import React,{useEffect,useMemo,useState} from 'react';
import {Navigate,Route,Routes,useLocation,useNavigate,useParams} from 'react-router-dom';
import Sidebar,{type SidebarView} from './components/Sidebar';
import AuthView from './components/views/AuthView';
import {SettingsModal} from './components/SettingsModal';
import {AnalyzeView} from './components/views/AnalyzeView';
import JobApplicationsView from './components/views/JobApplicationsView';
import JobsWorkflowView from './components/views/JobsWorkflowView';
import ResumeManagerView from './components/views/ResumeManagerView';
import PreparationsView from './components/views/PreparationsView';
import NewPreparationView from './components/views/NewPreparationView';
import PreparationEditorView from './components/views/PreparationEditorView';
import InterviewPreparationView from './components/views/InterviewPreparationView';
import PreparationPreviewView from './components/views/PreparationPreviewView';
import PublicPortfolioView from './components/views/PublicPortfolioView';
import {authGet,flushCloudSync,hasApiKey,hydrateApiKey,hydrateFromCloud,isCloudMode,loadCurrentResume,loadResumes,loadSavedJobs,type SavedJob} from './utils/storage';
import type {ParsedResume} from './types';
import {jsonRequest} from './services/http';
import {flushPreparationWrites,listPreparations} from './services/preparations';

const JobDetail:React.FC<{jobs:SavedJob[];resume:ParsedResume|null;onResumeUpdate:(resume:ParsedResume)=>void;onJobsChange:()=>void}>=({jobs,resume,onResumeUpdate,onJobsChange})=>{const{id=''}=useParams();const navigate=useNavigate();const job=jobs.find(item=>item.id===id);if(!job)return <div className="page-shell">岗位记录不存在或仍在加载。</div>;return <div className="page-shell"><button onClick={()=>navigate('/jobs')} className="btn-link mb-5">← 返回岗位投递</button><AnalyzeView key={job.id} resume={job.resumeSnapshot||resume} onResumeUpdate={onResumeUpdate} onJobSaved={onJobsChange} initialJob={job} onCreatePreparation={jobId=>navigate(`/preparations/new?jobId=${jobId}`)}/></div>};

const App:React.FC=()=>{const location=useLocation();const navigate=useNavigate();const[authChecked,setAuthChecked]=useState(false);const[user,setUser]=useState<{id:string;email:string}|null>(null);const[settingsOpen,setSettingsOpen]=useState(false);const[apiKeyConfigured,setApiKeyConfigured]=useState(hasApiKey());const[resume,setResume]=useState<ParsedResume|null>(loadCurrentResume());const[savedJobs,setSavedJobs]=useState<SavedJob[]>(loadSavedJobs());const[preparationCount,setPreparationCount]=useState(0);const[cloudDataLoading,setCloudDataLoading]=useState(isCloudMode);const[cloudDataError,setCloudDataError]=useState('');
  const isPublic=location.pathname.startsWith('/p/');const currentView:SidebarView=location.pathname.startsWith('/preparations')?'preparations':location.pathname.startsWith('/resumes')?'resumes':'jobs';
  const refreshJobs=()=>setSavedJobs(loadSavedJobs());const refreshResume=()=>setResume(loadCurrentResume());const refreshPreparations=()=>{void listPreparations().then(items=>setPreparationCount(items.length)).catch(()=>undefined);};
  const loadCloudSession=async(authenticatedUser?:{id:string;email:string})=>{setCloudDataLoading(true);setCloudDataError('');try{const current=authenticatedUser||(await authGet<{user:{id:string;email:string}}>('/auth/me')).user;setUser(current);await hydrateFromCloud(current.id);setApiKeyConfigured(await hydrateApiKey());setResume(loadCurrentResume());setSavedJobs(loadSavedJobs());refreshPreparations();}catch(error){if(error instanceof Error&&error.message.includes('未登录'))localStorage.removeItem('auth_token');else setCloudDataError('云端数据加载失败，请重试。');setUser(null);}finally{setCloudDataLoading(false);setAuthChecked(true);}};
  useEffect(()=>{if(isPublic){setAuthChecked(true);setCloudDataLoading(false);return;}const boot=async()=>{if(!isCloudMode){setUser({id:'local',email:''});setCloudDataLoading(false);setAuthChecked(true);refreshPreparations();return;}if(!localStorage.getItem('auth_token')){try{const response=await fetch('/api/auth/refresh',{method:'POST',credentials:'include',cache:'no-store'});if(response.ok){const data=await response.json();localStorage.setItem('auth_token',data.token);await loadCloudSession(data.user);return;}}catch{/* fall through */}setCloudDataLoading(false);setAuthChecked(true);return;}await loadCloudSession();};void boot();},[isPublic]);
  useEffect(()=>{const expired=()=>{setUser(null);navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`);};window.addEventListener('wf-auth-expired',expired);return()=>window.removeEventListener('wf-auth-expired',expired);},[location.pathname,navigate]);
  useEffect(()=>{if(user&&location.pathname.startsWith('/preparations'))refreshPreparations();},[location.pathname,user]);
  useEffect(()=>{if(authChecked&&user&&!apiKeyConfigured)setSettingsOpen(true);},[authChecked,user,apiKeyConfigured]);
  const handleLogout=async()=>{try{window.dispatchEvent(new CustomEvent('wf-flush-preparations'));await new Promise(resolve=>window.setTimeout(resolve,50));await flushPreparationWrites();await flushCloudSync();if(isCloudMode)await jsonRequest('/api/auth/logout',{method:'POST'});}catch{/* still clear local session */}finally{setCloudDataLoading(true);localStorage.removeItem('auth_token');setUser(null);setResume(null);setSavedJobs([]);setPreparationCount(0);setCloudDataLoading(false);navigate('/login');}};
  const returnTo=useMemo(()=>{const value=new URLSearchParams(location.search).get('returnTo');return value?.startsWith('/')&&!value.startsWith('//')?value:'/jobs';},[location.search]);
  if(isPublic)return <Routes><Route path="/p/:slug" element={<PublicPortfolioView/>}/><Route path="*" element={<Navigate to="/jobs" replace/>}/></Routes>;
  if(!authChecked||cloudDataLoading)return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-secondary">正在恢复登录与云端数据...</div>;
  if(cloudDataError)return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas"><p>{cloudDataError}</p><button className="btn-primary" onClick={()=>void loadCloudSession()}>重新加载</button></div>;
  if(isCloudMode&&!user)return <Routes><Route path="/login" element={<AuthView onAuthenticated={async current=>{await loadCloudSession(current);navigate(returnTo,{replace:true});}}/>}/><Route path="*" element={<Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace/>}/></Routes>;
  if(location.pathname.match(/^\/preparations\/[^/]+\/preview$/))return <Routes><Route path="/preparations/:id/preview" element={<PreparationPreviewView/>}/></Routes>;
  return <div className="min-h-screen bg-canvas"><Sidebar currentView={currentView} onViewChange={view=>navigate(view==='jobs'?'/jobs':view==='resumes'?'/resumes':'/preparations')} onOpenSettings={()=>setSettingsOpen(true)} onLogout={()=>void handleLogout()} showLogout={isCloudMode} jobCount={savedJobs.length} preparationCount={preparationCount} resumeCount={loadResumes().filter(item=>item.type==='original').length} hasApiKey={apiKeyConfigured} userEmail={user?.email}/><main className="min-h-screen pl-60"><Routes>
    <Route path="/" element={<Navigate to="/jobs" replace/>}/><Route path="/login" element={<Navigate to="/jobs" replace/>}/>
    <Route path="/jobs" element={<JobApplicationsView jobs={savedJobs} onNewJob={()=>navigate('/jobs/new')} onContinueDraft={()=>navigate('/jobs/new?resumeDraft=1')} onSelectJob={job=>navigate(`/jobs/${job.id}`)} onJobsChange={refreshJobs}/>}/>
    <Route path="/jobs/new" element={<JobsWorkflowView onJobsChange={refreshJobs} onComplete={job=>navigate(`/jobs/${job.id}`)} onExit={()=>navigate('/jobs')} onNeedApiKey={()=>setSettingsOpen(true)} resumeDraft={new URLSearchParams(location.search).get('resumeDraft')==='1'}/>}/>
    <Route path="/jobs/:id" element={<JobDetail jobs={savedJobs} resume={resume} onResumeUpdate={setResume} onJobsChange={refreshJobs}/>}/>
    <Route path="/resumes" element={<ResumeManagerView onResumeUpdate={updated=>{setResume(updated);refreshResume();}} onNeedApiKey={()=>setSettingsOpen(true)}/>}/>
    <Route path="/preparations" element={<PreparationsView/>}/><Route path="/preparations/new" element={<NewPreparationView onNeedApiKey={()=>setSettingsOpen(true)}/>}/><Route path="/preparations/:id/home" element={<PreparationEditorView/>}/><Route path="/preparations/:id/interview" element={<InterviewPreparationView/>}/><Route path="*" element={<Navigate to="/jobs" replace/>}/>
  </Routes></main><SettingsModal open={settingsOpen} onClose={()=>{setSettingsOpen(false);setApiKeyConfigured(hasApiKey());}}/></div>;
};
export default App;
