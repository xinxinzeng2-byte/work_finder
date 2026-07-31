import React from 'react';
import type { SavedJob } from '../utils/storage';
import { removeJob } from '../utils/storage';
import { ScoreBadge } from './ScoreBadge';

interface Props {
  open: boolean;
  onClose: () => void;
  jobs: SavedJob[];
  onJobsChange: () => void;
  onSelectJob: (job: SavedJob) => void;
}

export const JobsDrawer: React.FC<Props> = ({ open, onClose, jobs, onJobsChange, onSelectJob }) => {
  if (!open) return null;

  const handleDelete = (id: string) => {
    if (confirm('确定删除这个收录的岗位吗？')) {
      removeJob(id);
      onJobsChange();
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${month}月${day}日 ${hour}:${min}`;
  };

  // 按日期分组
  const groupedJobs: Record<string, SavedJob[]> = {};
  jobs.forEach((job) => {
    const date = new Date(job.savedAt).toISOString().slice(0, 10);
    if (!groupedJobs[date]) groupedJobs[date] = [];
    groupedJobs[date].push(job);
  });
  const dates = Object.keys(groupedJobs).sort((a, b) => b.localeCompare(a));

  const dateLabel = (dateStr: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return '今天';
    if (dateStr === yesterday) return '昨天';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-canvas h-full overflow-y-auto shadow-card animate-fade-in">
        {/* 头部 */}
        <div className="sticky top-0 bg-canvas border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-serif font-semibold">岗位收录</h2>
            <p className="text-xs text-ink-weak mt-0.5">共收录 {jobs.length} 个岗位</p>
          </div>
          <button onClick={onClose} className="text-ink-weak hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-ink-secondary">还没有收录的岗位</p>
            <p className="text-xs text-ink-weak mt-1">分析岗位后可以收录到这里</p>
          </div>
        ) : (
          <div className="px-6 py-6 space-y-6">
            {dates.map((date) => (
              <div key={date}>
                {/* 日期分组标题 */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-medium text-ink-weak">{dateLabel(date)}</span>
                  <div className="flex-1 h-px bg-line" />
                </div>

                {/* 岗位卡片 */}
                <div className="space-y-3">
                  {groupedJobs[date].map((job) => (
                    <div
                      key={job.id}
                      className="bg-paper border border-line rounded-[8px] p-4 group cursor-pointer hover:border-terra-border transition-colors"
                      onClick={() => onSelectJob(job)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif text-sm font-medium truncate">
                            {job.jd.position || '未命名岗位'}
                          </h3>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            {job.jd.company || '未知公司'}
                            {job.jd.salary && <span className="ml-2">{job.jd.salary}</span>}
                          </p>
                        </div>
                        <ScoreBadge score={job.matchResult.score} size="sm" />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ink-weak">{formatDate(job.savedAt)}</span>
                        <div className="flex items-center gap-2">
                          {job.status === 'completed' && (
                            <span className="text-[11px] text-moss bg-mossLight px-2 py-0.5 rounded">已生成简历</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(job.id);
                            }}
                            className="text-ink-weak hover:text-terra transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
