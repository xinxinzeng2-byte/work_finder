import React, { useMemo, useState } from 'react';
import type { ParsedResume } from '../../types';
import { parseResumeFile, parseResumeText, readFileAsDataUrl } from '../../services/api';
import { deleteResume, loadResumes, mergeExperiencesFromResumes, mergeSkillsFromResumes, renameResume, saveResume, setCurrentResume, type ResumeItem } from '../../utils/storage';
import ResumeImportModal from '../ResumeImportModal';
import ResumePreviewModal from '../ResumePreviewModal';
import { downloadResume } from '../../utils/resumeExport';

interface Props {
  onResumeUpdate: (resume: ParsedResume | null) => void;
  onNeedApiKey: () => void;
}

export const ResumeManagerView: React.FC<Props> = ({ onResumeUpdate, onNeedApiKey }) => {
  const [resumes, setResumes] = useState<ResumeItem[]>(loadResumes());
  const [tab, setTab] = useState<'original' | 'customized' | 'library'>('original');
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewItem, setPreviewItem] = useState<ResumeItem | null>(null);
  const refresh = () => setResumes(loadResumes());
  const originals = resumes.filter((item) => item.type === 'original');
  const customized = resumes.filter((item) => item.type === 'customized');
  const mergedSkills = useMemo(() => mergeSkillsFromResumes(originals), [resumes]);
  const mergedExperiences = useMemo(() => mergeExperiencesFromResumes(originals), [resumes]);

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (!localStorage.getItem('deepseek_api_key')) { setShowImport(false); onNeedApiKey(); return; }
    setLoading(true); setError('');
    try {
      for (const file of files) {
        const parsed = await parseResumeFile(file);
        const sourceFileData = await readFileAsDataUrl(file);
        const item = saveResume(parsed, { name: file.name.replace(/\.(pdf|docx|html|htm|txt)$/i, ''), fileName: file.name, sourceFileData, sourceMimeType: file.type });
        onResumeUpdate(item.resume);
      }
      refresh(); setShowImport(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '简历解析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const importText = async (text: string) => {
    if (!text.trim()) return;
    if (!localStorage.getItem('deepseek_api_key')) { setShowImport(false); onNeedApiKey(); return; }
    setLoading(true); setError('');
    try {
      const parsed = await parseResumeText(text.trim());
      const item = saveResume(parsed, { name: `原始简历 ${originals.length + 1}`, originalText: text.trim() });
      onResumeUpdate(item.resume); refresh(); setShowImport(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '简历解析失败，请重试');
    } finally { setLoading(false); }
  };

  const handleDelete = (item: ResumeItem) => {
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
    deleteResume(item.id); refresh(); onResumeUpdate(loadResumes().find((r) => r.isCurrent)?.resume || null);
  };

  const handleRename = (item: ResumeItem) => {
    const name = window.prompt('请输入新的简历名称', item.name);
    if (name) { renameResume(item.id, name); refresh(); }
  };

  const openImport = () => { setError(''); setShowImport(true); };

  return <div className="page-shell animate-fade-in">
    <header className="page-header items-center"><div><p className="eyebrow">RESUME & SKILL LIBRARY</p><h1>简历与能力库</h1><p className="page-subtitle">原始简历是能力来源，定制简历是岗位分析后的输出。</p></div><button onClick={openImport} disabled={loading} className="btn-primary">＋ 导入简历</button></header>

    {error && <div className="mb-5 rounded-lg border border-terra-border bg-terra-light px-4 py-3 text-sm text-terra">{error}</div>}

    <div className="mb-5 grid grid-cols-4 gap-4"><Stat label="原始简历" value={originals.length} /><Stat label="定制简历" value={customized.length} /><Stat label="合并能力" value={mergedSkills.length} /><Stat label="合并经历" value={mergedExperiences.length} /></div>
    <div className="mb-4 flex gap-1 border-b border-line"><Tab active={tab === 'original'} onClick={() => setTab('original')}>原始简历（{originals.length}）</Tab><Tab active={tab === 'customized'} onClick={() => setTab('customized')}>定制简历（{customized.length}）</Tab><Tab active={tab === 'library'} onClick={() => setTab('library')}>合并能力库</Tab></div>

    {tab !== 'library' ? <div className="space-y-3">{(tab === 'original' ? originals : customized).map((item) => <div key={item.id} className="card flex items-center gap-4 p-5"><div className={`flex h-11 w-11 items-center justify-center rounded-lg text-xl ${item.type === 'original' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>{item.type === 'original' ? '▤' : '✎'}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-medium">{item.name}</h3>{item.isCurrent && <span className="rounded-full bg-terra-light px-2 py-0.5 text-xs text-terra">默认来源</span>}</div><p className="mt-1 text-xs text-ink-secondary">{item.fileName || '粘贴文本'} · {item.resume.skills.length} 项能力 · {item.resume.experiences.length} 段经历 · {new Date(item.uploadedAt).toLocaleDateString('zh-CN')}</p>{item.targetJob && <p className="mt-1 text-xs text-purple-600">目标岗位：{item.targetJob.position} · 匹配度 {item.targetJob.matchScore}</p>}</div><div className="flex flex-wrap justify-end gap-2"><button onClick={() => setPreviewItem(item)} className="btn-ghost h-8 px-3 text-xs">预览</button><button onClick={() => void downloadResume(item)} className="btn-ghost h-8 px-3 text-xs">下载</button><button onClick={() => handleRename(item)} className="btn-ghost h-8 px-3 text-xs">重命名</button>{item.type === 'original' && !item.isCurrent && <button onClick={() => { setCurrentResume(item.id); onResumeUpdate(item.resume); refresh(); }} className="btn-ghost h-8 px-3 text-xs">设为默认</button>}<button onClick={() => handleDelete(item)} className="h-8 px-3 text-xs text-ink-weak hover:text-terra">删除</button></div></div>)}{(tab === 'original' ? originals : customized).length === 0 && <div className="card py-16 text-center text-sm text-ink-secondary">{tab === 'original' ? '还没有原始简历，点击右上角开始导入。' : '完成岗位匹配并生成定制简历后，会显示在这里。'}</div>}</div> : <div className="grid grid-cols-2 gap-5"><LibraryList title="能力" items={mergedSkills.map((skill) => ({ name: skill.name, meta: `${skill.level} · ${skill.category}`, sources: skill.sources }))} /><LibraryList title="经历" items={mergedExperiences.map((experience) => ({ name: `${experience.company} · ${experience.role}`, meta: experience.period, sources: experience.sources }))} /></div>}
    <ResumeImportModal open={showImport} loading={loading} error={error} onClose={() => !loading && setShowImport(false)} onFilesSelected={importFiles} onTextSubmit={importText} />
    <ResumePreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
  </div>;
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => <div className="card p-4"><p className="text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-secondary">{label}</p></div>;
const Tab: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => <button onClick={onClick} className={`border-b-2 px-4 pb-3 text-sm ${active ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary'}`}>{children}</button>;
const LibraryList: React.FC<{ title: string; items: Array<{ name: string; meta: string; sources: string[] }> }> = ({ title, items }) => <section className="card"><div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-lg font-semibold">{title}</h2><span className="text-xs text-ink-weak">{items.length} 项</span></div><div className="max-h-[520px] space-y-2 overflow-auto">{items.map((item) => <div key={`${item.name}-${item.meta}`} className="rounded-lg bg-canvas px-3 py-3"><div className="text-sm font-medium">{item.name}</div><div className="mt-1 text-xs text-ink-secondary">{item.meta}</div><div className="mt-2 flex flex-wrap gap-1">{item.sources.map((source) => <span key={source} className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-weak">来自：{source}</span>)}</div></div>)}</div></section>;

export default ResumeManagerView;
