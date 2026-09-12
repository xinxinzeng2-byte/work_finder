import assert from 'node:assert/strict';
import type { CapabilityDimensionKey, CapabilityEvidenceItemV2, CapabilityImportance } from '../types';
import {
  CapabilityScoringValidationError,
  DIMENSIONS_V2,
  calculateCapabilityRadarV2,
  calculateDisplayWeightsV2,
  calculateRequirementScoreV2,
  validateCapabilityEvidenceV2,
} from './capabilityScoringV2';

function scoreable(
  id: string,
  dimension: CapabilityDimensionKey,
  options: Partial<CapabilityEvidenceItemV2> = {},
): CapabilityEvidenceItemV2 {
  const background = dimension === 'education' || dimension === 'industry';
  return {
    id,
    title: id,
    requirement: `${id} 要求`,
    dimension,
    isHard: false,
    isScoreable: true,
    importance: 'important',
    ...(background ? { backgroundRequirement: 'preferred' as const, backgroundMatch: 'related' as const } : { requiredDepth: 'practical' as const, resumeEvidenceLevel: 'owned' as const, relevance: 'high' as const }),
    jobEvidence: `${id} 岗位原文`,
    resumeEvidence: `${id} 简历原文`,
    ...options,
  };
}

function notScoreable(id: string, isHard: boolean): CapabilityEvidenceItemV2 {
  return {
    id,
    requirement: `${id} 条件`,
    dimension: 'other',
    isHard,
    isScoreable: false,
    hardConditionStatus: isHard ? 'unknown' : undefined,
    jobEvidence: `${id} 岗位原文`,
  };
}

function expectValidationError(value: unknown, message: RegExp): void {
  assert.throws(
    () => validateCapabilityEvidenceV2(value),
    (error: unknown) => error instanceof CapabilityScoringValidationError && message.test(error.message),
  );
}

const mappingCases = [
  { requiredDepth: 'basic' as const, requiredDepthScore: 40 },
  { requiredDepth: 'familiar' as const, requiredDepthScore: 60 },
  { requiredDepth: 'practical' as const, requiredDepthScore: 80 },
  { requiredDepth: 'expert' as const, requiredDepthScore: 100 },
];
for (const mapping of mappingCases) {
  assert.equal(calculateRequirementScoreV2(scoreable(`depth-${mapping.requiredDepth}`, 'skill', { requiredDepth: mapping.requiredDepth })).requiredDepthScore, mapping.requiredDepthScore);
}
const evidenceMappingCases = [
  { level: 'none' as const, score: 0, evidence: undefined, relevance: 'none' as const },
  { level: 'mentioned' as const, score: 35, evidence: '证据', relevance: 'high' as const },
  { level: 'used' as const, score: 70, evidence: '证据', relevance: 'high' as const },
  { level: 'owned' as const, score: 100, evidence: '证据', relevance: 'high' as const },
];
for (const mapping of evidenceMappingCases) {
  assert.equal(calculateRequirementScoreV2(scoreable(`evidence-${mapping.level}`, 'skill', {
    resumeEvidenceLevel: mapping.level,
    relevance: mapping.relevance,
    resumeEvidence: mapping.evidence,
  })).evidenceLevelScore, mapping.score);
}
const relevanceMappingCases = [
  { relevance: 'none' as const, factor: 0, level: 'none' as const, evidence: undefined },
  { relevance: 'weak' as const, factor: 0.3, level: 'owned' as const, evidence: '证据' },
  { relevance: 'partial' as const, factor: 0.7, level: 'owned' as const, evidence: '证据' },
  { relevance: 'high' as const, factor: 1, level: 'owned' as const, evidence: '证据' },
];
for (const mapping of relevanceMappingCases) {
  assert.equal(calculateRequirementScoreV2(scoreable(`relevance-${mapping.relevance}`, 'skill', {
    resumeEvidenceLevel: mapping.level,
    relevance: mapping.relevance,
    resumeEvidence: mapping.evidence,
  })).relevanceFactor, mapping.factor);
}
for (const importance of ['core', 'important', 'normal', 'bonus'] as CapabilityImportance[]) {
  assert.ok(calculateRequirementScoreV2(scoreable(`importance-${importance}`, 'skill', { importance })).importanceValue > 0);
}

const exact = calculateRequirementScoreV2(scoreable('exact', 'skill'));
assert.equal(exact.requiredDepthScore, 80);
assert.equal(exact.evidenceLevelScore, 100);
assert.equal(exact.relevanceFactor, 1);
assert.equal(exact.resumeEvidenceScore, 100);
assert.equal(exact.coverageScore, 100);
assert.equal(exact.status, 'matched');

const partial = calculateRequirementScoreV2(scoreable('partial', 'skill', {
  resumeEvidenceLevel: 'used',
  relevance: 'partial',
}));
assert.equal(partial.resumeEvidenceScore, 49);
assert.equal(partial.coverageScore, 61.25);
assert.equal(partial.status, 'partial');

const backgroundCoverageCases = [
  { requirement: 'preferred' as const, match: 'none' as const, expected: 0 },
  { requirement: 'preferred' as const, match: 'unrelated' as const, expected: 37.5 },
  { requirement: 'preferred' as const, match: 'related' as const, expected: 100 },
  { requirement: 'required' as const, match: 'none' as const, expected: 0 },
  { requirement: 'required' as const, match: 'unrelated' as const, expected: 15 },
  { requirement: 'required' as const, match: 'related' as const, expected: 100 },
];
for (const backgroundCase of backgroundCoverageCases) {
  const result = calculateRequirementScoreV2(scoreable(`background-${backgroundCase.requirement}-${backgroundCase.match}`, 'education', {
    backgroundRequirement: backgroundCase.requirement,
    backgroundMatch: backgroundCase.match,
    resumeEvidence: backgroundCase.match === 'none' ? undefined : '专业背景证据',
    requiredDepth: undefined,
  }));
  assert.equal(result.requiredDepthScore, backgroundCase.requirement === 'preferred' ? 40 : 100);
  assert.equal(result.resumeEvidenceScore, backgroundCase.match === 'none' ? 0 : backgroundCase.match === 'unrelated' ? 15 : 100);
  assert.equal(result.coverageScore, backgroundCase.expected);
}

const missing = calculateRequirementScoreV2(scoreable('missing', 'skill', {
  resumeEvidenceLevel: 'none',
  relevance: 'none',
  resumeEvidence: undefined,
}));
assert.equal(missing.resumeEvidenceScore, 0);
assert.equal(missing.coverageScore, 0);
assert.equal(missing.status, 'missing_evidence');

const exceeded = calculateRequirementScoreV2(scoreable('exceeded', 'skill', {
  requiredDepth: 'basic',
  resumeEvidenceLevel: 'owned',
  relevance: 'high',
}));
assert.equal(exceeded.coverageScore, 100, '能力证据超过岗位要求时必须封顶 100%');

const sanitized = validateCapabilityEvidenceV2([scoreable('sanitized', 'skill', {
  resumeEvidenceLevel: 'owned',
  relevance: 'high',
  resumeEvidence: undefined,
})]);
assert.equal(sanitized.items[0].resumeEvidenceLevel, 'none');
assert.equal(sanitized.items[0].relevance, 'none');
assert.equal(sanitized.warnings.length, 1);

expectValidationError({}, /必须是数组/);
expectValidationError([{ ...scoreable('duplicate', 'skill') }, { ...scoreable('duplicate', 'project') }], /ID 重复/);
expectValidationError([{ ...scoreable('invalid-enum', 'skill'), importance: 'urgent' }], /importance 非法/);
expectValidationError([{ ...scoreable('other-scoreable', 'skill'), dimension: 'other' }], /六个能力维度/);
expectValidationError([{ ...scoreable('missing-boolean', 'skill'), isScoreable: undefined }], /isScoreable 必须是布尔值/);
expectValidationError([{ ...scoreable('invalid-relevance', 'skill'), relevance: 'none' }], /相关度不能为 none/);

const hardNotScoreable = notScoreable('location', true);
const hardScoreable = scoreable('required-skill', 'skill', { isHard: true, hardConditionStatus: 'met' });
const softScoreable = scoreable('bonus-project', 'project', { importance: 'bonus' });
const softNotScoreable = notScoreable('benefit', false);
const fourCombinations = calculateCapabilityRadarV2([hardNotScoreable, hardScoreable, softScoreable, softNotScoreable]);
assert.equal(fourCombinations.dimensions.reduce((sum, dimension) => sum + dimension.scoreableCount, 0), 2);
assert.equal(fourCombinations.dimensions.find((dimension) => dimension.key === 'skill')?.requirementCount, 1);
assert.equal(fourCombinations.dimensions.find((dimension) => dimension.key === 'project')?.requirementCount, 1);

const emptyScore = calculateCapabilityRadarV2([hardNotScoreable, softNotScoreable]);
assert.equal(emptyScore.score, null);
assert.equal(emptyScore.totalImportance, 0);
assert.equal(emptyScore.dimensions.reduce((sum, dimension) => sum + dimension.displayWeight, 0), 0);

for (let activeCount = 1; activeCount <= DIMENSIONS_V2.length; activeCount += 1) {
  const input = DIMENSIONS_V2.slice(0, activeCount).map(({ key }, index) => scoreable(`dimension-${activeCount}-${index}`, key));
  const result = calculateCapabilityRadarV2(input);
  assert.equal(result.dimensions.reduce((sum, dimension) => sum + dimension.displayWeight, 0), 100, `${activeCount} 个有效维度的展示权重必须合计 100%`);
  assert.ok(Math.abs(result.dimensions.reduce((sum, dimension) => sum + dimension.exactWeight, 0) - 100) < 0.00001);
  assert.ok(result.score !== null && result.score >= 0 && result.score <= 100);
  if (activeCount === 1) assert.equal(result.dimensions[0].displayWeight, 100);
}

assert.deepEqual(calculateDisplayWeightsV2([33.333333, 33.333333, 33.333333]), [34, 33, 33]);
assert.deepEqual(calculateDisplayWeightsV2([20, 30, 50]), [20, 30, 50]);

const weighted = calculateCapabilityRadarV2([
  scoreable('core-skill', 'skill', { importance: 'core' }),
  scoreable('normal-project', 'project', { importance: 'normal' }),
  scoreable('bonus-education', 'education', { importance: 'bonus', backgroundRequirement: 'preferred', backgroundMatch: 'related' }),
]);
assert.equal(weighted.totalImportance, 1.8);
assert.deepEqual(weighted.dimensions.map((dimension) => dimension.displayWeight), [55, 0, 28, 0, 17, 0]);
assert.equal(weighted.score, 100);

const multiDimensionExample = calculateCapabilityRadarV2([
  scoreable('example-skill', 'skill', { importance: 'core', requiredDepth: 'practical', resumeEvidenceLevel: 'owned', relevance: 'high' }),
  scoreable('example-project', 'project', { importance: 'important', requiredDepth: 'practical', resumeEvidenceLevel: 'used', relevance: 'high' }),
  scoreable('example-education', 'education', { importance: 'normal', backgroundRequirement: 'preferred', backgroundMatch: 'unrelated' }),
]);
assert.deepEqual(multiDimensionExample.dimensions.map((dimension) => dimension.displayWeight), [43, 0, 35, 0, 22, 0]);
assert.equal(multiDimensionExample.score, 82, 'used=70 且背景不相关按 37.5% 覆盖后，多维度案例必须使用内部精确权重得到 82 分');

const coreGap = calculateCapabilityRadarV2([
  scoreable('core-missing', 'skill', {
    isHard: true,
    hardConditionStatus: 'not_met',
    importance: 'core',
    resumeEvidenceLevel: 'none',
    relevance: 'none',
    resumeEvidence: undefined,
  }),
  scoreable('bonus-met', 'skill', { importance: 'bonus', requiredDepth: 'basic', resumeEvidenceLevel: 'owned' }),
]);
const coreGapDimension = coreGap.dimensions.find((dimension) => dimension.key === 'skill');
assert.equal(coreGap.score, 23, '核心缺口案例保留正常计算得到的 23 分');
assert.equal(coreGapDimension?.matchScore, 23);
assert.equal(coreGapDimension?.status, 'core_gap');
assert.equal(coreGapDimension?.hasCoreGap, true);
assert.equal(coreGap.keyGaps[0]?.id, 'core-missing');

const sameJdResumeA = calculateCapabilityRadarV2([
  scoreable('same-jd-skill', 'skill', { importance: 'core', resumeEvidenceLevel: 'owned' }),
  scoreable('same-jd-project', 'project', { importance: 'normal', resumeEvidenceLevel: 'used', relevance: 'high' }),
]);
const sameJdResumeB = calculateCapabilityRadarV2([
  scoreable('same-jd-skill', 'skill', { importance: 'core', resumeEvidenceLevel: 'none', relevance: 'none', resumeEvidence: undefined }),
  scoreable('same-jd-project', 'project', { importance: 'normal', resumeEvidenceLevel: 'owned', relevance: 'high' }),
]);
assert.deepEqual(sameJdResumeA.dimensions.map((dimension) => dimension.exactWeight), sameJdResumeB.dimensions.map((dimension) => dimension.exactWeight), '同一 JD 更换简历证据后权重必须不变');
assert.notEqual(sameJdResumeA.score, sameJdResumeB.score, '不同简历证据应允许产生不同总分');

const nonScoreableChanged = calculateCapabilityRadarV2([
  scoreable('stable-score', 'skill'),
  notScoreable('location-a', true),
]);
const nonScoreableChangedAgain = calculateCapabilityRadarV2([
  scoreable('stable-score', 'skill'),
  { ...notScoreable('location-a', true), requirement: '完全不同的地点条件', jobEvidence: '另一个岗位原文' },
]);
assert.equal(nonScoreableChanged.score, nonScoreableChangedAgain.score);
assert.deepEqual(nonScoreableChanged.dimensions.map((dimension) => dimension.displayWeight), nonScoreableChangedAgain.dimensions.map((dimension) => dimension.displayWeight));

const orderInput = [
  scoreable('b-skill', 'skill', { importance: 'core' }),
  scoreable('a-project', 'project', { importance: 'normal', relevance: 'high' }),
  scoreable('c-education', 'education', { importance: 'bonus', backgroundRequirement: 'preferred', backgroundMatch: 'none', resumeEvidence: undefined }),
];
const ordered = calculateCapabilityRadarV2(orderInput);
const reversed = calculateCapabilityRadarV2([...orderInput].reverse());
assert.deepEqual(ordered, reversed, '输入顺序不得改变 radar-v2 结果');
for (let iteration = 0; iteration < 100; iteration += 1) assert.deepEqual(calculateCapabilityRadarV2(orderInput), ordered);

const itemScoreFromDetails = ordered.dimensions.flatMap((dimension) => dimension.details).reduce((sum, detail) => sum + detail.scoreContribution, 0);
const dimensionScore = ordered.dimensions.reduce((sum, dimension) => sum + dimension.contribution, 0);
assert.equal(Math.round(itemScoreFromDetails), ordered.score);
assert.equal(Math.round(dimensionScore), ordered.score);

const importances: CapabilityImportance[] = ['core', 'important', 'normal', 'bonus'];
let seed = 20260910;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};
for (let caseIndex = 0; caseIndex < 200; caseIndex += 1) {
  const count = 1 + Math.floor(random() * 24);
  const input = Array.from({ length: count }, (_, index) => {
    const dimension = DIMENSIONS_V2[Math.floor(random() * DIMENSIONS_V2.length)].key;
    const importance = importances[Math.floor(random() * importances.length)];
    const evidence = random();
    const hasEvidence = evidence >= 0.25;
    const background = dimension === 'education' || dimension === 'industry';
    return scoreable(`property-${caseIndex}-${index}`, dimension, {
      importance,
      ...(background
        ? { backgroundRequirement: (evidence < 0.5 ? 'preferred' as const : 'required' as const), backgroundMatch: !hasEvidence ? 'none' as const : evidence < 0.6 ? 'unrelated' as const : 'related' as const }
        : {
            resumeEvidenceLevel: !hasEvidence ? 'none' as const : evidence < 0.5 ? 'mentioned' as const : evidence < 0.75 ? 'used' as const : 'owned' as const,
            relevance: !hasEvidence ? 'none' as const : evidence < 0.5 ? 'weak' as const : evidence < 0.75 ? 'partial' as const : 'high' as const,
          }),
      resumeEvidence: hasEvidence ? `property-${caseIndex}-${index} 证据` : undefined,
    });
  });
  const result = calculateCapabilityRadarV2(input);
  assert.equal(result.dimensions.reduce((sum, dimension) => sum + dimension.displayWeight, 0), 100);
  assert.ok(result.score !== null && result.score >= 0 && result.score <= 100);
  assert.ok(Math.abs(result.dimensions.reduce((sum, dimension) => sum + dimension.exactWeight, 0) - 100) < 0.00001);
  assert.equal(Math.round(result.dimensions.reduce((sum, dimension) => sum + dimension.contribution, 0)), result.score);
}

console.log('capabilityScoringV2 tests passed');
