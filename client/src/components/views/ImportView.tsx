import React, { useState, useRef } from 'react';
import { parseResumeFile, parseResumeText } from '../../services/api';
import { saveResume } from '../../utils/storage';
import type { ParsedResume } from '../../types';
import { Loading } from '../Loading';

interface Props {
  onComplete: (resume: ParsedResume) => void;
  existingResume: ParsedResume | null;
}

export const ImportView: React.FC<Props> = ({ onComplete, existingResume }) => {
  const [mode, setMode] = useState<'upload' | 'text'>(existingResume ? 'text' : 'upload');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;
    const validExts = ['.pdf', '.html', '.htm'];
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
    if (!validExts.includes(ext)) {
      setError('仅支持 PDF 和 HTML 文件');
      return;
    }
    setError('');
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleAnalyze = async () => {
    setError('');
    setLoading(true);
    try {
      let result: ParsedResume;
      if (mode === 'upload') {
        if (!file) {
          setError('请先选择简历文件');
          setLoading(false);
          return;
        }
        result = await parseResumeFile(file);
      } else {
        if (!text.trim()) {
          setError('请输入简历文本');
          setLoading(false);
          return;
        }
        result = await parseResumeText(text.trim());
      }
      saveResume(result);
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card animate-fade-in">
        <Loading text="正在解析你的简历..." subtext="AI 正在拆解原子能力和原子经历" />
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      <h2 className="text-xl font-serif font-semibold mb-2">建立经历库</h2>
      <p className="text-sm text-ink-secondary mb-8 leading-relaxed">
        导入你的简历，AI 会把它拆解成一条条「原子能力」和「原子经历」，作为后续匹配和生成的基础。
        建好之后可以随时在右侧抽屉中查看和编辑。
      </p>

      {existingResume && (
        <div className="mb-6 p-3 bg-mossLight border border-moss/30 rounded-[6px] text-sm text-moss">
          已有经历库：{existingResume.skills.length} 个能力、{existingResume.experiences.length} 段经历。重新导入将覆盖现有数据。
        </div>
      )}

      {/* 模式切换 */}
      <div className="flex gap-1 mb-8 border-b border-line">
        {(['upload', 'text'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              mode === m
                ? 'border-terra text-terra'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {m === 'upload' ? '上传文件' : '粘贴文本'}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`upload-zone p-10 ${dragOver ? 'bg-[#f3f0eb]' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.html,.htm"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
          />
          {file ? (
            <div>
              <p className="text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs text-ink-weak mt-1">
                {(file.size / 1024).toFixed(1)} KB · 点击重新选择
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-ink-secondary">点击或拖拽文件到此处</p>
              <p className="text-xs text-ink-weak mt-1">支持 PDF、HTML 格式</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="label">简历文本</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="textarea h-56"
            placeholder="把简历的文字内容粘贴到这里...&#10;&#10;可以从 PDF 里全选复制，或者用大白话描述你的经历"
          />
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-terra-light border border-terra-border rounded-[6px] text-sm text-terra">
          {error}
        </div>
      )}

      <button onClick={handleAnalyze} className="btn-primary mt-8 w-full">
        开始解析简历
      </button>
    </div>
  );
};
