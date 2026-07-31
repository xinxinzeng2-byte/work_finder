import type { ParsedResume, ParsedJobDescription, MatchResult, GeneratedResume } from '../types';

// 本地存储工具 - 简历、岗位收录、生成结果

const KEYS = {
  RESUME: 'wf_resume',
  API_KEY: 'deepseek_api_key',
  SAVED_JOBS: 'wf_saved_jobs',
  GENERATED: 'wf_generated',
} as const;

// ============ 简历（经历库） ============

export function saveResume(resume: ParsedResume): void {
  localStorage.setItem(KEYS.RESUME, JSON.stringify(resume));
}

export function loadResume(): ParsedResume | null {
  const data = localStorage.getItem(KEYS.RESUME);
  return data ? JSON.parse(data) : null;
}

// ============ API Key ============

export function getApiKey(): string | null {
  return localStorage.getItem(KEYS.API_KEY);
}

export function saveApiKey(key: string): void {
  localStorage.setItem(KEYS.API_KEY, key);
}

// ============ 收录的岗位 ============

export interface SavedJob {
  id: string;
  jd: ParsedJobDescription;
  matchResult: MatchResult;
  savedAt: string; // ISO 时间
  status: 'analyzed' | 'generating' | 'completed';
  generatedResume?: GeneratedResume;
}

export function loadSavedJobs(): SavedJob[] {
  const data = localStorage.getItem(KEYS.SAVED_JOBS);
  if (!data) return [];
  const jobs: SavedJob[] = JSON.parse(data);
  return jobs.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveJob(job: SavedJob): void {
  const jobs = loadSavedJobs();
  const existing = jobs.findIndex((j) => j.id === job.id);
  if (existing >= 0) {
    jobs[existing] = job;
  } else {
    jobs.push(job);
  }
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(jobs));
}

export function removeJob(id: string): void {
  const jobs = loadSavedJobs().filter((j) => j.id !== id);
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(jobs));
}

export function updateJob(id: string, updates: Partial<SavedJob>): void {
  const jobs = loadSavedJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx], ...updates };
    localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(jobs));
  }
}

// ============ 生成的简历 ============

export function saveGeneratedResume(resume: GeneratedResume): void {
  localStorage.setItem(KEYS.GENERATED, JSON.stringify(resume));
}

export function loadGeneratedResume(): GeneratedResume | null {
  const data = localStorage.getItem(KEYS.GENERATED);
  return data ? JSON.parse(data) : null;
}

// ============ 数据管理 ============

export function clearAllData(): void {
  Object.values(KEYS).forEach((key) => {
    if (key !== KEYS.API_KEY) {
      localStorage.removeItem(key);
    }
  });
}

export function exportData(): void {
  const data: Record<string, unknown> = {};
  Object.entries(KEYS).forEach(([name, key]) => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        data[name] = JSON.parse(value);
      } catch {
        data[name] = value;
      }
    }
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worker-finder-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============ 工具 ============

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
