import type {
  CapabilityDetail,
  CapabilityDetailStatus,
  CapabilityDimension,
  CapabilityDimensionKey,
  CapabilityEvidenceItem,
  CapabilityEvidenceLevel,
  CapabilityImportance,
  CapabilityRadarResult,
  CapabilityRelevance,
  CapabilityRequiredDepth,
} from '../types';

export const DIMENSIONS: ReadonlyArray<{ key: CapabilityDimensionKey; label: string }> = [
  { key: 'skill', label: '技能' },
  { key: 'experience', label: '经验' },
  { key: 'project', label: '项目' },
  { key: 'achievement', label: '成果' },
  { key: 'education', label: '教育专业' },
  { key: 'industry', label: '行业领域' },
];

const IMPORTANCE: Record<CapabilityImportance, number> = { core: 1, important: 0.8, normal: 0.5, bonus: 0.3 };
const REQUIRED_DEPTH: Record<CapabilityRequiredDepth, number> = { basic: 40, familiar: 60, practical: 80, expert: 100 };
const EVIDENCE_LEVEL: Record<CapabilityEvidenceLevel, number> = { none: 0, mentioned: 30, used: 60, owned: 80, achieved: 100 };
const RELEVANCE: Record<CapabilityRelevance, number> = { none: 0, weak: 0.2, partial: 0.5, high: 0.8, exact: 1 };

const isKey = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T);
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const round = (value: number) => Math.round(clamp(value));

export function normalizeCapabilityEvidence(value: unknown): CapabilityEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  const dimensionKeys = DIMENSIONS.map((item) => item.key);
  const importanceKeys = Object.keys(IMPORTANCE) as CapabilityImportance[];
  const depthKeys = Object.keys(REQUIRED_DEPTH) as CapabilityRequiredDepth[];
  const evidenceKeys = Object.keys(EVIDENCE_LEVEL) as CapabilityEvidenceLevel[];
  const relevanceKeys = Object.keys(RELEVANCE) as CapabilityRelevance[];

  return value.flatMap((raw): CapabilityEvidenceItem[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const requirement = typeof item.requirement === 'string' ? item.requirement.trim() : '';
    if (!requirement || !(isKey(item.dimension, dimensionKeys) || item.dimension === 'other')) return [];
    const resumeEvidenceLevel = isKey(item.resumeEvidenceLevel, evidenceKeys) ? item.resumeEvidenceLevel : 'none';
    const resumeEvidence = typeof item.resumeEvidence === 'string' ? item.resumeEvidence.trim() : '';
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `req_${requirement.slice(0, 24)}`,
      title: typeof item.title === 'string' ? item.title.trim() || undefined : undefined,
      requirement,
      dimension: item.dimension as CapabilityEvidenceItem['dimension'],
      isHard: item.isHard === true,
      importance: isKey(item.importance, importanceKeys) ? item.importance : 'normal',
      requiredDepth: isKey(item.requiredDepth, depthKeys) ? item.requiredDepth : 'familiar',
      jobEvidence: typeof item.jobEvidence === 'string' ? item.jobEvidence.trim() : requirement,
      resumeEvidenceLevel: resumeEvidence ? resumeEvidenceLevel : 'none',
      relevance: resumeEvidence && isKey(item.relevance, relevanceKeys) ? item.relevance : 'none',
      resumeEvidence: resumeEvidence || undefined,
    }];
  });
}

function detailStatus(resumeScore: number, requiredScore: number): CapabilityDetailStatus {
  if (resumeScore <= 0) return 'missing';
  return resumeScore / requiredScore >= 0.8 ? 'matched' : 'partial';
}

function calculateWeights(groups: Map<CapabilityDimensionKey, CapabilityEvidenceItem[]>): Map<CapabilityDimensionKey, number> {
  const active = DIMENSIONS.filter(({ key }) => (groups.get(key)?.length || 0) > 0);
  const result = new Map<CapabilityDimensionKey, number>();
  if (!active.length) return result;

  const importanceTotals = active.map(({ key }) => (groups.get(key) || []).reduce((sum, item) => sum + IMPORTANCE[item.importance], 0));
  const total = importanceTotals.reduce((sum, value) => sum + value, 0);
  let weights = importanceTotals.map((value) => value / total * 100);

  for (let iteration = 0; iteration < 12; iteration += 1) {
    weights = weights.map((value) => Math.max(5, Math.min(40, value)));
    const sum = weights.reduce((current, value) => current + value, 0);
    const flexible = weights.map((value, index) => ({ value, index })).filter(({ value }) => value > 5.0001 && value < 39.9999);
    const delta = 100 - sum;
    if (Math.abs(delta) < 0.001 || flexible.length === 0) break;
    flexible.forEach(({ index }) => { weights[index] += delta / flexible.length; });
  }

  const rounded = weights.map((value) => Math.round(value));
  let delta = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = weights.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => delta > 0 ? b.fraction - a.fraction : a.fraction - b.fraction);
  for (let index = 0; delta !== 0 && index < order.length * 2; index += 1) {
    const target = order[index % order.length].index;
    const change = delta > 0 ? 1 : -1;
    if (rounded[target] + change >= 5 && rounded[target] + change <= 40) {
      rounded[target] += change;
      delta -= change;
    }
  }
  active.forEach(({ key }, index) => result.set(key, rounded[index]));
  return result;
}

export function calculateCapabilityRadar(input: CapabilityEvidenceItem[]): { radar: CapabilityRadarResult; score: number } {
  const evidence = normalizeCapabilityEvidence(input);
  if (!evidence.length) throw new Error('AI 未返回可计算的六维能力证据');
  const dimensionEvidence = evidence.filter((item) => item.dimension !== 'other');
  if (!dimensionEvidence.length) throw new Error('AI 未返回可计算的六维能力证据');

  const groups = new Map<CapabilityDimensionKey, CapabilityEvidenceItem[]>();
  DIMENSIONS.forEach(({ key }) => groups.set(key, evidence.filter((item) => item.dimension === key)));
  const weights = calculateWeights(groups);

  const dimensions: CapabilityDimension[] = DIMENSIONS.map(({ key, label }) => {
    const items = groups.get(key) || [];
    if (!items.length) return { key, label, jobScore: 0, resumeScore: 0, matchScore: null, weight: 0, status: 'not_required', matchedCount: 0, partialCount: 0, missingCount: 0, details: [] };
    const totalImportance = items.reduce((sum, item) => sum + IMPORTANCE[item.importance], 0);
    const jobScore = round(items.reduce((sum, item) => sum + REQUIRED_DEPTH[item.requiredDepth] * IMPORTANCE[item.importance], 0) / totalImportance);
    const resumeScore = round(items.reduce((sum, item) => sum + EVIDENCE_LEVEL[item.resumeEvidenceLevel] * RELEVANCE[item.relevance] * IMPORTANCE[item.importance], 0) / totalImportance);
    const matchScore = round(jobScore ? resumeScore / jobScore * 100 : 0);
    const allDetails: CapabilityDetail[] = items.map((item) => {
      const itemJob = REQUIRED_DEPTH[item.requiredDepth];
      const itemResume = EVIDENCE_LEVEL[item.resumeEvidenceLevel] * RELEVANCE[item.relevance];
      return {
        id: item.id,
        title: item.title,
        requirement: item.requirement,
        status: detailStatus(itemResume, itemJob),
        dimension: item.dimension === 'other' ? undefined : item.dimension,
        isHard: item.isHard,
        jobEvidence: item.jobEvidence,
        evidence: item.resumeEvidence || '简历中未发现明确证据',
        analysisSection: itemResume > 0 ? 'skill' : 'gap',
      };
    });
    const details = allDetails;
    const counts = allDetails.reduce((result, item) => ({ ...result, [item.status]: result[item.status] + 1 }), { matched: 0, partial: 0, missing: 0 });
    const hasMissingCore = items.some((item, index) => item.importance === 'core' && allDetails[index].status === 'missing');
    const status = resumeScore === 0 || (counts.missing / allDetails.length >= 0.6) ? 'missing' : matchScore >= 80 && !hasMissingCore ? 'matched' : 'partial';
    return { key, label, jobScore, resumeScore, matchScore, weight: weights.get(key) || 0, status, matchedCount: counts.matched, partialCount: counts.partial, missingCount: counts.missing, details };
  });

  const score = round(dimensions.reduce((sum, item) => sum + (item.matchScore || 0) * item.weight / 100, 0));
  const active = dimensions.filter((item) => item.weight > 0 && item.matchScore !== null);
  const advantages = active.filter((item) => (item.matchScore || 0) >= 80).sort((a, b) => ((b.matchScore || 0) * b.weight) - ((a.matchScore || 0) * a.weight)).slice(0, 2).map((item) => item.label);
  const keyGaps = active.filter((item) => (item.matchScore || 0) < 100).sort((a, b) => ((100 - (b.matchScore || 0)) * b.weight) - ((100 - (a.matchScore || 0)) * a.weight)).slice(0, 2).map((item) => item.label);

  return { radar: { scoringVersion: 'radar-v1', dimensions, advantages, keyGaps }, score };
}
