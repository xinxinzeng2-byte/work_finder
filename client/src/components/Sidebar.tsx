import React from 'react';

export type SidebarView = 'jobs' | 'resumes';

interface Props {
  currentView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onOpenSettings: () => void;
  jobCount: number;
  resumeCount: number;
  hasApiKey: boolean;
}

export const Sidebar: React.FC<Props> = ({ currentView, onViewChange, onOpenSettings, jobCount, resumeCount, hasApiKey }) => (
  <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-line bg-paper">
    <div className="border-b border-line px-6 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-terra text-lg font-bold text-white">W</div>
        <div>
          <h1 className="font-serif text-lg font-bold text-ink">AI 求职助手</h1>
          <p className="text-[11px] text-ink-weak">像聊天一样补经历</p>
        </div>
      </div>
    </div>

    <nav className="flex-1 space-y-1 px-3 py-6">
      <SidebarButton active={currentView === 'jobs'} onClick={() => onViewChange('jobs')} icon="▣" label="我的岗位投递" count={jobCount} />
      <SidebarButton active={currentView === 'resumes'} onClick={() => onViewChange('resumes')} icon="▤" label="简历与能力库" count={resumeCount} />
    </nav>

    <div className="px-3 pb-6">
      <button onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-secondary transition hover:bg-canvas hover:text-ink">
        <span className="text-lg">⚙</span>
        <span className="flex-1 text-left">设置</span>
        <span className={`h-2 w-2 rounded-full ${hasApiKey ? 'bg-moss' : 'bg-amber-500'}`} />
      </button>
    </div>
  </aside>
);

const SidebarButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string; count: number }> = ({ active, onClick, icon, label, count }) => (
  <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-terra-light text-terra' : 'text-ink-secondary hover:bg-canvas hover:text-ink'}`}>
    <span className="w-5 text-center text-base">{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {count > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-terra-border text-terra' : 'bg-canvas text-ink-weak'}`}>{count}</span>}
  </button>
);

export default Sidebar;
