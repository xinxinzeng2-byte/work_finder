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

const API_BASE = '/api';
// 开发服务器默认使用本地模式；生产构建（包括 Vercel Preview）默认使用云端模式。
// 如需覆盖，可设置 VITE_DATA_MODE=local 或 VITE_DATA_MODE=cloud。
const DATA_MODE = import.meta.env.VITE_DATA_MODE || (import.meta.env.DEV ? 'local' : 'cloud');
export const isCloudMode = DATA_MODE === 'cloud';

function shouldSync(): boolean {
  return isCloudMode && !!localStorage.getItem('auth_token');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `请求失败 (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('服务器响应超时，请检查本地后端和数据库配置');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function background(task: Promise<unknown>): void {
  void task.catch((error) => console.warn('云端数据同步失败', error));
}

export async function hydrateFromCloud(): Promise<void> {
  if (!shouldSync()) return;
  const [resumeData, jobData, draftData] = await Promise.all([
    request<{ resumes: ResumeItem[] }>('/data/resumes'),
    request<{ jobs: SavedJob[] }>('/data/jobs'),
    request<{ draft: WorkflowDraft | null }>('/data/draft'),
  ]);
  let resumes = resumeData.resumes;
  let jobs = jobData.jobs;
  if (resumes.length === 0 && jobs.length === 0) {
    const localResumes = loadResumes();
    const idMap = new Map(localResumes.map((item) => [item.id, isUuid(item.id) ? item.id : generateId()]));
    if (localResumes.length) {
      const migratedResumes = localResumes.map((item) => ({
        ...item,
        id: idMap.get(item.id)!,
        sourceIds: item.sourceIds?.map((id) => idMap.get(id) || id),
      }));
      await Promise.all(migratedResumes.map((item) => syncResume(item)));
      resumes = migratedResumes;
      const current = resumes.find((item) => item.isCurrent);
      if (current) localStorage.setItem(KEYS.CURRENT_RESUME_ID, current.id);
    }
    const localJobs = loadSavedJobs();
    if (localJobs.length) {
      const migratedJobs = localJobs.map((job) => ({
        ...job,
        id: isUuid(job.id) ? job.id : generateId(),
        sourceResumeIds: job.sourceResumeIds?.map((id) => idMap.get(id) || id),
      }));
      await Promise.all(migratedJobs.map((job) => syncJob(job)));
      jobs = migratedJobs;
    }
  }
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(jobs));
  if (draftData.draft) localStorage.setItem(KEYS.WORKFLOW_DRAFT, JSON.stringify(draftData.draft));
  else localStorage.removeItem(KEYS.WORKFLOW_DRAFT);
}

export async function authRequest<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function authGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

function syncResume(item: ResumeItem): Promise<unknown> {
  const payload = isUuid(item.id) ? item : { ...item, id: undefined };
  return request('/data/resumes', { method: 'POST', body: JSON.stringify(payload) });
}

function patchResume(item: ResumeItem): Promise<unknown> {
  const updates: Promise<unknown>[] = [
    request(`/data/resumes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ resume: item.resume }) }),
    request(`/data/resumes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: item.name }) }),
  ];
  if (item.isCurrent) updates.push(request(`/data/resumes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isCurrent: true }) }));
  return Promise.all(updates);
}

function syncJob(job: SavedJob): Promise<unknown> {
  const payload = isUuid(job.id) ? job : { ...job, id: undefined };
  return request('/data/jobs', { method: 'POST', body: JSON.stringify(payload) });
}

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
  if (shouldSync()) background(syncResume(item));
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
  if (shouldSync()) background(syncResume(item));
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
  if (shouldSync()) background(patchResume(current));
}

export function setCurrentResume(id: string): void {
  const resumes = loadResumes();
  resumes.forEach((r) => (r.isCurrent = r.type === 'original' && r.id === id));
  const selected = resumes.find((r) => r.id === id && r.type === 'original');
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  if (selected) {
    localStorage.setItem(KEYS.CURRENT_RESUME_ID, id);
    localStorage.setItem(KEYS.RESUME, JSON.stringify(selected.resume));
    if (shouldSync()) background(patchResume(selected));
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
  if (shouldSync()) background(request(`/data/resumes/${id}`, { method: 'DELETE' }));
}

export function renameResume(id: string, name: string): void {
  const resumes = loadResumes();
  const updated = resumes.map((item) => {
    if (item.id === id) {
      return { ...item, name: name.trim() };
    }
    return item;
  });
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(updated));
  const item = updated.find((resume) => resume.id === id);
  if (item && shouldSync()) background(patchResume(item));
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

/**
 * 编辑合并后的能力：同步更新所有来源原始简历中同名能力。
 */
export function updateMergedSkill(
  originalName: string,
  updates: { name?: string; level?: string; category?: string; evidence?: string }
): void {
  const resumes = loadResumes();
  resumes
    .filter((r) => r.type === 'original')
    .forEach((item) => {
      item.resume.skills = item.resume.skills.map((skill) => {
        if (skill.name !== originalName) return skill;
        const next = { ...skill, ...updates };
        // 改名后避免与同简历已有能力重名
        if (updates.name && updates.name !== originalName) {
          const duplicate = item.resume.skills.find(
            (s) => s.name === updates.name && s.id !== skill.id
          );
          if (duplicate) return skill;
        }
        return next;
      });
    });
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => background(patchResume(item)));
}

/**
 * 删除合并后的能力：从所有来源原始简历中移除同名能力。
 */
export function removeMergedSkill(name: string): void {
  const resumes = loadResumes();
  resumes
    .filter((r) => r.type === 'original')
    .forEach((item) => {
      item.resume.skills = item.resume.skills.filter((skill) => skill.name !== name);
    });
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => background(patchResume(item)));
}

/**
 * 编辑合并后的经历：按 key 同步更新所有来源原始简历中对应的经历。
 */
export function updateMergedExperience(
  key: string,
  updates: {
    company?: string;
    role?: string;
    period?: string;
    description?: string;
    achievements?: string[];
    skillsUsed?: string[];
    rawText?: string;
  }
): void {
  const [company, role, period] = key.split('|||');
  const resumes = loadResumes();
  resumes
    .filter((r) => r.type === 'original')
    .forEach((item) => {
      item.resume.experiences = item.resume.experiences.map((exp) => {
        const expKey = `${exp.company}-${exp.role}-${exp.period}`;
        const matchKey = `${company}-${role}-${period}`;
        if (expKey !== matchKey) return exp;
        return { ...exp, ...updates };
      });
    });
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => background(patchResume(item)));
}

/**
 * 删除合并后的经历：从所有来源原始简历中移除对应经历。
 */
export function removeMergedExperience(key: string): void {
  const [company, role, period] = key.split('|||');
  const resumes = loadResumes();
  resumes
    .filter((r) => r.type === 'original')
    .forEach((item) => {
      item.resume.experiences = item.resume.experiences.filter((exp) => {
        return !(exp.company === company && exp.role === role && exp.period === period);
      });
    });
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => background(patchResume(item)));
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
  supplementedGaps?: string[];
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
  if (shouldSync()) background(syncJob(job));
}

export function updateJob(id: string, updates: Partial<SavedJob>): void {
  const job = loadSavedJobs().find((item) => item.id === id);
  if (job) {
    const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
    saveJob(updated);
    if (shouldSync()) background(syncJob(updated));
  }
}

export function removeJob(id: string): void {
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(loadSavedJobs().filter((job) => job.id !== id)));
  if (shouldSync()) background(request(`/data/jobs/${id}`, { method: 'DELETE' }));
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
  const draft = { id: generateId(), updatedAt: new Date().toISOString(), data };
  localStorage.setItem(KEYS.WORKFLOW_DRAFT, JSON.stringify(draft));
  if (shouldSync()) background(request('/data/draft', { method: 'PUT', body: JSON.stringify({ data }) }));
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
  if (shouldSync()) background(request('/data/draft', { method: 'DELETE' }));
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
