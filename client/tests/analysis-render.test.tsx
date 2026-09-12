import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CapabilityRadar } from '../src/components/CapabilityRadar';
import { AnalyzeView, matchesSelectedDimension } from '../src/components/views/AnalyzeView';

const keys = ['skill', 'experience', 'project', 'achievement', 'education', 'industry'] as const;
const details = [{
  id: 'req-1', requirement: 'TypeScript', dimension: 'skill' as const, isHard: false, isScoreable: true as const,
  importance: 'core' as const, importanceValue: 1, scoringMethod: 'evidence_relevance' as const, requiredDepth: 'practical' as const,
  requiredDepthScore: 80, resumeEvidenceLevel: 'used' as const, evidenceLevelScore: 70, relevance: 'high' as const,
  relevanceFactor: 1, resumeEvidenceScore: 70, coverageScore: 87.5, weightedCoverage: 87.5,
  scoreContribution: 87.5, status: 'matched' as const, jobEvidence: 'TypeScript', resumeEvidence: 'TypeScript 项目',
}];
const v2 = {
  scoringVersion: 'radar-v2' as const,
  score: 88,
  totalImportance: 1,
  dimensions: keys.map((key, index) => ({
    key, label: key, jobScore: index === 0 ? 80 : 0, resumeScore: index === 0 ? 70 : 0,
    matchScore: index === 0 ? 88 : null, requirementCount: index === 0 ? 1 : 0, scoreableCount: index === 0 ? 1 : 0,
    importanceTotal: index === 0 ? 1 : 0, exactWeight: index === 0 ? 100 : 0, displayWeight: index === 0 ? 100 : 0,
    contribution: index === 0 ? 88 : 0, status: index === 0 ? 'matched' as const : 'not_required' as const,
    hasCoreGap: false, matchedCount: index === 0 ? 1 : 0, partialCount: 0, missingCount: 0, details: index === 0 ? details : [],
  })),
  advantages: [], keyGaps: [], validationWarnings: [],
};

const v2Html = renderToStaticMarkup(<CapabilityRadar data={v2} selectedDimension="skill" />);
for (const text of ['评分占比', '要求项数量', '可评分项数量', '重要度合计', '要求项数量只是条目数', '查看六维完整文本数据']) assert.ok(v2Html.includes(text), `v2 应展示：${text}`);

const legacy = {
  scoringVersion: 'radar-v1',
  dimensions: keys.map(key => ({ key, label: key, jobScore: 50, resumeScore: 50, matchScore: 50, weight: 0, status: 'partial' as const, matchedCount: 0, partialCount: 1, missingCount: 0, details: [] })),
  advantages: [], keyGaps: [],
};
const legacyHtml = renderToStaticMarkup(<CapabilityRadar data={legacy} selectedDimension="skill" />);
assert.ok(legacyHtml.includes('历史记录使用 radar-v1'));
assert.ok(!legacyHtml.includes('展开评分占比解释'), 'radar-v1 不得套用 v2 公式');

const emptyHtml = renderToStaticMarkup(<CapabilityRadar />);
assert.ok(emptyHtml.includes('不会猜测或补造分数'));

const hardOther = { requirement: '必须接受出差', matched: false, dimension: 'other' as const, isHard: true };
assert.equal(matchesSelectedDimension(hardOther, true, 'experience'), false, '经验联动不应展示其他要求');
assert.equal(matchesSelectedDimension(hardOther, true, 'other'), true, '其他要求应保留在其他要求筛选中');
assert.equal(matchesSelectedDimension(hardOther, false, 'experience'), true, '关闭联动后应展示全部要求');

const partial = { ...details[0], id: 'req-partial', requirement: '能力差距', status: 'partial' as const, coverageScore: 60, scoreContribution: 20 };
const missing = { ...details[0], id: 'req-missing', requirement: '无证据能力', status: 'missing_evidence' as const, resumeEvidenceLevel: 'none' as const, relevance: 'none' as const, resumeEvidence: undefined, coverageScore: 0, scoreContribution: 0 };
const matchResult = {
  score: 50,
  hardConditionCheck: [], skillMatch: [], gaps: [], summary: '结果摘要',
  capabilityRadar: { ...v2, dimensions: v2.dimensions.map((dimension, index) => index === 0 ? { ...dimension, details: [details[0], partial, missing], requirementCount: 3, scoreableCount: 3 } : dimension) },
  capabilityEvidence: [
    { id: 'hard-1', requirement: '必须接受出差', dimension: 'other' as const, isHard: true, isScoreable: false, hardConditionStatus: 'unknown' as const, jobEvidence: '需要出差' },
    { id: 'req-partial', requirement: '能力差距', dimension: 'skill' as const, isHard: false, isScoreable: true, jobEvidence: '能力差距', resumeEvidence: '部分证据' },
    { id: 'req-missing', requirement: '无证据能力', dimension: 'skill' as const, isHard: false, isScoreable: true, jobEvidence: '无证据能力' },
    { id: 'req-1', requirement: 'TypeScript', dimension: 'skill' as const, isHard: false, isScoreable: true, jobEvidence: 'TypeScript', resumeEvidence: 'TypeScript 项目' },
  ],
  standardizedRequirements: [],
  metadata: { scoringVersion: 'radar-v2' as const, extractionVersion: 'match-extraction-v2.1', inputHash: 'hash', requirementCacheHit: false, evidenceCacheHit: false },
};
const detailHtml = renderToStaticMarkup(<AnalyzeView resume={{ basicInfo: {}, skills: [], experiences: [], rawText: '简历' }} onJobSaved={() => undefined} initialJob={{ id: 'job', jd: { position: '测试岗位', rawText: '岗位', requirements: [] }, matchResult, savedAt: '2026-09-12T00:00:00.000Z', status: 'analyzed', scoringVersion: 'radar-v2' }} />);
for (const text of ['未发现', '部分匹配', '已匹配', '硬性条件', '不参与评分', '计算详情']) assert.ok(detailHtml.includes(text), `详情页应展示：${text}`);
assert.ok(!detailHtml.includes('必须接受出差'), '默认技能联动范围不应混入其他要求');
assert.ok(!detailHtml.includes('查看单项计算'), '卡片内不应默认提供单项计算入口');

console.log('client analysis rendering tests passed');
