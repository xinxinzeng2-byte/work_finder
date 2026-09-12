import assert from 'node:assert/strict';
import { calculateCapabilityRadar, normalizeCapabilityEvidence } from './capabilityScoring';
import { equivalentJdFixtures, jobMatchingGoldenFixtures, realRecordValidationFixtures } from './fixtures/jobMatchingGoldenFixtures';

const expectedBaseline = {
  fixtures: {
    'single-skill-exact': { score: 40, weights: [40, 0, 0, 0, 0, 0], statuses: ['matched', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'single-skill-missing': { score: 0, weights: [40, 0, 0, 0, 0, 0], statuses: ['missing', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'two-dimensions': { score: 60, weights: [40, 0, 0, 0, 40, 0], statuses: ['partial', 'not_required', 'not_required', 'not_required', 'partial', 'not_required'] },
    'all-six-dimensions': { score: 63, weights: [26, 20, 20, 13, 13, 8], statuses: ['matched', 'partial', 'matched', 'missing', 'partial', 'missing'] },
    'core-gap-with-bonuses': { score: 19, weights: [40, 0, 0, 0, 0, 0], statuses: ['partial', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'core-met-bonuses-missing': { score: 30, weights: [40, 0, 0, 0, 0, 0], statuses: ['missing', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'hard-not-scoreable-location': null,
    'hard-scoreable-skill': { score: 40, weights: [40, 0, 0, 0, 0, 0], statuses: ['matched', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'duplicate-requirement': { score: 30, weights: [40, 0, 0, 0, 0, 0], statuses: ['partial', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'alternative-tools': { score: 40, weights: [40, 0, 0, 0, 0, 0], statuses: ['matched', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'compound-independent': { score: 40, weights: [40, 0, 40, 0, 0, 0], statuses: ['matched', 'not_required', 'missing', 'not_required', 'not_required', 'not_required'] },
    'mentioned-without-practice': { score: 15, weights: [40, 0, 0, 0, 0, 0], statuses: ['partial', 'not_required', 'not_required', 'not_required', 'not_required', 'not_required'] },
    'transferable-experience': { score: 32, weights: [0, 0, 0, 0, 0, 40], statuses: ['not_required', 'not_required', 'not_required', 'not_required', 'not_required', 'matched'] },
    'supplement-before': { score: 0, weights: [0, 0, 0, 40, 0, 0], statuses: ['not_required', 'not_required', 'not_required', 'missing', 'not_required', 'not_required'] },
    'supplement-after': { score: 40, weights: [0, 0, 0, 40, 0, 0], statuses: ['not_required', 'not_required', 'not_required', 'matched', 'not_required', 'not_required'] },
  },
  equivalentJdCount: 3,
};

type Snapshot = Exclude<(typeof expectedBaseline.fixtures)[keyof typeof expectedBaseline.fixtures], null>;

function snapshotFixture(id: string): Snapshot | null {
  const fixture = jobMatchingGoldenFixtures.find((candidate) => candidate.id === id);
  assert.ok(fixture, `找不到黄金样本 ${id}`);
  const normalized = normalizeCapabilityEvidence(fixture.evidence);
  if (!normalized.some((entry) => entry.dimension !== 'other')) return null;
  const result = calculateCapabilityRadar(normalized);
  return {
    score: result.score,
    weights: result.radar.dimensions.map((dimension) => dimension.weight),
    statuses: result.radar.dimensions.map((dimension) => dimension.status),
  };
}

assert.equal(jobMatchingGoldenFixtures.length, 15, '阶段 1 必须包含 15 组黄金样本');
assert.equal(realRecordValidationFixtures.length, 3, '阶段 1 必须包含 3 组真实脱敏样本');
assert.equal(equivalentJdFixtures.length, expectedBaseline.equivalentJdCount, '必须包含 3 组等价 JD');
assert.equal(new Set(jobMatchingGoldenFixtures.map((fixture) => fixture.id)).size, jobMatchingGoldenFixtures.length, '黄金样本 ID 必须唯一');
assert.equal(new Set(realRecordValidationFixtures.map((fixture) => fixture.id)).size, realRecordValidationFixtures.length, '真实脱敏样本 ID 必须唯一');
assert.equal(new Set(equivalentJdFixtures.map((fixture) => fixture.equivalenceGroup)).size, 1, '三组等价 JD 必须属于同一语义组');
realRecordValidationFixtures.forEach((fixture) => {
  assert.equal(fixture.source, 'dev-database-redacted');
  assert.ok(fixture.privacyNote.includes('不含姓名'));
  assert.ok(fixture.jdRequirements.length >= 5);
  assert.ok(fixture.resumeEvidence.length >= 4);
  assert.ok(fixture.expectedBusiness.length >= 4);
});

for (const [id, expected] of Object.entries(expectedBaseline.fixtures)) {
  const first = snapshotFixture(id);
  const second = snapshotFixture(id);
  assert.deepEqual(first, second, `${id} 的旧算法输出必须可重复`);
  assert.deepEqual(first, expected, `${id} 的旧算法基线发生变化；如为有意修改，请更新基线说明`);
}

const oneDimension = snapshotFixture('single-skill-exact');
assert.equal(oneDimension?.weights.reduce((sum, weight) => sum + weight, 0), 40, '基线应暴露旧算法单维度只能分配 40% 的问题');
const twoDimensions = snapshotFixture('two-dimensions');
assert.equal(twoDimensions?.weights.reduce((sum, weight) => sum + weight, 0), 80, '基线应暴露旧算法双维度可能只能分配 80% 的问题');

console.log('capabilityScoring baseline tests passed');
