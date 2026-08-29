import React, { useMemo, useState } from 'react';
import type { ParsedResume, MergedSkill, MergedExperience } from '../../types';
import { parseResumeFile, parseResumeText, readFileAsDataUrl } from '../../services/api';
import { deleteResume, hasApiKey, loadResumes, mergeExperiencesFromResumes, mergeSkillsFromResumes, renameResume, saveResume, setCurrentResume, updateMergedSkill, removeMergedSkill, updateMergedExperience, removeMergedExperience, type ResumeItem } from '../../utils/storage';
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
  const [librarySubTab, setLibrarySubTab] = useState<'skills' | 'experiences'>('skills');
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewItem, setPreviewItem] = useState<ResumeItem | null>(null);
  const [renameItem, setRenameItem] = useState<ResumeItem | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [editSkillId, setEditSkillId] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<Partial<MergedSkill>>({});
  const [editExpKey, setEditExpKey] = useState<string | null>(null);
  const [editingExp, setEditingExp] = useState<Partial<MergedExperience>>({});
  const refresh = () => setResumes(loadResumes());
  const originals = resumes.filter((item) => item.type === 'original');
  const customized = resumes.filter((item) => item.type === 'customized');
  const mergedSkills = useMemo(() => mergeSkillsFromResumes(originals), [resumes]);
  const mergedExperiences = useMemo(() => mergeExperiencesFromResumes(originals), [resumes]);

  const doRename = () => {
    if (!renameItem || !renameInput.trim()) return;
    renameResume(renameItem.id, renameInput.trim());
    refresh();
    setRenameItem(null);
  };

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (!hasApiKey()) { setShowImport(false); onNeedApiKey(); return; }
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
    if (!hasApiKey()) { setShowImport(false); onNeedApiKey(); return; }
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

  const openRename = (item: ResumeItem) => {
    setRenameItem(item);
    setRenameInput(item.name);
  };

  const openImport = () => { setError(''); setShowImport(true); };

  const openEditSkill = (s: MergedSkill) => {
    setEditSkillId(s.name);
    setEditingSkill({ name: s.name, level: s.level, category: s.category, evidence: s.evidence });
  };
  const saveSkillEdit = (oldName: string) => {
    if (!editingSkill.name) return;
    updateMergedSkill(oldName, editingSkill);
    refresh();
    setEditSkillId(null);
  };
  const deleteSkill = (name: string) => {
    if (!window.confirm(`确定删除能力「${name}」吗？将从所有来源简历中移除。`)) return;
    removeMergedSkill(name); refresh();
  };

  const openEditExp = (e: MergedExperience) => {
    const key = `${e.company}|||${e.role}|||${e.period}`;
    setEditExpKey(key);
    setEditingExp({ ...e });
  };
  const saveExpEdit = (oldKey: string) => {
    if (!editingExp.company || !editingExp.role) return;
    updateMergedExperience(oldKey, editingExp);
    refresh();
    setEditExpKey(null);
  };
  const deleteExperience = (e: MergedExperience) => {
    const key = `${e.company}|||${e.role}|||${e.period}`;
    if (!window.confirm(`确定删除经历「${e.company} · ${e.role}」吗？将从所有来源简历中移除。`)) return;
    removeMergedExperience(key); refresh();
  };

  return <div className="page-shell animate-fade-in">
    <header className="page-header items-center"><div><p className="eyebrow">RESUME & SKILL LIBRARY</p><h1>简历与能力库</h1><p className="page-subtitle">原始简历是能力来源，定制简历是岗位分析后的输出。</p></div><button onClick={openImport} disabled={loading} className="btn-primary">＋ 导入简历</button></header>

    {error && <div className="mb-5 rounded-lg border border-terra-border bg-terra-light px-4 py-3 text-sm text-terra">{error}</div>}

    <div className="mb-5 grid grid-cols-4 gap-4">
      <Stat label="原始简历" value={originals.length} />
      <Stat label="定制简历" value={customized.length} />
      <Stat label="合并能力" value={mergedSkills.length} />
      <Stat label="合并经历" value={mergedExperiences.length} />
    </div>

    <div className="mb-4 flex gap-1 border-b border-line">
      <Tab active={tab === 'original'} onClick={() => setTab('original')}>原始简历（{originals.length}）</Tab>
      <Tab active={tab === 'customized'} onClick={() => setTab('customized')}>定制简历（{customized.length}）</Tab>
      <Tab active={tab === 'library'} onClick={() => setTab('library')}>合并能力库</Tab>
    </div>

    {tab !== 'library' ? (
      <div className="space-y-3">
        {(tab === 'original' ? originals : customized).map((item) => (
          <div key={item.id} className="card flex items-center gap-4 p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-lg text-xl ${item.type === 'original' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
              {item.type === 'original' ? '▤' : '✎'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium">{item.name}</h3>
                {item.isCurrent && <span className="rounded-full bg-terra-light px-2 py-0.5 text-xs text-terra">默认来源</span>}
              </div>
              <p className="mt-1 text-xs text-ink-secondary">
                {item.fileName || '粘贴文本'} · {item.resume.skills.length} 项能力 · {item.resume.experiences.length} 段经历 · {new Date(item.uploadedAt).toLocaleDateString('zh-CN')}
              </p>
              {item.targetJob && <p className="mt-1 text-xs text-purple-600">目标岗位：{item.targetJob.position} · 匹配度 {item.targetJob.matchScore}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setPreviewItem(item)} className="btn-ghost h-8 px-3 text-xs">预览</button>
              <button onClick={() => void downloadResume(item)} className="btn-ghost h-8 px-3 text-xs">下载</button>
              <button onClick={() => openRename(item)} className="btn-ghost h-8 px-3 text-xs">重命名</button>
              {item.type === 'original' && !item.isCurrent && (
                <button onClick={() => { setCurrentResume(item.id); onResumeUpdate(item.resume); refresh(); }} className="btn-ghost h-8 px-3 text-xs">设为默认</button>
              )}
              <button onClick={() => handleDelete(item)} className="h-8 px-3 text-xs text-ink-weak hover:text-terra">删除</button>
            </div>
          </div>
        ))}
        {(tab === 'original' ? originals : customized).length === 0 && (
          <div className="card py-16 text-center text-sm text-ink-secondary">
            {tab === 'original' ? '还没有原始简历，点击右上角开始导入。' : '完成岗位匹配并生成定制简历后，会显示在这里。'}
          </div>
        )}
      </div>
    ) : (
      <div>
        <div className="mb-4 flex gap-1 border-b border-line">
          <Tab active={librarySubTab === 'skills'} onClick={() => setLibrarySubTab('skills')}>能力（{mergedSkills.length}）</Tab>
          <Tab active={librarySubTab === 'experiences'} onClick={() => setLibrarySubTab('experiences')}>经历（{mergedExperiences.length}）</Tab>
        </div>
        <div className="card">
          {librarySubTab === 'skills' ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold">全部能力</h2>
                <span className="text-xs text-ink-weak">{mergedSkills.length} 项 · 支持编辑、删除</span>
              </div>
              <div className="scroll-hover max-h-[640px] space-y-3 pr-2">
                {mergedSkills.map((skill) => editSkillId === skill.name ? (
                  <div key={skill.name} className="rounded-lg bg-canvas p-4 space-y-2 border border-line">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label><span className="text-xs text-ink-secondary">名称</span><input className="input mt-1" value={editingSkill.name || ''} onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })} /></label>
                      <label><span className="text-xs text-ink-secondary">熟练度</span><input className="input mt-1" value={editingSkill.level || ''} onChange={(e) => setEditingSkill({ ...editingSkill, level: e.target.value })} /></label>
                      <label className="sm:col-span-2"><span className="text-xs text-ink-secondary">分类</span><input className="input mt-1" value={editingSkill.category || ''} onChange={(e) => setEditingSkill({ ...editingSkill, category: e.target.value })} /></label>
                      <label className="sm:col-span-2"><span className="text-xs text-ink-secondary">证据</span><textarea className="textarea mt-1 h-24 text-sm" value={editingSkill.evidence || ''} onChange={(e) => setEditingSkill({ ...editingSkill, evidence: e.target.value })} /></label>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-ink-weak">来源：{skill.sources.join('、')}</p>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditSkillId(null); }} className="btn-ghost h-8 px-3 text-xs">取消</button>
                        <button onClick={() => saveSkillEdit(skill.name)} className="btn-primary h-8 px-3 text-xs">保存</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={skill.name} className="group flex items-start justify-between gap-3 rounded-lg bg-canvas p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{skill.name}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{skill.level} · {skill.category || '未分类'}</p>
                      {skill.evidence && <p className="mt-2 text-xs leading-relaxed text-ink-weak">{skill.evidence}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {skill.sources.map((s) => <span key={s} className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-weak">来自：{s}</span>)}
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => openEditSkill(skill)} className="btn-ghost h-7 px-2 text-xs">编辑</button>
                      <button onClick={() => deleteSkill(skill.name)} className="h-7 px-2 text-xs text-ink-weak hover:text-terra">删除</button>
                    </div>
                  </div>
                ))}
                {mergedSkills.length === 0 && <div className="py-10 text-center text-sm text-ink-secondary">暂无能力数据</div>}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold">全部经历</h2>
                <span className="text-xs text-ink-weak">{mergedExperiences.length} 段 · 完整展示并支持编辑、删除</span>
              </div>
              <div className="scroll-hover max-h-[640px] space-y-3 pr-2">
                {mergedExperiences.map((exp) => {
                  const expKey = `${exp.company}|||${exp.role}|||${exp.period}`;
                  return editExpKey === expKey ? (
                    <div key={expKey} className="rounded-lg bg-canvas p-4 space-y-2 border border-line">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label><span className="text-xs text-ink-secondary">公司</span><input className="input mt-1" value={editingExp.company || ''} onChange={(e) => setEditingExp({ ...editingExp, company: e.target.value })} /></label>
                        <label><span className="text-xs text-ink-secondary">职位</span><input className="input mt-1" value={editingExp.role || ''} onChange={(e) => setEditingExp({ ...editingExp, role: e.target.value })} /></label>
                        <label><span className="text-xs text-ink-secondary">时间</span><input className="input mt-1" value={editingExp.period || ''} onChange={(e) => setEditingExp({ ...editingExp, period: e.target.value })} /></label>
                      </div>
                      <label><span className="text-xs text-ink-secondary">描述 / 职责</span><textarea className="textarea mt-1 h-20 text-sm" value={editingExp.description || ''} onChange={(e) => setEditingExp({ ...editingExp, description: e.target.value })} /></label>
                      <label><span className="text-xs text-ink-secondary">关键成就（每行一项）</span><textarea className="textarea mt-1 h-28 text-sm" value={(editingExp.achievements || []).join('\n')} onChange={(e) => setEditingExp({ ...editingExp, achievements: e.target.value.split('\n').filter(Boolean) })} /></label>
                      <label><span className="text-xs text-ink-secondary">使用技能（逗号分隔）</span><textarea className="textarea mt-1 h-14 text-sm" value={(editingExp.skillsUsed || []).join(', ')} onChange={(e) => setEditingExp({ ...editingExp, skillsUsed: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label>
                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-ink-weak">来源：{exp.sources.join('、')}</p>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditExpKey(null); }} className="btn-ghost h-8 px-3 text-xs">取消</button>
                          <button onClick={() => saveExpEdit(expKey)} className="btn-primary h-8 px-3 text-xs">保存</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={expKey} className="group rounded-lg bg-canvas p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{exp.company} · {exp.role}</p>
                          <p className="mt-1 text-xs text-ink-secondary">{exp.period}</p>
                          {exp.description && <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{exp.description}</p>}
                          {exp.achievements.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-secondary">
                              {exp.achievements.map((a, idx) => <li key={idx}>{a}</li>)}
                            </ul>
                          )}
                          {exp.skillsUsed.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {exp.skillsUsed.map((s) => <span key={s} className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-weak">{s}</span>)}
                            </div>
                          )}
                          {exp.rawText && (
                            <div className="mt-3 rounded bg-paper px-3 py-2 text-xs text-ink-weak whitespace-pre-line">原文：{exp.rawText}</div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {exp.sources.map((s) => <span key={s} className="rounded bg-terra-light px-2 py-0.5 text-[11px] text-terra">来自：{s}</span>)}
                          </div>
                        </div>
                        <div className="shrink-0 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => openEditExp(exp)} className="btn-ghost h-7 px-2 text-xs">编辑</button>
                          <button onClick={() => deleteExperience(exp)} className="h-7 px-2 text-xs text-ink-weak hover:text-terra">删除</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {mergedExperiences.length === 0 && <div className="py-10 text-center text-sm text-ink-secondary">暂无经历数据</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    {renameItem && (
      <div className="modal-backdrop" onClick={() => setRenameItem(null)}>
        <div className="modal modal-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-line p-6">
            <h2 className="font-serif text-lg font-semibold">重命名</h2>
            <button onClick={() => setRenameItem(null)} className="btn-ghost -m-2 h-8 w-8 p-0 text-lg">×</button>
          </div>
          <div className="p-6 space-y-5">
            <label>
              <span className="text-sm text-ink-secondary">简历名称</span>
              <input
                className="input mt-2"
                value={renameInput}
                autoFocus
                onChange={(e) => setRenameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doRename()}
              />
            </label>
          </div>
          <div className="flex justify-end gap-3 border-t border-line p-6">
            <button onClick={() => setRenameItem(null)} className="btn-ghost">取消</button>
            <button onClick={doRename} className="btn-primary">确定</button>
          </div>
        </div>
      </div>
    )}

    <ResumeImportModal open={showImport} loading={loading} error={error} onClose={() => !loading && setShowImport(false)} onFilesSelected={importFiles} onTextSubmit={importText} />
    <ResumePreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
  </div>;
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => <div className="card p-4"><p className="text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-secondary">{label}</p></div>;
const Tab: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => <button onClick={onClick} className={`border-b-2 px-4 pb-3 text-sm ${active ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary'}`}>{children}</button>;

export default ResumeManagerView;
