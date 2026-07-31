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
  category: string;        // 硬性条件 / 能力要求
  item: string;            // 具体要求项
  isHard: boolean;         // 是否硬性条件
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
export interface MatchItem {
  requirement: string;
  matched: boolean;
  evidence?: string;       // 匹配的证据（来自简历的哪段经历）
  isHard: boolean;
}

// 匹配分析结果
export interface MatchResult {
  score: number;            // 0-100
  hardConditionCheck: MatchItem[];   // 硬性条件核查
  skillMatch: MatchItem[];          // 能力匹配
  gaps: MatchItem[];                // 缺口项
  summary: string;                  // 总体评价
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
