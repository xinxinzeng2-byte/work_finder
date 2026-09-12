import assert from 'node:assert/strict';
import { loadResumes, normalizeMatchResult, normalizeSavedJob, replaceJobAnalysis, replaceResumeData } from '../src/utils/storage';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  },
});

const dimensionKeys = ['skill', 'experience', 'project', 'achievement', 'education', 'industry'] as const;
const v2Radar = {
  scoringVersion: 'radar-v2',
  score: 80,
  totalImportance: 1,
  dimensions: dimensionKeys.map((key, index) => ({
    key,
    label: key,
    jobScore: index === 0 ? 80 : 0,
    resumeScore: index === 0 ? 64 : 0,
    matchScore: index === 0 ? 80 : null,
    requirementCount: index === 0 ? 1 : 0,
    scoreableCount: index === 0 ? 1 : 0,
    importanceTotal: index === 0 ? 1 : 0,
    exactWeight: index === 0 ? 100 : 0,
    displayWeight: index === 0 ? 100 : 0,
    contribution: index === 0 ? 80 : 0,
    status: index === 0 ? 'matched' : 'not_required',
    hasCoreGap: false,
    matchedCount: index === 0 ? 1 : 0,
    partialCount: 0,
    missingCount: 0,
    details: index === 0 ? [{
      id: 'req-1', requirement: 'TypeScript', dimension: 'skill', isHard: false, isScoreable: true,
      importance: 'core', importanceValue: 1, scoringMethod: 'evidence_relevance', requiredDepth: 'practical',
      requiredDepthScore: 80, resumeEvidenceLevel: 'used', evidenceLevelScore: 70, relevance: 'high',
      relevanceFactor: 1, resumeEvidenceScore: 70, coverageScore: 87.5, weightedCoverage: 87.5,
      scoreContribution: 80, status: 'matched', jobEvidence: 'TypeScript', resumeEvidence: 'TypeScript 项目',
    }] : [],
  })),
  advantages: [{ id: 'req-1', title: 'TypeScript', dimension: 'skill', impact: 80 }],
  keyGaps: [],
  validationWarnings: [],
};
const v2 = {
  score: 80,
  hardConditionCheck: [], skillMatch: [], gaps: [], summary: '测试', capabilityRadar: v2Radar,
  capabilityEvidence: [{ id: 'req-1', requirement: 'TypeScript', dimension: 'skill', isHard: false, isScoreable: true, jobEvidence: 'TypeScript' }],
  standardizedRequirements: [],
  metadata: { scoringVersion: 'radar-v2', extractionVersion: 'match-extraction-v2.1', inputHash: 'hash-v2', requirementCacheHit: false, evidenceCacheHit: false },
};

const restoredV2 = normalizeMatchResult(JSON.parse(JSON.stringify(v2)));
assert.equal('metadata' in restoredV2 && restoredV2.metadata.scoringVersion, 'radar-v2');
assert.equal(restoredV2.capabilityRadar?.dimensions.length, 6);

const restoredLegacy = normalizeMatchResult({ score: 66, hardConditionCheck: [], skillMatch: [], gaps: [], summary: '旧记录' });
assert.equal(restoredLegacy.score, 66);
assert.equal('metadata' in restoredLegacy, false);

const incompleteV2 = normalizeMatchResult({ ...v2, capabilityRadar: { scoringVersion: 'radar-v2', dimensions: [] } });
assert.equal(incompleteV2.score, null, '不完整的 v2 数据不得展示半成品分数');
assert.equal(incompleteV2.capabilityRadar, undefined);
const truncatedV2 = normalizeMatchResult({ ...v2, capabilityEvidence: [] });
assert.equal(truncatedV2.score, null, '缺少评分项证据的 v2 数据不得展示半成品分数');
assert.equal(truncatedV2.capabilityRadar, undefined);

const resume = { basicInfo: {}, skills: [], experiences: [], rawText: '原始简历' };
memory.set('wf_resumes', JSON.stringify([{ id: 'resume-1', name: '简历', type: 'original', resume, uploadedAt: '2026-09-12T00:00:00.000Z', version: 1, isCurrent: true, targetJob: { position: '测试岗位', matchScore: null } }]));
assert.equal(loadResumes()[0].targetJob?.matchScore, null, '无评分项不得在定制简历记录中伪造成 0 分');
const updatedResume = await replaceResumeData('resume-1', { ...resume, rawText: '原始简历\n补录经历' });
assert.equal(updatedResume.version, 2);
assert.equal(JSON.parse(memory.get('wf_resumes')!)[0].version, 2, '刷新后简历版本应持久化');

const oldJob = { id: 'job-1', jd: { requirements: [], rawText: '' }, matchResult: restoredLegacy, savedAt: '2026-09-12T00:00:00.000Z', status: 'analyzed' };
memory.set('wf_saved_jobs', JSON.stringify([oldJob]));
await replaceJobAnalysis({ ...oldJob, matchResult: restoredV2, matchScore: 80, scoringVersion: 'radar-v2', inputHash: 'hash-v2', analyzedResumeId: 'resume-1', analyzedResumeVersion: 2, resumeSnapshot: updatedResume.resume });
const restoredJob = normalizeSavedJob(JSON.parse(memory.get('wf_saved_jobs')!)[0]);
assert.equal(restoredJob.scoringVersion, 'radar-v2');
assert.equal(restoredJob.inputHash, 'hash-v2');
assert.equal(restoredJob.analyzedResumeVersion, 2);
assert.equal('metadata' in restoredJob.matchResult && restoredJob.matchResult.metadata.inputHash, 'hash-v2');

console.log('client storage compatibility tests passed');
