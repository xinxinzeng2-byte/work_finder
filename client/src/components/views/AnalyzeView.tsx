import React, { useState } from 'react';
import { parseJobDescription, analyzeMatch, generateFollowUpQuestion, formatFollowUpExperience } from '../../services/api';
import { saveJob, type SavedJob, generateId } from '../../utils/storage';
import { saveResume } from '../../utils/storage';
import type { ParsedResume, ParsedJobDescription, MatchResult, GeneratedResume, AtomicExperience } from '../../types';
import { Loading, InlineLoading } from '../Loading';
import { ScoreBadge } from '../ScoreBadge';
import { generateTailoredResume } from '../../services/api';

interface Props {
  resume: ParsedResume;
  onResumeUpdate: (resume: ParsedResume) => void;
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
  const [supplementedGaps, setSupplementedGaps] = useState<Set<string>>(new Set());

  const handleAnalyze = async () => {
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
      };
      saveJob(newJob);
      setCurrentJobId(jobId);
      onJobSaved();

      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
      setStage('idle');
    }
  };

  const handleSelectGap = async (gap: string) => {
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
    if (!answer.trim() || !selectedGap) return;
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
      onResumeUpdate(updatedResume);
      setSupplementedGaps((prev) => new Set([...prev, selectedGap]));

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
    if (!jd) return;
    setStage('generating');
    try {
      const result = await generateTailoredResume(resume, jd, match || undefined);
      setGenerated(result);

      // 更新收录的岗位
      if (currentJobId) {
        saveJob({
          id: currentJobId,
          jd,
          matchResult: match!,
          savedAt: new Date().toISOString(),
          status: 'completed',
          generatedResume: result,
        });
        onJobSaved();
      }
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
      <div className="space-y-6 animate-fade-in">
        {/* 分数概览 */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-serif font-semibold">{jd.position || '岗位'} 匹配结果</h2>
              {jd.company && <p className="text-sm text-ink-secondary mt-0.5">{jd.company}</p>}
            </div>
            <ScoreBadge score={match.score} size="lg" />
          </div>
          <p className="mt-4 text-sm text-ink-secondary bg-canvas rounded-[6px] p-3 leading-relaxed">{match.summary}</p>
        </div>

        {/* 硬性条件 */}
        {match.hardConditionCheck.length > 0 && (
          <div className="card">
            <h3 className="font-serif font-medium mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-ink-secondary rounded"></span>
              硬性条件核查
            </h3>
            <div className="space-y-2">
              {match.hardConditionCheck.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 ${item.matched ? 'text-moss' : 'text-terra'}`}>
                    {item.matched ? '✓' : '✗'}
                  </span>
                  <div>
                    <span className="text-ink">{item.requirement}</span>
                    {item.evidence && <span className="text-ink-weak ml-2">— {item.evidence}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 能力匹配 */}
        {match.skillMatch.length > 0 && (
          <div className="card">
            <h3 className="font-serif font-medium mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-moss rounded"></span>
              能力匹配
              <span className="text-xs text-ink-weak font-sans font-normal">
                {match.skillMatch.filter((m) => m.matched).length}/{match.skillMatch.length}
              </span>
            </h3>
            <div className="space-y-2">
              {match.skillMatch.map((item, i) => (
                <div key={i} className={`p-2 rounded-[6px] text-sm ${item.matched ? 'bg-mossLight' : 'bg-canvas'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${item.matched ? 'text-moss' : 'text-ink-weak'}`}>
                      {item.matched ? '✓' : '○'}
                    </span>
                    <div className="flex-1">
                      <span className="text-ink">{item.requirement}</span>
                      {item.evidence && <p className="text-xs text-ink-weak mt-1">{item.evidence}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 缺口 */}
        {match.gaps.length > 0 && (
          <div className="card">
            <h3 className="font-serif font-medium mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-terra rounded"></span>
              硬性缺口
              <span className="text-xs text-ink-weak font-sans font-normal">点击可补录</span>
            </h3>
            <div className="space-y-2">
              {match.gaps.map((item, i) => {
                const done = supplementedGaps.has(item.requirement);
                return (
                  <button
                    key={i}
                    onClick={() => !done && handleSelectGap(item.requirement)}
                    disabled={done}
                    className={`w-full flex items-center gap-2 p-2 rounded-[6px] text-left transition-colors ${
                      done
                        ? 'bg-mossLight cursor-default'
                        : 'bg-terra-light hover:bg-terra-light/70'
                    }`}
                  >
                    <span className={done ? 'text-moss' : 'text-terra'}>{done ? '✓' : '+'}</span>
                    <span className="text-sm flex-1">{item.requirement}</span>
                    {item.isHard && !done && (
                      <span className="text-[11px] text-terra bg-white px-2 py-0.5 rounded">硬性</span>
                    )}
                    {done && <span className="text-xs text-moss">已补录</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
