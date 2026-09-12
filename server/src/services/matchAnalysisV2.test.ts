import assert from 'node:assert/strict';
import type { DeepSeekMessage, ParsedJobDescription, ParsedResume } from '../types';
import { executeMatchV2 } from '../controllers/matchControllerV2';
import { DeepSeekClientError } from './deepseekClient';
import {
  MatchAnalysisError,
  analyzeMatchV2,
  clearMatchAnalysisV2Cache,
  createMatchInputHash,
  matchAnalysisErrorResponse,
} from './matchAnalysisV2';

async function run(): Promise<void> {

  const job: ParsedJobDescription = {
    position: '全栈产品开发',
    company: '测试企业',
    rawText: '必须掌握 TypeScript。必须常驻上海办公。本科相关专业。',
    requirements: [
      { id: 'source_skill', title: 'TypeScript', category: '技能', item: '必须掌握 TypeScript', isHard: true },
      { id: 'source_city', title: '上海办公', category: '硬性条件', item: '必须常驻上海办公', isHard: true },
      { id: 'source_education', title: '相关专业', category: '教育', item: '本科相关专业', isHard: false },
    ],
  };
  const resume: ParsedResume = {
    basicInfo: { city: '上海', yearsOfExperience: 3, education: '本科计算机相关专业' },
    skills: [{ id: 'skill_ts', category: '技术', name: 'TypeScript', level: '熟练', evidence: '独立负责 TypeScript 项目' }],
    experiences: [{ id: 'exp_1', company: '某企业', role: '开发', period: '2023-2026', achievements: ['独立负责 TypeScript 项目'], skillsUsed: ['skill_ts'], rawText: '独立负责 TypeScript 项目' }],
    rawText: '当前在上海。独立负责 TypeScript 项目。',
  };

  const requirementResponse = JSON.stringify({
    requirements: [
      {
        id: 'req_city',
        sourceIds: ['source_city'],
        title: '上海办公',
        requirement: '必须常驻上海办公',
        dimension: 'other',
        isHard: true,
        isScoreable: false,
        jobEvidence: '必须常驻上海办公',
      },
      {
        id: 'req_education',
        sourceIds: ['source_education'],
        title: '相关专业',
        requirement: '本科相关专业',
        dimension: 'education',
        isHard: false,
        isScoreable: true,
        importance: 'normal',
        backgroundRequirement: 'preferred',
        jobEvidence: '本科相关专业',
      },
      {
        id: 'req_ts',
        sourceIds: ['source_skill'],
        title: 'TypeScript',
        requirement: '必须掌握 TypeScript',
        dimension: 'skill',
        isHard: true,
        isScoreable: true,
        importance: 'core',
        requiredDepth: 'practical',
        jobEvidence: '必须掌握 TypeScript',
      },
    ],
  });
  const evidenceResponse = JSON.stringify({
    evidence: [
      { requirementId: 'req_city', hardConditionStatus: 'met', resumeEvidenceLevel: 'none', relevance: 'none', resumeEvidenceSourceIds: ['resume.rawText'], resumeEvidence: '当前在上海' },
      { requirementId: 'req_education', backgroundMatch: 'related', resumeEvidenceSourceIds: ['basic.education'], resumeEvidence: '本科计算机相关专业' },
      { requirementId: 'req_ts', hardConditionStatus: 'met', resumeEvidenceLevel: 'owned', relevance: 'high', resumeEvidenceSourceIds: ['experience.exp_1.rawText'], resumeEvidence: '独立负责 TypeScript 项目' },
    ],
  });
  const summaryResponse = JSON.stringify({
    summary: '候选人具备 TypeScript 实际项目经验和相关专业背景，能够满足岗位的主要能力要求。当前没有明显核心短板，建议结合具体业务场景继续核对细节。',
  });

  function mockCall(responses: string[]) {
    const prompts: DeepSeekMessage[][] = [];
    let index = 0;
    const call = async (_apiKey: string, messages: DeepSeekMessage[]) => {
      prompts.push(messages);
      const response = responses[index];
      index += 1;
      if (response === undefined) throw new Error('mock response missing');
      return response;
    };
    return { call, prompts, count: () => index };
  }

  clearMatchAnalysisV2Cache();
  const firstMock = mockCall([requirementResponse, evidenceResponse, summaryResponse]);
  const first = await analyzeMatchV2('test-key', resume, job, { callJson: firstMock.call });
  assert.equal(firstMock.count(), 3, '首次分析执行岗位要求、简历证据和综合评语三个阶段');
  assert.equal(first.score, 100);
  assert.equal(first.metadata.scoringVersion, 'radar-v2');
  assert.equal(first.metadata.requirementCacheHit, false);
  assert.equal(first.metadata.evidenceCacheHit, false);
  assert.equal(first.capabilityRadar.dimensions.find((item) => item.key === 'skill')?.displayWeight, 67);
  assert.equal(first.capabilityRadar.dimensions.find((item) => item.key === 'education')?.displayWeight, 33);
  assert.equal(first.hardConditionCheck.length, 2);
  assert.equal(first.capabilityEvidence.find((item) => item.id === 'req_city')?.resumeEvidence, '当前在上海');
  assert.equal(first.capabilityEvidence.find((item) => item.id === 'req_city')?.resumeEvidenceLevel, undefined, '不评分的地点条件应保留原文证据，但不携带评分档位');
  assert.equal(first.skillMatch.length, 2);
  assert.equal(first.gaps.length, 0);
  assert.ok(first.summary.includes('TypeScript 实际项目经验'));
  assert.ok(firstMock.prompts[0][0].content.includes('不得输出任何分数'));
  assert.ok(firstMock.prompts[0][0].content.includes('具备前后端开发能力'));
  assert.ok(firstMock.prompts[0][0].content.includes('Owner 意识'));
  assert.ok(firstMock.prompts[1][0].content.includes('backgroundMatch=none/unrelated/related'));
  assert.ok(firstMock.prompts[1][0].content.includes('Vibe Coding'));
  assert.ok(firstMock.prompts[1][0].content.includes('Python 开发业务算法'));
  assert.ok(firstMock.prompts[1][0].content.includes('平台化思维与业务闭环'));
  assert.ok(firstMock.prompts[1][0].content.includes('resumeEvidence'));
  assert.ok(!firstMock.prompts[1][0].content.includes('exact'));
  assert.ok(firstMock.prompts[2][0].content.includes('不要以分数开头'));

  const cachedMock = mockCall([]);
  const cached = await analyzeMatchV2('test-key', resume, job, { callJson: cachedMock.call });
  assert.equal(cachedMock.count(), 0);
  assert.equal(cached.metadata.requirementCacheHit, true);
  assert.equal(cached.metadata.evidenceCacheHit, true);
  assert.equal(cached.metadata.inputHash, first.metadata.inputHash);
  assert.deepEqual(cached.capabilityRadar, first.capabilityRadar);

  const changedResume: ParsedResume = {
    ...resume,
    skills: [],
    experiences: [],
    rawText: '当前在上海。',
  };
  const changedEvidence = JSON.stringify({
    evidence: [
      { requirementId: 'req_city', hardConditionStatus: 'met', resumeEvidenceLevel: 'mentioned', relevance: 'high', resumeEvidenceSourceIds: ['resume.rawText'] },
      { requirementId: 'req_education', backgroundMatch: 'related', resumeEvidenceSourceIds: ['basic.education'] },
      { requirementId: 'req_ts', hardConditionStatus: 'unknown', resumeEvidenceLevel: 'none', relevance: 'none', resumeEvidenceSourceIds: [] },
    ],
  });
  const changedMock = mockCall([changedEvidence, summaryResponse]);
  const changed = await analyzeMatchV2('test-key', changedResume, job, { callJson: changedMock.call });
  assert.equal(changedMock.count(), 2, '同一 JD 更换简历时重新提取简历证据并生成新的综合评语');
  assert.equal(changed.metadata.requirementCacheHit, true);
  assert.equal(changed.metadata.evidenceCacheHit, false);
  assert.notEqual(changed.metadata.inputHash, first.metadata.inputHash);
  assert.deepEqual(changed.standardizedRequirements, first.standardizedRequirements);
  assert.deepEqual(changed.capabilityRadar.dimensions.map((item) => item.exactWeight), first.capabilityRadar.dimensions.map((item) => item.exactWeight));
  assert.equal(changed.score, 33, '技能缺失但教育专业相关时，仍保留教育专业按权重贡献的分数');
  assert.equal(changed.gaps[0]?.id, 'req_ts');

  const directMock = mockCall([requirementResponse, evidenceResponse]);
  const throughSharedExecutor = await executeMatchV2('test-key', { resume, jobDescription: job, ignored: true });
  assert.equal(throughSharedExecutor.metadata.scoringVersion, 'radar-v2');
  assert.deepEqual(throughSharedExecutor.capabilityRadar, first.capabilityRadar);
  void directMock;

  assert.equal(createMatchInputHash({ b: 2, a: 1 }), createMatchInputHash({ a: 1, b: 2 }));
  assert.notEqual(createMatchInputHash({ a: 1 }), createMatchInputHash({ a: 2 }));

  const invalidRequirementMock = mockCall([JSON.stringify({ requirements: [{
    id: 'req_ts', sourceIds: ['source_skill'], title: 'TypeScript', requirement: '必须掌握 TypeScript', dimension: 'skill', isHard: true, isScoreable: true,
    importance: 'urgent', requiredDepth: 'practical', jobEvidence: '必须掌握 TypeScript',
  }] })]);
  await assert.rejects(
    analyzeMatchV2('test-key', resume, job, { callJson: invalidRequirementMock.call, disableCache: true }),
    (error: unknown) => error instanceof MatchAnalysisError && error.code === 'AI_CONTRACT_INVALID',
  );

  const missingSourceMock = mockCall([JSON.stringify({ requirements: [{
    id: 'req_ts', sourceIds: ['source_skill'], title: 'TypeScript', requirement: '必须掌握 TypeScript', dimension: 'skill', isHard: true, isScoreable: true,
    importance: 'core', requiredDepth: 'practical', jobEvidence: '必须掌握 TypeScript',
  }] })]);
  await assert.rejects(
    analyzeMatchV2('test-key', resume, job, { callJson: missingSourceMock.call, disableCache: true }),
    (error: unknown) => error instanceof MatchAnalysisError && error.code === 'AI_CONTRACT_INVALID' && /遗漏/.test(error.message),
  );

  const fabricatedEvidenceMock = mockCall([requirementResponse, JSON.stringify({ evidence: [
    { requirementId: 'req_city', hardConditionStatus: 'met', resumeEvidenceLevel: 'mentioned', relevance: 'high', resumeEvidenceSourceIds: ['resume.rawText'] },
      { requirementId: 'req_education', backgroundMatch: 'related', resumeEvidenceSourceIds: ['basic.education'] },
    { requirementId: 'req_ts', hardConditionStatus: 'met', resumeEvidenceLevel: 'owned', relevance: 'high', resumeEvidenceSourceIds: ['experience.unknown.rawText'] },
  ] })]);
  await assert.rejects(
    analyzeMatchV2('test-key', resume, job, { callJson: fabricatedEvidenceMock.call, disableCache: true }),
    (error: unknown) => error instanceof MatchAnalysisError && error.code === 'AI_CONTRACT_INVALID' && /未知简历证据来源/.test(error.message),
  );


  const achievedEvidenceMock = mockCall([requirementResponse, JSON.stringify({ evidence: [
    { requirementId: 'req_city', hardConditionStatus: 'met', resumeEvidenceLevel: 'mentioned', relevance: 'high', resumeEvidenceSourceIds: ['resume.rawText'] },
      { requirementId: 'req_education', backgroundMatch: 'related', resumeEvidenceSourceIds: ['basic.education'] },
    { requirementId: 'req_ts', hardConditionStatus: 'met', resumeEvidenceLevel: 'achieved', relevance: 'high', resumeEvidenceSourceIds: ['experience.exp_1.rawText'] },
  ] })]);
  await assert.rejects(
    analyzeMatchV2('test-key', resume, job, { callJson: achievedEvidenceMock.call, disableCache: true }),
    (error: unknown) => error instanceof MatchAnalysisError && error.code === 'AI_CONTRACT_INVALID' && /resumeEvidenceLevel 非法/.test(error.message),
  );

  const exactEvidenceMock = mockCall([requirementResponse, JSON.stringify({ evidence: [
    { requirementId: 'req_city', hardConditionStatus: 'met', resumeEvidenceLevel: 'mentioned', relevance: 'high', resumeEvidenceSourceIds: ['resume.rawText'] },
      { requirementId: 'req_education', backgroundMatch: 'related', resumeEvidenceSourceIds: ['basic.education'] },
    { requirementId: 'req_ts', hardConditionStatus: 'met', resumeEvidenceLevel: 'owned', relevance: 'exact', resumeEvidenceSourceIds: ['experience.exp_1.rawText'] },
  ] })]);
  await assert.rejects(
    analyzeMatchV2('test-key', resume, job, { callJson: exactEvidenceMock.call, disableCache: true }),
    (error: unknown) => error instanceof MatchAnalysisError && error.code === 'AI_CONTRACT_INVALID' && /relevance 非法/.test(error.message),
  );

  const truncatedCall = async () => {
    throw new DeepSeekClientError('AI_OUTPUT_TRUNCATED', 'AI 输出达到长度上限，未进入岗位评分');
  };
  await assert.rejects(
    analyzeMatchV2('test-key', resume, job, { callJson: truncatedCall, disableCache: true }),
    (error: unknown) => error instanceof MatchAnalysisError && error.code === 'AI_OUTPUT_TRUNCATED',
  );

  await assert.rejects(
    analyzeMatchV2('', resume, job),
    (error: unknown) => error instanceof MatchAnalysisError && error.code === 'INPUT_INVALID' && error.status === 400,
  );
  assert.deepEqual(matchAnalysisErrorResponse(new MatchAnalysisError('AI_OUTPUT_INVALID', 'bad json', 502)), { status: 502, code: 'AI_OUTPUT_INVALID', message: 'bad json' });
  assert.deepEqual(matchAnalysisErrorResponse(new Error('secret')), { status: 500, code: 'INTERNAL_ERROR', message: '岗位匹配服务发生异常，请稍后重试' });

  console.log('matchAnalysisV2 tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
