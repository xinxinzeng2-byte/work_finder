import React, { useState, useEffect } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { ExperienceDrawer } from './components/ExperienceDrawer';
import { JobsDrawer } from './components/JobsDrawer';
import { ImportView } from './components/views/ImportView';
import { AnalyzeView } from './components/views/AnalyzeView';
import { getApiKey, loadResume, loadSavedJobs, type SavedJob, saveResume } from './utils/storage';
import type { ParsedResume } from './types';

type View = 'import' | 'analyze';

const App: React.FC = () => {
  const [view, setView] = useState<View>('import');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expDrawerOpen, setExpDrawerOpen] = useState(false);
  const [jobsDrawerOpen, setJobsDrawerOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<SavedJob | null>(null);

  useEffect(() => {
    setHasApiKey(!!getApiKey());
    const savedResume = loadResume();
    if (savedResume) {
      setResume(savedResume);
      setView('analyze');
    }
    refreshJobs();
  }, []);

  const refreshJobs = () => {
    setSavedJobs(loadSavedJobs());
  };

  const handleResumeComplete = (parsed: ParsedResume) => {
    setResume(parsed);
    setView('analyze');
  };

  const handleResumeUpdate = (updated: ParsedResume) => {
    setResume(updated);
    saveResume(updated);
  };

  const handleSelectJob = (job: SavedJob) => {
    setSelectedJob(job);
    setJobsDrawerOpen(false);
    setView('analyze');
  };

  // 没有 API Key 时的引导
  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-canvas">
        <Header
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenExperience={() => setExpDrawerOpen(true)}
          onOpenJobs={() => setJobsDrawerOpen(true)}
          jobCount={savedJobs.length}
          hasResume={!!resume}
          expCount={resume?.skills.length || 0}
        />
        <main className="max-w-content mx-auto px-6 py-16">
          <div className="card text-center">
            <div className="text-3xl mb-4">🔑</div>
            <h2 className="text-lg font-serif font-semibold mb-2">先配置 DeepSeek API Key</h2>
            <p className="text-sm text-ink-secondary mb-6 leading-relaxed">
              本工具需要 DeepSeek AI 提供智能分析能力，请先在设置中填入你的 API Key。
            </p>
            <button onClick={() => setSettingsOpen(true)} className="btn-primary">
              打开设置
            </button>
            <p className="text-xs text-ink-weak mt-6">
              还没有？在 platform.deepseek.com 注册，充几块钱即可使用
            </p>
          </div>
        </main>
        <SettingsModal
          open={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
            setHasApiKey(!!getApiKey());
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenExperience={() => setExpDrawerOpen(true)}
        onOpenJobs={() => setJobsDrawerOpen(true)}
        jobCount={savedJobs.length}
        hasResume={!!resume}
        expCount={resume?.skills.length || 0}
        currentView={view}
        onViewChange={setView}
      />

      <main className="max-w-content mx-auto px-6 py-12">
        {view === 'import' && (
          <ImportView onComplete={handleResumeComplete} existingResume={resume} />
        )}

        {view === 'analyze' && resume && (
          <AnalyzeView
            resume={resume}
            onResumeUpdate={handleResumeUpdate}
            onJobSaved={refreshJobs}
            initialJob={selectedJob}
          />
        )}

        {view === 'analyze' && !resume && (
          <ImportView onComplete={handleResumeComplete} existingResume={resume} />
        )}
      </main>

      {/* 抽屉 */}
      <ExperienceDrawer
        open={expDrawerOpen}
        onClose={() => setExpDrawerOpen(false)}
        resume={resume}
        onResumeUpdate={handleResumeUpdate}
      />
      <JobsDrawer
        open={jobsDrawerOpen}
        onClose={() => setJobsDrawerOpen(false)}
        jobs={savedJobs}
        onJobsChange={refreshJobs}
        onSelectJob={handleSelectJob}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setHasApiKey(!!getApiKey());
        }}
      />
    </div>
  );
};

// 顶部导航
interface HeaderProps {
  onOpenSettings: () => void;
  onOpenExperience: () => void;
  onOpenJobs: () => void;
  jobCount: number;
  hasResume: boolean;
  expCount: number;
  currentView?: View;
  onViewChange?: (view: View) => void;
}

const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenExperience,
  onOpenJobs,
  jobCount,
  hasResume,
  expCount,
  currentView,
  onViewChange,
}) => {
  return (
    <header className="bg-paper/80 backdrop-blur-sm border-b border-line sticky top-0 z-20">
      <div className="max-w-content mx-auto px-6 py-4 flex items-center justify-between">
        {/* 左侧：标题 + 导航 */}
        <div className="flex items-center gap-6">
          <h1 className="font-serif text-lg font-semibold">求职助手</h1>
          {hasResume && onViewChange && (
            <nav className="flex gap-1">
              <button
                onClick={() => onViewChange('import')}
                className={`text-sm px-3 py-1 rounded transition-colors ${
                  currentView === 'import' ? 'text-terra' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                导入
              </button>
              <button
                onClick={() => onViewChange('analyze')}
                className={`text-sm px-3 py-1 rounded transition-colors ${
                  currentView === 'analyze' ? 'text-terra' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                岗位分析
              </button>
            </nav>
          )}
        </div>

        {/* 右侧：功能入口 */}
        <div className="flex items-center gap-2">
          {hasResume && (
            <button
              onClick={onOpenExperience}
              className="text-xs text-ink-secondary hover:text-terra transition-colors px-3 py-1.5 rounded-[6px] hover:bg-terra-light flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              经历库
              {expCount > 0 && (
                <span className="text-[10px] bg-terra-light text-terra px-1.5 py-0.5 rounded-full">{expCount}</span>
              )}
            </button>
          )}
          <button
            onClick={onOpenJobs}
            className="text-xs text-ink-secondary hover:text-terra transition-colors px-3 py-1.5 rounded-[6px] hover:bg-terra-light flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            岗位收录
            {jobCount > 0 && (
              <span className="text-[10px] bg-terra-light text-terra px-1.5 py-0.5 rounded-full">{jobCount}</span>
            )}
          </button>
          <button
            onClick={onOpenSettings}
            className="text-ink-weak hover:text-ink transition-colors p-1.5 rounded-[6px] hover:bg-canvas"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

export default App;
