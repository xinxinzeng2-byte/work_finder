import React, { useEffect, useRef, useState } from 'react';

export type SidebarView = 'jobs' | 'preparations' | 'resumes';

interface Props {
  currentView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onLogout: () => void;
  showLogout?: boolean;
  jobCount: number;
  resumeCount: number;
  preparationCount?: number;
  hasApiKey: boolean;
  userEmail?: string;
}

export const Sidebar: React.FC<Props> = ({ currentView, onViewChange, onOpenSettings, onOpenAbout, onLogout, showLogout = true, jobCount, resumeCount, preparationCount = 0, hasApiKey, userEmail }) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const email = userEmail?.trim() || '';

  useEffect(() => {
    if (!profileOpen) return undefined;
    const closeProfile = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', closeProfile);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeProfile);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  return <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-line bg-paper">
    <div className="border-b border-line px-6 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-terra text-lg font-bold text-white">W</div>
        <h1 className="font-serif text-lg font-bold text-ink">AI 求职助手</h1>
      </div>
    </div>

    <nav className="flex-1 space-y-1 px-3 py-6">
      <SidebarButton active={currentView === 'jobs'} onClick={() => onViewChange('jobs')} icon="▣" label="我的岗位投递" count={jobCount} />
      <SidebarButton active={currentView === 'preparations'} onClick={() => onViewChange('preparations')} icon="✦" label="我的求职准备" count={preparationCount} />
      <SidebarButton active={currentView === 'resumes'} onClick={() => onViewChange('resumes')} icon="▤" label="简历与能力库" count={resumeCount} />
    </nav>

    <div className="space-y-1 px-3 pb-6">
      <button onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-secondary transition hover:bg-canvas hover:text-ink">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-secondary">
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.6 3.45h4.8l.55 2.15c.38.16.74.37 1.08.62l2.1-.6 2.4 4.16-1.55 1.54a7.6 7.6 0 0 1 0 1.36l1.55 1.54-2.4 4.16-2.1-.6c-.34.25-.7.46-1.08.62l-.55 2.15H9.6l-.55-2.15a7.2 7.2 0 0 1-1.08-.62l-2.1.6-2.4-4.16 1.55-1.54a7.6 7.6 0 0 1 0-1.36L3.47 9.78l2.4-4.16 2.1.6c.34-.25.7-.46 1.08-.62l.55-2.15Z" />
            <circle cx="12" cy="12" r="2.75" />
          </svg>
        </span>
        <span className="flex-1 text-left">设置</span>
        <span className={`h-2 w-2 rounded-full ${hasApiKey ? 'bg-moss' : 'bg-amber-500'}`} />
      </button>
      {email && <div ref={profileRef} className="relative">
        {profileOpen && <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-line bg-paper shadow-lg" role="menu" aria-label="账号菜单">
          <div className="px-3 py-3">
            <p className="mb-1 text-[11px] text-ink-weak">登录邮箱</p>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 break-all text-xs leading-5 text-ink">{email}</p>
              {showLogout && <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-terra transition hover:bg-terra-light hover:text-terra-hover"
              >
                <span>退出</span>
              </button>}
            </div>
          </div>
        </div>}
        <button
          type="button"
          onClick={() => setProfileOpen((open) => !open)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-secondary transition hover:bg-canvas hover:text-ink"
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          aria-label="打开账号菜单"
          title="我的账号"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-secondary">
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate text-left">我的账号</span>
          <span className={`text-xs text-ink-weak transition-transform ${profileOpen ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
        </button>
      </div>}
      <button onClick={onOpenAbout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-secondary transition hover:bg-canvas hover:text-ink">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-secondary">
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 10.75v5.5" />
            <circle cx="12" cy="7.5" r=".75" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className="flex-1 text-left">关于本站</span>
      </button>
    </div>
  </aside>;
};

const SidebarButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string; count: number }> = ({ active, onClick, icon, label, count }) => (
  <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-terra-light text-terra' : 'text-ink-secondary hover:bg-canvas hover:text-ink'}`}>
    <span className="w-5 text-center text-base">{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {count > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-terra-border text-terra' : 'bg-canvas text-ink-weak'}`}>{count}</span>}
  </button>
);

export default Sidebar;
