import type {
  DeepSeekRequest,
  DeepSeekMessage,
  ParsedResume,
  ParsedJobDescription,
  MatchResult,
  GeneratedResume,
  AtomicExperience,
  AtomicSkill,
  JobRequirement,
  MatchItem,
  CapabilityEvidenceItem,
  MatchDimensionKey,
} from '../types';
import { calculateCapabilityRadar, normalizeCapabilityEvidence } from './capabilityScoring';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

/**
 * 调用 DeepSeek API
 */
async function callDeepSeek(
  apiKey: string,
  messages: DeepSeekMessage[],
  options?: { temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const body: DeepSeekRequest = {
    model: MODEL,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: 4096,
  };

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 调用失败 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// 功能 1：简历原子化解析
// ============================================================

/**
 * 将简历文本解析为原子能力和原子经历
 */
export async function parseResume(
  apiKey: string,
  resumeText: string,
  fileName?: string
): Promise<ParsedResume> {
  const systemPrompt = `你是一个专业的简历分析师。你的任务是将简历内容拆解为"原子能力"和"原子经历"。

原子能力：简历中体现的最小能力单元，如"数据分析"、"项目管理"、"用户调研"等。
原子经历：简历中每段工作/项目经历，提炼出关键成就。

规则：
1. 能力要拆得足够细，不要笼统说"能力强"
2. 每个能力要标注来源（哪段经历证明了这个能力）
3. 经历要提炼关键成就，用大白话描述，保留具体数字和事实
4. 公司、职位、时间、数字等硬性事实必须如实保留，不得修改或编造
5. 输出必须是合法 JSON`;

  const userPrompt = `请分析以下简历内容${fileName ? `（来自文件：${fileName}）` : ''}，拆解为原子能力和原子经历。

简历内容：
---
${resumeText}
---

请输出以下 JSON 格式（严格遵循，不要输出其他内容）：
{
  "skills": [
    {
      "category": "能力分类（如：技术/管理/沟通/行业知识/工具）",
      "name": "能力名称",
      "level": "熟练度（了解/熟悉/精通）",
      "evidence": "这个能力从哪段经历体现出来的"
    }
  ],
  "experiences": [
    {
      "company": "公司名",
      "role": "职位",
      "period": "时间段",
      "achievements": ["关键成就1（带数字）", "关键成就2"],
      "rawText": "这段经历的原始描述"
    }
  ],
  "basicInfo": {
    "name": "姓名（如有）",
    "phone": "电话（如有）",
    "email": "邮箱（如有）",
    "education": "最高学历（如有）",
    "yearsOfExperience": 工作年限数字（如有，否则为0）,
    "city": "期望城市或当前城市（如有）"
  }
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    // 补充 ID
    const skills: AtomicSkill[] = (Array.isArray(parsed.skills) ? parsed.skills : []).map((s: Omit<AtomicSkill, 'id'>) => ({
      category: typeof s.category === 'string' ? s.category : '',
      name: typeof s.name === 'string' ? s.name : '',
      level: typeof s.level === 'string' ? s.level : '',
      evidence: typeof s.evidence === 'string' ? s.evidence : '',
      id: generateId('skill'),
    }));
    const experiences: AtomicExperience[] = (Array.isArray(parsed.experiences) ? parsed.experiences : []).map(
      (e: Omit<AtomicExperience, 'id' | 'skillsUsed'>) => ({
        company: typeof e.company === 'string' ? e.company : '',
        role: typeof e.role === 'string' ? e.role : '',
        period: typeof e.period === 'string' ? e.period : '',
        achievements: Array.isArray(e.achievements) ? e.achievements.filter((item): item is string => typeof item === 'string') : [],
        rawText: typeof e.rawText === 'string' ? e.rawText : '',
        id: generateId('exp'),
        skillsUsed: [],
      })
    );

    if (skills.length === 0 && experiences.length === 0) {
      throw new Error('AI 未从简历中提取出能力或经历，请检查简历文本后重试');
    }

    return {
      skills,
      experiences,
      basicInfo: parsed.basicInfo && typeof parsed.basicInfo === 'object' && !Array.isArray(parsed.basicInfo) ? parsed.basicInfo : {},
      rawText: resumeText,
    };
  } catch (error) {
    throw new Error(`简历解析结果格式化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 功能 2：JD 解析
// ============================================================

/**
 * 解析岗位描述，提取结构化要求
 */
export async function parseJobDescription(
  apiKey: string,
  jdText: string
): Promise<ParsedJobDescription> {
  const systemPrompt = `你是一个招聘分析师。你的任务是解析岗位描述（JD），提取结构化的岗位要求。

规则：
1. 区分"硬性条件"（学历、年限、城市、证书等）和"能力要求"（技能、经验、软素质）
2. 每个要求项要具体、可验证
3. 每个要求项提供独立的 title：用简短名词短语概括能力主题，通常 4–12 个汉字，最多 32 个字符（英文技术名可保留）。例如“大模型应用开发”“工程化与系统集成”“学历要求”。不得复制完整要求或简单截断前几个字；item 保留完整要求及所有限定条件
4. 输出必须是合法 JSON`;

  const userPrompt = `请解析以下岗位描述，提取结构化要求。

岗位描述：
---
${jdText}
---

请输出以下 JSON 格式：
{
  "company": "公司名（如有）",
  "position": "职位名（如有）",
  "salary": "薪资范围（如有）",
  "city": "城市（如有）",
  "requirements": [
    {
      "category": "分类（硬性条件/能力要求/加分项）",
      "title": "能力短标题，例如大模型应用开发",
      "item": "具体要求项",
      "isHard": true或false
    }
  ]
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      company: parsed.company,
      position: parsed.position,
      salary: parsed.salary,
      city: parsed.city,
      requirements: ((parsed.requirements || []) as JobRequirement[]).map(requirement => ({
        ...requirement,
        title: typeof requirement.title === 'string' ? requirement.title.trim() || undefined : undefined,
      })),
      rawText: jdText,
    };
  } catch (error) {
    throw new Error(`JD 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 功能 3：匹配分析
// ============================================================

/**
 * 对比简历与 JD，进行差异化分析
 */
export async function analyzeMatch(
  apiKey: string,
  resume: ParsedResume,
  jobDescription: ParsedJobDescription
): Promise<MatchResult> {
  const systemPrompt = `你是一个资深招聘顾问。你的职责是从岗位描述和简历中提取可追溯的结构化判断，不负责计算最终分数。

规则：
1. 硬性条件（学历、最低年限、城市、必须证书等）单独逐条核查，不放入六维能力证据
2. 每条非硬性岗位要求必须归入且只能归入一个维度：skill 技能、experience 经验、project 项目、achievement 成果、education 教育专业、industry 行业领域
3. importance 只能为 core/important/normal/bonus，对应核心必须/明确要求/一般要求/优先加分
4. requiredDepth 只能为 basic/familiar/practical/expert，对应了解/熟悉使用/独立实践/精通主导
5. resumeEvidenceLevel 只能为 none/mentioned/used/owned/achieved，对应未发现/仅提及/实际使用/独立负责/有成果
6. relevance 只能为 none/weak/partial/high/exact
7. jobEvidence 和 resumeEvidence 必须是输入原文中的短摘录；找不到简历原文时 resumeEvidence 为空，resumeEvidenceLevel 与 relevance 必须为 none
8. 不得推测候选人未写在简历中的能力，不输出 score、维度分、权重或雷达图，它们由后端算法计算
9. 每一条岗位要求都必须出现一次，硬性要求也要进入 capabilityEvidence；使用稳定 id，且 hardConditionCheck、skillMatch、gaps 不得重复表达同一要求
10. 无法归入六维的要求使用 dimension=other，不得丢弃
11. skillMatch 必须区分 status：matched、partial、missing；gaps 收录岗位要求但简历证据不足的项目
12. 每条要求提供独立的 title：简短的能力主题名词短语，通常 4–12 个汉字，最多 32 个字符；如“大模型应用开发”“工程化与系统集成”“学历要求”。优先沿用输入中的标题，没有时根据完整要求概括，不得复制完整要求或机械截断；requirement 保留完整要求和所有限定条件。同一要求在各数组中的 title 必须一致，title 不作为唯一标识或匹配依据
13. 输出必须是合法 JSON`;

  // 构造简历摘要
  const resumeSummary = {
    基本信息: resume.basicInfo,
    能力列表: resume.skills.map((s) => ({
      分类: s.category,
      能力: s.name,
      熟练度: s.level,
      证据: s.evidence,
    })),
    经历列表: resume.experiences.map((e) => ({
      公司: e.company,
      职位: e.role,
      时间: e.period,
      成就: e.achievements,
    })),
  };

  // 构造 JD 摘要
  const jdSummary = {
    岗位: jobDescription.position,
    公司: jobDescription.company,
    要求列表: jobDescription.requirements.map((r) => ({
      分类: r.category,
      标题: r.title,
      要求: r.item,
      是否硬性: r.isHard,
    })),
  };

  const userPrompt = `请对比以下简历和岗位要求，进行差异化分析。

【简历数据】
${JSON.stringify(resumeSummary, null, 2)}

【岗位要求】
${JSON.stringify(jdSummary, null, 2)}

请输出以下 JSON 格式：
{
  "hardConditionCheck": [
    {
      "id": "req_001",
      "title": "能力短标题",
      "requirement": "要求项",
      "matched": true或false,
      "status": "matched/partial/missing",
      "evidence": "符合/不符合的说明",
      "jobEvidence": "岗位原文短摘录",
      "dimension": "skill/experience/project/achievement/education/industry 或 other",
      "isHard": true
    }
  ],
  "skillMatch": [
    {
      "id": "req_002",
      "title": "能力短标题",
      "requirement": "能力要求项",
      "matched": true或false,
      "status": "matched/partial/missing",
      "jobEvidence": "岗位原文短摘录",
      "dimension": "skill/experience/project/achievement/education/industry 或 other",
      "evidence": "简历中的对应证据；部分匹配时说明缺少什么",
      "isHard": false
    }
  ],
  "gaps": [
    {
      "id": "req_003",
      "title": "能力短标题",
      "requirement": "缺口项",
      "matched": false,
      "status": "missing/partial",
      "jobEvidence": "岗位原文短摘录",
      "dimension": "skill/experience/project/achievement/education/industry 或 other",
      "evidence": "简历中暂无对应经历",
      "isHard": true或false
    }
  ],
  "capabilityEvidence": [
    {
      "id": "与岗位要求对应的稳定唯一标识，例如 req_001",
      "title": "能力短标题，与对应匹配项一致",
      "requirement": "标准化后的岗位要求项（硬性与非硬性都必须覆盖）",
      "dimension": "skill/experience/project/achievement/education/industry 或 other",
      "importance": "core/important/normal/bonus",
      "requiredDepth": "basic/familiar/practical/expert",
      "jobEvidence": "岗位原文短摘录",
      "resumeEvidenceLevel": "none/mentioned/used/owned/achieved",
      "relevance": "none/weak/partial/high/exact",
      "resumeEvidence": "简历原文短摘录；未发现时为空"
    }
  ],
  "summary": "总体评价（2-3 句话，说明匹配情况和主要差距）"
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const capabilityEvidence = normalizeCapabilityEvidence(parsed.capabilityEvidence) as CapabilityEvidenceItem[];
    const { radar, score } = calculateCapabilityRadar(capabilityEvidence);
    return {
      score,
      hardConditionCheck: normalizeMatchItems(parsed.hardConditionCheck, capabilityEvidence, true),
      skillMatch: normalizeMatchItems(parsed.skillMatch, capabilityEvidence, false),
      gaps: normalizeMatchItems(parsed.gaps, capabilityEvidence),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '已完成六维能力匹配分析。',
      capabilityRadar: radar,
    };
  } catch (error) {
    throw new Error(`匹配分析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeMatchItems(value: unknown, evidence: CapabilityEvidenceItem[], hard?: boolean): MatchItem[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const byRequirement = new Map(evidence.map((item) => [item.requirement, item]));
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const requirement = typeof item.requirement === 'string' ? item.requirement.trim() : '';
    const source = (typeof item.id === 'string' && byId.get(item.id)) || byRequirement.get(requirement);
    if (!requirement && !source) return [];
    const status = item.status === 'matched' || item.status === 'partial' || item.status === 'missing' ? item.status : item.matched === true ? 'matched' : 'missing';
    return [{ id: source?.id || (typeof item.id === 'string' ? item.id : undefined), title: source?.title || (typeof item.title === 'string' ? item.title.trim() || undefined : undefined), requirement: source?.requirement || requirement, matched: status === 'matched', status, evidence: typeof item.evidence === 'string' ? item.evidence : source?.resumeEvidence, jobEvidence: source?.jobEvidence || (typeof item.jobEvidence === 'string' ? item.jobEvidence : undefined), dimension: source?.dimension || (typeof item.dimension === 'string' ? item.dimension as MatchDimensionKey : undefined), isHard: typeof hard === 'boolean' ? hard : source?.isHard === true || item.isHard === true }];
  });
}

// ============================================================
// 功能 4：经历补录引导
// ============================================================

/**
 * 引导用户补录经历 - 根据 AI 返回引导问题
 */
export async function generateFollowUpQuestions(
  apiKey: string,
  gap: string,
  existingResume: ParsedResume
): Promise<string> {
  const systemPrompt = `你是一个温和的面试官。用户在求职时发现简历缺少某个能力/经历，你要引导用户回忆相关经历。

规则：
1. 用大白话提问，像聊天一样
2. 鼓励用户回忆间接相关的经历（如兼职、学校项目、帮朋友做事等）
3. 不要让用户觉得有压力
4. 只输出引导问题本身，不要输出其他内容`;

  const userPrompt = `用户缺少的能力/经历是：${gap}

用户已有的经历背景（帮助判断问什么）：
${existingResume.experiences.map((e) => `- ${e.company} ${e.role}：${e.achievements.join('；')}`).join('\n')}

请生成一段引导问题，帮助用户回忆和这个缺口相关的经历。`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.7 }
  );

  return content.trim();
}

/**
 * 将用户的大白话补录整理为正式经历
 */
export async function formatFollowUpExperience(
  apiKey: string,
  userResponse: string,
  gap: string
): Promise<AtomicExperience> {
  const systemPrompt = `你是一个简历优化师。用户用大白话描述了一段经历，你要将其整理为正式的经历条目。

规则：
1. 公司、职位、时间、数字必须来自用户描述，不得编造
2. 提炼关键成就，用正式但通俗的语言
3. 标注这段经历体现的能力
4. 输出必须是合法 JSON`;

  const userPrompt = `用户缺少的能力/经历是：${gap}

用户的大白话描述：
---
${userResponse}
---

请整理为以下 JSON 格式：
{
  "company": "公司或项目名",
  "role": "担任的角色",
  "period": "时间段（如不确定写'不详'）",
  "achievements": ["关键成就1", "关键成就2"],
  "rawText": "用户原始描述"
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      id: generateId('exp'),
      company: parsed.company || '',
      role: parsed.role || '',
      period: parsed.period || '',
      achievements: parsed.achievements || [],
      skillsUsed: [],
      rawText: userResponse,
    };
  } catch (error) {
    throw new Error(`经历格式化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 功能 5：定制简历生成
// ============================================================

/**
 * 针对特定岗位生成定制简历
 */
export async function generateTailoredResume(
  apiKey: string,
  resume: ParsedResume,
  jobDescription: ParsedJobDescription,
  matchResult?: MatchResult
): Promise<GeneratedResume> {
  const systemPrompt = `你是一个资深简历顾问。你的任务是根据求职者的经历库，针对特定岗位生成一份定制的简历。

【铁律 - 绝对不可违反】
1. 公司、职位、时间、数字等硬性事实必须来自经历库，不得编造
2. 你只能做"提炼"和"重组"：把最相关的经历排到前面，把不相关的经历改写为能体现可迁移能力的说法
3. 不得添加经历库中不存在的内容
4. 不得夸大或改变事实

【优化原则】
1. 根据岗位要求，从经历库中挑选最相关的内容
2. 按相关性排序，最相关的放最前面
3. 将通用表述改写为岗位导向的说法（但不改变事实）
4. 突出与岗位匹配的能力
5. 生成一段简短的打招呼话术

输出必须是合法 JSON。`;

  const resumeData = {
    基本信息: resume.basicInfo,
    能力列表: resume.skills,
    经历列表: resume.experiences,
  };

  const jdData = {
    岗位: jobDescription.position,
    公司: jobDescription.company,
    要求: jobDescription.requirements,
  };

  const matchData = matchResult
    ? {
        匹配分数: matchResult.score,
        主要缺口: matchResult.gaps.map((g) => g.requirement),
      }
    : null;

  const userPrompt = `请根据以下数据，针对该岗位生成定制简历。

【经历库】
${JSON.stringify(resumeData, null, 2)}

【目标岗位】
${JSON.stringify(jdData, null, 2)}

${matchData ? `【匹配分析】\n${JSON.stringify(matchData, null, 2)}` : ''}

请输出以下 JSON 格式：
{
  "summary": "个人简介（2-3 句话，针对该岗位定制，突出核心优势）",
  "skillsHighlight": ["核心技能亮点1", "核心技能亮点2", "核心技能亮点3"],
  "experiences": [
    {
      "company": "公司名",
      "role": "职位",
      "period": "时间段",
      "description": "针对该岗位改写后的经历描述（2-3 句话）",
      "highlights": ["关键成就1", "关键成就2"]
    }
  ],
  "coverLetter": "简短的打招呼话术（1-2 句话，提及对该岗位的兴趣和核心匹配点）"
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.4, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || '',
      skillsHighlight: parsed.skillsHighlight || [],
      experiences: (parsed.experiences || []).map(
        (e: { company: string; role: string; period: string; description: string; highlights: string[] }) => ({
          company: e.company,
          role: e.role,
          period: e.period,
          description: e.description,
          highlights: e.highlights || [],
        })
      ),
      coverLetter: parsed.coverLetter || '',
    };
  } catch (error) {
    throw new Error(`简历生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 测试 API Key 是否有效
 */
export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 10,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
