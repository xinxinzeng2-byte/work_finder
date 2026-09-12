import React, { useMemo, useState } from 'react';
import { parseJobDescription, analyzeMatchV2, generateFollowUpQuestion, formatFollowUpExperience } from '../../services/api';
import { clearWorkflowDraft, getCurrentResumeItem, loadResumes, replaceJobAnalysis, replaceResumeData, saveCustomizedResume, saveJob, type ResumeItem, type SavedJob, generateId } from '../../utils/storage';
import { isMatchResultV2, type AnalysisMatchResult, type CapabilityHardConditionStatus, type CapabilityRequirementScoreV2, type ParsedResume, type ParsedJobDescription, type GeneratedResume, type AtomicExperience, type MatchItem, type MatchDimensionKey } from '../../types';
import { Loading, InlineLoading } from '../Loading';
import { generateTailoredResume } from '../../services/api';
import { CapabilityRadar } from '../CapabilityRadar';
import '../analysis-detail.css';

const dimensionLabels: Record<MatchDimensionKey, string> = { skill: '技能', experience: '经验', project: '项目', achievement: '成果', education: '教育专业', industry: '行业领域', other: '其他要求' };
const itemDimension = (item: MatchItem): MatchDimensionKey => item.dimension && item.dimension in dimensionLabels ? item.dimension : 'other';
export const matchesSelectedDimension = (item: MatchItem, linked: boolean, selectedDimension: MatchDimensionKey | 'all'): boolean =>
  !linked || selectedDimension === 'all' || itemDimension(item) === selectedDimension;
const compactEvidenceForDisplay = (value: string, requirement: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 120) return normalized;
  const terms = [...(requirement.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g) || []), ...(requirement.match(/[\u4e00-\u9fff]{2,}/g) || [])].map(term => term.toLowerCase());
  const chunks = normalized.split(/(?<=[。！？；.!?;])/u).map(chunk => chunk.trim()).filter(Boolean);
  const ranked = chunks.map((chunk, index) => ({ chunk, index, score: terms.reduce((total, term) => total + (chunk.toLowerCase().includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score || a.index - b.index);
  let selected = '';
  for (const item of ranked) {
    const candidate = selected ? `${selected}；${item.chunk}` : item.chunk;
    if (candidate.length > 120) continue;
    selected = candidate;
    if (selected.length >= 70) break;
  }
  return `${selected || normalized.slice(0, 120)}${(selected || normalized.slice(0, 120)).length < normalized.length ? '…' : ''}`;
};
const statusMeta = {
  missing: { label: '未发现', symbol: '○', note: '简历中暂未找到明确证据' },
  partial: { label: '部分匹配', symbol: '△', note: '已有相关经历，仍需补充细节' },
  matched: { label: '已匹配', symbol: '✓', note: '已找到支持岗位要求的证据' },
};
const statusOrder = ['missing', 'partial', 'matched'] as const;
const hardStatusMeta: Record<CapabilityHardConditionStatus, { label: string; symbol: string; className: string }> = {
  met: { label: '已匹配', symbol: '✓', className: 'matched' },
  not_met: { label: '未发现', symbol: '○', className: 'missing' },
  unknown: { label: '部分匹配', symbol: '△', className: 'partial' },
  not_applicable: { label: '已匹配', symbol: '✓', className: 'matched' },
};

interface AnalysisRequirementItem extends MatchItem {
  isScoreable?: boolean;
  hardConditionStatus?: CapabilityHardConditionStatus;
  scoreDetail?: CapabilityRequirementScoreV2;
}

/** 判断选中的简历是否就是这条岗位上次实际分析使用的版本。 */
export const isSameAnalyzedResume = (item: ResumeItem, job: SavedJob): boolean => {
  if (job.analyzedResumeId) {
    return item.id === job.analyzedResumeId
      && (typeof job.analyzedResumeVersion !== 'number' || item.version === job.analyzedResumeVersion);
  }
  return !!job.resumeSnapshot && JSON.stringify(item.resume) === JSON.stringify(job.resumeSnapshot);
};

interface Props {
  resume: ParsedResume | null;
  onResumeUpdate?: (resume: ParsedResume) => void;
  onJobSaved: () => void;
  initialJob?: SavedJob | null;
}

type Stage = 'idle' | 'parsing-jd' | 'analyzing' | 'result' | 'supplementing' | 'generating' | 'done';

export const AnalyzeView: React.FC<Props> = ({ resume, onResumeUpdate, onJobSaved, initialJob }) => {
  const [jdText, setJdText] = useState(initialJob?.jd.rawText || '');
  const [stage, setStage] = useState<Stage>(initialJob ? 'result' : 'idle');
  const [jd, setJd] = useState<ParsedJobDescription | null>(initialJob?.jd || null);
  const [match, setMatch] = useState<AnalysisMatchResult | null>(initialJob?.matchResult || null);
  const [jobRecord, setJobRecord] = useState<SavedJob | null>(initialJob || null);
  const [activeResume, setActiveResume] = useState<ParsedResume | null>(resume);
  const [generated, setGenerated] = useState<GeneratedResume | null>(initialJob?.generatedResume || null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(initialJob?.id || null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showResumePicker, setShowResumePicker] = useState(false);
  const [resumePickerItems, setResumePickerItems] = useState<ResumeItem[]>([]);
  const [resumePickerSelection, setResumePickerSelection] = useState('');

  // 补录相关
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'ai' | 'user'; content: string }[]>([]);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [loadingFormat, setLoadingFormat] = useState(false);
  const [supplementResumeItem, setSupplementResumeItem] = useState<ResumeItem | null>(null);
  const [supplementedGaps, setSupplementedGaps] = useState<Set<string>>(new Set(initialJob?.supplementedGaps || []));
  const [linked, setLinked] = useState(true);
  const [selectedDimension, setSelectedDimension] = useState<MatchDimensionKey | 'all'>('skill');

  const uniqueMatchItems = useMemo(() => {
    if (match && isMatchResultV2(match)) {
      const scoreById = new Map(match.capabilityRadar.dimensions.flatMap(dimension => dimension.details).map(detail => [detail.id, detail]));
      return match.capabilityEvidence.map((item): AnalysisRequirementItem => {
        const scoreDetail = scoreById.get(item.id);
        const status = scoreDetail?.status === 'matched' ? 'matched' : scoreDetail?.status === 'partial' ? 'partial' : 'missing';
        const hardStatus = item.hardConditionStatus;
        return {
          id: item.id,
          title: item.title,
          requirement: item.requirement,
          matched: item.isHard ? hardStatus === 'met' : status === 'matched',
          status: item.isHard && hardStatus === 'unknown' ? 'partial' : status,
          evidence: item.resumeEvidence,
          jobEvidence: item.jobEvidence,
          dimension: item.dimension,
          isHard: item.isHard,
          isScoreable: item.isScoreable,
          hardConditionStatus: hardStatus,
          scoreDetail,
        };
      });
    }
    const byRequirement = new Map<string, AnalysisRequirementItem>();
    const requirementKey = (text: string) => text.trim().replace(/\s+/g, ' ');
    // Historical records can have dimensions/status only inside radar details.
    // Reuse those saved associations; never infer capability from display text.
    const radarDetails = new Map((match?.capabilityRadar?.dimensions || []).flatMap(dimension =>
      (dimension.details || []).map(detail => [requirementKey(detail.requirement), { ...detail, dimension: dimension.key }] as const)
    ));
    const all = [
      ...(match?.hardConditionCheck || []).map(item => ({ ...item, isHard: true })),
      ...(match?.skillMatch || []),
      ...(match?.gaps || []),
    ];
    all.forEach(item => {
      const key = requirementKey(item.requirement);
      const detail = radarDetails.get(key);
      const previous = byRequirement.get(key);
      const normalized: AnalysisRequirementItem = {
        ...item,
        title: item.title?.trim() || detail?.title?.trim() || undefined,
        dimension: item.dimension ?? detail?.dimension,
        status: item.status ?? detail?.status ?? (item.matched ? 'matched' : 'missing'),
        evidence: item.evidence || detail?.evidence,
        jobEvidence: item.jobEvidence || detail?.jobEvidence,
        isHard: item.isHard || detail?.isHard === true || detail?.analysisSection === 'hard',
      };
      byRequirement.set(key, previous ? {
        ...normalized, ...previous,
        title: previous.title?.trim() || normalized.title,
        isHard: previous.isHard || normalized.isHard,
        dimension: previous.dimension ?? normalized.dimension,
        evidence: previous.evidence || normalized.evidence,
        jobEvidence: previous.jobEvidence || normalized.jobEvidence,
      } : normalized);
    });
    return Array.from(byRequirement.values());
  }, [match]);

  const orderedMatchItems = useMemo(() => {
    const statusRank = { missing: 0, partial: 1, matched: 2 };
    return uniqueMatchItems
      .filter((item) => matchesSelectedDimension(item, linked, selectedDimension))
      .sort((a, b) => {
        const aStatus = a.status || (a.matched ? 'matched' : 'missing');
        const bStatus = b.status || (b.matched ? 'matched' : 'missing');
        return (statusRank[aStatus] - statusRank[bStatus]) || Number(a.isHard ? -1 : 1) - Number(b.isHard ? -1 : 1);
      });
  }, [linked, selectedDimension, uniqueMatchItems]);

  const handleAnalyze = async () => {
    if (!activeResume) {
      setError('当前没有可用的简历，无法进行新的分析。请先在简历与能力库中导入简历。');
      return;
    }
    if (!jdText.trim()) {
      setError('请粘贴岗位描述');
      return;
    }
    setError('');
    setStage('parsing-jd');
    try {
      const parsedJd = await parseJobDescription(jdText.trim());
      setJd(parsedJd);

      setStage('analyzing');
      const matchResult = await analyzeMatchV2(activeResume, parsedJd);
      setMatch(matchResult);

      // 自动保存为收录岗位
      const jobId = generateId();
      const newJob: SavedJob = {
        id: jobId,
        jd: parsedJd,
        matchResult,
        savedAt: new Date().toISOString(),
        status: 'analyzed',
        resumeSnapshot: activeResume,
        analyzedResumeId: getCurrentResumeItem()?.id,
        analyzedResumeVersion: getCurrentResumeItem()?.version,
        scoringVersion: matchResult.metadata.scoringVersion,
        inputHash: matchResult.metadata.inputHash,
      };
      await saveJob(newJob);
      setJobRecord(newJob);
      setCurrentJobId(jobId);
      onJobSaved();

      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
      setStage('idle');
    }
  };

  const openResumePicker = () => {
    if (!jobRecord || !jd) return;
    const items = loadResumes();
    if (items.length === 0) {
      setError('当前没有可重新分析的简历，请先在“简历与能力库”中导入简历。');
      return;
    }
    const currentAnalysis = items.find(item => isSameAnalyzedResume(item, jobRecord));
    setResumePickerItems(items);
    setResumePickerSelection(currentAnalysis?.id || getCurrentResumeItem()?.id || items[0].id);
    setError('');
    setInfo('');
    setShowResumePicker(true);
  };

  const handleReanalyze = async (selectedResume?: ResumeItem) => {
    if (!jobRecord || !jd) return;
    const resumes = loadResumes();
    let resumeItem = selectedResume || (jobRecord.analyzedResumeId ? resumes.find(item => item.id === jobRecord.analyzedResumeId) : undefined);
    let analysisResume = resumeItem?.resume || (!jobRecord.analyzedResumeId ? jobRecord.resumeSnapshot : undefined);
    if (jobRecord.analyzedResumeId && !resumeItem) {
      const current = getCurrentResumeItem() || resumes[0];
      if (!current) {
        setError('原分析使用的简历已不存在，当前也没有可用简历。原结果已保留。');
        return;
      }
      if (!window.confirm('原分析使用的简历已不存在。是否改用当前简历重新分析？\n\n选择“取消”将保留原结果。')) return;
      resumeItem = current;
      analysisResume = current.resume;
    }
    analysisResume ||= activeResume || undefined;
    if (!analysisResume) {
      setError('这条历史岗位没有保存简历快照，且当前没有可用简历，暂时无法重新计算。');
      return;
    }

    setError('');
    setInfo('');
    setShowResumePicker(false);
    if (resumeItem && isSameAnalyzedResume(resumeItem, jobRecord)) {
      setActiveResume(analysisResume);
      setInfo('已选择本条岗位原来使用的简历，直接复用已有分析结果，未重复调用 AI。');
      setStage('result');
      return;
    }
    setStage('analyzing');
    try {
      const matchResult = await analyzeMatchV2(analysisResume, jd);
      const updatedAt = new Date().toISOString();
      const updatedJob: SavedJob = {
        ...jobRecord,
        id: jobRecord.id,
        jd,
        matchResult,
        matchScore: matchResult.score,
        mainGaps: matchResult.gaps.map((item) => item.requirement),
        analyzedAt: updatedAt,
        updatedAt,
        resumeSnapshot: analysisResume,
        analyzedResumeId: resumeItem?.id || jobRecord.analyzedResumeId,
        analyzedResumeVersion: resumeItem?.version || jobRecord.analyzedResumeVersion,
        scoringVersion: matchResult.metadata.scoringVersion,
        inputHash: matchResult.metadata.inputHash,
      };
      await replaceJobAnalysis(updatedJob);
      setMatch(matchResult);
      setJobRecord(updatedJob);
      setActiveResume(analysisResume);
      setCurrentJobId(jobRecord.id);
      onJobSaved();
      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新计算失败');
      setStage('result');
    }
  };

  const handleSelectGap = async (gap: string) => {
    const resumes = loadResumes();
    const linkedId = jobRecord?.analyzedResumeId || (jobRecord?.sourceResumeIds?.length === 1 ? jobRecord.sourceResumeIds[0] : undefined);
    let target = linkedId ? resumes.find(item => item.id === linkedId && item.type === 'original') : undefined;
    if (!target) {
      const current = getCurrentResumeItem();
      if (!current) {
        setError('当前没有可编辑的原始简历，请先在“简历与能力库”中选择或导入简历。');
        return;
      }
      if (jobRecord && !window.confirm('这条岗位找不到原分析绑定的简历。是否将补录写入当前简历并用它重评？\n\n选择“取消”不会修改任何数据。')) return;
      target = current;
    }
    if (!target) {
      setError('当前没有可用的简历，暂时无法补录缺口。');
      return;
    }
    setSupplementResumeItem(target);
    setSelectedGap(gap);
    setAnswer('');
    setChatHistory([]);
    setLoadingQuestion(true);
    setStage('supplementing');
    try {
      const q = await generateFollowUpQuestion(gap, target.resume);
      setChatHistory([{ role: 'ai', content: q }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成问题失败');
    } finally {
      setLoadingQuestion(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!supplementResumeItem || !answer.trim() || !selectedGap) return;
    setLoadingFormat(true);
    const userMsg = answer.trim();
    setChatHistory((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAnswer('');

    try {
      const newExp: AtomicExperience = await formatFollowUpExperience(userMsg, selectedGap);
      const updatedResume: ParsedResume = {
        ...supplementResumeItem.resume,
        experiences: [...supplementResumeItem.resume.experiences, newExp],
        skills: [
          ...supplementResumeItem.resume.skills,
          {
            id: `skill_${Date.now()}`,
            category: '补录',
            name: selectedGap,
            level: '熟悉',
            evidence: newExp.rawText,
          },
        ],
      };
      const updatedResumeItem = await replaceResumeData(supplementResumeItem.id, updatedResume);
      setActiveResume(updatedResume);
      if (updatedResumeItem.isCurrent) onResumeUpdate?.(updatedResume);
      const nextSupplemented = new Set([...supplementedGaps, selectedGap]);
      if (jobRecord && jd) {
        const matchResult = await analyzeMatchV2(updatedResume, jd);
        const updatedAt = new Date().toISOString();
        const updatedJob: SavedJob = {
          ...jobRecord,
          jd,
          matchResult,
          matchScore: matchResult.score,
          mainGaps: matchResult.gaps.map(item => item.requirement),
          supplementedGaps: Array.from(nextSupplemented),
          resumeSnapshot: updatedResume,
          analyzedResumeId: updatedResumeItem.id,
          analyzedResumeVersion: updatedResumeItem.version,
          scoringVersion: matchResult.metadata.scoringVersion,
          inputHash: matchResult.metadata.inputHash,
          status: 'analyzed',
          analyzedAt: updatedAt,
          updatedAt,
        };
        await replaceJobAnalysis(updatedJob);
        setJobRecord(updatedJob);
        setMatch(matchResult);
        setSupplementedGaps(nextSupplemented);
        onJobSaved();
      }

      const aiReply = `已整理并存入经历库：\n\n${newExp.company} · ${newExp.role}\n${newExp.achievements.map((a) => `· ${a}`).join('\n')}`;
      setChatHistory((prev) => [...prev, { role: 'ai', content: aiReply }]);
      setSelectedGap(null);
      setSupplementResumeItem(null);
      setStage('result');
    } catch (err) {
      setError(`补录处理未完成：${err instanceof Error ? err.message : '处理失败'}。原岗位分析已保留。`);
      setStage('result');
    } finally {
      setLoadingFormat(false);
    }
  };

  const handleGenerate = async () => {
    if (!jd || !activeResume) {
      setError('当前没有可用的简历，无法生成定制简历。请先在简历与能力库中导入简历。');
      return;
    }
    setStage('generating');
    try {
      const result = await generateTailoredResume(activeResume, jd, match || undefined);
      setGenerated(result);
      const sourceResumeIds = jobRecord?.sourceResumeIds || [];
      saveCustomizedResume({
        basicInfo: activeResume.basicInfo,
        rawText: result.summary,
        skills: activeResume.skills,
        experiences: result.experiences.map((item) => ({
          id: generateId(),
          company: item.company,
          role: item.role,
          period: item.period,
          description: item.description,
          achievements: item.highlights,
          skillsUsed: [],
          rawText: `${item.description}\n${item.highlights.join('\n')}`,
        })),
      }, {
        name: `${jd.position || '岗位'}${jd.company ? ` @${jd.company}` : ''}`,
        sourceIds: sourceResumeIds,
        targetJob: {
          position: jd.position || '',
          company: jd.company,
          matchScore: typeof match?.score === 'number' ? match.score : null,
          jobId: currentJobId || undefined,
        },
      });

      // 更新收录的岗位
      if (currentJobId) {
        await saveJob({
          ...jobRecord,
          id: currentJobId,
          jd,
          matchResult: match!,
          savedAt: jobRecord?.savedAt || new Date().toISOString(),
          status: 'completed',
          generatedResume: result,
          resumeSnapshot: jobRecord?.resumeSnapshot || activeResume,
        });
        onJobSaved();
      }
      // 岗位详情页也可以完成定制简历生成；成功后原工作流草稿已经没有继续存在的必要。
      // 否则返回岗位列表时会同时看到“已生成定制简历”和“未完成的岗位分析”。
      await clearWorkflowDraft();
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      setStage('result');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    if (!generated || !jd) return;
    const content = formatResumeText(generated, jd);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `简历_${jd.position || '定制'}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setJdText('');
    setJd(null);
    setMatch(null);
    setGenerated(null);
    setStage('idle');
    setError('');
    setInfo('');
    setShowResumePicker(false);
    setSelectedGap(null);
    setSupplementedGaps(new Set());
  };

  if (stage === 'parsing-jd' || stage === 'analyzing') {
    return (
      <div className="card animate-fade-in">
        <Loading
          text={stage === 'parsing-jd' ? '正在解析岗位描述...' : '正在匹配分析...'}
          subtext="AI 正在对比你的经历库与岗位要求"
        />
      </div>
    );
  }

  if (stage === 'generating') {
    return (
      <div className="card animate-fade-in">
        <Loading text="正在生成定制简历..." subtext="从经历库中挑选最相关的内容，按岗位优化表述" />
      </div>
    );
  }

  // 补录对话
  if (stage === 'supplementing') {
    return (
      <div className="card animate-fade-in">
        <h2 className="text-lg font-serif font-semibold mb-2">补录经历</h2>
        <p className="text-sm text-ink-secondary mb-6">
          针对缺口「{selectedGap}」，用大白话描述你的相关经历
        </p>

        {loadingQuestion && <Loading text="AI 正在生成引导问题..." />}

        {chatHistory.length > 0 && (
          <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] p-3 rounded-[8px] text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-terra text-white rounded-br-sm'
                      : 'bg-canvas text-ink rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loadingFormat && (
              <div className="flex justify-start">
                <div className="bg-canvas p-3 rounded-[8px]">
                  <InlineLoading text="正在整理..." />
                </div>
              </div>
            )}
          </div>
        )}

        {!loadingFormat && selectedGap && (
          <div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="textarea h-24"
              placeholder="用大白话描述，比如：在 XX 公司时我做过..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitAnswer();
              }}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={handleSubmitAnswer} className="btn-primary flex-1">
                提交并整理
              </button>
              <button onClick={() => setStage('result')} className="btn-ghost">
                返回
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-terra-light border border-terra-border rounded-[6px] text-sm text-terra">
            {error}
          </div>
        )}
      </div>
    );
  }

  // 生成结果
  if (stage === 'done' && generated) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-semibold">定制简历已生成</h2>
            <div className="flex gap-2">
              <button onClick={handleGenerate} className="btn-ghost text-xs">重新生成</button>
              <button onClick={handleDownload} className="btn-ghost text-xs">下载</button>
            </div>
          </div>

          {/* 个人简介 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-serif font-medium">个人简介</h3>
              <button onClick={() => handleCopy(generated.summary)} className="btn-link text-xs">复制</button>
            </div>
            <p className="text-sm text-ink-secondary leading-relaxed bg-canvas rounded-[6px] p-3">{generated.summary}</p>
          </div>

          {/* 核心技能 */}
          {generated.skillsHighlight.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-serif font-medium">核心技能</h3>
                <button onClick={() => handleCopy(generated.skillsHighlight.join('\n'))} className="btn-link text-xs">复制</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {generated.skillsHighlight.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-terra-light text-terra text-xs rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* 经历 */}
          <div className="mb-6">
            <h3 className="text-sm font-serif font-medium mb-3">工作经历</h3>
            <div className="space-y-4">
              {generated.experiences.map((exp, i) => (
                <div key={i} className="border-l-2 border-terra-border pl-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="font-medium text-sm">{exp.company}</span>
                      <span className="text-ink-secondary text-xs ml-2">{exp.role}</span>
                    </div>
                    <span className="text-xs text-ink-weak">{exp.period}</span>
                  </div>
                  <p className="text-sm text-ink-secondary mt-1 leading-relaxed">{exp.description}</p>
                  {exp.highlights.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {exp.highlights.map((h, j) => (
                        <li key={j} className="text-sm text-ink-secondary flex items-start gap-2">
                          <span className="text-terra mt-0.5">·</span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 打招呼话术 */}
          {generated.coverLetter && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-serif font-medium">打招呼话术</h3>
                <button onClick={() => handleCopy(generated.coverLetter!)} className="btn-link text-xs">复制</button>
              </div>
              <p className="text-sm text-ink-secondary bg-terra-light border border-terra-border rounded-[6px] p-3 italic">
                {generated.coverLetter}
              </p>
            </div>
          )}
        </div>

        <div className="card bg-mossLight border-moss/30">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div className="flex-1">
              <p className="font-medium text-ink">简历已就绪</p>
              <p className="text-sm text-ink-secondary">可复制内容到 Boss 直聘，或下载文本备份</p>
            </div>
            <button onClick={handleReset} className="btn-ghost text-sm">分析新岗位</button>
          </div>
        </div>
      </div>
    );
  }

  // 匹配结果
  if (stage === 'result' && jd && match) {
    const v2 = isMatchResultV2(match);
    const groups = statusOrder.map(status => ({
      key: status,
      ...statusMeta[status],
      className: status,
      items: orderedMatchItems.filter(item => (item.status || (item.matched ? 'matched' : 'missing')) === status),
    }));
    return (
      <div className="analysis-detail space-y-7 animate-fade-in">
        <div className="analysis-page-title"><p>JOB MATCH ANALYSIS</p><h1>岗位匹配分析</h1></div>
        {jobRecord?.scoringVersion === 'radar-v2' && !v2 && <div className="analysis-data-warning" role="alert">这条新版历史数据不完整，系统已停止展示半成品分数。请点击“重新分析”生成完整结果，原记录会在成功后才被替换。</div>}
        <AnalysisOverview match={match} jd={jd} items={uniqueMatchItems} selectedDimension={selectedDimension} onDimensionSelect={setSelectedDimension} onReanalyze={jobRecord ? openResumePicker : undefined} />
        <section className="analysis-matches" aria-labelledby="detailed-analysis-title">
          <div className="analysis-section-heading">
            <div><h2 id="detailed-analysis-title">具体能力匹配分析</h2></div>
            <label className="analysis-link-control"><span>与雷达图联动</span><button type="button" role="switch" aria-label="与雷达图联动" aria-checked={linked} onClick={() => setLinked(value => !value)}><span /></button><small>{linked ? '开启' : '关闭'}</small></label>
          </div>
          <div className="analysis-filter-bar">
            {linked ? <div className="analysis-dimension-tabs" aria-label="能力维度筛选">
              {(['all', ...Object.keys(dimensionLabels)] as (MatchDimensionKey | 'all')[]).map(key => <button type="button" key={key} aria-pressed={selectedDimension === key} onClick={() => setSelectedDimension(key)}>{key === 'all' ? '全部要求' : dimensionLabels[key]}<small>{uniqueMatchItems.filter(item => key === 'all' || itemDimension(item) === key).length}</small></button>)}
            </div> : <p>全部要求 · 切换雷达图维度不会改变下方内容</p>}
          </div>
          {groups.map(group => <section key={group.key} className={`analysis-match-group analysis-${group.className}`}><div className="analysis-group-heading"><span>{group.symbol}</span><h3>{group.label}</h3><small>{group.items.length}</small><p>{group.note}</p></div>
            {group.items.length ? <div className="analysis-card-grid">{group.items.map(item => <MatchRequirementCard key={item.id || item.requirement} item={item} onSupplement={handleSelectGap} supplemented={supplementedGaps.has(item.requirement)} />)}</div> : <p className="analysis-empty">当前范围暂无{group.label}条目。</p>}
          </section>)}
        </section>

        {/* 操作 */}
        <div className="flex gap-3">
          <button onClick={handleReset} className="btn-ghost flex-1">分析新岗位</button>
          <button onClick={handleGenerate} className="btn-primary flex-1">生成定制简历</button>
        </div>

        {error && (
          <div className="p-3 bg-terra-light border border-terra-border rounded-[6px] text-sm text-terra">
            {error}
          </div>
        )}
        {info && (
          <div className="p-3 rounded-[6px] border border-moss/30 bg-mossLight text-sm text-moss">
            {info}
          </div>
        )}
        <ResumePickerModal
          open={showResumePicker}
          items={resumePickerItems}
          currentJob={jobRecord}
          selectedId={resumePickerSelection}
          onSelect={setResumePickerSelection}
          onClose={() => setShowResumePicker(false)}
          onConfirm={() => {
            const selected = resumePickerItems.find(item => item.id === resumePickerSelection);
            if (selected) void handleReanalyze(selected);
          }}
        />
      </div>
    );
  }

  // 初始输入
  return (
    <div className="card animate-fade-in">
      <h2 className="text-xl font-serif font-semibold mb-2">岗位匹配分析</h2>
      <p className="text-sm text-ink-secondary mb-8 leading-relaxed">
        在 Boss 直聘上看到感兴趣的岗位，把 JD（岗位描述）复制粘贴到下面，系统会比对经历库给出匹配分数和差异点。
      </p>

      <label className="label">岗位描述（JD）</label>
      <textarea
        value={jdText}
        onChange={(e) => setJdText(e.target.value)}
        className="textarea h-48"
        placeholder={'把 Boss 直聘上的岗位描述粘贴到这里...\n\n例如：\n岗位名称：高级产品经理\n岗位职责：\n1. 负责XX产品的规划...\n任职要求：\n1. 本科及以上学历...'}
      />

      {error && (
        <div className="mt-4 p-3 bg-terra-light border border-terra-border rounded-[6px] text-sm text-terra">
          {error}
        </div>
      )}

      <button onClick={handleAnalyze} className="btn-primary mt-6 w-full">
        开始匹配分析
      </button>
    </div>
  );
};

interface ResumePickerModalProps {
  open: boolean;
  items: ResumeItem[];
  currentJob: SavedJob | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const ResumePickerModal: React.FC<ResumePickerModalProps> = ({ open, items, currentJob, selectedId, onSelect, onClose, onConfirm }) => {
  if (!open) return null;
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal max-w-2xl animate-scale-in" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reanalyze-resume-picker-title">
      <div className="flex items-start justify-between border-b border-line p-6">
        <div>
          <p className="eyebrow">RESUME SELECTION</p>
          <h2 id="reanalyze-resume-picker-title" className="mt-2 font-serif text-xl font-semibold">选择用于重新分析的简历</h2>
          <p className="mt-2 text-sm text-ink-secondary">相同简历版本会直接复用已有结果；选择其他简历才会重新调用 AI。</p>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost -m-2 h-8 w-8 p-0 text-lg" aria-label="关闭重新分析简历选择">×</button>
      </div>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto p-6">
        {items.map(item => {
          const selected = item.id === selectedId;
          return <button
            type="button"
            key={item.id}
            onClick={() => onSelect(item.id)}
            aria-pressed={selected}
            className={`w-full rounded-lg border p-4 text-left transition ${selected ? 'border-terra bg-terra-light' : 'border-line bg-paper hover:border-terra/60'}`}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-terra bg-terra text-white' : 'border-ink-weak'}`} aria-hidden="true">{selected ? '✓' : ''}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-sm text-ink">{item.name}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${item.type === 'customized' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>{item.type === 'customized' ? '定制简历' : '原始简历'}</span>
                  {currentJob && isSameAnalyzedResume(item, currentJob) && <span className="rounded-full bg-mossLight px-2 py-0.5 text-[11px] text-moss">本岗位当前使用</span>}
                  {item.isCurrent && item.type === 'original' && <span className="rounded-full bg-terra-light px-2 py-0.5 text-[11px] text-terra">默认简历</span>}
                </span>
                <span className="mt-1 block text-xs text-ink-secondary">版本 {item.version} · {item.resume.skills.length} 项能力 · {item.resume.experiences.length} 段经历 · {new Date(item.uploadedAt).toLocaleDateString('zh-CN')}</span>
              </span>
            </div>
          </button>;
        })}
      </div>
      <div className="flex justify-end gap-3 border-t border-line p-6">
        <button type="button" onClick={onClose} className="btn-ghost">取消</button>
        <button type="button" onClick={onConfirm} disabled={!selectedId} className="btn-primary">使用此简历</button>
      </div>
    </div>
  </div>;
};

interface OverviewProps {
  match: AnalysisMatchResult;
  jd: ParsedJobDescription;
  items: MatchItem[];
  selectedDimension: MatchDimensionKey | 'all';
  onDimensionSelect: (key: MatchDimensionKey | 'all') => void;
  onReanalyze?: () => void;
}

const AnalysisOverview: React.FC<OverviewProps> = ({ match, jd, items, selectedDimension, onDimensionSelect, onReanalyze }) => {
  const isV2 = isMatchResultV2(match);
  const score = typeof match.score === 'number' ? Math.max(0, Math.min(100, match.score)) : null;
  const advantages = isV2 ? match.capabilityRadar.advantages.map(item => item.title) : match.capabilityRadar?.advantages || [];
  const keyGaps = isV2 ? match.capabilityRadar.keyGaps.map(item => item.title) : match.capabilityRadar?.keyGaps || [];
  const rawSummary = match.summary?.trim();
  const legacyTemplate = /^当前简历对可评分岗位要求的覆盖度为\s*(?:\d+(?:\.\d+)?|null)\s*分。?/;
  const summary = isV2 && rawSummary?.match(legacyTemplate)
    ? [
      score === null ? '候选人当前缺少可评分要求，暂无法判断整体匹配度。' : score >= 75 ? '候选人整体匹配度较高，具备较好的岗位适配基础。' : score >= 50 ? '候选人与岗位存在一定匹配基础，但仍有需要补强的能力。' : '候选人与岗位的匹配度偏低，建议优先核对关键要求。',
      advantages.length ? `具备${advantages.slice(0, 3).join('、')}等岗位相关能力。` : '',
      rawSummary.replace(legacyTemplate, '').trim(),
    ].filter(Boolean).join('')
    : rawSummary || '暂无分析摘要';
  const title = jd.position || '未命名岗位';
  const titleParts = title.match(/^(.*?)\s*[（(]([^）)]+)[）)]$/);
  return <section className="analysis-overview" aria-label="岗位匹配概览">
    <div className="analysis-summary">
      <p className="analysis-kicker">匹配结果 / MATCH OVERVIEW</p>
      <div className="analysis-job-top">
        <div><h2>{titleParts ? titleParts[1] : title}{titleParts && <span>{titleParts[2]}</span>}</h2><p className="analysis-company"><span aria-hidden="true">{jd.company?.slice(0, 1) || '企'}</span>投递公司 · {jd.company || '未注明公司'}{jd.city && ` · ${jd.city}`}</p></div>
        <div className="analysis-score">{score === null ? <div className="analysis-score-empty" role="status"><strong>—</strong><small>无可评分项</small></div> : <><div className="analysis-score-ring" style={{ background: `conic-gradient(from -90deg, #c45a3c ${score}%, #f1ede7 ${score}% 100%)` }} role="img" aria-label={`匹配分数 ${score} 分，满分 100 分`}><div><strong>{score}</strong><small>/ 100</small></div></div><p>{score >= 75 ? '推荐投递' : score >= 50 ? '可以考虑' : '匹配度较低'}</p></>}</div>
      </div>
      <div className="analysis-summary-report"><h3><span aria-hidden="true">✧</span>综合分析摘要</h3><p>{summary}</p></div>
      <div className="analysis-pros-cons">
        <div><h3><span aria-hidden="true">↗</span>主要优势</h3>{advantages.length ? <ul>{advantages.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>暂无明确优势</p>}</div>
        <div><h3><span aria-hidden="true">↘</span>主要差距</h3>{keyGaps.length ? <ul>{keyGaps.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>暂无明确差距</p>}</div>
      </div>
      <p className="analysis-summary-note">ⓘ 分析依据当前简历与岗位要求；“未发现”表示简历缺少证据，不代表你不具备该能力。</p>
    </div>
    <CapabilityRadar data={match.capabilityRadar} items={items} selectedDimension={selectedDimension} onDimensionSelect={onDimensionSelect} onReanalyze={onReanalyze} />
  </section>;
};

const MatchRequirementCard: React.FC<{ item: AnalysisRequirementItem; onSupplement: (requirement: string) => void; supplemented: boolean }> = ({ item, onSupplement, supplemented }) => {
  const status = item.status || (item.matched ? 'matched' : 'missing');
  const hardMeta = item.isHard && item.hardConditionStatus ? hardStatusMeta[item.hardConditionStatus] : null;
  const meta = hardMeta || statusMeta[status];
  const visualStatus = hardMeta?.className || status;
  const requirement = item.requirement.trim() || item.jobEvidence?.trim() || '';
  const title = item.title?.trim();
  const comparableText = (text: string) => text.normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLowerCase();
  const showTitle = !!title && title.length <= 32
    && comparableText(title) !== comparableText(requirement)
    && comparableText(title) !== comparableText(item.jobEvidence || '');
  return <article data-analysis-requirement={item.requirement} className={`analysis-match-card analysis-${visualStatus}`}>
    <div className="analysis-card-top">{showTitle ? <h4>{title}</h4> : <div className="analysis-card-label">岗位要求</div>}<span>{dimensionLabels[itemDimension(item)]}</span></div>
    {showTitle && <div className="analysis-card-label">岗位要求</div>}<p className="analysis-requirement">{requirement}</p>
    <div className="analysis-evidence"><div className="analysis-card-label">简历证据</div><p>{item.evidence ? compactEvidenceForDisplay(item.evidence, requirement) : '简历中未发现明确证据'}</p></div>
    <div className="analysis-card-footer"><div className="analysis-tags"><span className="analysis-status-tag">{meta.symbol} {meta.label}</span><span className={item.isHard ? 'analysis-hard-tag' : 'analysis-soft-tag'}>{item.isHard ? '硬性条件' : '非硬性条件'}</span><span className="analysis-soft-tag">{item.isScoreable === false ? '不参与评分' : '参与评分'}</span></div>
      {status !== 'matched' && item.isScoreable !== false ? <button type="button" disabled={supplemented} onClick={() => onSupplement(item.requirement)}>{supplemented ? '已补录并重评' : '去补录 ↗'}</button> : <span className="analysis-source-note">{item.isScoreable === false ? '仅作条件核查' : '证据已匹配'}</span>}
    </div>
  </article>;
};

function formatResumeText(resume: GeneratedResume, jd: ParsedJobDescription): string {
  let text = `求职简历\n应聘岗位：${jd.position || '（未指定）'}\n${'─'.repeat(40)}\n\n`;
  text += `【个人简介】\n${resume.summary}\n\n`;
  if (resume.skillsHighlight.length > 0) {
    text += `【核心技能】\n`;
    resume.skillsHighlight.forEach((s) => (text += `· ${s}\n`));
    text += '\n';
  }
  text += `【工作经历】\n`;
  resume.experiences.forEach((exp) => {
    text += `\n${exp.company} · ${exp.role} (${exp.period})\n${exp.description}\n`;
    exp.highlights.forEach((h) => (text += `  · ${h}\n`));
  });
  if (resume.coverLetter) {
    text += `\n${'─'.repeat(40)}\n【打招呼话术】\n${resume.coverLetter}\n`;
  }
  return text;
}
