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
  category: string;
  item: string;
  isHard: boolean;
}

export interface ParsedJobDescription {
  company?: string;
  position?: string;
  salary?: string;
  city?: string;
  requirements: JobRequirement[];
  rawText: string;
}

export interface MatchItem {
  requirement: string;
  matched: boolean;
  evidence?: string;
  isHard: boolean;
}

export interface MatchResult {
  score: number;
  hardConditionCheck: MatchItem[];
  skillMatch: MatchItem[];
  gaps: MatchItem[];
  summary: string;
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
