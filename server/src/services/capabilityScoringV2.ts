import type {
  CapabilityBackgroundMatchV2,
  CapabilityBackgroundRequirementV2,
  CapabilityDimensionKey,
  CapabilityDimensionStatusV2,
  CapabilityEvidenceItemV2,
  CapabilityEvidenceLevelV2,
  CapabilityHardConditionStatus,
  CapabilityImportance,
  CapabilityRadarResultV2,
  CapabilityRankedRequirementV2,
  CapabilityRelevanceV2,
  CapabilityRequiredDepth,
  CapabilityRequirementScoreV2,
  MatchDimensionKey,
} from '../types';

export const DIMENSIONS_V2: ReadonlyArray<{ key: CapabilityDimensionKey; label: string }> = [
  { key: 'skill', label: '技能' },
  { key: 'experience', label: '经验' },
  { key: 'project', label: '项目' },
  { key: 'achievement', label: '成果' },
  { key: 'education', label: '教育专业' },
  { key: 'industry', label: '行业领域' },
];

export const IMPORTANCE_V2: Readonly<Record<CapabilityImportance, number>> = { core: 1, important: 0.8, normal: 0.5, bonus: 0.3 };
export const REQUIRED_DEPTH_V2: Readonly<Record<CapabilityRequiredDepth, number>> = { basic: 40, familiar: 60, practical: 80, expert: 100 };
export const EVIDENCE_LEVEL_V2: Readonly<Record<CapabilityEvidenceLevelV2, number>> = { none: 0, mentioned: 35, used: 70, owned: 100 };
export const RELEVANCE_V2: Readonly<Record<CapabilityRelevanceV2, number>> = { none: 0, weak: 0.3, partial: 0.7, high: 1 };
export const BACKGROUND_REQUIREMENT_V2: Readonly<Record<CapabilityBackgroundRequirementV2, number>> = { preferred: 40, required: 100 };
export const BACKGROUND_MATCH_V2: Readonly<Record<CapabilityBackgroundMatchV2, number>> = { none: 0, unrelated: 15, related: 100 };

const DIMENSION_KEYS = DIMENSIONS_V2.map(({ key }) => key);
const MATCH_DIMENSION_KEYS: MatchDimensionKey[] = [...DIMENSION_KEYS, 'other'];
const IMPORTANCE_KEYS = Object.keys(IMPORTANCE_V2) as CapabilityImportance[];
const DEPTH_KEYS = Object.keys(REQUIRED_DEPTH_V2) as CapabilityRequiredDepth[];
const EVIDENCE_KEYS = Object.keys(EVIDENCE_LEVEL_V2) as CapabilityEvidenceLevelV2[];
const RELEVANCE_KEYS = Object.keys(RELEVANCE_V2) as CapabilityRelevanceV2[];
const BACKGROUND_REQUIREMENT_KEYS = Object.keys(BACKGROUND_REQUIREMENT_V2) as CapabilityBackgroundRequirementV2[];
const BACKGROUND_MATCH_KEYS = Object.keys(BACKGROUND_MATCH_V2) as CapabilityBackgroundMatchV2[];
const HARD_STATUS_KEYS: CapabilityHardConditionStatus[] = ['met', 'not_met', 'unknown', 'not_applicable'];

export interface ValidatedCapabilityEvidenceV2 {
  items: CapabilityEvidenceItemV2[];
  warnings: string[];
}

export class CapabilityScoringValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityScoringValidationError';
  }
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function requiredText(value: unknown, field: string, index: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CapabilityScoringValidationError(`第 ${index + 1} 项缺少 ${field}`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}

function requiredBoolean(value: unknown, field: string, index: number): boolean {
  if (typeof value !== 'boolean') {
    throw new CapabilityScoringValidationError(`第 ${index + 1} 项的 ${field} 必须是布尔值`);
  }
  return value;
}

function requiredEnum<T extends string>(value: unknown, values: readonly T[], field: string, index: number): T {
  if (!isEnum(value, values)) {
    throw new CapabilityScoringValidationError(`第 ${index + 1} 项的 ${field} 非法`);
  }
  return value;
}

function round(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function fixed(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

export function validateCapabilityEvidenceV2(value: unknown): ValidatedCapabilityEvidenceV2 {
  if (!Array.isArray(value)) {
    throw new CapabilityScoringValidationError('能力证据必须是数组');
  }

  const warnings: string[] = [];
  const ids = new Set<string>();
  const items = value.map((raw, index): CapabilityEvidenceItemV2 => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new CapabilityScoringValidationError(`第 ${index + 1} 项必须是对象`);
    }
    const source = raw as Record<string, unknown>;
    const id = requiredText(source.id, 'id', index);
    if (ids.has(id)) throw new CapabilityScoringValidationError(`要求 ID 重复：${id}`);
    ids.add(id);

    const requirement = requiredText(source.requirement, 'requirement', index);
    const jobEvidence = requiredText(source.jobEvidence, 'jobEvidence', index);
    const dimension = requiredEnum(source.dimension, MATCH_DIMENSION_KEYS, 'dimension', index);
    const isHard = requiredBoolean(source.isHard, 'isHard', index);
    const isScoreable = requiredBoolean(source.isScoreable, 'isScoreable', index);
    const hardConditionStatus = source.hardConditionStatus === undefined
      ? undefined
      : requiredEnum(source.hardConditionStatus, HARD_STATUS_KEYS, 'hardConditionStatus', index);

    if (isHard && hardConditionStatus === undefined) {
      warnings.push(`${id}: 硬性条件尚未提供核查状态`);
    }

    if (!isScoreable) {
      return {
        id,
        title: optionalText(source.title),
        requirement,
        dimension,
        isHard,
        isScoreable,
        hardConditionStatus,
        jobEvidence,
      };
    }

    if (dimension === 'other') {
      throw new CapabilityScoringValidationError(`${id}: 可评分要求必须归入六个能力维度之一`);
    }

    const importance = requiredEnum(source.importance, IMPORTANCE_KEYS, 'importance', index);
    const isBackgroundDimension = dimension === 'education' || dimension === 'industry';
    let requiredDepth: CapabilityRequiredDepth | undefined;
    let backgroundRequirement: CapabilityBackgroundRequirementV2 | undefined;
    if (isBackgroundDimension) {
      backgroundRequirement = requiredEnum(source.backgroundRequirement, BACKGROUND_REQUIREMENT_KEYS, 'backgroundRequirement', index);
      if (source.requiredDepth !== undefined) {
        throw new CapabilityScoringValidationError(`${id}: 教育专业和行业领域不得使用岗位要求深度`);
      }
    } else {
      requiredDepth = requiredEnum(source.requiredDepth, DEPTH_KEYS, 'requiredDepth', index);
      if (source.backgroundRequirement !== undefined) {
        throw new CapabilityScoringValidationError(`${id}: 只有教育专业和行业领域可以使用 backgroundRequirement`);
      }
    }
    let resumeEvidenceLevel: CapabilityEvidenceLevelV2 = 'none';
    let relevance: CapabilityRelevanceV2 | undefined;
    let backgroundMatch: CapabilityBackgroundMatchV2 | undefined;
    const resumeEvidence = optionalText(source.resumeEvidence);

    if (isBackgroundDimension) {
      backgroundMatch = requiredEnum(source.backgroundMatch, BACKGROUND_MATCH_KEYS, 'backgroundMatch', index);
      if (source.resumeEvidenceLevel !== undefined || source.relevance !== undefined) {
        throw new CapabilityScoringValidationError(`${id}: 教育专业和行业领域不得使用证据等级或相关度档位`);
      }
      if (!resumeEvidence && backgroundMatch !== 'none') {
        warnings.push(`${id}: 缺少简历原文，背景匹配已归零`);
        backgroundMatch = 'none';
      }
      if (resumeEvidence && backgroundMatch === 'none') {
        throw new CapabilityScoringValidationError(`${id}: 有背景证据时 backgroundMatch 不能为 none`);
      }
    } else {
      if (source.backgroundMatch !== undefined) {
        throw new CapabilityScoringValidationError(`${id}: 只有教育专业和行业领域可以使用 backgroundMatch`);
      }
      resumeEvidenceLevel = requiredEnum(source.resumeEvidenceLevel, EVIDENCE_KEYS, 'resumeEvidenceLevel', index);
      relevance = requiredEnum(source.relevance, RELEVANCE_KEYS, 'relevance', index);
      if (!resumeEvidence && (resumeEvidenceLevel !== 'none' || relevance !== 'none')) {
        warnings.push(`${id}: 缺少简历原文，证据等级和相关度已归零`);
        resumeEvidenceLevel = 'none';
        relevance = 'none';
      }
      if (resumeEvidence && resumeEvidenceLevel === 'none' && relevance !== 'none') {
        throw new CapabilityScoringValidationError(`${id}: 证据等级为 none 时相关度必须为 none`);
      }
      if (resumeEvidence && resumeEvidenceLevel !== 'none' && relevance === 'none') {
        throw new CapabilityScoringValidationError(`${id}: 存在正向证据时相关度不能为 none`);
      }
    }

    return {
      id,
      title: optionalText(source.title),
      requirement,
      dimension,
      isHard,
      isScoreable,
      hardConditionStatus,
      importance,
      requiredDepth,
      backgroundRequirement,
      jobEvidence,
      resumeEvidenceLevel,
      relevance,
      backgroundMatch,
      resumeEvidence,
    };
  });

  return { items, warnings };
}

export function calculateRequirementScoreV2(item: CapabilityEvidenceItemV2): CapabilityRequirementScoreV2 {
  if (!item.isScoreable || item.dimension === 'other' || !item.importance) {
    throw new CapabilityScoringValidationError(`${item.id}: 不是完整的可评分要求`);
  }
  const isBackgroundDimension = item.dimension === 'education' || item.dimension === 'industry';
  if (isBackgroundDimension ? (!item.backgroundRequirement || !item.backgroundMatch) : (!item.requiredDepth || !item.resumeEvidenceLevel || !item.relevance)) {
    throw new CapabilityScoringValidationError(`${item.id}: 不是完整的可评分要求`);
  }
  const importanceValue = IMPORTANCE_V2[item.importance];
  const backgroundScore = isBackgroundDimension ? BACKGROUND_MATCH_V2[item.backgroundMatch!] : undefined;
  const requiredDepthScore = isBackgroundDimension ? BACKGROUND_REQUIREMENT_V2[item.backgroundRequirement!] : REQUIRED_DEPTH_V2[item.requiredDepth!];
  const evidenceLevelScore = isBackgroundDimension ? backgroundScore! : EVIDENCE_LEVEL_V2[item.resumeEvidenceLevel!];
  const relevanceFactor = isBackgroundDimension ? 1 : RELEVANCE_V2[item.relevance!];
  const resumeEvidenceScore = isBackgroundDimension ? backgroundScore! : fixed(evidenceLevelScore * relevanceFactor);
  const coverageScore = fixed(Math.min(resumeEvidenceScore / requiredDepthScore, 1) * 100);
  const status = coverageScore >= 80 ? 'matched' : coverageScore > 0 ? 'partial' : 'missing_evidence';

  return {
    id: item.id,
    title: item.title,
    requirement: item.requirement,
    dimension: item.dimension,
    isHard: item.isHard,
    isScoreable: true,
    importance: item.importance,
    importanceValue,
    scoringMethod: isBackgroundDimension ? 'background_match' : 'evidence_relevance',
    requiredDepth: item.requiredDepth,
    backgroundRequirement: item.backgroundRequirement,
    requiredDepthScore,
    resumeEvidenceLevel: item.resumeEvidenceLevel || 'none',
    evidenceLevelScore,
    relevance: item.relevance,
    relevanceFactor,
    backgroundMatch: item.backgroundMatch,
    resumeEvidenceScore,
    coverageScore,
    weightedCoverage: fixed(coverageScore * importanceValue),
    scoreContribution: 0,
    status,
    jobEvidence: item.jobEvidence,
    resumeEvidence: item.resumeEvidence,
  };
}

export function calculateDisplayWeightsV2(exactWeights: number[]): number[] {
  if (!exactWeights.length) return [];
  const floors = exactWeights.map((value) => Math.floor(value));
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exactWeights
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) floors[order[index].index] += 1;
  return floors;
}

function dimensionStatus(details: CapabilityRequirementScoreV2[], matchScore: number | null): { status: CapabilityDimensionStatusV2; hasCoreGap: boolean } {
  if (!details.length || matchScore === null) return { status: 'not_required', hasCoreGap: false };
  const hasCoreGap = details.some((item) => item.importance === 'core' && item.status === 'missing_evidence');
  if (hasCoreGap) return { status: 'core_gap', hasCoreGap };
  if (details.every((item) => item.status === 'missing_evidence')) return { status: 'missing_evidence', hasCoreGap };
  if (matchScore >= 80) return { status: 'matched', hasCoreGap };
  return { status: 'partial', hasCoreGap };
}

function rankedRequirement(item: CapabilityRequirementScoreV2, impact: number): CapabilityRankedRequirementV2 {
  return {
    id: item.id,
    title: item.title || item.requirement,
    dimension: item.dimension,
    impact: fixed(impact),
  };
}

export function calculateCapabilityRadarV2(value: unknown): CapabilityRadarResultV2 {
  const validated = validateCapabilityEvidenceV2(value);
  const dimensionOrder = new Map(DIMENSIONS_V2.map(({ key }, index) => [key, index]));
  const scored = validated.items
    .filter((item) => item.isScoreable)
    .map(calculateRequirementScoreV2)
    .sort((a, b) => (dimensionOrder.get(a.dimension) ?? 0) - (dimensionOrder.get(b.dimension) ?? 0) || a.id.localeCompare(b.id));
  const totalImportance = fixed(scored.reduce((sum, item) => sum + item.importanceValue, 0));

  if (totalImportance === 0) {
    return {
      scoringVersion: 'radar-v2',
      score: null,
      totalImportance: 0,
      dimensions: DIMENSIONS_V2.map(({ key, label }) => ({
        key,
        label,
        jobScore: 0,
        resumeScore: 0,
        matchScore: null,
        requirementCount: validated.items.filter((item) => item.dimension === key).length,
        scoreableCount: 0,
        importanceTotal: 0,
        exactWeight: 0,
        displayWeight: 0,
        contribution: 0,
        status: 'not_required',
        hasCoreGap: false,
        matchedCount: 0,
        partialCount: 0,
        missingCount: 0,
        details: [],
      })),
      advantages: [],
      keyGaps: [],
      validationWarnings: validated.warnings,
    };
  }

  const withContribution = scored.map((item) => ({
    ...item,
    scoreContribution: fixed(item.weightedCoverage / totalImportance),
  }));
  const importanceByDimension = DIMENSIONS_V2.map(({ key }) => fixed(withContribution.filter((item) => item.dimension === key).reduce((sum, item) => sum + item.importanceValue, 0)));
  const exactWeights = importanceByDimension.map((importance) => fixed(importance / totalImportance * 100));
  const displayWeights = calculateDisplayWeightsV2(exactWeights);

  const dimensions = DIMENSIONS_V2.map(({ key, label }, index) => {
    const details = withContribution.filter((item) => item.dimension === key);
    const importanceTotal = importanceByDimension[index];
    if (!details.length || importanceTotal === 0) {
      return {
        key,
        label,
        jobScore: 0,
        resumeScore: 0,
        matchScore: null,
        requirementCount: validated.items.filter((item) => item.dimension === key).length,
        scoreableCount: 0,
        importanceTotal: 0,
        exactWeight: 0,
        displayWeight: 0,
        contribution: 0,
        status: 'not_required' as const,
        hasCoreGap: false,
        matchedCount: 0,
        partialCount: 0,
        missingCount: 0,
        details: [],
      };
    }
    const jobScore = round(details.reduce((sum, item) => sum + item.requiredDepthScore * item.importanceValue, 0) / importanceTotal);
    const resumeScore = round(details.reduce((sum, item) => sum + item.resumeEvidenceScore * item.importanceValue, 0) / importanceTotal);
    const matchScore = round(details.reduce((sum, item) => sum + item.weightedCoverage, 0) / importanceTotal);
    const status = dimensionStatus(details, matchScore);
    return {
      key,
      label,
      jobScore,
      resumeScore,
      matchScore,
      requirementCount: validated.items.filter((item) => item.dimension === key).length,
      scoreableCount: details.length,
      importanceTotal,
      exactWeight: exactWeights[index],
      displayWeight: displayWeights[index],
      contribution: fixed(details.reduce((sum, item) => sum + item.scoreContribution, 0)),
      status: status.status,
      hasCoreGap: status.hasCoreGap,
      matchedCount: details.filter((item) => item.status === 'matched').length,
      partialCount: details.filter((item) => item.status === 'partial').length,
      missingCount: details.filter((item) => item.status === 'missing_evidence').length,
      details,
    };
  });

  const score = round(withContribution.reduce((sum, item) => sum + item.scoreContribution, 0));
  const stableSort = (a: CapabilityRequirementScoreV2, b: CapabilityRequirementScoreV2, impact: (item: CapabilityRequirementScoreV2) => number) =>
    impact(b) - impact(a) || (dimensionOrder.get(a.dimension) || 0) - (dimensionOrder.get(b.dimension) || 0) || a.id.localeCompare(b.id);
  const advantageImpact = (item: CapabilityRequirementScoreV2) => item.coverageScore * item.importanceValue;
  const gapImpact = (item: CapabilityRequirementScoreV2) => (100 - item.coverageScore) * item.importanceValue;
  const advantages = withContribution
    .filter((item) => item.coverageScore >= 80)
    .sort((a, b) => stableSort(a, b, advantageImpact))
    .slice(0, 2)
    .map((item) => rankedRequirement(item, advantageImpact(item)));
  const keyGaps = withContribution
    .filter((item) => item.coverageScore < 100)
    .sort((a, b) => {
      const coreDifference = Number(b.importance === 'core' && b.status === 'missing_evidence') - Number(a.importance === 'core' && a.status === 'missing_evidence');
      return coreDifference || stableSort(a, b, gapImpact);
    })
    .slice(0, 2)
    .map((item) => rankedRequirement(item, gapImpact(item)));

  return {
    scoringVersion: 'radar-v2',
    score,
    totalImportance,
    dimensions,
    advantages,
    keyGaps,
    validationWarnings: validated.warnings,
  };
}
