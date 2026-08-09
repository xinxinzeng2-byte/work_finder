import type {
  AtomicExperience,
  AtomicSkill,
  GeneratedResume,
  MatchResult,
  ParsedJobDescription,
  ParsedResume,
} from '../types';

const KEYS = {
  RESUME: 'wf_resume',
  RESUMES: 'wf_resumes',
  CURRENT_RESUME_ID: 'wf_current_resume_id',
  API_KEY: 'deepseek_api_key',
  SAVED_JOBS: 'wf_saved_jobs',
  GENERATED: 'wf_generated',
  WORKFLOW_DRAFT: 'wf_workflow_draft',
} as const;

export type ResumeType = 'original' | 'customized';

export interface TargetJobInfo {
  position: string;
  company?: string;
  matchScore: number;
}

export interface ResumeItem {
  id: string;
  name: string;
  type: ResumeType;
  resume: ParsedResume;
  originalText?: string;
  fileName?: string;
  uploadedAt: string;
  isCurrent: boolean;
  sourceIds?: string[];
  sourceId?: string;
  sourceFileData?: string;
  sourceMimeType?: string;
  targetJob?: TargetJobInfo;
}

export function loadResumes(): ResumeItem[] {
  const data = localStorage.getItem(KEYS.RESUMES);
  if (data) {
    try {
      return (JSON.parse(data) as ResumeItem[]).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    } catch {
      localStorage.removeItem(KEYS.RESUMES);
    }
  }

  const legacy = localStorage.getItem(KEYS.RESUME);
  if (!legacy) return [];
  try {
    const resume = JSON.parse(legacy) as ParsedResume;
    const item: ResumeItem = {
      id: 'legacy_resume',
      name: '原始简历 1',
      type: 'original',
      resume,
      uploadedAt: new Date().toISOString(),
      isCurrent: true,
    };
    localStorage.setItem(KEYS.RESUMES, JSON.stringify([item]));
    localStorage.setItem(KEYS.CURRENT_RESUME_ID, item.id);
    return [item];
  } catch {
    return [];
  }
}

export function saveResume(
  resume: ParsedResume,
  options?: { name?: string; originalText?: string; fileName?: string; sourceFileData?: string; sourceMimeType?: string },
): ResumeItem {
  const resumes = loadResumes();
  const item: ResumeItem = {
    id: generateId(),
    name: options?.name || `原始简历 ${resumes.filter((r) => r.type === 'original').length + 1}`,
    type: 'original',
    resume,
    originalText: options?.originalText,
    fileName: options?.fileName,
    sourceFileData: options?.sourceFileData,
    sourceMimeType: options?.sourceMimeType,
    uploadedAt: new Date().toISOString(),
    isCurrent: true,
  };
  resumes.forEach((r) => (r.isCurrent = false));
  resumes.push(item);
  try {
    localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  } catch {
    // 原文件较大时避免占满 localStorage；解析结果仍可正常保存并回退为 HTML 下载。
    item.sourceFileData = undefined;
    localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  }
  localStorage.setItem(KEYS.CURRENT_RESUME_ID, item.id);
  localStorage.setItem(KEYS.RESUME, JSON.stringify(resume));
  return item;
}

export function saveCustomizedResume(
  resume: ParsedResume,
  options: { name: string; sourceIds: string[]; targetJob: TargetJobInfo },
): ResumeItem {
  const resumes = loadResumes();
  const item: ResumeItem = {
    id: generateId(),
    name: options.name,
    type: 'customized',
    resume,
    sourceIds: options.sourceIds,
    sourceId: options.sourceIds.join(','),
    uploadedAt: new Date().toISOString(),
    isCurrent: false,
    targetJob: options.targetJob,
  };
  resumes.push(item);
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  return item;
}

export function loadCurrentResume(): ParsedResume | null {
  const id = localStorage.getItem(KEYS.CURRENT_RESUME_ID);
  const resumes = loadResumes();
  return (resumes.find((r) => r.id === id && r.type === 'original') || resumes.find((r) => r.type === 'original'))?.resume || null;
}

export function loadResume(): ParsedResume | null {
  return loadCurrentResume();
}

export function updateCurrentResume(resume: ParsedResume): void {
  const resumes = loadResumes();
  const current = resumes.find((item) => item.isCurrent && item.type === 'original') || resumes.find((item) => item.type === 'original');
  if (!current) {
    saveResume(resume);
    return;
  }
  current.resume = resume;
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  localStorage.setItem(KEYS.CURRENT_RESUME_ID, current.id);
  localStorage.setItem(KEYS.RESUME, JSON.stringify(resume));
}

export function setCurrentResume(id: string): void {
  const resumes = loadResumes();
  resumes.forEach((r) => (r.isCurrent = r.type === 'original' && r.id === id));
  const selected = resumes.find((r) => r.id === id && r.type === 'original');
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  if (selected) {
    localStorage.setItem(KEYS.CURRENT_RESUME_ID, id);
    localStorage.setItem(KEYS.RESUME, JSON.stringify(selected.resume));
  }
}

export function deleteResume(id: string): void {
  const resumes = loadResumes();
  const deleted = resumes.find((r) => r.id === id);
  const remaining = resumes.filter((r) => r.id !== id);
  if (deleted?.isCurrent) {
    const fallback = remaining.find((r) => r.type === 'original');
    remaining.forEach((r) => (r.isCurrent = r.id === fallback?.id));
    if (fallback) {
      localStorage.setItem(KEYS.CURRENT_RESUME_ID, fallback.id);
      localStorage.setItem(KEYS.RESUME, JSON.stringify(fallback.resume));
    } else {
      localStorage.removeItem(KEYS.CURRENT_RESUME_ID);
      localStorage.removeItem(KEYS.RESUME);
    }
  }
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(remaining));
}

export function renameResume(id: string, name: string): void {
  const resumes = loadResumes();
  const item = resumes.find((r) => r.id === id);
  if (item && name.trim()) {
    item.name = name.trim();
    localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  }
}

export interface MergedSkill extends AtomicSkill {
  sources: string[];
}

export interface MergedExperience extends AtomicExperience {
  sources: string[];
}

const LEVEL_ORDER: Record<string, number> = { 了解: 1, 熟悉: 2, 熟练: 3, 精通: 4 };

export function mergeSkillsFromResumes(resumes: ResumeItem[]): MergedSkill[] {
  const map = new Map<string, MergedSkill>();
  resumes.filter((r) => r.type === 'original').forEach((item) => {
    item.resume.skills.forEach((skill) => {
      const existing = map.get(skill.name);
      if (!existing) {
        map.set(skill.name, { ...skill, sources: [item.name] });
        return;
      }
      if (!existing.sources.includes(item.name)) existing.sources.push(item.name);
      if ((LEVEL_ORDER[skill.level] || 0) > (LEVEL_ORDER[existing.level] || 0)) {
        existing.level = skill.level;
        existing.category = skill.category || existing.category;
        existing.evidence = skill.evidence || existing.evidence;
      }
    });
  });
  return [...map.values()];
}

export function mergeExperiencesFromResumes(resumes: ResumeItem[]): MergedExperience[] {
  const map = new Map<string, MergedExperience>();
  resumes.filter((r) => r.type === 'original').forEach((item) => {
    item.resume.experiences.forEach((experience) => {
      const key = `${experience.company}-${experience.role}-${experience.period}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...experience, achievements: [...experience.achievements], sources: [item.name] });
        return;
      }
      if (!existing.sources.includes(item.name)) existing.sources.push(item.name);
      experience.achievements.forEach((achievement) => {
        if (!existing.achievements.includes(achievement)) existing.achievements.push(achievement);
      });
    });
  });
  return [...map.values()];
}

export function getApiKey(): string | null {
  return localStorage.getItem(KEYS.API_KEY);
}

export function saveApiKey(key: string): void {
  localStorage.setItem(KEYS.API_KEY, key.trim());
}

export interface SavedJob {
  id: string;
  jd: ParsedJobDescription;
  matchResult: MatchResult;
  savedAt: string;
  status: 'analyzed' | 'supplementing' | 'generating' | 'completed' | 'generated';
  generatedResume?: GeneratedResume;
  sequenceNumber?: number;
  jobName?: string;
  company?: string;
  intendedPosition?: string;
  matchScore?: number;
  mainGaps?: string[];
  analyzedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  sourceResumeIds?: string[];
  resumeSnapshot?: ParsedResume;
}

export function getNextSequenceNumber(): number {
  const jobs = loadSavedJobs();
  return jobs.reduce((max, job, index) => Math.max(max, job.sequenceNumber || index + 1), 0) + 1;
}

export function loadSavedJobs(): SavedJob[] {
  const data = localStorage.getItem(KEYS.SAVED_JOBS);
  if (!data) return [];
  try {
    const jobs = JSON.parse(data) as SavedJob[];
    jobs.forEach((job, index) => {
      job.analyzedAt ||= job.savedAt;
      job.createdAt ||= job.analyzedAt;
      job.updatedAt ||= job.analyzedAt;
      job.sequenceNumber ||= index + 1;
    });
    return jobs.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export function saveJob(job: SavedJob): void {
  const jobs = loadSavedJobs();
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) jobs[index] = job;
  else jobs.push(job);
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(jobs));
}

export function updateJob(id: string, updates: Partial<SavedJob>): void {
  const job = loadSavedJobs().find((item) => item.id === id);
  if (job) saveJob({ ...job, ...updates, updatedAt: new Date().toISOString() });
}

export function removeJob(id: string): void {
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(loadSavedJobs().filter((job) => job.id !== id)));
}

export function saveGeneratedResume(resume: GeneratedResume): void {
  localStorage.setItem(KEYS.GENERATED, JSON.stringify(resume));
}

export function loadGeneratedResume(): GeneratedResume | null {
  const data = localStorage.getItem(KEYS.GENERATED);
  return data ? JSON.parse(data) : null;
}

export type WorkflowStepId = 'import-resume' | 'extract-skills' | 'input-job' | 'ai-match' | 'supplement' | 'generate';

export interface WorkflowDraft {
  id: string;
  updatedAt: string;
  data: {
    step: WorkflowStepId;
    sourceMode?: 'library' | 'resumes' | 'import';
    resumeIds: string[];
    jobInput: string;
    parsedJd?: ParsedJobDescription;
    extractedSkills?: MergedSkill[];
    extractedExperiences?: MergedExperience[];
  };
}

export function saveWorkflowDraft(data: WorkflowDraft['data']): void {
  localStorage.setItem(KEYS.WORKFLOW_DRAFT, JSON.stringify({ id: generateId(), updatedAt: new Date().toISOString(), data }));
}

export function loadWorkflowDraft(): WorkflowDraft | null {
  const data = localStorage.getItem(KEYS.WORKFLOW_DRAFT);
  if (!data) return null;
  try {
    return JSON.parse(data) as WorkflowDraft;
  } catch {
    clearWorkflowDraft();
    return null;
  }
}

export function clearWorkflowDraft(): void {
  localStorage.removeItem(KEYS.WORKFLOW_DRAFT);
}

export function hasValidDraft(): boolean {
  return !!loadWorkflowDraft();
}

export function clearAllData(): void {
  Object.values(KEYS).forEach((key) => {
    if (key !== KEYS.API_KEY) localStorage.removeItem(key);
  });
}

export function exportData(): void {
  const data: Record<string, unknown> = {};
  Object.entries(KEYS).forEach(([name, key]) => {
    const value = localStorage.getItem(key);
    if (!value) return;
    try {
      data[name] = JSON.parse(value);
    } catch {
      data[name] = value;
    }
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `worker-finder-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
