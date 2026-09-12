// 原子能力 - 简历中提取的最小能力单元
export interface AtomicSkill {
  id: string;
  category: string;        // 能力分类：技术/管理/沟通/行业知识等
  name: string;            // 能力名称：如"数据分析"
  level: string;           // 熟练度：了解/熟悉/精通
  evidence: string;        // 能力来源描述
}

// 原子经历 - 简历中提取的最小经历单元
export interface AtomicExperience {
  id: string;
  company: string;         // 公司
  role: string;            // 职位
  period: string;          // 时间段
  achievements: string[];  // 关键成就（大白话）
  skillsUsed: string[];    // 这段经历用到的能力 ID
  rawText: string;         // 原始描述
}

// 简历解析结果
export interface ParsedResume {
  skills: AtomicSkill[];
  experiences: AtomicExperience[];
  basicInfo: {
    name?: string;
    phone?: string;
    email?: string;
    education?: string;
    yearsOfExperience?: number;
    city?: string;
  };
  rawText: string;
}

// 岗位要求项
export interface JobRequirement {
  id?: string;
  title?: string;          // 独立的能力短标题，完整要求保存在 item
  category: string;        // 硬性条件 / 能力要求
  item: string;            // 具体要求项
  isHard: boolean;         // 是否硬性条件
  dimension?: CapabilityDimensionKey | 'other';
  jobEvidence?: string;
}

// 解析后的 JD
export interface ParsedJobDescription {
  company?: string;
  position?: string;
  salary?: string;
  city?: string;
  requirements: JobRequirement[];
  rawText: string;
}

// 匹配项
export type CapabilityDetailStatus = 'matched' | 'partial' | 'missing';

export interface MatchItem {
  id?: string;
  title?: string;
  requirement: string;
  matched: boolean;
  status?: CapabilityDetailStatus;
  evidence?: string;       // 匹配的证据（来自简历的哪段经历）
  jobEvidence?: string;
  dimension?: MatchDimensionKey;
  isHard: boolean;
}

export interface CapabilityDetail {
  id?: string;
  title?: string;
  requirement: string;
  status: CapabilityDetailStatus;
  jobEvidence?: string;
  evidence?: string;
  analysisSection?: 'hard' | 'skill' | 'gap';
  dimension?: CapabilityDimensionKey;
  isHard?: boolean;
}

export type CapabilityDimensionKey =
  | 'skill'
  | 'experience'
  | 'project'
  | 'achievement'
  | 'education'
  | 'industry';
export type MatchDimensionKey = CapabilityDimensionKey | 'other';

export type CapabilityImportance = 'core' | 'important' | 'normal' | 'bonus';
export type CapabilityRequiredDepth = 'basic' | 'familiar' | 'practical' | 'expert';
export type CapabilityEvidenceLevel = 'none' | 'mentioned' | 'used' | 'owned' | 'achieved';
export type CapabilityEvidenceLevelV2 = 'none' | 'mentioned' | 'used' | 'owned';
export type CapabilityRelevance = 'none' | 'weak' | 'partial' | 'high' | 'exact';
export type CapabilityMatchStatus = 'matched' | 'partial' | 'missing' | 'not_required';

export interface CapabilityEvidenceItem {
  id?: string;
  title?: string;
  requirement: string;
  dimension: MatchDimensionKey;
  isHard?: boolean;
  importance: CapabilityImportance;
  requiredDepth: CapabilityRequiredDepth;
  jobEvidence: string;
  resumeEvidenceLevel: CapabilityEvidenceLevel;
  relevance: CapabilityRelevance;
  resumeEvidence?: string;
}

export interface CapabilityDimension {
  key: CapabilityDimensionKey;
  label: string;
  jobScore: number;
  resumeScore: number;
  matchScore: number | null;
  weight: number;
  status: CapabilityMatchStatus;
  matchedCount: number;
  partialCount: number;
  missingCount: number;
  details: CapabilityDetail[];
}

export interface CapabilityRadarResult {
  scoringVersion: string;
  dimensions: CapabilityDimension[];
  advantages: string[];
  keyGaps: string[];
}

export type CapabilityHardConditionStatus = 'met' | 'not_met' | 'unknown' | 'not_applicable';
export type CapabilityRelevanceV2 = 'none' | 'weak' | 'partial' | 'high';
export type CapabilityBackgroundRequirementV2 = 'preferred' | 'required';
export type CapabilityBackgroundMatchV2 = 'none' | 'unrelated' | 'related';
export type CapabilityRequirementStatusV2 = 'matched' | 'partial' | 'missing_evidence';
export type CapabilityDimensionStatusV2 = CapabilityRequirementStatusV2 | 'core_gap' | 'not_required';

export interface CapabilityEvidenceItemV2 {
  id: string;
  title?: string;
  requirement: string;
  dimension: MatchDimensionKey;
  isHard: boolean;
  isScoreable: boolean;
  hardConditionStatus?: CapabilityHardConditionStatus;
  importance?: CapabilityImportance;
  requiredDepth?: CapabilityRequiredDepth;
  backgroundRequirement?: CapabilityBackgroundRequirementV2;
  jobEvidence: string;
  resumeEvidenceLevel?: CapabilityEvidenceLevelV2;
  relevance?: CapabilityRelevanceV2;
  backgroundMatch?: CapabilityBackgroundMatchV2;
  resumeEvidenceSourceIds?: string[];
  resumeEvidence?: string;
}

export interface CapabilityRequirementScoreV2 {
  id: string;
  title?: string;
  requirement: string;
  dimension: CapabilityDimensionKey;
  isHard: boolean;
  isScoreable: true;
  importance: CapabilityImportance;
  importanceValue: number;
  scoringMethod: 'evidence_relevance' | 'background_match';
  requiredDepth?: CapabilityRequiredDepth;
  backgroundRequirement?: CapabilityBackgroundRequirementV2;
  requiredDepthScore: number;
  resumeEvidenceLevel: CapabilityEvidenceLevelV2;
  evidenceLevelScore: number;
  relevance?: CapabilityRelevanceV2;
  relevanceFactor: number;
  backgroundMatch?: CapabilityBackgroundMatchV2;
  resumeEvidenceScore: number;
  coverageScore: number;
  weightedCoverage: number;
  scoreContribution: number;
  status: CapabilityRequirementStatusV2;
  jobEvidence: string;
  resumeEvidence?: string;
}

export interface CapabilityRankedRequirementV2 {
  id: string;
  title: string;
  dimension: CapabilityDimensionKey;
  impact: number;
}

export interface CapabilityDimensionV2 {
  key: CapabilityDimensionKey;
  label: string;
  jobScore: number;
  resumeScore: number;
  matchScore: number | null;
  requirementCount: number;
  scoreableCount: number;
  importanceTotal: number;
  exactWeight: number;
  displayWeight: number;
  contribution: number;
  status: CapabilityDimensionStatusV2;
  hasCoreGap: boolean;
  matchedCount: number;
  partialCount: number;
  missingCount: number;
  details: CapabilityRequirementScoreV2[];
}

export interface CapabilityRadarResultV2 {
  scoringVersion: 'radar-v2';
  score: number | null;
  totalImportance: number;
  dimensions: CapabilityDimensionV2[];
  advantages: CapabilityRankedRequirementV2[];
  keyGaps: CapabilityRankedRequirementV2[];
  validationWarnings: string[];
}

export interface StandardizedJobRequirementV2 {
  id: string;
  sourceIds: string[];
  title: string;
  requirement: string;
  dimension: MatchDimensionKey;
  isHard: boolean;
  isScoreable: boolean;
  importance?: CapabilityImportance;
  requiredDepth?: CapabilityRequiredDepth;
  backgroundRequirement?: CapabilityBackgroundRequirementV2;
  jobEvidence: string;
}

export interface MatchAnalysisMetadataV2 {
  scoringVersion: 'radar-v2';
  extractionVersion: string;
  inputHash: string;
  requirementCacheHit: boolean;
  evidenceCacheHit: boolean;
}

export interface MatchResultV2 {
  score: number | null;
  hardConditionCheck: MatchItem[];
  skillMatch: MatchItem[];
  gaps: MatchItem[];
  summary: string;
  capabilityRadar: CapabilityRadarResultV2;
  capabilityEvidence: CapabilityEvidenceItemV2[];
  standardizedRequirements: StandardizedJobRequirementV2[];
  metadata: MatchAnalysisMetadataV2;
}

// 匹配分析结果
export interface MatchResult {
  score: number;            // 0-100
  hardConditionCheck: MatchItem[];   // 硬性条件核查
  skillMatch: MatchItem[];          // 能力匹配
  gaps: MatchItem[];                // 缺口项
  summary: string;                  // 总体评价
  capabilityRadar?: CapabilityRadarResult;
}

// 简历生成请求
export interface ResumeGenerationRequest {
  targetPosition: string;
  targetCompany?: string;
  jobDescription: string;
  matchResult?: MatchResult;
}

// 生成的定制简历
export interface GeneratedResume {
  summary: string;          // 个人简介（针对岗位定制）
  skillsHighlight: string[]; // 核心技能亮点
  experiences: {
    company: string;
    role: string;
    period: string;
    description: string;     // 针对岗位改写后的描述
    highlights: string[];
  }[];
  coverLetter?: string;      // 求职信/打招呼话术
}

// DeepSeek API 请求参数
export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}
