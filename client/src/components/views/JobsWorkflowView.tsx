import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ParsedJobDescription, ParsedResume } from '../../types';
import { analyzeMatch, parseJobDescription, parseResumeFile, parseResumeText, readFileAsDataUrl } from '../../services/api';
import { Loading } from '../Loading';
import WorkflowProgressBar, { type WorkflowStep } from '../WorkflowProgressBar';
import { clearWorkflowDraft, generateId, getNextSequenceNumber, hasApiKey, loadResumes, loadWorkflowDraft, mergeExperiencesFromResumes, mergeSkillsFromResumes, saveJob, saveResume, saveWorkflowDraft, updateResumeData, type ResumeItem, type SavedJob } from '../../utils/storage';

interface Props {
  onJobsChange: () => void;
  onComplete: (job: SavedJob) => void;
  onExit: () => void;
  onNeedApiKey: () => void;
}

const STEP_ORDER: WorkflowStep[] = ['import-resume', 'extract-skills', 'input-job', 'ai-match'];
type SourceMode = 'library' | 'resumes' | 'import';

const normalizeDraftStep = (step?: string): WorkflowStep => STEP_ORDER.includes(step as WorkflowStep) ? step as WorkflowStep : 'input-job';

export const JobsWorkflowView: React.FC<Props> = ({ onJobsChange, onComplete, onExit, onNeedApiKey }) => {
  const [draft] = useState(() => loadWorkflowDraft());
  const initialStep = normalizeDraftStep(draft?.data.step);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(initialStep);
  const [completedSteps, setCompletedSteps] = useState<WorkflowStep[]>(draft ? STEP_ORDER.slice(0, Math.max(0, STEP_ORDER.indexOf(initialStep))) : []);
  const [resumes, setResumes] = useState<ResumeItem[]>(loadResumes());
  const [sourceMode, setSourceMode] = useState<SourceMode>(draft?.data.sourceMode || 'resumes');
  const [selectedResumeIds, setSelectedResumeIds] = useState<string[]>(draft?.data.resumeIds || loadResumes().filter((item) => item.type === 'original').map((item) => item.id));
  const [mergedSkills, setMergedSkills] = useState<ReturnType<typeof mergeSkillsFromResumes>>(draft?.data.extractedSkills || []);
  const [mergedExperiences, setMergedExperiences] = useState<ReturnType<typeof mergeExperiencesFromResumes>>(draft?.data.extractedExperiences || []);
  const [jdInput, setJdInput] = useState(draft?.data.jobInput || '');
  const [parsedJd, setParsedJd] = useState<ParsedJobDescription | null>(draft?.data.parsedJd || null);
  const [intendedPosition, setIntendedPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractTab, setExtractTab] = useState<'skills' | 'experiences'>('skills');
  const extractionAttemptRef = useRef<string | null>(null);

  const originalResumes = useMemo(() => resumes.filter((item) => item.type === 'original'), [resumes]);
  const selectedResumes = useMemo(() => originalResumes.filter((item) => selectedResumeIds.includes(item.id)), [originalResumes, selectedResumeIds]);
  const sourceResumes = sourceMode === 'library' ? originalResumes : selectedResumes;
  const extractionKey = `${sourceMode}:${sourceResumes.map((item) => item.id).join('|')}`;
  const librarySkills = useMemo(() => mergeSkillsFromResumes(originalResumes), [originalResumes]);

  useEffect(() => {
    if (currentStep === 'ai-match') return;
    saveWorkflowDraft({ step: currentStep, sourceMode, resumeIds: selectedResumeIds, jobInput: jdInput, parsedJd: parsedJd || undefined, extractedSkills: mergedSkills, extractedExperiences: mergedExperiences });
  }, [currentStep, sourceMode, selectedResumeIds, jdInput, parsedJd, mergedSkills, mergedExperiences]);

  const requireKey = () => {
    if (hasApiKey()) return true;
    onNeedApiKey();
    setError('请先配置 API Key，再使用 AI 功能。');
    return false;
  };

  const handleUpload = async (file: File) => {
    if (!requireKey()) return;
    setLoading(true);
    setError('');
    try {
      const parsed = await parseResumeFile(file);
      const sourceFileData = await readFileAsDataUrl(file);
      const item = saveResume(parsed, { name: file.name.replace(/\.(pdf|docx|html|htm|txt)$/i, ''), fileName: file.name, sourceFileData, sourceMimeType: file.type });
      setSourceMode('import');
      setSelectedResumeIds([item.id]);
      setResumes(loadResumes());
    } catch (err) {
      setError(err instanceof Error ? err.message : '简历解析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmResumes = async () => {
    if (sourceResumes.length === 0) {
      setError(sourceMode === 'library' ? '当前能力库还没有可使用的原始简历，请先导入简历。' : sourceMode === 'import' ? '请先导入一份新简历。' : '请至少选择一份原始简历。');
      return;
    }
    const incomplete = sourceResumes.filter((item) => item.resume.skills.length === 0 && item.resume.experiences.length === 0);
    const missingText = incomplete.filter((item) => !(item.resume.rawText || item.originalText || '').trim());
    if (missingText.length > 0) {
      setError(`简历“${missingText[0].name}”没有可用于 AI 提取的原文，请返回重新导入。`);
      return;
    }
    let nextResumes = resumes;
    if (incomplete.length > 0) {
      if (!requireKey()) return;
      setLoading(true);
      setError('');
      try {
        for (const item of incomplete) {
          const sourceText = (item.resume.rawText || item.originalText || '').trim();
          const parsed = await parseResumeText(sourceText);
          if (parsed.skills.length === 0 && parsed.experiences.length === 0) throw new Error(`AI 未能从“${item.name}”中提取出能力或经历，请检查原文后重试。`);
          updateResumeData(item.id, parsed);
          nextResumes = nextResumes.map((candidate) => candidate.id === item.id ? { ...candidate, resume: parsed } : candidate);
        }
        setResumes(nextResumes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI 提取能力失败，请重试');
        return;
      } finally {
        setLoading(false);
      }
    }
    const nextSourceResumes = (sourceMode === 'library' ? nextResumes : nextResumes.filter((item) => selectedResumeIds.includes(item.id))).filter((item) => item.type === 'original');
    setMergedSkills(mergeSkillsFromResumes(nextSourceResumes));
    setMergedExperiences(mergeExperiencesFromResumes(nextSourceResumes));
    setError('');
    setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'import-resume'])));
    setCurrentStep('extract-skills');
  };

  useEffect(() => {
    if (currentStep !== 'extract-skills' || loading || error || mergedSkills.length > 0 || mergedExperiences.length > 0 || sourceResumes.length === 0) return;
    if (extractionAttemptRef.current === extractionKey) return;
    extractionAttemptRef.current = extractionKey;
    void handleConfirmResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, loading, error, mergedSkills.length, mergedExperiences.length, extractionKey]);

  const buildMergedResume = (): ParsedResume => {
    const first = sourceResumes[0]?.resume;
    return {
      basicInfo: first?.basicInfo || {},
      rawText: sourceResumes.map((item) => item.resume.rawText).filter(Boolean).join('\n\n'),
      skills: mergedSkills.map(({ sources: _sources, ...skill }) => skill),
      experiences: mergedExperiences.map(({ sources: _sources, ...experience }) => experience),
    };
  };

  const handleParseJob = async () => {
    if (!requireKey()) return;
    if (!jdInput.trim()) {
      setError('请先粘贴岗位描述。');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setParsedJd(await parseJobDescription(jdInput.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : '岗位解析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleMatch = async () => {
    if (!requireKey()) return;
    if (!parsedJd) {
      setError('请先解析岗位描述。');
      return;
    }
    const merged = buildMergedResume();
    setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'input-job'])));
    setCurrentStep('ai-match');
    setLoading(true);
    setError('');
    try {
      const result = await analyzeMatch(merged, parsedJd);
      const now = new Date().toISOString();
      const job: SavedJob = {
        id: generateId(),
        savedAt: now,
        sequenceNumber: getNextSequenceNumber(),
        jobName: parsedJd.position || '未命名岗位',
        company: parsedJd.company || '未知公司',
        intendedPosition: intendedPosition || parsedJd.position || '未命名职位',
        matchScore: result.score,
        mainGaps: result.gaps.slice(0, 3).map((gap) => gap.requirement),
        analyzedAt: now,
        status: 'analyzed',
        jd: parsedJd,
        matchResult: result,
        sourceResumeIds: sourceResumes.map((item) => item.id),
        resumeSnapshot: merged,
        createdAt: now,
        updatedAt: now,
      };
      await saveJob(job);
      await clearWorkflowDraft();
      onJobsChange();
      onComplete(job);
    } catch (err) {
      setCurrentStep('input-job');
      setError(err instanceof Error ? err.message : '匹配分析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    const index = STEP_ORDER.indexOf(currentStep);
    if (index > 0) setCurrentStep(STEP_ORDER[index - 1]);
  };

  const canNext = currentStep === 'import-resume'
    ? sourceResumes.length > 0
    : currentStep === 'extract-skills'
      ? mergedSkills.length > 0 || mergedExperiences.length > 0
      : currentStep === 'input-job' ? !!parsedJd : false;

  const renderResumeSourceStep = () => <section className="card">
    <h2 className="font-serif text-xl font-semibold">选择能力来源</h2>
    <p className="mt-2 text-sm text-ink-secondary">选择本次岗位分析要使用的简历来源，AI 会据此整理能力和经历。</p>
    <div className="mt-6 space-y-3">
      <p className="label">本次分析使用</p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${sourceMode === 'library' ? 'border-terra bg-terra-light/40' : 'border-line hover:border-terra-border'}`}><input type="radio" name="resume-source" checked={sourceMode === 'library'} onChange={() => setSourceMode('library')} className="mt-1" /><span className="flex-1"><span className="block text-sm font-medium">使用现有能力库</span><span className="mt-1 block text-xs text-ink-secondary">直接使用当前已合并的能力和经历</span></span><span className="text-xs text-terra">{librarySkills.length} 项</span></label>
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${sourceMode === 'resumes' ? 'border-terra bg-terra-light/40' : 'border-line hover:border-terra-border'}`}><input type="radio" name="resume-source" checked={sourceMode === 'resumes'} onChange={() => setSourceMode('resumes')} className="mt-1" /><span className="flex-1"><span className="block text-sm font-medium">使用已有简历</span><span className="mt-1 block text-xs text-ink-secondary">从下方选择一份或多份简历</span></span><span className="text-xs text-terra">{selectedResumes.length} 份</span></label>
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${sourceMode === 'import' ? 'border-terra bg-terra-light/40' : 'border-line hover:border-terra-border'}`}><input type="radio" name="resume-source" checked={sourceMode === 'import'} onChange={() => { setSourceMode('import'); setSelectedResumeIds([]); }} className="mt-1" /><span className="flex-1"><span className="block text-sm font-medium">导入新简历</span><span className="mt-1 block text-xs text-ink-secondary">上传一份新的简历作为来源</span></span></label>
      </div>
    </div>
    {sourceMode === 'resumes' && <div className="mt-6 space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-medium">已有原始简历</h3><span className="text-xs text-ink-weak">已选择 {selectedResumeIds.length} 份</span></div>{originalResumes.length > 0 ? originalResumes.map((item) => <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${selectedResumeIds.includes(item.id) ? 'border-terra bg-terra-light/40' : 'border-line'}`}><input type="checkbox" checked={selectedResumeIds.includes(item.id)} onChange={() => setSelectedResumeIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /><div className="flex-1"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-ink-secondary">{item.resume.skills.length} 项能力 · {item.resume.experiences.length} 段经历</p></div>{item.isCurrent && <span className="text-xs text-terra">默认</span>}</label>) : <div className="rounded-lg bg-canvas px-4 py-5 text-center text-sm text-ink-secondary">还没有原始简历，请先导入一份简历。</div>}</div>}
    {sourceMode === 'import' && <div className="mt-6"><label className="upload-zone flex cursor-pointer flex-col items-center gap-2 p-8"><span className="text-3xl text-terra">＋</span><span className="text-sm font-medium">点击上传新简历</span><span className="text-xs text-ink-weak">支持 PDF、Word（.docx）、HTML、TXT</span><input type="file" accept=".pdf,.docx,.html,.htm,.txt" className="hidden" onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])} /></label>{selectedResumes.length > 0 && <div className="mt-3 rounded-lg bg-canvas px-4 py-3 text-sm text-ink-secondary">已导入：{selectedResumes[0].name} · {selectedResumes[0].resume.skills.length} 项能力 · {selectedResumes[0].resume.experiences.length} 段经历</div>}</div>}
    {error && <ErrorMessage text={error} />}
  </section>;

  const renderContent = () => {
    if (loading) return <div className="card py-20"><Loading text={currentStep === 'ai-match' ? '正在进行匹配分析...' : 'AI 正在处理...'} subtext={currentStep === 'ai-match' ? '完成后将直接进入岗位分析详情' : '请稍候，完成后结果会自动保存'} /></div>;
    if (currentStep === 'import-resume') return renderResumeSourceStep();
    if (currentStep === 'extract-skills') return <section className="card">
      <h2 className="font-serif text-xl font-semibold">AI 提取并合并能力</h2>
      <p className="mt-2 text-sm text-ink-secondary">{sourceMode === 'library' ? '已载入当前能力库' : `已合并 ${sourceResumes.length} 份原始简历`}，重复能力会取最高熟练度，并保留来源。</p>
      <div className="mt-5 grid grid-cols-3 gap-4"><Metric label="原子能力" value={mergedSkills.length} /><Metric label="原子经历" value={mergedExperiences.length} /><Metric label="来源简历" value={new Set(mergedSkills.flatMap((skill) => skill.sources)).size} /></div>
      <div className="mt-6 flex gap-1 border-b border-line"><button onClick={() => setExtractTab('skills')} className={`-mb-px border-b-2 px-4 py-2 text-sm ${extractTab === 'skills' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary hover:text-ink'}`}>原子能力（{mergedSkills.length}）</button><button onClick={() => setExtractTab('experiences')} className={`-mb-px border-b-2 px-4 py-2 text-sm ${extractTab === 'experiences' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary hover:text-ink'}`}>原子经历（{mergedExperiences.length}）</button></div>
      <div className="scroll-hover mt-4 max-h-[460px] pr-2">
        {mergedSkills.length === 0 && mergedExperiences.length === 0 && <div className="mb-3 rounded-lg border border-terra-border bg-terra-light px-4 py-3 text-sm text-terra">当前没有可展示的结构化结果。请返回上一步重新导入；如果记录中仍有原文，系统会自动重新调用 AI 提取。</div>}
        {extractTab === 'skills' ? (mergedSkills.length === 0 ? <div className="py-10 text-center text-sm text-ink-secondary">暂无能力数据</div> : <div className="space-y-2">{mergedSkills.map((skill) => <div key={skill.name} className="rounded-lg border border-line bg-canvas/50 px-4 py-3"><div className="flex items-center justify-between gap-4"><span className="text-sm font-medium text-ink">{skill.name}</span><span className="shrink-0 rounded-full bg-terra-light px-2 py-0.5 text-xs text-terra">{skill.level}</span></div><div className="mt-1 text-xs text-ink-weak">分类：{skill.category || '未分类'}</div>{skill.evidence && <p className="mt-2 text-xs leading-relaxed text-ink-secondary">证据：{skill.evidence}</p>}<div className="mt-2 text-xs text-ink-weak">来自：{skill.sources.join('、')}</div></div>)}</div>) : (mergedExperiences.length === 0 ? <div className="py-10 text-center text-sm text-ink-secondary">暂无经历数据</div> : <div className="space-y-3">{mergedExperiences.map((exp) => <div key={exp.id} className="rounded-lg border border-line bg-canvas/50 px-4 py-3"><div className="flex items-baseline justify-between gap-4"><span className="text-sm font-medium text-ink">{exp.company} · {exp.role}</span><span className="shrink-0 text-xs text-ink-weak">{exp.period}</span></div>{exp.achievements.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-secondary">{exp.achievements.map((achievement, index) => <li key={index}>{achievement}</li>)}</ul>}{exp.skillsUsed.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{exp.skillsUsed.map((skill) => <span key={skill} className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-secondary">{skill}</span>)}</div>}<div className="mt-2 text-xs text-ink-weak">来自：{exp.sources.join('、')}</div></div>)}</div>)}
      </div>
    </section>;
    if (currentStep === 'input-job') return <section className="card"><h2 className="font-serif text-xl font-semibold">输入目标岗位</h2><p className="mt-2 text-sm text-ink-secondary">粘贴岗位 JD，AI 会先提取岗位信息，再进行匹配分析。</p><textarea value={jdInput} onChange={(event) => { setJdInput(event.target.value); setParsedJd(null); }} className="textarea mt-6 h-64" placeholder="把岗位描述粘贴到这里..." />{parsedJd && <div className="mt-4 rounded-lg border border-moss/30 bg-mossLight p-4 text-sm"><div className="grid grid-cols-2 gap-2"><label>岗位名称<input value={parsedJd.position || ''} onChange={(event) => setParsedJd({ ...parsedJd, position: event.target.value })} className="input mt-1" /></label><label>公司<input value={parsedJd.company || ''} onChange={(event) => setParsedJd({ ...parsedJd, company: event.target.value })} className="input mt-1" /></label><label>意向职位<input value={intendedPosition || parsedJd.position || ''} onChange={(event) => setIntendedPosition(event.target.value)} className="input mt-1" /></label><label>城市<input value={parsedJd.city || ''} onChange={(event) => setParsedJd({ ...parsedJd, city: event.target.value })} className="input mt-1" /></label></div><p className="mt-3 text-xs text-moss">已提取 {parsedJd.requirements.length} 项岗位要求，确认后点击底部“开始匹配分析”。</p></div>}{error && <ErrorMessage text={error} />}<button onClick={handleParseJob} disabled={!jdInput.trim()} className="btn-ghost mt-5 w-full">{parsedJd ? '重新解析岗位描述' : '解析岗位描述'}</button></section>;
    return null;
  };

  const handleNext = () => {
    if (currentStep === 'import-resume') void handleConfirmResumes();
    else if (currentStep === 'extract-skills') {
      setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'extract-skills'])));
      setCurrentStep('input-job');
    } else if (currentStep === 'input-job') void handleMatch();
  };

  const handleExit = () => {
    saveWorkflowDraft({ step: currentStep, sourceMode, resumeIds: selectedResumeIds, jobInput: jdInput, parsedJd: parsedJd || undefined, extractedSkills: mergedSkills, extractedExperiences: mergedExperiences });
    onExit();
  };

  return <div className="min-h-screen bg-canvas"><WorkflowProgressBar currentStep={currentStep} completedSteps={completedSteps} onStepClick={(step) => completedSteps.includes(step) && setCurrentStep(step)} /><main className="page-shell py-8"><div className="mx-auto max-w-6xl">{renderContent()}</div><div className="mt-6 flex justify-center"><div className="flex items-center gap-3">{STEP_ORDER.indexOf(currentStep) > 0 && currentStep !== 'ai-match' && <button onClick={goBack} className="btn-ghost">上一步</button>}{currentStep !== 'ai-match' && <button onClick={handleNext} disabled={!canNext || loading} className="btn-primary">{currentStep === 'input-job' ? '开始匹配分析并查看结果' : '下一步'}</button>}<button onClick={handleExit} disabled={loading} className="btn-ghost">保存并退出</button></div></div></main></div>;
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => <div className="rounded-lg bg-canvas p-4 text-center"><p className="text-2xl font-semibold text-terra">{value}</p><p className="mt-1 text-xs text-ink-secondary">{label}</p></div>;
const ErrorMessage: React.FC<{ text: string }> = ({ text }) => <div className="mt-4 rounded-lg border border-terra-border bg-terra-light px-3 py-2 text-sm text-terra">{text}</div>;

export default JobsWorkflowView;
