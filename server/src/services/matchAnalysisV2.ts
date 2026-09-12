import crypto from 'crypto';
import type {
  CapabilityEvidenceItemV2,
  CapabilityHardConditionStatus,
  CapabilityRequirementScoreV2,
  DeepSeekMessage,
  MatchItem,
  MatchResultV2,
  ParsedJobDescription,
  ParsedResume,
  StandardizedJobRequirementV2,
} from '../types';
import { calculateCapabilityRadarV2, CapabilityScoringValidationError } from './capabilityScoringV2';
import { callDeepSeekJson, DeepSeekClientError, DEEPSEEK_MODEL } from './deepseekClient';

export const MATCH_EXTRACTION_VERSION = 'match-extraction-v2.1';
const REQUIREMENT_MAX_TOKENS = 8192;
const EVIDENCE_MAX_TOKENS = 8192;
const SUMMARY_MAX_TOKENS = 2048;
const CACHE_LIMIT = 100;
const SUMMARY_VERSION = 'summary-v2.1';

export type MatchAnalysisErrorCode =
  | 'INPUT_INVALID'
  | 'AI_REQUEST_FAILED'
  | 'AI_OUTPUT_TRUNCATED'
  | 'AI_OUTPUT_INVALID'
  | 'AI_CONTRACT_INVALID'
  | 'NO_SCOREABLE_REQUIREMENTS';

export class MatchAnalysisError extends Error {
  constructor(public readonly code: MatchAnalysisErrorCode, message: string, public readonly status: number) {
    super(message);
    this.name = 'MatchAnalysisError';
  }
}

export interface MatchAnalysisV2Dependencies {
  callJson?: typeof callDeepSeekJson;
  disableCache?: boolean;
}

interface EvidenceAlignment {
  requirementId: string;
  hardConditionStatus?: CapabilityHardConditionStatus;
  resumeEvidenceLevel?: CapabilityEvidenceItemV2['resumeEvidenceLevel'];
  relevance?: CapabilityEvidenceItemV2['relevance'];
  backgroundMatch?: CapabilityEvidenceItemV2['backgroundMatch'];
  resumeEvidenceSourceIds?: string[];
  resumeEvidence?: string;
}

interface ResumeEvidenceSource {
  id: string;
  text: string;
}

const DISPLAY_EVIDENCE_MAX_CHARS = 120;

const requirementCache = new Map<string, StandardizedJobRequirementV2[]>();
const evidenceCache = new Map<string, EvidenceAlignment[]>();
const summaryCache = new Map<string, string>();

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createMatchInputHash(value: unknown): string {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function cacheSet<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}

export function clearMatchAnalysisV2Cache(): void {
  requirementCache.clear();
  evidenceCache.clear();
  summaryCache.clear();
}

function parseObject(content: string, stage: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new MatchAnalysisError('AI_OUTPUT_INVALID', `${stage}返回的 JSON 无法解析`, 502);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MatchAnalysisError('AI_OUTPUT_INVALID', `${stage}必须返回 JSON 对象`, 502);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `AI 输出缺少 ${field}`, 502);
  return value.trim();
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new MatchAnalysisError('AI_CONTRACT_INVALID', `AI 输出的 ${field} 必须是布尔值`, 502);
  return value;
}

function includesSource(haystack: string, needle: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  return normalize(haystack).includes(normalize(needle));
}

function translateError(error: unknown): never {
  if (error instanceof MatchAnalysisError) throw error;
  if (error instanceof DeepSeekClientError) {
    if (error.code === 'AI_OUTPUT_TRUNCATED') throw new MatchAnalysisError('AI_OUTPUT_TRUNCATED', error.message, 502);
    if (error.code === 'AI_REQUEST_FAILED') throw new MatchAnalysisError('AI_REQUEST_FAILED', error.message, error.status === 401 ? 401 : 502);
    throw new MatchAnalysisError('AI_OUTPUT_INVALID', error.message, 502);
  }
  if (error instanceof CapabilityScoringValidationError) throw new MatchAnalysisError('AI_CONTRACT_INVALID', error.message, 502);
  throw error;
}

function buildRequirementMessages(job: ParsedJobDescription): DeepSeekMessage[] {
  const requirements = job.requirements.map((item, index) => ({
    sourceId: item.id?.trim() || `source_${String(index + 1).padStart(3, '0')}`,
    title: item.title,
    category: item.category,
    requirement: item.item,
    isHardHint: item.isHard,
  }));
  return [
    {
      role: 'system',
      content: `你负责把岗位要求标准化为稳定、去重的结构化清单，不负责匹配简历，也不得输出任何分数、权重、匹配状态、优势、差距或推荐结论。
规则：
1. 每个输入 sourceId 必须至少出现一次且不得遗漏；同义重复可合并。只有同一句确实包含多个可独立判断的要求时，同一 sourceId 才可用于多个输出项。
2. A/B 任一即可作为一个选择型要求；A 和 B 都必须且可独立判断时必须拆分。“具备前后端开发能力”同时要求前端和后端，必须拆成两条；其后“熟悉若干技术中的一项或多项”只表示技术列表内可选，不会把前端与后端合并成只需满足一边。
3. dimension 只能是 skill/experience/project/achievement/education/industry/other。
4. isHard 与 isScoreable 必须分别判断。地点、最低学历、最低年限、必须证书、必须接受出差等可客观核查的门槛通常是硬性条件。市场敏感度、抗压性、责任心、Owner 意识、跨部门协作、平台化思维和业务闭环是可从行为经历中取证的能力，不得归为 other 或只做硬性核查；应归入 skill、experience 或 project 并参与评分。
5. importance 只能是 core/important/normal/bonus。skill/experience/project/achievement 的 requiredDepth 只能是 basic/familiar/practical/expert。
6. isScoreable=false 时不得输出 importance、requiredDepth 和 backgroundRequirement；isScoreable=true 时必须输出 importance 且 dimension 不能是 other。
7. skill/experience/project/achievement 必须输出 requiredDepth，不得输出 backgroundRequirement；education/industry 必须输出 backgroundRequirement=preferred/required，不得输出 requiredDepth。preferred 表示有要求但不强求，required 表示必须具备。
8. jobEvidence 必须逐字来自输入 requirement，不得改写。
9. 传统前端开发、传统后端开发、前后端架构衔接/系统集成是不同要求，不得互相替代。
10. id 使用稳定短标识，不得使用随机数。
11. 只输出合法 JSON。`,
    },
    {
      role: 'user',
      content: `请标准化以下岗位要求：\n${JSON.stringify(requirements, null, 2)}\n\n输出：{"requirements":[{"id":"req_stable","sourceIds":["source_001"],"title":"短标题","requirement":"完整标准化要求","dimension":"skill","isHard":true,"isScoreable":true,"importance":"core","requiredDepth":"practical","jobEvidence":"输入要求中的逐字摘录"}]}`,
    },
  ];
}

function addResumeSource(sources: ResumeEvidenceSource[], id: string, value: unknown): void {
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const textValue = String(value).trim();
  if (textValue) sources.push({ id, text: textValue });
}

function buildResumeEvidenceSources(resume: ParsedResume): ResumeEvidenceSource[] {
  const sources: ResumeEvidenceSource[] = [];
  Object.entries(resume.basicInfo || {}).forEach(([key, value]) => addResumeSource(sources, `basic.${key}`, value));
  resume.skills.forEach((skill, index) => {
    const prefix = `skill.${skill.id || index + 1}`;
    addResumeSource(sources, `${prefix}.name`, skill.name);
    addResumeSource(sources, `${prefix}.level`, skill.level);
    addResumeSource(sources, `${prefix}.evidence`, skill.evidence);
  });
  resume.experiences.forEach((experience, index) => {
    const prefix = `experience.${experience.id || index + 1}`;
    addResumeSource(sources, `${prefix}.role`, experience.role);
    addResumeSource(sources, `${prefix}.period`, experience.period);
    experience.achievements.forEach((achievement, achievementIndex) => addResumeSource(sources, `${prefix}.achievement.${achievementIndex + 1}`, achievement));
    addResumeSource(sources, `${prefix}.rawText`, experience.rawText);
  });
  addResumeSource(sources, 'resume.rawText', resume.rawText);
  return sources;
}

function evidenceTerms(requirement: string): string[] {
  const latinTerms = requirement.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g) || [];
  const chineseRuns = requirement.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const chineseTerms = chineseRuns.flatMap((run) => run.length > 4 ? [run, ...Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2))] : [run]);
  return [...new Set([...latinTerms, ...chineseTerms].map((term) => term.toLowerCase()))];
}

function compactEvidenceText(value: string, requirement: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= DISPLAY_EVIDENCE_MAX_CHARS) return normalized;
  const terms = evidenceTerms(requirement);
  const chunks = normalized.split(/(?<=[。！？；.!?;])/u).map((chunk) => chunk.trim()).filter(Boolean);
  const ranked = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: terms.reduce((total, term) => total + (chunk.toLowerCase().includes(term) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  let selected = '';
  for (const item of ranked) {
    const candidate = selected ? `${selected}；${item.chunk}` : item.chunk;
    if (candidate.length > DISPLAY_EVIDENCE_MAX_CHARS) continue;
    selected = candidate;
    if (selected.length >= 70) break;
  }
  if (!selected) selected = normalized.slice(0, DISPLAY_EVIDENCE_MAX_CHARS);
  return `${selected}${selected.length < normalized.length ? '…' : ''}`;
}

function compactResumeEvidence(sourceIds: string[], sourceById: Map<string, string>, requirement: string): string | undefined {
  const snippets = sourceIds.map((sourceId) => sourceById.get(sourceId)).filter((text): text is string => Boolean(text)).map((text) => compactEvidenceText(text, requirement));
  if (!snippets.length) return undefined;
  return compactEvidenceText([...new Set(snippets)].join('；'), requirement);
}

function buildEvidenceMessages(requirements: StandardizedJobRequirementV2[], resume: ParsedResume): DeepSeekMessage[] {
  const resumeSources = buildResumeEvidenceSources(resume);
  return [
    {
      role: 'system',
      content: `你只负责针对已冻结的岗位要求查找简历证据，不得修改、增删岗位要求，也不得输出分数、权重、匹配状态、优势、差距或推荐结论。
规则：
1. 每个 requirementId 必须且只能返回一次。
2. skill/experience/project/achievement 使用 resumeEvidenceLevel=none/mentioned/used/owned 和 relevance=none/weak/partial/high，不得输出 achieved。
3. 只有 isScoreable=true 的要求才输出评分档位。education/industry 不使用 resumeEvidenceLevel 和 relevance；岗位要求由 backgroundRequirement=preferred/required 表达，简历只输出 backgroundMatch=none/unrelated/related，对应无背景证据/有背景但不相关/相关。
4. 正向证据必须返回一个或多个 resumeEvidenceSourceIds，且只能引用输入中的证据来源 ID；同时返回 resumeEvidence，必须是这些来源中的一段简短原文摘录，最多 120 个字符，不得新增事实或整段搬运经历。无证据时 resumeEvidence 为空字符串。
5. 找不到证据来源时，resumeEvidenceSourceIds 必须为空数组；可评分的普通维度的两个档位必须为 none，可评分的背景维度的 backgroundMatch 必须为 none。
6. 不得用常识推断简历未写出的能力。技能列表和 AI 归纳的能力名称只能证明“提及”；判为 used/owned 必须有具体工作或项目原文。
7. 硬性条件同时输出 hardConditionStatus：met/not_met/unknown/not_applicable；非硬性项不输出该字段。
8. isScoreable=false 的地点、出差等条件只输出 hardConditionStatus 和 resumeEvidenceSourceIds，不输出 resumeEvidenceLevel、relevance 或 backgroundMatch；它们的证据来源不参与评分档位校验。
9. 传统前端开发能力必须有 JavaScript/TypeScript、React/Vue 等对应语言或框架的实际编码证据；传统后端开发能力必须有 Node.js、FastAPI 等后端服务、API 或框架实现证据。Vibe Coding、低代码、产品设计、架构规划或“接入/联调前后端”不证明会传统前端或后端开发，但可作为架构衔接、系统集成或工程化思维的证据。
10. 使用 Python 开发业务算法只证明 Python 使用经验，不证明开发过后端服务；只有明确的服务端、API、数据库或后端框架实现才可支持后端开发要求。
11. “行业/业务系统经验”只有在简历明确写出建设或交付岗位指定领域的业务系统时才可为 related。化工装置运行、工业控制或通用产品平台，不得仅因包含“业务”“系统”“产品”等通用词就判为消费品、美妆、研发、质量、供应链或产品开发业务系统经验。
12. 市场敏感度、Owner 意识、平台化思维等通用能力必须从具体行为中取证。例如市场/竞品调研可支持市场敏感度；主动提案、独立负责、推动问题关闭可支持 Owner 意识；模块化、标准化、统一框架、需求跟踪和上线闭环可支持平台化思维与业务闭环。抗压性不得仅凭工作繁忙或项目复杂进行推测。
13. 只输出合法 JSON。`,
    },
    {
      role: 'user',
      content: `【冻结后的岗位要求】\n${JSON.stringify(requirements, null, 2)}\n\n【简历证据来源】\n${JSON.stringify(resumeSources, null, 2)}\n\n普通维度示例：{"requirementId":"req_skill","resumeEvidenceLevel":"owned","relevance":"high","resumeEvidenceSourceIds":["experience.exp_1.rawText"],"resumeEvidence":"独立负责 TypeScript 项目"}\n背景维度示例：{"requirementId":"req_education","backgroundMatch":"related","resumeEvidenceSourceIds":["basic.education"],"resumeEvidence":"本科计算机相关专业"}\n无证据示例：{"requirementId":"req_none","resumeEvidenceLevel":"none","relevance":"none","resumeEvidenceSourceIds":[],"resumeEvidence":""}\n输出：{"evidence":[...]}`,
    },
  ];
}

function validateRequirements(raw: unknown, job: ParsedJobDescription): StandardizedJobRequirementV2[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new MatchAnalysisError('AI_CONTRACT_INVALID', 'AI 未返回岗位要求清单', 502);
  const sourceIds = job.requirements.map((item, index) => item.id?.trim() || `source_${String(index + 1).padStart(3, '0')}`);
  const sourceById = new Map(sourceIds.map((id, index) => [id, job.requirements[index]]));
  const seenIds = new Set<string>();
  const seenSources = new Set<string>();
  const allowedDimensions = ['skill', 'experience', 'project', 'achievement', 'education', 'industry', 'other'];
  const allowedImportance = ['core', 'important', 'normal', 'bonus'];
  const allowedDepth = ['basic', 'familiar', 'practical', 'expert'];
  const allowedBackgroundRequirements = ['preferred', 'required'];

  const result = raw.map((entry, index): StandardizedJobRequirementV2 => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `第 ${index + 1} 条岗位要求格式无效`, 502);
    const item = entry as Record<string, unknown>;
    const id = text(item.id, 'requirements.id');
    if (seenIds.has(id)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `岗位要求 ID 重复：${id}`, 502);
    seenIds.add(id);
    if (!Array.isArray(item.sourceIds) || item.sourceIds.length === 0 || item.sourceIds.some((value) => typeof value !== 'string')) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: sourceIds 无效`, 502);
    }
    const itemSourceIds = item.sourceIds as string[];
    itemSourceIds.forEach((sourceId) => {
      if (!sourceById.has(sourceId)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: 引用了未知 sourceId`, 502);
      seenSources.add(sourceId);
    });
    const dimension = text(item.dimension, 'dimension');
    if (!allowedDimensions.includes(dimension)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: dimension 非法`, 502);
    const isHard = bool(item.isHard, 'isHard');
    const isScoreable = bool(item.isScoreable, 'isScoreable');
    const jobEvidence = text(item.jobEvidence, 'jobEvidence');
    if (!itemSourceIds.some((sourceId) => includesSource(sourceById.get(sourceId)?.item || '', jobEvidence))) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: jobEvidence 无法回查岗位原文`, 502);
    }
    const importance = typeof item.importance === 'string' ? item.importance : undefined;
    const requiredDepth = typeof item.requiredDepth === 'string' ? item.requiredDepth : undefined;
    const backgroundRequirement = typeof item.backgroundRequirement === 'string' ? item.backgroundRequirement : undefined;
    const isBackgroundDimension = dimension === 'education' || dimension === 'industry';
    if (isScoreable && (dimension === 'other' || !importance || !allowedImportance.includes(importance))) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: 可评分要求缺少合法重要度`, 502);
    }
    if (isScoreable && isBackgroundDimension && requiredDepth !== undefined) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: 教育专业和行业领域不得携带岗位要求深度`, 502);
    }
    if (isScoreable && isBackgroundDimension && (!backgroundRequirement || !allowedBackgroundRequirements.includes(backgroundRequirement))) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: 教育专业和行业领域缺少合法背景要求强度`, 502);
    }
    if (isScoreable && !isBackgroundDimension && backgroundRequirement !== undefined) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: 普通能力维度不得携带 backgroundRequirement`, 502);
    }
    if (isScoreable && !isBackgroundDimension && (!requiredDepth || !allowedDepth.includes(requiredDepth))) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: 可评分要求缺少合法岗位要求深度`, 502);
    }
    if (!isScoreable && (importance !== undefined || requiredDepth !== undefined || backgroundRequirement !== undefined)) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${id}: 不可评分要求不得携带评分字段`, 502);
    }
    return {
      id,
      sourceIds: [...itemSourceIds].sort(),
      title: text(item.title, 'title'),
      requirement: text(item.requirement, 'requirement'),
      dimension: dimension as StandardizedJobRequirementV2['dimension'],
      isHard,
      isScoreable,
      importance: importance as StandardizedJobRequirementV2['importance'],
      requiredDepth: requiredDepth as StandardizedJobRequirementV2['requiredDepth'],
      backgroundRequirement: backgroundRequirement as StandardizedJobRequirementV2['backgroundRequirement'],
      jobEvidence,
    };
  });
  if (seenSources.size !== sourceIds.length) throw new MatchAnalysisError('AI_CONTRACT_INVALID', 'AI 遗漏了部分岗位要求', 502);
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function validateEvidence(raw: unknown, requirements: StandardizedJobRequirementV2[], resume: ParsedResume): EvidenceAlignment[] {
  if (!Array.isArray(raw) || raw.length !== requirements.length) throw new MatchAnalysisError('AI_CONTRACT_INVALID', 'AI 证据数量与岗位要求不一致', 502);
  const requirementById = new Map(requirements.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const resumeSourceById = new Map(buildResumeEvidenceSources(resume).map((source) => [source.id, source.text]));
  const levels = ['none', 'mentioned', 'used', 'owned'];
  const relevances = ['none', 'weak', 'partial', 'high'];
  const backgroundMatches = ['none', 'unrelated', 'related'];
  const hardStatuses = ['met', 'not_met', 'unknown', 'not_applicable'];
  const result = raw.map((entry, index): EvidenceAlignment => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `第 ${index + 1} 条证据格式无效`, 502);
    const item = entry as Record<string, unknown>;
    const requirementId = text(item.requirementId, 'requirementId');
    const requirement = requirementById.get(requirementId);
    if (!requirement) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `证据引用未知要求：${requirementId}`, 502);
    if (seen.has(requirementId)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `证据重复：${requirementId}`, 502);
    seen.add(requirementId);
    const isBackgroundDimension = requirement.dimension === 'education' || requirement.dimension === 'industry';
    if (!requirement.isScoreable) {
      // 地点、出差等要求只做硬性条件核查，即使 AI 附带 none 或其他
      // 评分档位也不应影响验收；这些字段在转换为评分证据时会被丢弃。
      if (item.resumeEvidenceLevel !== undefined && (typeof item.resumeEvidenceLevel !== 'string' || !levels.includes(item.resumeEvidenceLevel))) {
        throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: resumeEvidenceLevel 非法`, 502);
      }
      if (item.relevance !== undefined && (typeof item.relevance !== 'string' || !relevances.includes(item.relevance))) {
        throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: relevance 非法`, 502);
      }
      if (item.backgroundMatch !== undefined && (typeof item.backgroundMatch !== 'string' || !backgroundMatches.includes(item.backgroundMatch))) {
        throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: backgroundMatch 非法`, 502);
      }
    } else if (isBackgroundDimension) {
      if (typeof item.backgroundMatch !== 'string' || !backgroundMatches.includes(item.backgroundMatch)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: backgroundMatch 非法`, 502);
      if (item.resumeEvidenceLevel !== undefined || item.relevance !== undefined) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 背景维度不得使用证据等级或相关度`, 502);
    } else {
      if (typeof item.resumeEvidenceLevel !== 'string' || !levels.includes(item.resumeEvidenceLevel)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: resumeEvidenceLevel 非法`, 502);
      if (typeof item.relevance !== 'string' || !relevances.includes(item.relevance)) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: relevance 非法`, 502);
      if (item.backgroundMatch !== undefined) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 普通维度不得使用 backgroundMatch`, 502);
    }
    if (!Array.isArray(item.resumeEvidenceSourceIds) || item.resumeEvidenceSourceIds.some((value) => typeof value !== 'string')) {
      throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: resumeEvidenceSourceIds 必须是数组`, 502);
    }
    const resumeEvidenceSourceIds = [...new Set(item.resumeEvidenceSourceIds as string[])].sort();
    const unknownSourceId = resumeEvidenceSourceIds.find((sourceId) => !resumeSourceById.has(sourceId));
    if (unknownSourceId) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 引用了未知简历证据来源 ${unknownSourceId}`, 502);
    if (!requirement.isScoreable) {
      // 不参与评分的条件可以引用简历原文，但没有证据等级或相关度。
    } else if (isBackgroundDimension) {
      if (resumeEvidenceSourceIds.length === 0 && item.backgroundMatch !== 'none') throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 无证据来源时 backgroundMatch 必须为 none`, 502);
      if (resumeEvidenceSourceIds.length > 0 && item.backgroundMatch === 'none') throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 有证据来源时 backgroundMatch 不能为 none`, 502);
    } else {
      if (resumeEvidenceSourceIds.length === 0 && (item.resumeEvidenceLevel !== 'none' || item.relevance !== 'none')) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 无证据来源时档位必须为 none`, 502);
      if (resumeEvidenceSourceIds.length > 0 && (item.resumeEvidenceLevel === 'none' || item.relevance === 'none')) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 有证据来源时档位不能为 none`, 502);
    }
    const sourceText = resumeEvidenceSourceIds.map((sourceId) => resumeSourceById.get(sourceId)).filter((text): text is string => Boolean(text)).join('；');
    const aiResumeEvidence = typeof item.resumeEvidence === 'string' ? item.resumeEvidence.replace(/\s+/g, ' ').trim() : '';
    const resumeEvidence = aiResumeEvidence.length <= DISPLAY_EVIDENCE_MAX_CHARS && aiResumeEvidence && includesSource(sourceText, aiResumeEvidence)
      ? aiResumeEvidence
      : compactResumeEvidence(resumeEvidenceSourceIds, resumeSourceById, requirement.requirement);
    const hardConditionStatus = requirement.isHard
      ? (typeof item.hardConditionStatus === 'string' && hardStatuses.includes(item.hardConditionStatus) ? item.hardConditionStatus as CapabilityHardConditionStatus : undefined)
      : undefined;
    if (requirement.isHard && !hardConditionStatus) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `${requirementId}: 硬性条件缺少核查状态`, 502);
    return {
      requirementId,
      hardConditionStatus,
      resumeEvidenceLevel: requirement.isScoreable && !isBackgroundDimension ? item.resumeEvidenceLevel as EvidenceAlignment['resumeEvidenceLevel'] : undefined,
      relevance: requirement.isScoreable && !isBackgroundDimension ? item.relevance as EvidenceAlignment['relevance'] : undefined,
      backgroundMatch: requirement.isScoreable && isBackgroundDimension ? item.backgroundMatch as EvidenceAlignment['backgroundMatch'] : undefined,
      resumeEvidenceSourceIds,
      resumeEvidence,
    };
  });
  return result.sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}

function toEvidence(requirements: StandardizedJobRequirementV2[], evidence: EvidenceAlignment[]): CapabilityEvidenceItemV2[] {
  const evidenceById = new Map(evidence.map((item) => [item.requirementId, item]));
  return requirements.map((requirement) => {
    const aligned = evidenceById.get(requirement.id);
    if (!aligned) throw new MatchAnalysisError('AI_CONTRACT_INVALID', `缺少 ${requirement.id} 的简历证据`, 502);
    return {
      id: requirement.id,
      title: requirement.title,
      requirement: requirement.requirement,
      dimension: requirement.dimension,
      isHard: requirement.isHard,
      isScoreable: requirement.isScoreable,
      hardConditionStatus: aligned.hardConditionStatus,
      importance: requirement.importance,
      requiredDepth: requirement.requiredDepth,
      backgroundRequirement: requirement.backgroundRequirement,
      jobEvidence: requirement.jobEvidence,
      resumeEvidenceLevel: requirement.isScoreable ? aligned.resumeEvidenceLevel : undefined,
      relevance: requirement.isScoreable ? aligned.relevance : undefined,
      backgroundMatch: requirement.isScoreable ? aligned.backgroundMatch : undefined,
      resumeEvidenceSourceIds: aligned.resumeEvidenceSourceIds,
      resumeEvidence: aligned.resumeEvidence,
    };
  });
}

function matchItem(item: CapabilityEvidenceItemV2, score?: CapabilityRequirementScoreV2): MatchItem {
  const hardStatus = item.hardConditionStatus;
  const status = score?.status === 'matched' ? 'matched' : score?.status === 'partial' ? 'partial' : 'missing';
  const matched = item.isHard ? hardStatus === 'met' : status === 'matched';
  return {
    id: item.id,
    title: item.title,
    requirement: item.requirement,
    matched,
    status: item.isHard && hardStatus === 'unknown' ? 'partial' : status,
    evidence: item.resumeEvidence || (hardStatus === 'unknown' ? '当前简历信息不足，需人工确认' : '简历中未发现明确证据'),
    jobEvidence: item.jobEvidence,
    dimension: item.dimension,
    isHard: item.isHard,
  };
}

function fallbackSummary(result: MatchResultV2): string {
  if (result.score === null) return '该岗位没有可评分的六维能力要求，请结合硬性条件核查结果人工判断。';
  const coreGaps = result.capabilityRadar.dimensions.filter((item) => item.hasCoreGap).map((item) => item.label);
  const advantageText = result.capabilityRadar.advantages.slice(0, 3).map((item) => item.title).join('、');
  const gapText = result.capabilityRadar.keyGaps.map((item) => item.title).join('、');
  const overall = result.score >= 75 ? '较高' : result.score >= 50 ? '中等' : '偏低';
  const strengths = advantageText ? `具备${advantageText}等与岗位相关的能力` : '具备一定的岗位适配基础';
  const gap = coreGaps.length ? `存在核心缺口：${coreGaps.join('、')}。` : gapText ? `主要差距在于${gapText}。` : '整体未发现明显能力差距。';
  return `候选人整体匹配度${overall}，${strengths}。${gap}${gapText ? `优先关注：${gapText}。` : ''}`;
}

function buildSummaryMessages(result: MatchResultV2): DeepSeekMessage[] {
  const requirements = result.capabilityRadar.dimensions.flatMap((dimension) => dimension.details.map((detail) => ({
    dimension: dimension.label,
    title: detail.title || detail.requirement,
    requirement: detail.requirement,
    status: detail.status,
    importance: detail.importance,
    isHard: detail.isHard,
    jobEvidence: detail.jobEvidence,
    resumeEvidence: detail.resumeEvidence || '简历中未发现明确证据',
  })));
  const hardConditions = result.capabilityEvidence.filter((item) => item.isHard).map((item) => ({
    title: item.title || item.requirement,
    requirement: item.requirement,
    evidence: item.resumeEvidence || '简历中未发现明确证据',
    hardConditionStatus: item.hardConditionStatus,
    status: result.hardConditionCheck.find((check) => check.id === item.id)?.status || 'missing',
  }));
  const coreGaps = result.capabilityRadar.dimensions.filter((item) => item.hasCoreGap).map((item) => item.label);
  return [
    {
      role: 'system',
      content: [
        '你是一名资深招聘顾问，负责把已经完成校验的岗位匹配事实整理成自然、具体、克制的中文综合评语。',
        '规则：',
        '1. 输出 2-3 句话，保持 radar-v1 的综合评语风格：先判断整体匹配基础，再结合具体能力、行业/教育背景或项目经验说明优势，最后说明主要差距和优先关注项。',
        '2. 必须只使用输入中的岗位要求和简历证据，不得把“未发现证据”写成候选人不会，也不得编造简历没有写过的经历、行业或成果。',
        '3. 不要以分数开头，不要只复述“匹配度较高/较低”，不要输出计算公式、权重、覆盖度数字、状态数量或内部字段名。',
        '4. 主要差距要区分“核心缺口”和“加分项缺失”；没有明确差距时，直接说明整体未发现明显短板。',
        '5. 只输出合法 JSON：{"summary":"2-3 句话的综合评语"}。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请根据以下已校验事实生成综合评语。评分和状态已经由后端确定，不要自行改写或补充。',
        '',
        '【岗位匹配结果】',
        JSON.stringify({ score: result.score, advantages: result.capabilityRadar.advantages.slice(0, 5), keyGaps: result.capabilityRadar.keyGaps.slice(0, 5), coreGaps }, null, 2),
        '',
        '【逐项要求与证据】',
        JSON.stringify(requirements, null, 2),
        '',
        '【硬性条件核查】',
        JSON.stringify(hardConditions, null, 2),
      ].join('\n'),
    },
  ];
}

async function generateSummary(apiKey: string, result: MatchResultV2, callJson: typeof callDeepSeekJson): Promise<string> {
  const fallback = fallbackSummary(result);
  try {
    const content = await callJson(apiKey, buildSummaryMessages(result), { maxTokens: SUMMARY_MAX_TOKENS, retries: 1 });
    const parsed = parseObject(content, '综合评语生成');
    const value = typeof parsed.summary === 'string' ? parsed.summary.replace(/\s+/g, ' ').trim() : '';
    if (value.length < 20 || value.length > 500) return fallback;
    return value;
  } catch {
    // 综合评语只负责可读性；AI 失败时保留与 V2 结果一致的确定性评语，不影响算分结果。
    return fallback;
  }
}

export async function analyzeMatchV2(
  apiKey: string,
  resume: ParsedResume,
  jobDescription: ParsedJobDescription,
  dependencies: MatchAnalysisV2Dependencies = {},
): Promise<MatchResultV2> {
  if (!apiKey.trim()) throw new MatchAnalysisError('INPUT_INVALID', '未配置 DeepSeek API Key', 400);
  if (!resume || !jobDescription || !Array.isArray(jobDescription.requirements) || jobDescription.requirements.length === 0) {
    throw new MatchAnalysisError('INPUT_INVALID', '缺少有效的简历或岗位要求', 400);
  }
  const callJson = dependencies.callJson || callDeepSeekJson;
  const requirementKey = createMatchInputHash({ model: DEEPSEEK_MODEL, extractionVersion: MATCH_EXTRACTION_VERSION, stage: 'requirements', jobDescription });
  let requirementCacheHit = false;
  let requirements = !dependencies.disableCache ? requirementCache.get(requirementKey) : undefined;
  try {
    if (requirements) {
      requirementCacheHit = true;
      requirements = clone(requirements);
    } else {
      const content = await callJson(apiKey, buildRequirementMessages(jobDescription), { maxTokens: REQUIREMENT_MAX_TOKENS, retries: 1 });
      requirements = validateRequirements(parseObject(content, '岗位要求提取').requirements, jobDescription);
      if (!dependencies.disableCache) cacheSet(requirementCache, requirementKey, clone(requirements));
    }

    const evidenceKey = createMatchInputHash({ model: DEEPSEEK_MODEL, extractionVersion: MATCH_EXTRACTION_VERSION, stage: 'evidence', requirements, resume });
    let evidenceCacheHit = false;
    let evidence = !dependencies.disableCache ? evidenceCache.get(evidenceKey) : undefined;
    if (evidence) {
      evidenceCacheHit = true;
      evidence = clone(evidence);
    } else {
      const content = await callJson(apiKey, buildEvidenceMessages(requirements, resume), { maxTokens: EVIDENCE_MAX_TOKENS, retries: 1 });
      evidence = validateEvidence(parseObject(content, '简历证据提取').evidence, requirements, resume);
      if (!dependencies.disableCache) cacheSet(evidenceCache, evidenceKey, clone(evidence));
    }

    const capabilityEvidence = toEvidence(requirements, evidence);
    const radar = calculateCapabilityRadarV2(capabilityEvidence);
    const scoreById = new Map(radar.dimensions.flatMap((dimension) => dimension.details).map((item) => [item.id, item]));
    const hardConditionCheck = capabilityEvidence.filter((item) => item.isHard).map((item) => matchItem(item, scoreById.get(item.id)));
    const skillMatch = capabilityEvidence.filter((item) => item.isScoreable && scoreById.get(item.id)?.status !== 'missing_evidence').map((item) => matchItem(item, scoreById.get(item.id)));
    const gaps = capabilityEvidence.filter((item) => item.isScoreable && scoreById.get(item.id)?.status !== 'matched').map((item) => matchItem(item, scoreById.get(item.id)));
    const result: MatchResultV2 = {
      score: radar.score,
      hardConditionCheck,
      skillMatch,
      gaps,
      summary: '',
      capabilityRadar: radar,
      capabilityEvidence,
      standardizedRequirements: requirements,
      metadata: {
        scoringVersion: 'radar-v2',
        extractionVersion: MATCH_EXTRACTION_VERSION,
        inputHash: createMatchInputHash({ jobDescription, resume, extractionVersion: MATCH_EXTRACTION_VERSION }),
        requirementCacheHit,
        evidenceCacheHit,
      },
    };
    const summaryKey = createMatchInputHash({ inputHash: result.metadata.inputHash, version: SUMMARY_VERSION });
    const cachedSummary = dependencies.disableCache ? undefined : summaryCache.get(summaryKey);
    result.summary = cachedSummary || await generateSummary(apiKey, result, callJson);
    if (!cachedSummary && !dependencies.disableCache) summaryCache.set(summaryKey, result.summary);
    return result;
  } catch (error) {
    translateError(error);
  }
}

export function matchAnalysisErrorResponse(error: unknown): { status: number; code: MatchAnalysisErrorCode | 'INTERNAL_ERROR'; message: string } {
  if (error instanceof MatchAnalysisError) return { status: error.status, code: error.code, message: error.message };
  return { status: 500, code: 'INTERNAL_ERROR', message: '岗位匹配服务发生异常，请稍后重试' };
}
