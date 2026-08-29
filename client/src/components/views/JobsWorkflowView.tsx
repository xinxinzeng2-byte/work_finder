import React, { useEffect, useMemo, useState } from 'react';
import type { ParsedJobDescription, ParsedResume, MatchResult, GeneratedResume, AtomicExperience } from '../../types';
import { formatFollowUpExperience, generateFollowUpQuestion, generateTailoredResume, analyzeMatch, parseJobDescription, parseResumeFile, readFileAsDataUrl } from '../../services/api';
import { Loading } from '../Loading';
import WorkflowProgressBar, { type WorkflowStep } from '../WorkflowProgressBar';
import { clearWorkflowDraft, generateId, getApiKey, getNextSequenceNumber, loadResumes, loadWorkflowDraft, mergeExperiencesFromResumes, mergeSkillsFromResumes, saveCustomizedResume, saveJob, saveResume, saveWorkflowDraft, updateJob, type ResumeItem, type SavedJob } from '../../utils/storage';

interface Props {
  onJobsChange: () => void;
  onExit: () => void;
  onNeedApiKey: () => void;
}

const STEP_ORDER: WorkflowStep[] = ['import-resume', 'extract-skills', 'input-job', 'ai-match', 'supplement', 'generate'];
type SourceMode = 'library' | 'resumes' | 'import';

export const JobsWorkflowView: React.FC<Props> = ({ onJobsChange, onExit, onNeedApiKey }) => {
  const draft = loadWorkflowDraft();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(draft?.data.step || 'import-resume');
  const [completedSteps, setCompletedSteps] = useState<WorkflowStep[]>(draft ? STEP_ORDER.slice(0, Math.max(0, STEP_ORDER.indexOf(draft.data.step))) : []);
  const [resumes, setResumes] = useState<ResumeItem[]>(loadResumes());
  const [sourceMode, setSourceMode] = useState<SourceMode>(draft?.data.sourceMode || 'resumes');
  const [selectedResumeIds, setSelectedResumeIds] = useState<string[]>(draft?.data.resumeIds || loadResumes().filter((item) => item.type === 'original').map((item) => item.id));
  const [mergedSkills, setMergedSkills] = useState<ReturnType<typeof mergeSkillsFromResumes>>([]);
  const [mergedExperiences, setMergedExperiences] = useState<ReturnType<typeof mergeExperiencesFromResumes>>([]);
  const [analysisResume, setAnalysisResume] = useState<ParsedResume | null>(null);
  const [jdInput, setJdInput] = useState(draft?.data.jobInput || '');
  const [parsedJd, setParsedJd] = useState<ParsedJobDescription | null>(draft?.data.parsedJd || null);
  const [intendedPosition, setIntendedPosition] = useState('');
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [savedJob, setSavedJob] = useState<SavedJob | null>(null);
  const [generated, setGenerated] = useState<GeneratedResume | null>(null);
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractTab, setExtractTab] = useState<'skills' | 'experiences'>('skills');
  // 补录：插入模式 / 目标经历 / 整理后的预览
  const [insertMode, setInsertMode] = useState<'new' | 'existing'>('new');
  const [targetExperienceId, setTargetExperienceId] = useState<string>('');
  const [previewExperience, setPreviewExperience] = useState<AtomicExperience | null>(null);

  const originalResumes = useMemo(() => resumes.filter((item) => item.type === 'original'), [resumes]);
  const selectedResumes = useMemo(() => originalResumes.filter((item) => selectedResumeIds.includes(item.id)), [originalResumes, selectedResumeIds]);
  const sourceResumes = sourceMode === 'library' ? originalResumes : selectedResumes;
  const librarySkills = useMemo(() => mergeSkillsFromResumes(originalResumes), [originalResumes]);

  useEffect(() => {
    if (draft?.data.extractedSkills) setMergedSkills(draft.data.extractedSkills);
    if (draft?.data.extractedExperiences) setMergedExperiences(draft.data.extractedExperiences);
  }, []);

  useEffect(() => {
    if (currentStep === 'ai-match' || currentStep === 'supplement' || currentStep === 'generate') return;
    saveWorkflowDraft({ step: currentStep, sourceMode, resumeIds: selectedResumeIds, jobInput: jdInput, parsedJd: parsedJd || undefined, extractedSkills: mergedSkills, extractedExperiences: mergedExperiences });
  }, [currentStep, sourceMode, selectedResumeIds, jdInput, parsedJd, mergedSkills, mergedExperiences]);

  const requireKey = () => {
    if (getApiKey()) return true;
    onNeedApiKey();
    setError('请先配置 API Key，再使用 AI 功能。');
    return false;
  };

  const refreshResumes = () => setResumes(loadResumes());

  const handleUpload = async (file: File) => {
    if (!requireKey()) return;
    setLoading(true); setError('');
    try {
      const parsed = await parseResumeFile(file);
      const sourceFileData = await readFileAsDataUrl(file);
      const item = saveResume(parsed, { name: file.name.replace(/\.(pdf|docx|html|htm|txt)$/i, ''), fileName: file.name, sourceFileData, sourceMimeType: file.type });
      setSourceMode('import');
      setSelectedResumeIds([item.id]);
      refreshResumes();
    } catch (err) { setError(err instanceof Error ? err.message : '简历解析失败，请重试'); }
    finally { setLoading(false); }
  };

  const handleConfirmResumes = () => {
    if (sourceResumes.length === 0) { setError(sourceMode === 'library' ? '当前能力库还没有可使用的原始简历，请先导入简历。' : sourceMode === 'import' ? '请先导入一份新简历。' : '请至少选择一份原始简历。'); return; }
    const skills = mergeSkillsFromResumes(sourceResumes);
    const experiences = mergeExperiencesFromResumes(sourceResumes);
    setMergedSkills(skills); setMergedExperiences(experiences); setError('');
    setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'import-resume'])));
    setCurrentStep('extract-skills');
  };

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
    if (!jdInput.trim()) { setError('请先粘贴岗位描述。'); return; }
    setLoading(true); setError('');
    try { setParsedJd(await parseJobDescription(jdInput.trim())); }
    catch (err) { setError(err instanceof Error ? err.message : '岗位解析失败，请重试'); }
    finally { setLoading(false); }
  };

  const handleMatch = async () => {
    if (!requireKey()) return;
    if (!parsedJd) { setError('请先解析岗位描述。'); return; }
    const merged = buildMergedResume();
    setAnalysisResume(merged); setLoading(true); setError('');
    try {
      const result = await analyzeMatch(merged, parsedJd);
      const now = new Date().toISOString();
      const job: SavedJob = {
        id: generateId(), savedAt: now, sequenceNumber: getNextSequenceNumber(),
        jobName: parsedJd.position || '未命名岗位', company: parsedJd.company || '未知公司', intendedPosition: intendedPosition || parsedJd.position || '未命名职位',
        matchScore: result.score, mainGaps: result.gaps.slice(0, 3).map((gap) => gap.requirement), analyzedAt: now,
        status: 'analyzed', jd: parsedJd, matchResult: result, sourceResumeIds: sourceResumes.map((item) => item.id), resumeSnapshot: merged, createdAt: now, updatedAt: now,
      };
      saveJob(job); setSavedJob(job); setMatchResult(result); onJobsChange(); clearWorkflowDraft();
      setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'input-job', 'ai-match']))); setCurrentStep('ai-match');
    } catch (err) { setError(err instanceof Error ? err.message : '匹配分析失败，请重试'); }
    finally { setLoading(false); }
  };

  const handleSupplement = async (gap: string) => {
    if (!requireKey() || !analysisResume) return;
    setSelectedGap(gap); setAnswer(''); setQuestion(''); setLoading(true); setError('');
    setInsertMode('new'); setTargetExperienceId(''); setPreviewExperience(null);
    try { setQuestion(await generateFollowUpQuestion(gap, analysisResume)); }
    catch (err) { setError(err instanceof Error ? err.message : '生成引导问题失败'); }
    finally { setLoading(false); }
  };

  // 仅生成整理后的预览，不立即写入简历
  const submitSupplement = async () => {
    if (!selectedGap || !analysisResume || !answer.trim()) return;
    setLoading(true); setError('');
    try {
      const experience: AtomicExperience = await formatFollowUpExperience(answer.trim(), selectedGap);
      setPreviewExperience(experience);
    } catch (err) { setError(err instanceof Error ? err.message : '补录整理失败'); }
    finally { setLoading(false); }
  };

  // 确认预览后再写入简历：新增经历或追加到现有经历
  const confirmSupplement = () => {
    if (!selectedGap || !analysisResume || !previewExperience) return;
    const newSkill = { id: generateId(), category: '补录能力', name: selectedGap, level: '熟悉' as const, evidence: previewExperience.rawText };
    let updated: ParsedResume;
    if (insertMode === 'existing' && targetExperienceId) {
      updated = {
        ...analysisResume,
        experiences: analysisResume.experiences.map((exp) => {
          if (exp.id !== targetExperienceId) return exp;
          const mergedAchievements = [...exp.achievements, ...previewExperience.achievements];
          const mergedSkills = Array.from(new Set([...exp.skillsUsed, ...previewExperience.skillsUsed, selectedGap]));
          return { ...exp, achievements: mergedAchievements, skillsUsed: mergedSkills, rawText: `${exp.rawText}\n${previewExperience.rawText}` };
        }),
        skills: analysisResume.skills.some((s) => s.name === selectedGap) ? analysisResume.skills : [...analysisResume.skills, newSkill],
      };
    } else {
      updated = {
        ...analysisResume,
        experiences: [...analysisResume.experiences, previewExperience],
        skills: analysisResume.skills.some((s) => s.name === selectedGap) ? analysisResume.skills : [...analysisResume.skills, newSkill],
      };
    }
    setAnalysisResume(updated);
    setAnswer('');
    const nextSupplemented = [...(savedJob?.supplementedGaps || []), selectedGap!];
    if (savedJob) {
      updateJob(savedJob.id, { status: 'supplementing', resumeSnapshot: updated, supplementedGaps: nextSupplemented });
      setSavedJob({ ...savedJob, status: 'supplementing', resumeSnapshot: updated, supplementedGaps: nextSupplemented });
    }
    setSelectedGap(null); setQuestion(''); setPreviewExperience(null); setTargetExperienceId(''); setInsertMode('new');
  };

  const cancelSupplementPreview = () => { setPreviewExperience(null); };

  const handleGenerate = async () => {
    if (!requireKey() || !parsedJd || !analysisResume || !matchResult) return;
    setLoading(true); setError('');
    try {
      const result = await generateTailoredResume(analysisResume, parsedJd, matchResult);
      setGenerated(result);
      if (savedJob) { updateJob(savedJob.id, { status: 'completed', generatedResume: result }); setSavedJob({ ...savedJob, status: 'completed', generatedResume: result }); }
      saveCustomizedResume({ basicInfo: analysisResume.basicInfo, rawText: result.summary, skills: analysisResume.skills, experiences: result.experiences.map((item) => ({ id: generateId(), company: item.company, role: item.role, period: item.period, description: item.description, achievements: item.highlights, skillsUsed: [], rawText: `${item.description}\n${item.highlights.join('\n')}` })) }, { name: `${parsedJd.position || '岗位'}${parsedJd.company ? ` @${parsedJd.company}` : ''}`, sourceIds: sourceResumes.map((item) => item.id), targetJob: { position: parsedJd.position || '', company: parsedJd.company, matchScore: matchResult.score } });
      onJobsChange();
      clearWorkflowDraft();
      setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'supplement', 'generate']))); setCurrentStep('generate');
    } catch (err) { setError(err instanceof Error ? err.message : '生成定制简历失败'); }
    finally { setLoading(false); }
  };

  const goBack = () => { const index = STEP_ORDER.indexOf(currentStep); if (index > 0) setCurrentStep(STEP_ORDER[index - 1]); };
  const canNext = currentStep === 'import-resume' ? sourceResumes.length > 0 : currentStep === 'extract-skills' ? true : currentStep === 'input-job' ? !!parsedJd : false;

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

  const isImportStep = () => currentStep === 'import-resume';
  const renderContent = () => {
    if (loading) return <div className="card py-20"><Loading text={currentStep === 'ai-match' ? '正在进行匹配分析...' : 'AI 正在处理...'} subtext="请稍候，完成后结果会自动保存" /></div>;
    if (isImportStep()) return renderResumeSourceStep();
    if (currentStep === 'import-resume') return <section className="card"><h2 className="font-serif text-xl font-semibold">选择能力来源</h2><p className="mt-2 text-sm text-ink-secondary">默认选中当前能力库中的原始简历，也可以继续导入新的简历并合并使用。</p><label className="upload-zone mt-6 flex cursor-pointer flex-col items-center gap-2 p-8"><span className="text-3xl text-terra">＋</span><span className="text-sm font-medium">导入新简历</span><span className="text-xs text-ink-weak">支持 PDF、Word、HTML、TXT</span><input type="file" accept=".pdf,.docx,.doc,.html,.htm,.txt" className="hidden" onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])} /></label><div className="mt-6 space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-medium">已有原始简历</h3><span className="text-xs text-ink-weak">已选择 {selectedResumeIds.length} 份</span></div>{resumes.filter((item) => item.type === 'original').map((item) => <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${selectedResumeIds.includes(item.id) ? 'border-terra bg-terra-light/40' : 'border-line'}`}><input type="checkbox" checked={selectedResumeIds.includes(item.id)} onChange={() => setSelectedResumeIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /><div className="flex-1"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-ink-secondary">{item.resume.skills.length} 项能力 · {item.resume.experiences.length} 段经历</p></div>{item.isCurrent && <span className="text-xs text-terra">默认</span>}</label>)}</div>{error && <ErrorMessage text={error} />}</section>;
    if (currentStep === 'extract-skills') return <section className="card">
      <h2 className="font-serif text-xl font-semibold">AI 提取并合并能力</h2>
      <p className="mt-2 text-sm text-ink-secondary">{sourceMode === 'library' ? '已载入当前能力库' : `已合并 ${sourceResumes.length} 份原始简历`}，重复能力会取最高熟练度，并保留来源。</p>
      <div className="mt-5 grid grid-cols-3 gap-4"><Metric label="原子能力" value={mergedSkills.length} /><Metric label="原子经历" value={mergedExperiences.length} /><Metric label="来源简历" value={new Set(mergedSkills.flatMap((skill) => skill.sources)).size} /></div>
      <div className="mt-6 flex gap-1 border-b border-line">
        <button onClick={() => setExtractTab('skills')} className={`-mb-px border-b-2 px-4 py-2 text-sm ${extractTab === 'skills' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary hover:text-ink'}`}>原子能力（{mergedSkills.length}）</button>
        <button onClick={() => setExtractTab('experiences')} className={`-mb-px border-b-2 px-4 py-2 text-sm ${extractTab === 'experiences' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary hover:text-ink'}`}>原子经历（{mergedExperiences.length}）</button>
      </div>
      <div className="scroll-hover mt-4 max-h-[460px] pr-2">
        {extractTab === 'skills' ? (
          mergedSkills.length === 0 ? <div className="py-10 text-center text-sm text-ink-secondary">暂无能力数据</div> : (
            <div className="space-y-2">
              {mergedSkills.map((skill) => (
                <div key={skill.name} className="rounded-lg border border-line bg-canvas/50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-ink">{skill.name}</span>
                    <span className="shrink-0 rounded-full bg-terra-light px-2 py-0.5 text-xs text-terra">{skill.level}</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-weak">分类：{skill.category || '未分类'}</div>
                  {skill.evidence && <p className="mt-2 text-xs leading-relaxed text-ink-secondary">证据：{skill.evidence}</p>}
                  <div className="mt-2 text-xs text-ink-weak">来自：{skill.sources.join('、')}</div>
                </div>
              ))}
            </div>
          )
        ) : (
          mergedExperiences.length === 0 ? <div className="py-10 text-center text-sm text-ink-secondary">暂无经历数据</div> : (
            <div className="space-y-3">
              {mergedExperiences.map((exp) => (
                <div key={exp.id} className="rounded-lg border border-line bg-canvas/50 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium text-ink">{exp.company} · {exp.role}</span>
                    <span className="shrink-0 text-xs text-ink-weak">{exp.period}</span>
                  </div>
                  {exp.achievements.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-secondary">
                      {exp.achievements.map((a, idx) => <li key={idx}>{a}</li>)}
                    </ul>
                  )}
                  {exp.skillsUsed.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{exp.skillsUsed.map((s) => <span key={s} className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-secondary">{s}</span>)}</div>}
                  <div className="mt-2 text-xs text-ink-weak">来自：{exp.sources.join('、')}</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </section>;
    if (currentStep === 'input-job') return <section className="card"><h2 className="font-serif text-xl font-semibold">输入目标岗位</h2><p className="mt-2 text-sm text-ink-secondary">粘贴岗位 JD，AI 会先提取岗位信息，再进行匹配分析。</p><textarea value={jdInput} onChange={(event) => { setJdInput(event.target.value); setParsedJd(null); }} className="textarea mt-6 h-64" placeholder="把岗位描述粘贴到这里..." />{parsedJd && <div className="mt-4 rounded-lg border border-moss/30 bg-mossLight p-4 text-sm"><div className="grid grid-cols-2 gap-2"><label>岗位名称<input value={parsedJd.position || ''} onChange={(event) => setParsedJd({ ...parsedJd, position: event.target.value })} className="input mt-1" /></label><label>公司<input value={parsedJd.company || ''} onChange={(event) => setParsedJd({ ...parsedJd, company: event.target.value })} className="input mt-1" /></label><label>意向职位<input value={intendedPosition || parsedJd.position || ''} onChange={(event) => setIntendedPosition(event.target.value)} className="input mt-1" /></label><label>城市<input value={parsedJd.city || ''} onChange={(event) => setParsedJd({ ...parsedJd, city: event.target.value })} className="input mt-1" /></label></div><p className="mt-3 text-xs text-moss">已提取 {parsedJd.requirements.length} 项岗位要求，确认后点击底部“开始匹配分析”。</p></div>}{error && <ErrorMessage text={error} />}<button onClick={handleParseJob} disabled={!jdInput.trim()} className="btn-ghost mt-5 w-full">{parsedJd ? '重新解析岗位描述' : '解析岗位描述'}</button></section>;
    if (currentStep === 'ai-match' && matchResult) return <MatchResultView result={matchResult} onSupplement={() => { setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'ai-match']))); setCurrentStep('supplement'); }} onGenerate={() => { setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'ai-match']))); setCurrentStep('generate'); }} />;
    if (currentStep === 'supplement' && matchResult) return <section className="space-y-5">
      <div className="card">
        <h2 className="font-serif text-xl font-semibold">人工确认并补录缺口</h2>
        <p className="mt-2 text-sm text-ink-secondary">选择一个缺口，用大白话回答 AI 的引导问题；整理后可先预览，确认后再加入简历。</p>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {matchResult.gaps.map((gap) => (
            <button key={gap.requirement} onClick={() => handleSupplement(gap.requirement)} className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm ${selectedGap === gap.requirement ? 'border-terra bg-terra-light' : 'border-line hover:border-terra-border'}`}>
              <span className="mt-0.5 text-terra">{gap.isHard ? '!' : '?'}</span>
              <span className="flex-1">{gap.requirement}</span>
              <span className="shrink-0 text-xs text-ink-weak">{selectedGap === gap.requirement ? '补录中' : '补录'}</span>
            </button>
          ))}
        </div>

        {selectedGap && (
          <div className="mt-6 rounded-lg border border-line bg-canvas/60 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">正在补录：{selectedGap}</h3>
              <button onClick={() => { setSelectedGap(null); setQuestion(''); setAnswer(''); setPreviewExperience(null); }} className="text-xs text-ink-weak hover:text-terra">取消</button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{question || '正在生成引导问题...'}</p>
            <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} className="textarea mt-3 h-28" placeholder="用大白话描述相关经历，越具体越好..." />

            <div className="mt-4">
              <p className="label">补录内容插入方式</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${insertMode === 'new' ? 'border-terra bg-terra-light/40' : 'border-line hover:border-terra-border'}`}>
                  <input type="radio" name="insert-mode" checked={insertMode === 'new'} onChange={() => setInsertMode('new')} className="mt-0.5" />
                  <span><span className="block font-medium">新增经历</span><span className="mt-1 block text-xs text-ink-secondary">作为一段新的工作/项目经历加入</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${insertMode === 'existing' ? 'border-terra bg-terra-light/40' : 'border-line hover:border-terra-border'}`}>
                  <input type="radio" name="insert-mode" checked={insertMode === 'existing'} onChange={() => setInsertMode('existing')} className="mt-0.5" />
                  <span><span className="block font-medium">插入现有经历</span><span className="mt-1 block text-xs text-ink-secondary">把这段内容追加到已有的某段经历下</span></span>
                </label>
              </div>
            </div>

            {insertMode === 'existing' && (
              <div className="mt-3">
                <label className="label">选择要追加到的经历</label>
                <select value={targetExperienceId} onChange={(event) => setTargetExperienceId(event.target.value)} className="input">
                  <option value="">请选择一段经历...</option>
                  {(analysisResume?.experiences || []).map((exp) => (
                    <option key={exp.id} value={exp.id}>{exp.company} · {exp.role}（{exp.period}）</option>
                  ))}
                </select>
                {(analysisResume?.experiences || []).length === 0 && <p className="mt-1 text-xs text-ink-weak">当前没有已有经历，请改用"新增经历"。</p>}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button onClick={submitSupplement} disabled={!answer.trim() || (insertMode === 'existing' && !targetExperienceId) || loading} className="btn-primary">{loading ? '整理中...' : '提交并整理'}</button>
              {previewExperience && <button onClick={cancelSupplementPreview} className="btn-ghost">重新整理</button>}
            </div>

            {previewExperience && (
              <div className="mt-5 rounded-lg border border-moss/40 bg-mossLight/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moss text-xs text-white">✓</span>
                  <h4 className="text-sm font-semibold text-ink">整理后预览{insertMode === 'existing' && targetExperienceId ? '（将追加到所选经历）' : '（将作为新经历加入）'}</h4>
                </div>
                <div className="mt-3 rounded-lg bg-paper p-4 text-sm">
                  <p className="font-medium text-ink">{previewExperience.company} · {previewExperience.role}</p>
                  <p className="mt-0.5 text-xs text-ink-weak">{previewExperience.period}</p>
                  {previewExperience.achievements.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-secondary">
                      {previewExperience.achievements.map((a, idx) => <li key={idx}>{a}</li>)}
                    </ul>
                  )}
                  {previewExperience.skillsUsed.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {previewExperience.skillsUsed.map((s) => <span key={s} className="rounded bg-terra-light px-2 py-0.5 text-[11px] text-terra">{s}</span>)}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={confirmSupplement} className="btn-primary h-9 px-4 text-xs">确认加入简历</button>
                  <button onClick={cancelSupplementPreview} className="btn-ghost h-9 px-4 text-xs">取消</button>
                </div>
              </div>
            )}
          </div>
        )}
        {error && <ErrorMessage text={error} />}
      </div>
      <div className="flex justify-end">
        <button onClick={() => { setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'supplement']))); setCurrentStep('generate'); }} className="btn-primary">跳过补录，生成定制简历</button>
      </div>
    </section>;
    if (currentStep === 'generate') return <section className="space-y-5"><div className="card"><h2 className="font-serif text-xl font-semibold">生成定制简历</h2><p className="mt-2 text-sm text-ink-secondary">AI 会根据岗位要求，从本次能力快照中筛选并重新组织最相关的经历。</p>{generated ? <div className="mt-5 space-y-5"><div><h3 className="font-serif font-medium">个人简介</h3><p className="mt-2 rounded-lg bg-canvas p-4 text-sm text-ink-secondary">{generated.summary}</p></div><div><h3 className="font-serif font-medium">核心技能</h3><div className="mt-2 flex flex-wrap gap-2">{generated.skillsHighlight.map((skill) => <span key={skill} className="rounded-full bg-terra-light px-3 py-1 text-xs text-terra">{skill}</span>)}</div></div><div><h3 className="font-serif font-medium">工作经历</h3><div className="mt-2 space-y-3">{generated.experiences.map((item) => <div key={`${item.company}-${item.role}`} className="border-l-2 border-terra-border pl-4"><p className="text-sm font-medium">{item.company} · {item.role}</p><p className="mt-1 text-sm text-ink-secondary">{item.description}</p></div>)}</div></div><div className="rounded-lg border border-moss/30 bg-mossLight px-4 py-3 text-sm text-moss">定制简历已保存到“简历与能力库”，岗位状态已更新。</div></div> : <button onClick={handleGenerate} className="btn-primary mt-6 w-full">生成并保存定制简历</button>}{error && <ErrorMessage text={error} />}</div></section>;
    return null;
  };

  const handleNext = () => { if (currentStep === 'import-resume') handleConfirmResumes(); else if (currentStep === 'extract-skills') { setCompletedSteps((steps) => Array.from(new Set<WorkflowStep>([...steps, 'extract-skills']))); setCurrentStep('input-job'); } else if (currentStep === 'input-job') handleMatch(); };

  return <div className="min-h-screen bg-canvas"><WorkflowProgressBar currentStep={currentStep} completedSteps={completedSteps} onStepClick={(step) => completedSteps.includes(step) && setCurrentStep(step)} /><main className="page-shell py-8"><div className="mx-auto max-w-6xl">{renderContent()}</div><div className="mt-6 flex justify-center"><div className="flex items-center gap-3">{STEP_ORDER.indexOf(currentStep) > 0 && currentStep !== 'generate' && <button onClick={goBack} className="btn-ghost">上一步</button>}{currentStep === 'import-resume' || currentStep === 'extract-skills' || currentStep === 'input-job' ? <button onClick={handleNext} disabled={!canNext || loading} className="btn-primary">{currentStep === 'input-job' ? '开始匹配分析并保存' : '下一步'}</button> : null}<button onClick={() => { saveWorkflowDraft({ step: currentStep, sourceMode, resumeIds: selectedResumeIds, jobInput: jdInput, parsedJd: parsedJd || undefined, extractedSkills: mergedSkills, extractedExperiences: mergedExperiences }); onExit(); }} className="btn-ghost">保存并退出</button></div></div></main></div>;
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => <div className="rounded-lg bg-canvas p-4 text-center"><p className="text-2xl font-semibold text-terra">{value}</p><p className="mt-1 text-xs text-ink-secondary">{label}</p></div>;
const ErrorMessage: React.FC<{ text: string }> = ({ text }) => <div className="mt-4 rounded-lg border border-terra-border bg-terra-light px-3 py-2 text-sm text-terra">{text}</div>;
const MatchResultView: React.FC<{ result: MatchResult; onSupplement: () => void; onGenerate: () => void }> = ({ result, onSupplement, onGenerate }) => <section className="space-y-5"><div className="card flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-terra">MATCH SCORE</p><h2 className="mt-2 font-serif text-xl font-semibold">匹配分析完成</h2><p className="mt-2 max-w-xl text-sm text-ink-secondary">{result.summary}</p></div><div className="text-center"><div className="text-5xl font-semibold text-terra">{result.score}</div><div className="text-xs text-ink-weak">/ 100</div></div></div><div className="grid grid-cols-2 gap-5"><div className="card"><h3 className="font-serif text-lg font-semibold">已具备能力</h3><div className="mt-4 space-y-2">{result.skillMatch.filter((item) => item.matched).map((item) => <div key={item.requirement} className="rounded bg-mossLight px-3 py-2 text-sm text-moss">✓ {item.requirement}</div>)}</div></div><div className="card"><h3 className="font-serif text-lg font-semibold">主要缺口</h3><div className="mt-4 space-y-2">{result.gaps.map((item) => <div key={item.requirement} className="rounded bg-terra-light px-3 py-2 text-sm text-terra">{item.isHard ? '!' : '?'} {item.requirement}</div>)}</div></div></div><div className="flex justify-end gap-3"><button onClick={onSupplement} className="btn-ghost">人工补录缺口</button><button onClick={onGenerate} className="btn-primary">跳过补录，生成简历</button></div></section>;

export default JobsWorkflowView;
