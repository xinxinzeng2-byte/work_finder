import React, { useEffect, useState } from 'react';
import Sidebar, { type SidebarView } from './components/Sidebar';
import AuthView from './components/views/AuthView';
import { SettingsModal } from './components/SettingsModal';
import { AnalyzeView } from './components/views/AnalyzeView';
import JobApplicationsView from './components/views/JobApplicationsView';
import JobsWorkflowView from './components/views/JobsWorkflowView';
import ResumeManagerView from './components/views/ResumeManagerView';
import { authGet, flushCloudSync, hasApiKey, hydrateApiKey, hydrateFromCloud, isCloudMode, loadCurrentResume, loadResumes, loadSavedJobs, type SavedJob } from './utils/storage';
import type { ParsedResume } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<SidebarView>('jobs');
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(hasApiKey());
  const [resume, setResume] = useState<ParsedResume | null>(loadCurrentResume());
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>(loadSavedJobs());
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [resumeWorkflowDraft, setResumeWorkflowDraft] = useState(false);
  const [selectedJob, setSelectedJob] = useState<SavedJob | null>(null);
  const [cloudDataLoading, setCloudDataLoading] = useState(isCloudMode);
  const [cloudDataError, setCloudDataError] = useState('');

  const loadCloudSession = async (authenticatedUser?: { id: string; email: string }) => {
    setCloudDataLoading(true);
    setCloudDataError('');
    // 在新账号的云端数据加载完成前，不展示上一个账号的 React 状态。
    setUser(null);
    setResume(null);
    setSavedJobs([]);
    try {
      const currentUser = authenticatedUser || (await authGet<{ user: { id: string; email: string } }>('/auth/me')).user;
      setUser(currentUser);
      await hydrateFromCloud(currentUser.id);
      setApiKeyConfigured(await hydrateApiKey());
      setResume(loadCurrentResume());
      setSavedJobs(loadSavedJobs());
    } catch (error) {
      if (error instanceof Error && error.message.includes('未登录')) {
        localStorage.removeItem('auth_token');
        setCloudDataError('登录已过期，请重新登录。');
      } else {
        console.error('读取云端数据失败', error);
        setCloudDataError('云端数据加载失败，请重试。');
      }
      setUser(null);
    } finally {
      setCloudDataLoading(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    if (!isCloudMode) {
      setUser({ id: 'local', email: '' });
      setCloudDataLoading(false);
      setAuthChecked(true);
      return;
    }
    const token = localStorage.getItem('auth_token');
    if (!token) { setCloudDataLoading(false); setAuthChecked(true); return; }
    void loadCloudSession();
  }, []);

  useEffect(() => {
    if (authChecked && user && !apiKeyConfigured) setSettingsOpen(true);
  }, [authChecked, user, apiKeyConfigured]);

  const refreshJobs = () => setSavedJobs(loadSavedJobs());
  const refreshResume = () => { setResume(loadCurrentResume()); };
  const handleViewChange = (view: SidebarView) => { setSelectedJob(null); setWorkflowOpen(false); setCurrentView(view); };
  const openNewWorkflow = () => { setSelectedJob(null); setResumeWorkflowDraft(false); setWorkflowOpen(true); setCurrentView('jobs'); };
  const continueWorkflow = () => { setSelectedJob(null); setResumeWorkflowDraft(true); setWorkflowOpen(true); setCurrentView('jobs'); };
  const handleWorkflowComplete = (job: SavedJob) => { setSelectedJob(job); setWorkflowOpen(false); };
  const handleResumeUpdate = (updated: ParsedResume) => { setResume(updated); };
  const handleAuthenticated = async (authenticatedUser: { id: string; email: string }) => {
    await loadCloudSession(authenticatedUser);
  };
  if (!authChecked) return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-secondary">正在检查登录状态...</div>;
  if (isCloudMode && cloudDataLoading) return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-secondary">正在加载你的云端数据...</div>;
  if (isCloudMode && cloudDataError) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center"><p className="text-sm text-ink-secondary">{cloudDataError}</p><div className="flex gap-3"><button onClick={() => void loadCloudSession()} className="btn-primary">重新加载</button><button onClick={() => { localStorage.removeItem('auth_token'); setCloudDataError(''); }} className="btn-ghost">返回登录</button></div></div>;
  if (isCloudMode && !user) return <AuthView onAuthenticated={handleAuthenticated} />;

  const handleLogout = async () => {
    setCloudDataLoading(true);
    setUser(null);
    setResume(null);
    setSavedJobs([]);
    setSelectedJob(null);
    setWorkflowOpen(false);
    try {
      await flushCloudSync();
    } finally {
      localStorage.removeItem('auth_token');
      setCloudDataLoading(false);
      setAuthChecked(true);
    }
  };

  return <div className="min-h-screen bg-canvas"><Sidebar currentView={currentView} onViewChange={handleViewChange} onOpenSettings={() => setSettingsOpen(true)} onLogout={handleLogout} showLogout={isCloudMode} jobCount={savedJobs.length} resumeCount={loadResumes().filter((item) => item.type === 'original').length} hasApiKey={apiKeyConfigured} userEmail={user?.email} /><main className="min-h-screen pl-60">
    {currentView === 'jobs' && workflowOpen && <JobsWorkflowView onJobsChange={refreshJobs} onComplete={handleWorkflowComplete} onExit={() => setWorkflowOpen(false)} onNeedApiKey={() => setSettingsOpen(true)} resumeDraft={resumeWorkflowDraft} />}
    {currentView === 'jobs' && !workflowOpen && selectedJob && <div className="page-shell"><button onClick={() => setSelectedJob(null)} className="btn-link mb-5">← 返回岗位投递</button><AnalyzeView key={selectedJob.id} resume={selectedJob.resumeSnapshot || resume} onResumeUpdate={handleResumeUpdate} onJobSaved={refreshJobs} initialJob={selectedJob} /></div>}
    {currentView === 'jobs' && !workflowOpen && !selectedJob && <JobApplicationsView jobs={savedJobs} onNewJob={openNewWorkflow} onContinueDraft={continueWorkflow} onSelectJob={setSelectedJob} onJobsChange={refreshJobs} />}
    {currentView === 'resumes' && <ResumeManagerView onResumeUpdate={(updated) => { setResume(updated); refreshResume(); }} onNeedApiKey={() => setSettingsOpen(true)} />}
  </main><SettingsModal open={settingsOpen} onClose={() => { setSettingsOpen(false); setApiKeyConfigured(hasApiKey()); }} /></div>;
};

export default App;
