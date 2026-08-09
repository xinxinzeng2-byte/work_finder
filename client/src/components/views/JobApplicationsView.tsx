import React, { useState } from 'react';
import type { SavedJob } from '../../utils/storage';
import { clearWorkflowDraft, getApiKey, hasValidDraft, removeJob } from '../../utils/storage';

interface Props {
  jobs: SavedJob[];
  onNewJob: () => void;
  onContinueDraft: () => void;
  onSelectJob: (job: SavedJob) => void;
  onJobsChange: () => void;
}

export const JobApplicationsView: React.FC<Props> = ({ jobs, onNewJob, onContinueDraft, onSelectJob, onJobsChange }) => {
  const [hasDraft, setHasDraft] = useState(hasValidDraft());
  const formatDate = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleDelete = (job: SavedJob) => {
    if (window.confirm(`确定删除「${job.jobName || job.jd.position || '未命名岗位'}」吗？`)) { removeJob(job.id); onJobsChange(); }
  };

  const handleAbandonDraft = () => {
    if (!window.confirm('确定放弃这次未完成的岗位分析吗？已保存的简历和能力库不会受影响。')) return;
    clearWorkflowDraft();
    setHasDraft(false);
  };

  return <div className="page-shell animate-fade-in">
    <header className="page-header items-end">
      <div>
        <p className="eyebrow">JOB APPLICATIONS</p>
        <h1>我的岗位投递</h1>
        <p className="page-subtitle">管理岗位分析结果，为每一次投递准备更匹配的简历。</p>
      </div>
      <button onClick={onNewJob} className="btn-primary"><span>＋</span> 新增岗位</button>
    </header>

    {!getApiKey() && <div className="mb-5 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><span>AI 功能还未启用，请先配置 API Key。</span><span className="text-xs">点击左侧「设置」</span></div>}

    {hasDraft && <div className="mb-5 flex items-center justify-between rounded-xl border border-terra-border bg-terra-light px-5 py-4"><div><p className="text-sm font-medium text-terra">有一个未完成的岗位分析</p><p className="mt-1 text-xs text-ink-secondary">草稿会保留你的简历来源和岗位输入，可以继续完成。</p></div><div className="flex items-center gap-3"><button onClick={handleAbandonDraft} className="h-9 px-2 text-xs text-ink-weak transition-colors hover:text-terra">放弃分析</button><button onClick={onContinueDraft} className="btn-ghost h-9 border-terra-border px-4 text-xs text-terra">继续分析</button></div></div>}

    <section className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-serif text-lg font-semibold">岗位记录</h2><p className="mt-1 text-xs text-ink-weak">共 {jobs.length} 条，完成 AI 匹配分析后自动保存</p></div><span className="text-xs text-ink-weak">按分析时间倒序</span></div>
      {jobs.length === 0 ? <div className="px-6 py-20 text-center"><div className="mb-3 text-4xl text-terra">⌕</div><h3 className="font-serif text-lg font-semibold">还没有岗位投递记录</h3><p className="mx-auto mt-2 max-w-sm text-sm text-ink-secondary">点击右上角“新增岗位”，选择已有能力库或导入新简历，开始第一次匹配分析。</p></div> : <div className="overflow-x-auto"><table className="min-w-[1080px] w-full text-left text-sm"><thead className="bg-canvas text-xs text-ink-secondary"><tr><th className="w-16 px-5 py-3 font-medium">序号</th><th className="w-56 px-4 py-3 font-medium">岗位名称</th><th className="w-40 px-4 py-3 font-medium">公司</th><th className="w-40 px-4 py-3 font-medium">意向职位</th><th className="w-28 px-4 py-3 font-medium">匹配分值</th><th className="px-4 py-3 font-medium">主要差距</th><th className="w-32 px-4 py-3 font-medium">分析时间</th><th className="w-32 px-4 py-3 font-medium">操作</th></tr></thead><tbody className="divide-y divide-line">{jobs.map((job, index) => { const score = job.matchScore ?? job.matchResult.score; const title = job.jobName || job.jd.position || '未命名岗位'; const gaps = job.mainGaps?.length ? job.mainGaps : job.matchResult.gaps.slice(0, 3).map((gap) => gap.requirement); return <tr key={job.id} className="group transition hover:bg-canvas"><td className="px-5 py-4 text-ink-weak">{job.sequenceNumber || index + 1}</td><td className="px-4 py-4"><button onClick={() => onSelectJob(job)} className="text-left"><span className="block max-w-[210px] truncate font-medium text-ink group-hover:text-terra">{title}</span><span className="mt-1 block text-xs text-ink-weak">{job.status === 'completed' ? '已生成定制简历' : '已完成匹配分析'}</span></button></td><td className="px-4 py-4 text-ink-secondary">{job.company || job.jd.company || '—'}</td><td className="px-4 py-4 text-ink-secondary">{job.intendedPosition || job.jd.position || '—'}</td><td className="px-4 py-4"><span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold ${score >= 80 ? 'border-moss text-moss' : score >= 60 ? 'border-amber-400 text-amber-600' : 'border-terra-border text-terra'}`}>{score}</span></td><td className="px-4 py-4"><div className="flex max-w-[280px] flex-wrap gap-1.5">{gaps.length ? gaps.map((gap) => <span key={gap} className="rounded bg-canvas px-2 py-1 text-xs text-ink-secondary">{gap}</span>) : <span className="text-xs text-moss">暂无明显缺口</span>}</div></td><td className="px-4 py-4 text-xs text-ink-secondary">{formatDate(job.analyzedAt || job.savedAt)}</td><td className="px-4 py-4"><div className="flex items-center gap-3 whitespace-nowrap"><button onClick={() => onSelectJob(job)} className="text-xs text-terra hover:text-terra-hover">分析详情</button><button onClick={() => handleDelete(job)} className="text-xs text-ink-weak hover:text-terra">删除</button></div></td></tr>;})}</tbody></table></div>}
    </section>
  </div>;
};

export default JobApplicationsView;
