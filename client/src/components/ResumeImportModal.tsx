import React, { useRef, useState } from 'react';

interface Props {
  open: boolean;
  loading: boolean;
  error: string;
  onClose: () => void;
  onFilesSelected: (files: File[]) => Promise<void>;
  onTextSubmit: (text: string) => Promise<void>;
}

export const ResumeImportModal: React.FC<Props> = ({ open, loading, error, onClose, onFilesSelected, onTextSubmit }) => {
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFiles = async (files: File[]) => {
    if (files.length === 0 || loading) return;
    await onFilesSelected(files);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleTextSubmit = async () => {
    if (!text.trim() || loading) return;
    await onTextSubmit(text.trim());
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
    <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-paper shadow-card animate-fade-in" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-line px-7 py-5">
        <div>
          <h2 className="font-serif text-xl font-semibold text-ink">导入简历</h2>
          <p className="mt-1 text-xs text-ink-secondary">上传文件或粘贴文本，AI 会自动提取能力和经历。</p>
        </div>
        <button onClick={onClose} disabled={loading} className="text-ink-weak transition-colors hover:text-ink disabled:opacity-50" aria-label="关闭导入简历弹窗">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex border-b border-line px-7 pt-2">
        <button onClick={() => setActiveTab('file')} className={`border-b-2 px-4 py-3 text-sm ${activeTab === 'file' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary'}`}>上传文件</button>
        <button onClick={() => setActiveTab('text')} className={`border-b-2 px-4 py-3 text-sm ${activeTab === 'text' ? 'border-terra font-medium text-terra' : 'border-transparent text-ink-secondary'}`}>粘贴文本</button>
      </div>

      <div className="px-7 py-6">
        {activeTab === 'file' ? <>
          <label className={`upload-zone flex min-h-[250px] flex-col items-center justify-center px-6 py-8 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
            <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.html,.htm,.txt" className="hidden" onChange={(event) => handleFiles(Array.from(event.target.files || []))} />
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-line bg-paper text-ink-secondary">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0L8 8m4-4l4 4M5 16.5v1A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5v-1" /></svg>
            </span>
            <span className="text-lg font-medium text-ink">点击上传新简历</span>
            <span className="mt-2 text-sm text-ink-secondary">支持 PDF、Word（.docx）、HTML、TXT 格式，可同时选择多份</span>
            <span className="mt-1 text-xs text-ink-weak">AI 会自动合并多份简历的能力和经历，并保留来源</span>
          </label>
        </> : <>
          <label className="label">粘贴简历文本</label>
          <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} className="textarea h-56" placeholder="把简历内容粘贴到这里..." />
          <div className="mt-4 flex justify-end"><button onClick={handleTextSubmit} disabled={loading || !text.trim()} className="btn-primary">{loading ? '解析中...' : '解析并加入简历库'}</button></div>
        </>}
        {error && <div className="mt-4 rounded-lg border border-terra-border bg-terra-light px-4 py-3 text-sm text-terra">{error}</div>}
      </div>

      <div className="flex justify-end border-t border-line px-7 py-4"><button onClick={onClose} disabled={loading} className="btn-ghost h-9 px-4 text-xs">取消</button></div>
    </div>
  </div>;
};

export default ResumeImportModal;
