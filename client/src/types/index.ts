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

export interface MatchResult {
  score: number;
  hardConditionCheck: MatchItem[];
  skillMatch: MatchItem[];
  gaps: MatchItem[];
  summary: string;
  capabilityRadar?: CapabilityRadarResult;
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
