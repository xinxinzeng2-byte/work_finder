// 与后端共享的类型定义

export interface AtomicSkill {
  id: string;
  category: string;
  name: string;
  level: string;
  evidence: string;
}

export interface AtomicExperience {
  id: string;
  company: string;
  role: string;
  period: string;
  description?: string;
  achievements: string[];
  skillsUsed: string[];
  rawText: string;
}

export type MergedSkill = AtomicSkill & { sources: string[] };
export type MergedExperience = AtomicExperience & { sources: string[] };

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

export interface JobRequirement {
  id?: string;
  title?: string;
  category: string;
  item: string;
  isHard: boolean;
  dimension?: MatchDimensionKey;
  jobEvidence?: string;
}

export interface ParsedJobDescription {
  company?: string;
  position?: string;
  salary?: string;
  city?: string;
  requirements: JobRequirement[];
  rawText: string;
}

export type CapabilityDetailStatus = 'matched' | 'partial' | 'missing';

export interface MatchItem {
  id?: string;
  title?: string;
  requirement: string;
  matched: boolean;
  status?: CapabilityDetailStatus;
  evidence?: string;
  jobEvidence?: string;
  dimension?: MatchDimensionKey;
  isHard: boolean;
}

export interface CapabilityDetail {
  title?: string;
  requirement: string;
  status: CapabilityDetailStatus;
  jobEvidence?: string;
  evidence?: string;
  dimension?: CapabilityDimensionKey | 'other';
  isHard?: boolean;
  analysisSection?: 'hard' | 'skill' | 'gap';
}

export type CapabilityDimensionKey =
  | 'skill'
  | 'experience'
  | 'project'
  | 'achievement'
  | 'education'
  | 'industry';
export type MatchDimensionKey = CapabilityDimensionKey | 'other';

export type CapabilityMatchStatus = 'matched' | 'partial' | 'missing' | 'not_required';

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
  details?: CapabilityDetail[];
}

export interface CapabilityRadarResult {
  scoringVersion: string;
  dimensions: CapabilityDimension[];
  advantages: string[];
  keyGaps: string[];
}

export type CapabilityHardConditionStatus = 'met' | 'not_met' | 'unknown' | 'not_applicable';
export type CapabilityRequirementStatusV2 = 'matched' | 'partial' | 'missing_evidence';
export type CapabilityDimensionStatusV2 = CapabilityRequirementStatusV2 | 'core_gap' | 'not_required';
export type CapabilityImportance = 'core' | 'important' | 'normal' | 'bonus';
export type CapabilityRequiredDepth = 'basic' | 'familiar' | 'practical' | 'expert';
export type CapabilityEvidenceLevel = 'none' | 'mentioned' | 'used' | 'owned' | 'achieved';
export type CapabilityEvidenceLevelV2 = 'none' | 'mentioned' | 'used' | 'owned';
export type CapabilityRelevance = 'none' | 'weak' | 'partial' | 'high' | 'exact';
export type CapabilityRelevanceV2 = 'none' | 'weak' | 'partial' | 'high';
export type CapabilityBackgroundRequirementV2 = 'preferred' | 'required';
export type CapabilityBackgroundMatchV2 = 'none' | 'unrelated' | 'related';

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
  jobEvidence: string;
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
  metadata: {
    scoringVersion: 'radar-v2';
    extractionVersion: string;
    inputHash: string;
    requirementCacheHit: boolean;
    evidenceCacheHit: boolean;
  };
}

export interface MatchResult {
  score: number | null;
  hardConditionCheck: MatchItem[];
  skillMatch: MatchItem[];
  gaps: MatchItem[];
  summary: string;
  capabilityRadar?: CapabilityRadarResult;
}

export type AnalysisMatchResult = MatchResult | MatchResultV2;

export function isMatchResultV2(result: AnalysisMatchResult): result is MatchResultV2 {
  return 'metadata' in result && result.metadata?.scoringVersion === 'radar-v2';
}

export interface GeneratedResume {
  summary: string;
  skillsHighlight: string[];
  experiences: {
    company: string;
    role: string;
    period: string;
    description: string;
    highlights: string[];
  }[];
  coverLetter?: string;
}

export interface ApiError {
  error: string;
}
