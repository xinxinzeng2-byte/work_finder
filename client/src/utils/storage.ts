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
  CLOUD_USER_ID: 'wf_cloud_user_id',
  LEGACY_LOCAL_BACKUP: 'wf_legacy_local_backup',
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

/** 兼容早期版本把来源 ID 保存为字符串或 JSON 字符串的历史数据。 */
function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeStringArray(parsed);
  } catch {
    // 继续按旧版逗号分隔字符串处理。
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** 保证历史简历缺少数组字段时，能力库和工作流仍能安全渲染。 */
function normalizeParsedResume(value: unknown): ParsedResume {
  const source = asRecord(value);
  const basicInfo = asRecord(source.basicInfo);
  const skills = Array.isArray(source.skills) ? source.skills.map((value) => {
    const skill = asRecord(value);
    return {
      id: typeof skill.id === 'string' ? skill.id : generateId(),
      category: typeof skill.category === 'string' ? skill.category : '',
      name: typeof skill.name === 'string' ? skill.name : '',
      level: typeof skill.level === 'string' ? skill.level : '',
      evidence: typeof skill.evidence === 'string' ? skill.evidence : '',
    };
  }) : [];
  const experiences = Array.isArray(source.experiences) ? source.experiences.map((value) => {
    const experience = asRecord(value);
    return {
      id: typeof experience.id === 'string' ? experience.id : generateId(),
      company: typeof experience.company === 'string' ? experience.company : '',
      role: typeof experience.role === 'string' ? experience.role : '',
      period: typeof experience.period === 'string' ? experience.period : '',
      description: typeof experience.description === 'string' ? experience.description : undefined,
      achievements: normalizeStringArray(experience.achievements),
      skillsUsed: normalizeStringArray(experience.skillsUsed),
      rawText: typeof experience.rawText === 'string' ? experience.rawText : '',
    };
  }) : [];
  return {
    basicInfo: {
      name: typeof basicInfo.name === 'string' ? basicInfo.name : undefined,
      phone: typeof basicInfo.phone === 'string' ? basicInfo.phone : undefined,
      email: typeof basicInfo.email === 'string' ? basicInfo.email : undefined,
      education: typeof basicInfo.education === 'string' ? basicInfo.education : undefined,
      yearsOfExperience: typeof basicInfo.yearsOfExperience === 'number' ? basicInfo.yearsOfExperience : undefined,
      city: typeof basicInfo.city === 'string' ? basicInfo.city : undefined,
    },
    rawText: typeof source.rawText === 'string' ? source.rawText : '',
    skills,
    experiences,
  };
}

function normalizeParsedJobDescription(value: unknown): ParsedJobDescription {
  const source = asRecord(value);
  const requirements = Array.isArray(source.requirements) ? source.requirements.map((value) => {
    const requirement = asRecord(value);
    return {
      category: typeof requirement.category === 'string' ? requirement.category : '',
      item: typeof requirement.item === 'string' ? requirement.item : '',
      isHard: requirement.isHard === true,
    };
  }) : [];
  return {
    company: typeof source.company === 'string' ? source.company : undefined,
    position: typeof source.position === 'string' ? source.position : undefined,
    salary: typeof source.salary === 'string' ? source.salary : undefined,
    city: typeof source.city === 'string' ? source.city : undefined,
    requirements,
    rawText: typeof source.rawText === 'string' ? source.rawText : '',
  };
}

function normalizeMatchItems(value: unknown): MatchResult['gaps'] {
  return Array.isArray(value) ? value.map((value) => {
    const item = asRecord(value);
    return {
      requirement: typeof item.requirement === 'string' ? item.requirement : '',
      matched: item.matched === true,
      evidence: typeof item.evidence === 'string' ? item.evidence : undefined,
      isHard: item.isHard === true,
    };
  }) : [];
}

function normalizeMatchResult(value: unknown): MatchResult {
  const source = asRecord(value);
  return {
    score: typeof source.score === 'number' ? source.score : 0,
    hardConditionCheck: normalizeMatchItems(source.hardConditionCheck),
    skillMatch: normalizeMatchItems(source.skillMatch),
    gaps: normalizeMatchItems(source.gaps),
    summary: typeof source.summary === 'string' ? source.summary : '',
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  // 登录态和用户数据不能使用浏览器/CDN缓存，否则可能收到没有响应体的 304。
  headers.set('Cache-Control', 'no-cache');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal, cache: 'no-store' });
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
  const trackedTask = task.catch((error) => console.warn('云端数据同步失败', error));
  pendingSyncs.add(trackedTask);
  void trackedTask.then(() => pendingSyncs.delete(trackedTask));
}

const pendingSyncs = new Set<Promise<unknown>>();
const cloudWriteChains = new Map<string, Promise<unknown>>();

/** 将同一条数据的云端写入串行化，避免保存/更新请求乱序抵消最新状态。 */
function enqueueCloudWrite(key: string, operation: () => Promise<unknown>): void {
  const previous = cloudWriteChains.get(key) || Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.then(() => undefined, () => undefined);
  cloudWriteChains.set(key, settled);
  void next.then(
    () => { if (cloudWriteChains.get(key) === settled) cloudWriteChains.delete(key); },
    () => { if (cloudWriteChains.get(key) === settled) cloudWriteChains.delete(key); },
  );
  background(next);
}

/** 退出登录前等待当前账号所有已发起的云端写入完成。 */
export async function flushCloudSync(): Promise<void> {
  while (pendingSyncs.size > 0) {
    await Promise.all([...pendingSyncs]);
  }
}

export async function hydrateFromCloud(userId?: string): Promise<void> {
  if (!shouldSync()) return;
  // 只有已经明确归属于当前账号的本地数据才允许自动补传；没有标记的数据无法证明
  // 属于哪个账号，必须保留为备份但不能自动上传，避免切换账号时串数据。
  const localOwnerId = localStorage.getItem(KEYS.CLOUD_USER_ID);
  const canMigrateLocalData = !!localOwnerId && !!userId && localOwnerId === userId;
  const localResumes = loadResumes();
  const localJobs = loadSavedJobs();
  const localDraft = loadWorkflowDraft();
  if (!localOwnerId && (localResumes.length > 0 || localJobs.length > 0 || localDraft)) {
    localStorage.setItem(KEYS.LEGACY_LOCAL_BACKUP, JSON.stringify({ resumes: localResumes, jobs: localJobs, draft: localDraft }));
  }
  const [resumeData, jobData, draftData] = await Promise.all([
    request<{ resumes: ResumeItem[] }>('/data/resumes'),
    request<{ jobs: SavedJob[] }>('/data/jobs'),
    request<{ draft: WorkflowDraft | null }>('/data/draft'),
  ]);
  let resumes = [...resumeData.resumes];
  let jobs = [...jobData.jobs];

  if (canMigrateLocalData) {
    // 分别迁移两类数据。之前这里要求“简历和岗位同时为空”，导致云端已有简历、
    // 但岗位保存请求失败/尚未完成时，本地岗位被空数组覆盖。
    const resumeIdMap = new Map(localResumes.map((item) => [item.id, isUuid(item.id) ? item.id : generateId()]));
    const migratedResumes: ResumeItem[] = localResumes
      .map((item): ResumeItem => {
        const sourceIds = normalizeStringArray(item.sourceIds).map((id) => resumeIdMap.get(id) || id);
        return {
          ...item,
          id: resumeIdMap.get(item.id)!,
          ...(sourceIds.length ? { sourceIds } : {}),
        };
      })
      .filter((item) => !resumes.some((remote) => remote.id === item.id));
    const migratedJobs: SavedJob[] = localJobs
      .map((job): SavedJob => {
        const sourceResumeIds = normalizeStringArray(job.sourceResumeIds).map((id) => resumeIdMap.get(id) || id);
        return {
          ...job,
          id: isUuid(job.id) ? job.id : generateId(),
          ...(sourceResumeIds.length ? { sourceResumeIds } : {}),
        };
      })
      .filter((job) => !jobs.some((remote) => remote.id === job.id));

    // 上传失败时保留本地记录，避免一次网络抖动把界面清空；下次进入还会继续重试。
    await Promise.all(migratedResumes.map(async (item) => {
      try { await syncResume(item); } catch (error) { console.warn('迁移简历失败', error); }
    }));
    await Promise.all(migratedJobs.map(async (job) => {
      try { await syncJob(job); } catch (error) { console.warn('迁移岗位失败', error); }
    }));
    // 即使本次上传失败，也先保留在本地，下一次进入时继续尝试同步。
    resumes = [...resumes, ...migratedResumes];
    jobs = [...jobs, ...migratedJobs];
  }

  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(jobs));
  if (draftData.draft) {
    localStorage.setItem(KEYS.WORKFLOW_DRAFT, JSON.stringify(draftData.draft));
  } else if (canMigrateLocalData && localDraft) {
    localStorage.setItem(KEYS.WORKFLOW_DRAFT, JSON.stringify(localDraft));
    try {
      await request('/data/draft', { method: 'PUT', body: JSON.stringify({ data: localDraft.data }) });
    } catch (error) {
      console.warn('迁移流程草稿失败', error);
    }
  } else {
    localStorage.removeItem(KEYS.WORKFLOW_DRAFT);
  }
  const current = resumes.find((item) => item.type === 'original' && item.isCurrent);
  if (current) {
    localStorage.setItem(KEYS.CURRENT_RESUME_ID, current.id);
    localStorage.setItem(KEYS.RESUME, JSON.stringify(current.resume));
  } else {
    localStorage.removeItem(KEYS.CURRENT_RESUME_ID);
    localStorage.removeItem(KEYS.RESUME);
  }
  if (userId) localStorage.setItem(KEYS.CLOUD_USER_ID, userId);
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

function normalizeResumeItem(value: unknown): ResumeItem {
  const item = asRecord(value);
  const targetJob = asRecord(item.targetJob);
  return {
    id: typeof item.id === 'string' ? item.id : generateId(),
    name: typeof item.name === 'string' ? item.name : '未命名简历',
    type: item.type === 'customized' ? 'customized' : 'original',
    resume: normalizeParsedResume(item.resume),
    originalText: typeof item.originalText === 'string' ? item.originalText : undefined,
    fileName: typeof item.fileName === 'string' ? item.fileName : undefined,
    uploadedAt: typeof item.uploadedAt === 'string' ? item.uploadedAt : new Date(0).toISOString(),
    isCurrent: item.isCurrent === true,
    sourceIds: normalizeStringArray(item.sourceIds),
    sourceId: typeof item.sourceId === 'string' ? item.sourceId : undefined,
    sourceFileData: typeof item.sourceFileData === 'string' ? item.sourceFileData : undefined,
    sourceMimeType: typeof item.sourceMimeType === 'string' ? item.sourceMimeType : undefined,
    targetJob: item.targetJob && typeof item.targetJob === 'object' ? {
      position: typeof targetJob.position === 'string' ? targetJob.position : '',
      company: typeof targetJob.company === 'string' ? targetJob.company : undefined,
      matchScore: typeof targetJob.matchScore === 'number' ? targetJob.matchScore : 0,
    } : undefined,
  };
}

export function loadResumes(): ResumeItem[] {
  const data = localStorage.getItem(KEYS.RESUMES);
  if (data) {
    try {
      return (JSON.parse(data) as unknown[])
        .map(normalizeResumeItem)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    } catch {
      localStorage.removeItem(KEYS.RESUMES);
    }
  }

  const legacy = localStorage.getItem(KEYS.RESUME);
  if (!legacy) return [];
  try {
    const resume = normalizeParsedResume(JSON.parse(legacy));
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
  if (shouldSync()) enqueueCloudWrite(`resume:${item.id}`, () => syncResume(item));
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
  if (shouldSync()) enqueueCloudWrite(`resume:${item.id}`, () => syncResume(item));
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
  if (shouldSync()) enqueueCloudWrite(`resume:${current.id}`, () => patchResume(current));
}

export function setCurrentResume(id: string): void {
  const resumes = loadResumes();
  resumes.forEach((r) => (r.isCurrent = r.type === 'original' && r.id === id));
  const selected = resumes.find((r) => r.id === id && r.type === 'original');
  localStorage.setItem(KEYS.RESUMES, JSON.stringify(resumes));
  if (selected) {
    localStorage.setItem(KEYS.CURRENT_RESUME_ID, id);
    localStorage.setItem(KEYS.RESUME, JSON.stringify(selected.resume));
    if (shouldSync()) enqueueCloudWrite(`resume:${selected.id}`, () => patchResume(selected));
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
  if (shouldSync()) enqueueCloudWrite(`resume:${id}`, () => request(`/data/resumes/${id}`, { method: 'DELETE' }));
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
  if (item && shouldSync()) enqueueCloudWrite(`resume:${item.id}`, () => patchResume(item));
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
    const skills = Array.isArray(item.resume?.skills) ? item.resume.skills : [];
    skills.forEach((skill) => {
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
    const experiences = Array.isArray(item.resume?.experiences) ? item.resume.experiences : [];
    experiences.forEach((experience) => {
      const key = `${experience.company}-${experience.role}-${experience.period}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...experience, achievements: normalizeStringArray(experience.achievements), skillsUsed: normalizeStringArray(experience.skillsUsed), sources: [item.name] });
        return;
      }
      if (!existing.sources.includes(item.name)) existing.sources.push(item.name);
      normalizeStringArray(experience.achievements).forEach((achievement) => {
        if (!existing.achievements.includes(achievement)) existing.achievements.push(achievement);
      });
      normalizeStringArray(experience.skillsUsed).forEach((skill) => {
        if (!existing.skillsUsed.includes(skill)) existing.skillsUsed.push(skill);
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
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => enqueueCloudWrite(`resume:${item.id}`, () => patchResume(item)));
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
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => enqueueCloudWrite(`resume:${item.id}`, () => patchResume(item)));
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
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => enqueueCloudWrite(`resume:${item.id}`, () => patchResume(item)));
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
  if (shouldSync()) resumes.filter((item) => item.type === 'original').forEach((item) => enqueueCloudWrite(`resume:${item.id}`, () => patchResume(item)));
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

function normalizeSavedJob(value: unknown): SavedJob {
  const job = asRecord(value);
  return {
    id: typeof job.id === 'string' ? job.id : generateId(),
    jd: normalizeParsedJobDescription(job.jd),
    matchResult: normalizeMatchResult(job.matchResult),
    savedAt: typeof job.savedAt === 'string' ? job.savedAt : new Date(0).toISOString(),
    status: ['analyzed', 'supplementing', 'generating', 'completed', 'generated'].includes(String(job.status)) ? job.status as SavedJob['status'] : 'analyzed',
    generatedResume: job.generatedResume && typeof job.generatedResume === 'object' ? job.generatedResume as GeneratedResume : undefined,
    sequenceNumber: typeof job.sequenceNumber === 'number' ? job.sequenceNumber : undefined,
    jobName: typeof job.jobName === 'string' ? job.jobName : undefined,
    company: typeof job.company === 'string' ? job.company : undefined,
    intendedPosition: typeof job.intendedPosition === 'string' ? job.intendedPosition : undefined,
    matchScore: typeof job.matchScore === 'number' ? job.matchScore : undefined,
    mainGaps: normalizeStringArray(job.mainGaps),
    analyzedAt: typeof job.analyzedAt === 'string' ? job.analyzedAt : undefined,
    createdAt: typeof job.createdAt === 'string' ? job.createdAt : undefined,
    updatedAt: typeof job.updatedAt === 'string' ? job.updatedAt : undefined,
    sourceResumeIds: normalizeStringArray(job.sourceResumeIds),
    resumeSnapshot: job.resumeSnapshot && typeof job.resumeSnapshot === 'object' ? normalizeParsedResume(job.resumeSnapshot) : undefined,
    supplementedGaps: normalizeStringArray(job.supplementedGaps),
  };
}

export function getNextSequenceNumber(): number {
  const jobs = loadSavedJobs();
  return jobs.reduce((max, job, index) => Math.max(max, job.sequenceNumber || index + 1), 0) + 1;
}

export function loadSavedJobs(): SavedJob[] {
  const data = localStorage.getItem(KEYS.SAVED_JOBS);
  if (!data) return [];
  try {
    const jobs = (JSON.parse(data) as unknown[]).map(normalizeSavedJob);
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
  if (shouldSync()) enqueueCloudWrite(`job:${job.id}`, () => syncJob(job));
}

export function updateJob(id: string, updates: Partial<SavedJob>): void {
  const job = loadSavedJobs().find((item) => item.id === id);
  if (job) {
    const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
    saveJob(updated);
  }
}

export function removeJob(id: string): void {
  localStorage.setItem(KEYS.SAVED_JOBS, JSON.stringify(loadSavedJobs().filter((job) => job.id !== id)));
  if (shouldSync()) enqueueCloudWrite(`job:${id}`, () => request(`/data/jobs/${id}`, { method: 'DELETE' }));
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

function normalizeWorkflowDraft(value: unknown): WorkflowDraft | null {
  const source = asRecord(value);
  const data = asRecord(source.data);
  const validSteps: WorkflowStepId[] = ['import-resume', 'extract-skills', 'input-job', 'ai-match', 'supplement', 'generate'];
  const step = validSteps.includes(data.step as WorkflowStepId) ? data.step as WorkflowStepId : 'import-resume';
  const extractedSkills = Array.isArray(data.extractedSkills) ? data.extractedSkills.map((value) => {
    const skill = asRecord(value);
    return {
      id: typeof skill.id === 'string' ? skill.id : generateId(),
      category: typeof skill.category === 'string' ? skill.category : '',
      name: typeof skill.name === 'string' ? skill.name : '',
      level: typeof skill.level === 'string' ? skill.level : '',
      evidence: typeof skill.evidence === 'string' ? skill.evidence : '',
      sources: normalizeStringArray(skill.sources),
    };
  }) : undefined;
  const extractedExperiences = Array.isArray(data.extractedExperiences) ? data.extractedExperiences.map((value) => {
    const experience = asRecord(value);
    return {
      id: typeof experience.id === 'string' ? experience.id : generateId(),
      company: typeof experience.company === 'string' ? experience.company : '',
      role: typeof experience.role === 'string' ? experience.role : '',
      period: typeof experience.period === 'string' ? experience.period : '',
      description: typeof experience.description === 'string' ? experience.description : undefined,
      achievements: normalizeStringArray(experience.achievements),
      skillsUsed: normalizeStringArray(experience.skillsUsed),
      rawText: typeof experience.rawText === 'string' ? experience.rawText : '',
      sources: normalizeStringArray(experience.sources),
    };
  }) : undefined;
  return {
    id: typeof source.id === 'string' ? source.id : generateId(),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    data: {
      step,
      sourceMode: ['library', 'resumes', 'import'].includes(String(data.sourceMode)) ? data.sourceMode as WorkflowDraft['data']['sourceMode'] : 'resumes',
      resumeIds: normalizeStringArray(data.resumeIds),
      jobInput: typeof data.jobInput === 'string' ? data.jobInput : '',
      parsedJd: data.parsedJd && typeof data.parsedJd === 'object' ? normalizeParsedJobDescription(data.parsedJd) : undefined,
      extractedSkills,
      extractedExperiences,
    },
  };
}

export function saveWorkflowDraft(data: WorkflowDraft['data']): void {
  const draft = { id: generateId(), updatedAt: new Date().toISOString(), data };
  localStorage.setItem(KEYS.WORKFLOW_DRAFT, JSON.stringify(draft));
  if (shouldSync()) enqueueCloudWrite('draft', () => request('/data/draft', { method: 'PUT', body: JSON.stringify({ data }) }));
}

export function loadWorkflowDraft(): WorkflowDraft | null {
  const data = localStorage.getItem(KEYS.WORKFLOW_DRAFT);
  if (!data) return null;
  try {
    return normalizeWorkflowDraft(JSON.parse(data));
  } catch {
    clearWorkflowDraft();
    return null;
  }
}

export function clearWorkflowDraft(): void {
  localStorage.removeItem(KEYS.WORKFLOW_DRAFT);
  if (shouldSync()) enqueueCloudWrite('draft', () => request('/data/draft', { method: 'DELETE' }));
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
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const random = Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24);
  return `${Date.now().toString(16).slice(-8)}-${random.slice(0, 4)}-4${random.slice(4, 7)}-8${random.slice(7, 10)}-${random.slice(10, 22)}`;
}
