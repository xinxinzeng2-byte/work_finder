import React, { useState } from 'react';
import { getApiKey, hasApiKey, isCloudApiKeyMode, saveApiKey, saveApiKeyToCloud, exportData, clearAllData, loadCurrentResume, loadSavedJobs, type SavedJob } from '../utils/storage';
import { useEffect } from 'react';
import { analyzeMatchV2, testApiKey } from '../services/api';
import type { MatchResultV2 } from '../types';

type ManualCheckKey = 'requirements' | 'evidence' | 'conclusion';

interface AutomaticCheck {
  label: string;
  passed: boolean;
  detail: string;
}

// 评分语义升级后必须重新人工确认，避免旧规则下的确认数继续计入。
const STAGE_3_ACCEPTED_HASHES_KEY = 'wf_stage_3_accepted_hashes_v2_1';

const EMPTY_MANUAL_CHECKS: Record<ManualCheckKey, boolean> = {
  requirements: false,
  evidence: false,
  conclusion: false,
};

const DIMENSION_LABELS: Record<string, string> = {
  skill: '技能',
  experience: '经验',
  project: '项目',
  achievement: '成果',
  education: '教育背景',
  industry: '行业背景',
  other: '其他条件',
};

const IMPORTANCE_LABELS: Record<string, string> = {
  core: '核心要求',
  important: '明确要求',
  normal: '一般要求',
  bonus: '加分项',
};

const DEPTH_LABELS: Record<string, string> = {
  basic: '了解即可',
  familiar: '需要熟悉',
  practical: '需要能独立完成',
  expert: '需要能主导复杂工作',
};

const EVIDENCE_LABELS: Record<string, string> = {
  none: '简历未找到证据',
  mentioned: '简历中有提到',
  used: '简历显示实际做过',
  owned: '简历显示独立负责过',
  unrelated: '有相关背景，但方向不符',
  related: '背景符合',
};

const HARD_CONDITION_LABELS: Record<string, string> = {
  met: '硬性条件符合',
  not_met: '硬性条件不符合',
  unknown: '硬性条件还不能确定',
  not_applicable: '无需核查',
};

function loadAcceptedHashes(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STAGE_3_ACCEPTED_HASHES_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

const jobLabel = (job: SavedJob): string => {
  const position = job.jobName || job.jd.position || job.intendedPosition || '未命名岗位';
  return job.company || job.jd.company ? `${position}（${job.company || job.jd.company}）` : position;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [apiKey, setApiKey] = useState(getApiKey() || '');

  useEffect(() => {
    if (open) {
      setApiKey(getApiKey() || '');
      setError('');
      setTestResult('none');
      setV2Result(null);
      const jobs = [...loadSavedJobs()].sort((a, b) => (b.updatedAt || b.savedAt).localeCompare(a.updatedAt || a.savedAt));
      setSavedJobsList(jobs);
      setSelectedJobId(jobs[0]?.id || '');
    }
  }, [open]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'none' | 'success' | 'fail'>('none');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [v2Testing, setV2Testing] = useState(false);
  const [v2Result, setV2Result] = useState<MatchResultV2 | null>(null);
  const [savedJobsList, setSavedJobsList] = useState<SavedJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [automaticChecks, setAutomaticChecks] = useState<AutomaticCheck[]>([]);
  const [manualChecks, setManualChecks] = useState<Record<ManualCheckKey, boolean>>(EMPTY_MANUAL_CHECKS);
  const [acceptedHashes, setAcceptedHashes] = useState<string[]>(loadAcceptedHashes);
  const [v2Error, setV2Error] = useState('');

  if (!open) return null;

  const persistApiKey = async () => {
    const value = apiKey.trim();
    if (!value) return;
    // 云端保存失败时保留本地临时副本，保存成功后会删除浏览器明文。
    saveApiKey(value);
    if (isCloudApiKeyMode && localStorage.getItem('auth_token')) await saveApiKeyToCloud(value);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await persistApiKey();
      setSaved(true);
      setTestResult('none');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setError('');
    setTestResult('none');
    try {
      await persistApiKey();
      const valid = await testApiKey();
      setTestResult(valid ? 'success' : 'fail');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 保存失败，请重试');
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  const handleV2Test = async () => {
    setV2Testing(true);
    setV2Error('');
    setV2Result(null);
    setAutomaticChecks([]);
    setManualChecks(EMPTY_MANUAL_CHECKS);
    try {
      await persistApiKey();
      const selectedJob = savedJobsList.find((job) => job.id === selectedJobId);
      const resume = selectedJob?.resumeSnapshot || loadCurrentResume();
      if (!selectedJob || !resume) throw new Error('请先保存一个岗位和对应简历，再回来验收');

      // 连续运行两次：第一次做真实分析，第二次自动检查缓存和结果稳定性。
      const firstResult = await analyzeMatchV2(resume, selectedJob.jd);
      const secondResult = await analyzeMatchV2(resume, selectedJob.jd);
      const displayWeightTotal = secondResult.capabilityRadar.dimensions.reduce((sum, item) => sum + item.displayWeight, 0);
      const comparableResult = (result: MatchResultV2) => JSON.stringify({
        score: result.score,
        standardizedRequirements: result.standardizedRequirements,
        capabilityEvidence: result.capabilityEvidence,
        capabilityRadar: result.capabilityRadar,
        hardConditionCheck: result.hardConditionCheck,
        gaps: result.gaps,
      });

      setAutomaticChecks([
        {
          label: '使用新版评分',
          passed: secondResult.metadata.scoringVersion === 'radar-v2',
          detail: '确认没有误用旧版分析结果',
        },
        {
          label: '每条岗位要求都有判断',
          passed: secondResult.standardizedRequirements.length > 0
            && secondResult.standardizedRequirements.length === secondResult.capabilityEvidence.length,
          detail: `识别 ${secondResult.standardizedRequirements.length} 条要求，生成 ${secondResult.capabilityEvidence.length} 条判断`,
        },
        {
          label: '评分占比完整',
          passed: secondResult.score !== null && displayWeightTotal === 100,
          detail: `当前评分占比合计 ${displayWeightTotal}%`,
        },
        {
          label: '重复运行结果一致',
          passed: comparableResult(firstResult) === comparableResult(secondResult),
          detail: '系统已自动连续运行两次并比较结果',
        },
        {
          label: '重复运行没有再次消耗 AI',
          passed: secondResult.metadata.requirementCacheHit && secondResult.metadata.evidenceCacheHit,
          detail: '第二次运行应直接使用缓存',
        },
      ]);
      setV2Result(secondResult);
    } catch (err) {
      setV2Error(err instanceof Error ? err.message : '验收运行失败，请重试');
    } finally {
      setV2Testing(false);
    }
  };

  const automaticPassed = automaticChecks.length > 0 && automaticChecks.every((check) => check.passed);
  const manualPassed = Object.values(manualChecks).every(Boolean);
  const currentAccepted = !!v2Result && acceptedHashes.includes(v2Result.metadata.inputHash);

  const confirmCurrentJob = () => {
    if (!v2Result || !automaticPassed || !manualPassed) return;
    const next = [...new Set([...acceptedHashes, v2Result.metadata.inputHash])];
    localStorage.setItem(STAGE_3_ACCEPTED_HASHES_KEY, JSON.stringify(next));
    setAcceptedHashes(next);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-paper rounded-lg shadow-card max-w-3xl max-h-[90vh] overflow-y-auto w-full p-8 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-serif font-semibold">设置</h2>
          <button onClick={onClose} className="text-ink-weak hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* API Key */}
        <div className="mb-8">
          <label className="label">DeepSeek API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input font-mono text-xs"
            placeholder="sk-xxxxxxxx..."
          />
          <p className="text-xs text-ink-weak mt-2 leading-relaxed">
            在 platform.deepseek.com 注册并创建 API Key，充几块钱即可使用。
          </p>
          {isCloudApiKeyMode && hasApiKey() && !apiKey && <p className="mt-2 text-xs text-moss">当前账号已配置 API Key；如需更换，请直接输入新的 Key 并保存。</p>}

          <div className="flex gap-3 mt-4">
            <button onClick={handleTest} disabled={testing || (!apiKey.trim() && !hasApiKey())} className="btn-ghost text-sm">
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button onClick={() => void handleSave()} disabled={saving || !apiKey.trim()} className="btn-primary text-sm">
              {saving ? '保存中...' : saved ? '已保存' : '保存'}
            </button>
          </div>

          {testResult === 'success' && (
            <p className="mt-3 text-xs text-moss">API Key 有效，连接成功</p>
          )}
          {testResult === 'fail' && (
            <p className="mt-3 text-xs text-terra">连接失败，请检查 Key 或账户余额</p>
          )}
          {error && <p className="mt-3 text-xs text-terra">{error}</p>}
        </div>

        {import.meta.env.DEV && (
          <div className="border-t border-line py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-serif font-semibold text-ink">第三阶段验收助手</h3>
                <p className="mt-1 text-xs text-ink-weak leading-relaxed">不用看公式：选岗位、点运行，再确认 3 个直观问题即可。</p>
              </div>
              <span className="rounded-full bg-canvas px-3 py-1 text-xs text-ink-secondary">已确认 {acceptedHashes.length}/3 个岗位</span>
            </div>

            <label className="label mt-5" htmlFor="stage-3-job">第 1 步：选择要检查的岗位</label>
            {savedJobsList.length > 0 ? (
              <select
                id="stage-3-job"
                value={selectedJobId}
                onChange={(event) => {
                  setSelectedJobId(event.target.value);
                  setV2Result(null);
                  setAutomaticChecks([]);
                  setManualChecks(EMPTY_MANUAL_CHECKS);
                  setV2Error('');
                }}
                className="input"
              >
                {savedJobsList.map((job) => <option key={job.id} value={job.id}>{jobLabel(job)}</option>)}
              </select>
            ) : (
              <p className="rounded-md bg-canvas p-3 text-sm text-ink-secondary">还没有可验收的岗位。请先关闭设置，新增并完成一个岗位分析。</p>
            )}

            <p className="label mt-5">第 2 步：让系统自动检查</p>
            <button
              onClick={() => void handleV2Test()}
              disabled={v2Testing || !selectedJobId || (!apiKey.trim() && !hasApiKey())}
              className="btn-primary text-sm"
            >
              {v2Testing ? '正在自动检查，请稍候…' : '一键运行验收'}
            </button>
            {v2Error && <p className="mt-3 rounded-md border border-terra-border bg-terra-light p-3 text-sm text-terra">{v2Error}</p>}

            {automaticChecks.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="stage-3-automatic-checks">
              {automaticChecks.map((check) => <div key={check.label} className={`rounded-md border p-3 ${check.passed ? 'border-moss/30 bg-moss/5' : 'border-terra-border bg-terra-light'}`}>
                <p className={`text-sm font-medium ${check.passed ? 'text-moss' : 'text-terra'}`}>{check.passed ? '✓' : '✕'} {check.label}</p>
                <p className="mt-1 text-xs text-ink-weak">{check.detail}</p>
              </div>)}
            </div>}

            {v2Result && <div className="mt-5" data-testid="v2-verification-result">
              <div className="rounded-md bg-canvas p-4">
                <p className="text-sm font-medium text-ink">本次结果：能力匹配 {v2Result.score ?? '暂无分数'} 分</p>
                <p className="mt-1 text-xs text-ink-secondary">系统识别了 {v2Result.standardizedRequirements.length} 条岗位要求。下面只需看“岗位原文、简历证据、系统判断”是否合理。</p>
              </div>
              <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                {v2Result.capabilityEvidence.map(item => {
                  const score = v2Result.capabilityRadar.dimensions.flatMap(dimension => dimension.details).find(detail => detail.id === item.id);
                  const evidenceLabel = item.backgroundMatch
                    ? EVIDENCE_LABELS[item.backgroundMatch]
                    : EVIDENCE_LABELS[item.resumeEvidenceLevel || 'none'];
                  const judgment = item.isScoreable
                    ? `${evidenceLabel}${score ? `，覆盖约 ${Math.round(score.coverageScore)}%` : ''}`
                    : HARD_CONDITION_LABELS[item.hardConditionStatus || 'unknown'];
                  return <div key={item.id} className="rounded-md border border-line bg-paper p-3 text-xs leading-6 text-ink-secondary">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{item.title || item.requirement}</p>
                      <span className="rounded bg-canvas px-2 py-0.5 text-ink-secondary">{DIMENSION_LABELS[item.dimension] || item.dimension}</span>
                    </div>
                    <p><span className="text-ink-weak">岗位原文：</span>{item.jobEvidence}</p>
                    <p><span className="text-ink-weak">简历证据：</span>{item.resumeEvidence || '未找到相关内容'}</p>
                    <p><span className="text-ink-weak">系统判断：</span>{judgment}</p>
                    {item.isScoreable && <p><span className="text-ink-weak">岗位要求程度：</span>{IMPORTANCE_LABELS[item.importance || 'normal']}{item.requiredDepth ? `，${DEPTH_LABELS[item.requiredDepth]}` : ''}</p>}
                  </div>;
                })}
              </div>

              <div className="mt-5 rounded-md border border-line p-4">
                <p className="text-sm font-medium text-ink">第 3 步：看完上面的结果，确认 3 件事</p>
                <div className="mt-3 space-y-3">
                  {([
                    ['requirements', '岗位要求看起来完整', '没有明显少掉、重复，意思也没有理解错。'],
                    ['evidence', '简历证据没有编造', '展示的证据确实来自简历；没写过的内容显示“未找到”。'],
                    ['conclusion', '总分和主要差距符合直觉', '不用计算公式，只要判断整体结果有没有明显离谱。'],
                  ] as const).map(([key, label, help]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-md bg-canvas p-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-terra"
                      checked={manualChecks[key]}
                      onChange={(event) => setManualChecks((current) => ({ ...current, [key]: event.target.checked }))}
                    />
                    <span><span className="block text-sm font-medium text-ink">{label}</span><span className="block text-xs text-ink-weak">{help}</span></span>
                  </label>)}
                </div>
                <button
                  onClick={confirmCurrentJob}
                  disabled={!automaticPassed || !manualPassed || currentAccepted}
                  className="btn-primary mt-4 w-full"
                >
                  {currentAccepted ? '这个岗位已确认' : '确认这个岗位验收通过'}
                </button>
                {!manualPassed && <p className="mt-2 text-center text-xs text-ink-weak">如果有一项不符合，不要勾选，截图发给我即可。</p>}
                {currentAccepted && <p className="mt-3 text-center text-xs text-moss">已记录。再选择其他岗位重复操作，确认 3 个代表岗位即可完成本地人工抽查。</p>}
              </div>
            </div>}
          </div>
        )}

        <div className="border-t border-line pt-6">
          <h3 className="text-sm font-serif font-medium text-ink mb-3">数据管理</h3>
          <div className="flex gap-3">
            <button onClick={exportData} className="btn-ghost text-sm">
              导出备份
            </button>
            <button
              onClick={() => {
                if (confirm('确定要清除所有数据吗？此操作不可恢复（API Key 保留）')) {
                  clearAllData();
                  location.reload();
                }
              }}
              className="text-sm text-terra hover:text-terra-hover transition-colors px-4 h-10 inline-flex items-center"
            >
              清除数据
            </button>
          </div>
        </div>

        <div className="border-t border-line pt-6 mt-6">
          <p className="text-xs text-ink-weak leading-relaxed">
            {isCloudApiKeyMode ? 'DeepSeek API Key 会加密保存到当前账号的云端，数据库和浏览器都不保存明文。' : '当前为本地预览模式，DeepSeek API Key 仅保存在当前浏览器，可随时在这里修改。'}
          </p>
        </div>
      </div>
    </div>
  );
};
