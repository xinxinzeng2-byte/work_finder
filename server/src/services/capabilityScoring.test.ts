import assert from 'node:assert/strict';
import { calculateCapabilityRadar, normalizeCapabilityEvidence } from './capabilityScoring';
import type { CapabilityEvidenceItem } from '../types';

const fixtures: CapabilityEvidenceItem[] = [
  { requirement: 'TypeScript', dimension: 'skill', importance: 'core', requiredDepth: 'practical', jobEvidence: '熟练使用 TypeScript', resumeEvidenceLevel: 'owned', relevance: 'exact', resumeEvidence: '负责 TypeScript 前端项目' },
  { requirement: '三年相关经验', dimension: 'experience', importance: 'important', requiredDepth: 'practical', jobEvidence: '三年以上相关经验', resumeEvidenceLevel: 'used', relevance: 'high', resumeEvidence: '两年相关岗位经历' },
  { requirement: '独立项目交付', dimension: 'project', importance: 'important', requiredDepth: 'practical', jobEvidence: '可独立完成项目', resumeEvidenceLevel: 'achieved', relevance: 'exact', resumeEvidence: '独立交付并上线系统' },
  { requirement: '作品', dimension: 'achievement', importance: 'bonus', requiredDepth: 'familiar', jobEvidence: '有作品优先', resumeEvidenceLevel: 'mentioned', relevance: 'exact', resumeEvidence: '个人作品集' },
  { requirement: '本科相关专业', dimension: 'education', importance: 'normal', requiredDepth: 'familiar', jobEvidence: '本科相关专业', resumeEvidenceLevel: 'mentioned', relevance: 'partial', resumeEvidence: '本科，专业部分相关' },
  { requirement: '电商行业', dimension: 'industry', importance: 'normal', requiredDepth: 'familiar', jobEvidence: '熟悉电商行业', resumeEvidenceLevel: 'none', relevance: 'none' },
];

const first = calculateCapabilityRadar(fixtures);
const second = calculateCapabilityRadar(fixtures);
assert.deepEqual(first, second, '同一输入必须得到相同结果');
assert.equal(first.radar.dimensions.length, 6);
assert.equal(first.radar.dimensions.reduce((sum, item) => sum + item.weight, 0), 100);
assert.equal(first.radar.dimensions.find((item) => item.key === 'industry')?.status, 'missing');
assert.equal(first.radar.dimensions.find((item) => item.key === 'project')?.matchScore, 100);
assert.ok(first.score >= 0 && first.score <= 100);

const sanitized = normalizeCapabilityEvidence([{ ...fixtures[0], resumeEvidence: '', resumeEvidenceLevel: 'achieved', relevance: 'exact' }]);
assert.equal(sanitized[0].resumeEvidenceLevel, 'none', '无简历原文时不得保留能力证据等级');
assert.equal(sanitized[0].relevance, 'none', '无简历原文时相关度必须归零');

console.log('capabilityScoring tests passed');
