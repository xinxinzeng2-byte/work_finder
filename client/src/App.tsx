import React, { useEffect, useState } from 'react';
import Sidebar, { type SidebarView } from './components/Sidebar';
import AuthView from './components/views/AuthView';
import { SettingsModal } from './components/SettingsModal';
import { AnalyzeView } from './components/views/AnalyzeView';
import JobApplicationsView from './components/views/JobApplicationsView';
import JobsWorkflowView from './components/views/JobsWorkflowView';
import ResumeManagerView from './components/views/ResumeManagerView';
import { authGet, getApiKey, hydrateFromCloud, isCloudMode, loadCurrentResume, loadResumes, loadSavedJobs, updateCurrentResume, type SavedJob } from './utils/storage';
import type { ParsedResume } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<SidebarView>('jobs');
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(!!getApiKey());
  const [resume, setResume] = useState<ParsedResume | null>(loadCurrentResume());
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>(loadSavedJobs());
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<SavedJob | null>(null);

  useEffect(() => {
    if (!isCloudMode) {
      setUser({ id: 'local', email: '' });
      setAuthChecked(true);
      return;
    }
    const token = localStorage.getItem('auth_token');
    if (!token) { setAuthChecked(true); return; }
    authGet<{ user: { id: string; email: string } }>('/auth/me')
      .then(async ({ user: currentUser }) => {
        setUser(currentUser);
        await hydrateFromCloud();
        setResume(loadCurrentResume());
        setSavedJobs(loadSavedJobs());
      })
      .catch(() => { localStorage.removeItem('auth_token'); })
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (authChecked && user && !getApiKey()) setSettingsOpen(true);
  }, [authChecked, user]);

  const refreshJobs = () => setSavedJobs(loadSavedJobs());
  const refreshResume = () => { setResume(loadCurrentResume()); };
  const handleViewChange = (view: SidebarView) => { setSelectedJob(null); setWorkflowOpen(false); setCurrentView(view); };
  const openWorkflow = () => { setSelectedJob(null); setWorkflowOpen(true); setCurrentView('jobs'); };
  const handleResumeUpdate = (updated: ParsedResume | null) => { setResume(updated); if (updated) updateCurrentResume(updated); };
  if (!authChecked) return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-secondary">正在检查登录状态...</div>;
  if (isCloudMode && !user) return <AuthView onAuthenticated={async (authenticatedUser) => { setUser(authenticatedUser); await hydrateFromCloud(); setResume(loadCurrentResume()); setSavedJobs(loadSavedJobs()); }} />;

  const handleLogout = () => { localStorage.removeItem('auth_token'); setUser(null); setAuthChecked(true); };

  return <div className="min-h-screen bg-canvas"><Sidebar currentView={currentView} onViewChange={handleViewChange} onOpenSettings={() => setSettingsOpen(true)} onLogout={handleLogout} showLogout={isCloudMode} jobCount={savedJobs.length} resumeCount={loadResumes().filter((item) => item.type === 'original').length} hasApiKey={hasApiKey} userEmail={user?.email} /><main className="min-h-screen pl-60">
    {currentView === 'jobs' && workflowOpen && <JobsWorkflowView onJobsChange={refreshJobs} onExit={() => setWorkflowOpen(false)} onNeedApiKey={() => setSettingsOpen(true)} />}
    {currentView === 'jobs' && !workflowOpen && selectedJob && resume && <div className="page-shell"><button onClick={() => setSelectedJob(null)} className="btn-link mb-5">← 返回岗位投递</button><AnalyzeView key={selectedJob.id} resume={resume} onResumeUpdate={handleResumeUpdate} onJobSaved={refreshJobs} initialJob={selectedJob} /></div>}
    {currentView === 'jobs' && !workflowOpen && !selectedJob && <JobApplicationsView jobs={savedJobs} onNewJob={openWorkflow} onContinueDraft={openWorkflow} onSelectJob={setSelectedJob} onJobsChange={refreshJobs} />}
    {currentView === 'resumes' && <ResumeManagerView onResumeUpdate={(updated) => { setResume(updated); refreshResume(); }} onNeedApiKey={() => setSettingsOpen(true)} />}
  </main><SettingsModal open={settingsOpen} onClose={() => { setSettingsOpen(false); setHasApiKey(!!getApiKey()); }} /></div>;
};

export default App;
