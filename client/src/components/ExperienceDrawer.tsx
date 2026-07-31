import React, { useState } from 'react';
import type { ParsedResume, AtomicSkill, AtomicExperience } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  resume: ParsedResume | null;
  onResumeUpdate: (resume: ParsedResume) => void;
}

export const ExperienceDrawer: React.FC<Props> = ({ open, onClose, resume, onResumeUpdate }) => {
  const [tab, setTab] = useState<'skills' | 'experiences'>('experiences');
  const [editingExp, setEditingExp] = useState<string | null>(null);
  const [addingSkill, setAddingSkill] = useState(false);

  if (!open) return null;

  const handleDeleteSkill = (id: string) => {
    if (!resume) return;
    const updated = { ...resume, skills: resume.skills.filter((s) => s.id !== id) };
    onResumeUpdate(updated);
  };

  const handleDeleteExperience = (id: string) => {
    if (!resume) return;
    const updated = { ...resume, experiences: resume.experiences.filter((e) => e.id !== id) };
    onResumeUpdate(updated);
  };

  const handleAddSkill = (skill: Omit<AtomicSkill, 'id'>) => {
    if (!resume) return;
    const newSkill: AtomicSkill = { ...skill, id: `skill_${Date.now()}` };
    const updated = { ...resume, skills: [...resume.skills, newSkill] };
    onResumeUpdate(updated);
    setAddingSkill(false);
  };

  const handleEditExperience = (id: string, achievements: string[]) => {
    if (!resume) return;
    const updated = {
      ...resume,
      experiences: resume.experiences.map((e) =>
        e.id === id ? { ...e, achievements } : e
      ),
    };
    onResumeUpdate(updated);
    setEditingExp(null);
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* 抽屉 */}
      <div className="relative ml-auto w-full max-w-md bg-canvas h-full overflow-y-auto shadow-card animate-fade-in">
        {/* 头部 */}
        <div className="sticky top-0 bg-canvas border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-serif font-semibold">经历库</h2>
            {resume && (
              <p className="text-xs text-ink-weak mt-0.5">
                {resume.skills.length} 个能力 · {resume.experiences.length} 段经历
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-ink-weak hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!resume ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-ink-secondary">还没有经历库</p>
            <p className="text-xs text-ink-weak mt-1">关闭抽屉后导入简历即可建立</p>
          </div>
        ) : (
          <div className="px-6 py-6">
            {/* 基本信息 */}
            {resume.basicInfo && (resume.basicInfo.name || resume.basicInfo.education) && (
              <div className="mb-6 pb-6 border-b border-line">
                {resume.basicInfo.name && (
                  <p className="font-serif text-base font-medium">{resume.basicInfo.name}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary mt-1">
                  {resume.basicInfo.education && <span>学历：{resume.basicInfo.education}</span>}
                  {resume.basicInfo.yearsOfExperience != null && resume.basicInfo.yearsOfExperience > 0 && (
                    <span>工作年限：{resume.basicInfo.yearsOfExperience}年</span>
                  )}
                  {resume.basicInfo.city && <span>城市：{resume.basicInfo.city}</span>}
                </div>
              </div>
            )}

            {/* 标签切换 */}
            <div className="flex gap-1 mb-6 border-b border-line">
              <button
                onClick={() => setTab('experiences')}
                className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'experiences'
                    ? 'border-terra text-terra'
                    : 'border-transparent text-ink-secondary hover:text-ink'
                }`}
              >
                经历（{resume.experiences.length}）
              </button>
              <button
                onClick={() => setTab('skills')}
                className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'skills'
                    ? 'border-terra text-terra'
                    : 'border-transparent text-ink-secondary hover:text-ink'
                }`}
              >
                能力（{resume.skills.length}）
              </button>
            </div>

            {/* 经历列表 */}
            {tab === 'experiences' && (
              <div className="space-y-4">
                {resume.experiences.map((exp) => (
                  <ExperienceCard
                    key={exp.id}
                    exp={exp}
                    editing={editingExp === exp.id}
                    onEdit={() => setEditingExp(exp.id)}
                    onCancelEdit={() => setEditingExp(null)}
                    onSaveEdit={(achievements) => handleEditExperience(exp.id, achievements)}
                    onDelete={() => handleDeleteExperience(exp.id)}
                  />
                ))}
              </div>
            )}

            {/* 能力列表 */}
            {tab === 'skills' && (
              <div className="space-y-4">
                {addingSkill ? (
                  <AddSkillForm onAdd={handleAddSkill} onCancel={() => setAddingSkill(false)} />
                ) : (
                  <button
                    onClick={() => setAddingSkill(true)}
                    className="w-full text-sm text-terra hover:text-terra-hover border border-dashed border-terra-border rounded-[6px] py-2 transition-colors"
                  >
                    + 添加能力
                  </button>
                )}
                {resume.skills.map((skill) => (
                  <SkillCard key={skill.id} skill={skill} onDelete={() => handleDeleteSkill(skill.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// 经历卡片
const ExperienceCard: React.FC<{
  exp: AtomicExperience;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (achievements: string[]) => void;
  onDelete: () => void;
}> = ({ exp, editing, onEdit, onCancelEdit, onSaveEdit, onDelete }) => {
  const [editText, setEditText] = useState(exp.achievements.join('\n'));

  if (editing) {
    return (
      <div className="bg-paper border border-line rounded-[8px] p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <span className="font-serif font-medium text-sm">{exp.company}</span>
            <span className="text-ink-secondary text-xs ml-2">{exp.role}</span>
          </div>
          <span className="text-xs text-ink-weak">{exp.period}</span>
        </div>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="textarea h-32 text-xs"
          placeholder="每行一条成就"
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onSaveEdit(editText.split('\n').filter((s) => s.trim()))}
            className="btn-primary text-xs h-8 px-4"
          >
            保存
          </button>
          <button onClick={onCancelEdit} className="btn-ghost text-xs h-8 px-4">
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-paper border border-line rounded-[8px] p-4 group">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="font-serif font-medium text-sm">{exp.company}</span>
          <span className="text-ink-secondary text-xs ml-2">{exp.role}</span>
        </div>
        <span className="text-xs text-ink-weak">{exp.period}</span>
      </div>
      {exp.achievements.length > 0 && (
        <ul className="space-y-1">
          {exp.achievements.map((a, i) => (
            <li key={i} className="text-xs text-ink-secondary flex items-start gap-2">
              <span className="text-terra mt-0.5">·</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="text-xs text-ink-weak hover:text-terra transition-colors">
          编辑
        </button>
        <button onClick={onDelete} className="text-xs text-ink-weak hover:text-terra transition-colors">
          删除
        </button>
      </div>
    </div>
  );
};

// 能力卡片
const SkillCard: React.FC<{ skill: AtomicSkill; onDelete: () => void }> = ({ skill, onDelete }) => {
  return (
    <div className="bg-paper border border-line rounded-[8px] p-3 group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{skill.name}</span>
            <span className="text-[11px] text-ink-weak bg-canvas px-2 py-0.5 rounded">{skill.level}</span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">{skill.evidence}</p>
          <span className="inline-block text-[11px] text-ink-weak mt-1">{skill.category}</span>
        </div>
        <button
          onClick={onDelete}
          className="text-ink-weak hover:text-terra transition-colors opacity-0 group-hover:opacity-100"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// 添加能力表单
const AddSkillForm: React.FC<{
  onAdd: (skill: Omit<AtomicSkill, 'id'>) => void;
  onCancel: () => void;
}> = ({ onAdd, onCancel }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('熟悉');
  const [evidence, setEvidence] = useState('');

  return (
    <div className="bg-paper border border-terra-border rounded-[8px] p-4 space-y-3">
      <div>
        <label className="label">能力名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="如：数据分析" />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">分类</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="input" placeholder="如：技术" />
        </div>
        <div className="flex-1">
          <label className="label">熟练度</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="input">
            <option>了解</option>
            <option>熟悉</option>
            <option>精通</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">来源说明</label>
        <input value={evidence} onChange={(e) => setEvidence(e.target.value)} className="input" placeholder="哪段经历体现了这个能力" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => name.trim() && onAdd({ name: name.trim(), category: category || '其他', level, evidence: evidence || '' })}
          className="btn-primary text-xs h-8 px-4"
        >
          添加
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs h-8 px-4">
          取消
        </button>
      </div>
    </div>
  );
};
