import React, { useMemo, useState } from 'react';
import { parseJobDescription, analyzeMatch, generateFollowUpQuestion, formatFollowUpExperience } from '../../services/api';
import { clearWorkflowDraft, saveJob, type SavedJob, generateId } from '../../utils/storage';
import { saveResume } from '../../utils/storage';
import type { ParsedResume, ParsedJobDescription, MatchResult, GeneratedResume, AtomicExperience, MatchItem, MatchDimensionKey } from '../../types';
import { Loading, InlineLoading } from '../Loading';
import { generateTailoredResume } from '../../services/api';
import { CapabilityRadar } from '../CapabilityRadar';
import '../analysis-detail.css';

const dimensionLabels: Record<MatchDimensionKey, string> = { skill: '技能', experience: '经验', project: '项目', achievement: '成果', education: '教育专业', industry: '行业领域', other: '其他要求' };
const itemDimension = (item: MatchItem): MatchDimensionKey => item.dimension && item.dimension in dimensionLabels ? item.dimension : 'other';
const statusMeta = {
  missing: { label: '未发现', symbol: '○', note: '简历中暂未找到明确证据' },
  partial: { label: '部分匹配', symbol: '△', note: '已有相关经历，仍需补充细节' },
  matched: { label: '已匹配', symbol: '✓', note: '已找到支持岗位要求的证据' },
};
const statusOrder = ['missing', 'partial', 'matched'] as const;

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
  const [match, setMatch] = useState<MatchResult | null>(initialJob?.matchResult || null);
  const [generated, setGenerated] = useState<GeneratedResume | null>(initialJob?.generatedResume || null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(initialJob?.id || null);
  const [error, setError] = useState('');

  // 补录相关
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'ai' | 'user'; content: string }[]>([]);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [loadingFormat, setLoadingFormat] = useState(false);
  const [supplementedGaps, setSupplementedGaps] = useState<Set<string>>(new Set(initialJob?.supplementedGaps || []));
  const [linked, setLinked] = useState(true);
  const [selectedDimension, setSelectedDimension] = useState<MatchDimensionKey | 'all'>('skill');

  const uniqueMatchItems = useMemo(() => {
    const byRequirement = new Map<string, MatchItem>();
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
      const normalized: MatchItem = {
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
      .filter((item) => !linked || selectedDimension === 'all' || itemDimension(item) === selectedDimension)
      .sort((a, b) => {
        const aStatus = a.status || (a.matched ? 'matched' : 'missing');
        const bStatus = b.status || (b.matched ? 'matched' : 'missing');
        return (statusRank[aStatus] - statusRank[bStatus]) || Number(a.isHard ? -1 : 1) - Number(b.isHard ? -1 : 1);
      });
  }, [linked, selectedDimension, uniqueMatchItems]);

  const handleAnalyze = async () => {
    if (!resume) {
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
      const matchResult = await analyzeMatch(resume, parsedJd);
      setMatch(matchResult);

      // 自动保存为收录岗位
      const jobId = generateId();
      const newJob: SavedJob = {
        id: jobId,
        jd: parsedJd,
        matchResult,
        savedAt: new Date().toISOString(),
        status: 'analyzed',
        resumeSnapshot: resume,
      };
      await saveJob(newJob);
      setCurrentJobId(jobId);
      onJobSaved();

      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
      setStage('idle');
    }
  };

  const handleReanalyze = async () => {
    if (!initialJob || !jd) return;
    const analysisResume = initialJob.resumeSnapshot || resume;
    if (!analysisResume) {
      setError('这条历史岗位没有保存简历快照，且当前没有可用简历，暂时无法重新计算。');
      return;
    }

    setError('');
    setStage('analyzing');
    try {
      const matchResult = await analyzeMatch(analysisResume, jd);
      const updatedAt = new Date().toISOString();
      const updatedJob: SavedJob = {
        ...initialJob,
        id: initialJob.id,
        jd,
        matchResult,
        matchScore: matchResult.score,
        mainGaps: matchResult.gaps.map((item) => item.requirement),
        analyzedAt: updatedAt,
        updatedAt,
        resumeSnapshot: analysisResume,
      };
      await saveJob(updatedJob);
      setMatch(matchResult);
      setCurrentJobId(initialJob.id);
      onJobSaved();
      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新计算失败');
      setStage('result');
    }
  };

  const handleSelectGap = async (gap: string) => {
    if (!resume) {
      setError('当前没有可用的简历，暂时无法补录缺口。');
      return;
    }
    setSelectedGap(gap);
    setAnswer('');
    setChatHistory([]);
    setLoadingQuestion(true);
    setStage('supplementing');
    try {
      const q = await generateFollowUpQuestion(gap, resume);
      setChatHistory([{ role: 'ai', content: q }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成问题失败');
    } finally {
      setLoadingQuestion(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!resume || !answer.trim() || !selectedGap) return;
    setLoadingFormat(true);
    const userMsg = answer.trim();
    setChatHistory((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAnswer('');

    try {
      const newExp: AtomicExperience = await formatFollowUpExperience(userMsg, selectedGap);
      const updatedResume: ParsedResume = {
        ...resume,
        experiences: [...resume.experiences, newExp],
        skills: [
          ...resume.skills,
          {
            id: `skill_${Date.now()}`,
            category: '补录',
            name: selectedGap,
            level: '熟悉',
            evidence: newExp.rawText,
          },
        ],
      };
      saveResume(updatedResume);
      onResumeUpdate?.(updatedResume);
      const nextSupplemented = new Set([...supplementedGaps, selectedGap]);
      setSupplementedGaps(nextSupplemented);
      if (initialJob && jd && match) {
        await saveJob({ ...initialJob, jd, matchResult: match, supplementedGaps: Array.from(nextSupplemented), resumeSnapshot: updatedResume, status: 'supplementing', updatedAt: new Date().toISOString() });
        onJobSaved();
      }

      const aiReply = `已整理并存入经历库：\n\n${newExp.company} · ${newExp.role}\n${newExp.achievements.map((a) => `· ${a}`).join('\n')}`;
      setChatHistory((prev) => [...prev, { role: 'ai', content: aiReply }]);
      setSelectedGap(null);
      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理失败');
    } finally {
      setLoadingFormat(false);
    }
  };

  const handleGenerate = async () => {
    if (!jd || !resume) {
      setError('当前没有可用的简历，无法生成定制简历。请先在简历与能力库中导入简历。');
      return;
    }
    setStage('generating');
    try {
      const result = await generateTailoredResume(resume, jd, match || undefined);
      setGenerated(result);

      // 更新收录的岗位
      if (currentJobId) {
        await saveJob({
          ...initialJob,
          id: currentJobId,
          jd,
          matchResult: match!,
          savedAt: initialJob?.savedAt || new Date().toISOString(),
          status: 'completed',
          generatedResume: result,
          resumeSnapshot: initialJob?.resumeSnapshot || resume,
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
    return (
      <div className="analysis-detail space-y-7 animate-fade-in">
        <div className="analysis-page-title"><p>JOB MATCH ANALYSIS</p><h1>岗位匹配分析</h1></div>
        <AnalysisOverview match={match} jd={jd} items={uniqueMatchItems} selectedDimension={selectedDimension} onDimensionSelect={setSelectedDimension} onReanalyze={initialJob ? handleReanalyze : undefined} />
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
          {statusOrder.map(status => {
            const items = orderedMatchItems.filter(item => (item.status || (item.matched ? 'matched' : 'missing')) === status);
            const meta = statusMeta[status];
            return <section key={status} className={`analysis-match-group analysis-${status}`}><div className="analysis-group-heading"><span>{meta.symbol}</span><h3>{meta.label}</h3><small>{items.length}</small><p>{meta.note}</p></div>
              {items.length ? <div className="analysis-card-grid">{items.map(item => <MatchRequirementCard key={item.id || item.requirement} item={item} onSupplement={handleSelectGap} supplemented={supplementedGaps.has(item.requirement)} />)}</div> : <p className="analysis-empty">当前范围暂无{meta.label}的条目。</p>}
            </section>;
          })}
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

interface OverviewProps {
  match: MatchResult;
  jd: ParsedJobDescription;
  items: MatchItem[];
  selectedDimension: MatchDimensionKey | 'all';
  onDimensionSelect: (key: MatchDimensionKey | 'all') => void;
  onReanalyze?: () => void;
}

const AnalysisOverview: React.FC<OverviewProps> = ({ match, jd, items, selectedDimension, onDimensionSelect, onReanalyze }) => {
  const score = Math.max(0, Math.min(100, match.score));
  const title = jd.position || '未命名岗位';
  const titleParts = title.match(/^(.*?)\s*[（(]([^）)]+)[）)]$/);
  return <section className="analysis-overview" aria-label="岗位匹配概览">
    <div className="analysis-summary">
      <p className="analysis-kicker">匹配结果 / MATCH OVERVIEW</p>
      <div className="analysis-job-top">
        <div><h2>{titleParts ? titleParts[1] : title}{titleParts && <span>{titleParts[2]}</span>}</h2><p className="analysis-company"><span aria-hidden="true">{jd.company?.slice(0, 1) || '企'}</span>投递公司 · {jd.company || '未注明公司'}{jd.city && ` · ${jd.city}`}</p></div>
        <div className="analysis-score"><div className="analysis-score-ring" style={{ background: `conic-gradient(from -90deg, #c45a3c ${score}%, #f1ede7 ${score}% 100%)` }} role="img" aria-label={`匹配分数 ${match.score} 分，满分 100 分`}><div><strong>{match.score}</strong><small>/ 100</small></div></div><p>{score >= 75 ? '推荐投递' : score >= 50 ? '可以考虑' : '匹配度较低'}</p></div>
      </div>
      <div className="analysis-summary-report"><h3><span aria-hidden="true">✧</span>综合分析摘要</h3><p>{match.summary || '暂无分析摘要'}</p></div>
      <div className="analysis-pros-cons">
        <div><h3><span aria-hidden="true">↗</span>主要优势</h3>{match.capabilityRadar?.advantages.length ? <ul>{match.capabilityRadar.advantages.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>暂无明确优势</p>}</div>
        <div><h3><span aria-hidden="true">↘</span>主要差距</h3>{match.capabilityRadar?.keyGaps.length ? <ul>{match.capabilityRadar.keyGaps.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>暂无明确差距</p>}</div>
      </div>
      <p className="analysis-summary-note">ⓘ 分析依据当前简历与岗位要求；“未发现”表示简历缺少证据，不代表你不具备该能力。</p>
    </div>
    <CapabilityRadar data={match.capabilityRadar} items={items} selectedDimension={selectedDimension} onDimensionSelect={onDimensionSelect} onReanalyze={onReanalyze} />
  </section>;
};

const MatchRequirementCard: React.FC<{ item: MatchItem; onSupplement: (requirement: string) => void; supplemented: boolean }> = ({ item, onSupplement, supplemented }) => {
  const status = item.status || (item.matched ? 'matched' : 'missing');
  const meta = statusMeta[status];
  const requirement = item.requirement.trim() || item.jobEvidence?.trim() || '';
  const title = item.title?.trim();
  // Ignore whitespace/punctuation differences when rejecting duplicated titles.
  const comparableText = (text: string) => text.normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLowerCase();
  const showTitle = !!title && title.length <= 32
    && comparableText(title) !== comparableText(requirement)
    && comparableText(title) !== comparableText(item.jobEvidence || '');
  return <article data-analysis-requirement={item.requirement} className={`analysis-match-card analysis-${status}`}>
    <div className="analysis-card-top">{showTitle ? <h4>{title}</h4> : <div className="analysis-card-label">岗位要求</div>}<span>{dimensionLabels[itemDimension(item)]}</span></div>
    {showTitle && <div className="analysis-card-label">岗位要求</div>}<p className="analysis-requirement">{requirement}</p>
    <div className="analysis-evidence"><div className="analysis-card-label">简历证据</div><p>{item.evidence || '简历中未发现明确证据'}</p></div>
    <div className="analysis-card-footer"><div className="analysis-tags"><span className="analysis-status-tag">{meta.symbol} {meta.label}</span><span className={item.isHard ? 'analysis-hard-tag' : 'analysis-soft-tag'}>{item.isHard ? '硬性条件' : '非硬性条件'}</span></div>
      {status !== 'matched' ? <button type="button" disabled={supplemented} onClick={() => onSupplement(item.requirement)}>{supplemented ? '已补录 · 待重新分析' : '去补录 ↗'}</button> : <span className="analysis-source-note">证据已匹配</span>}
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
