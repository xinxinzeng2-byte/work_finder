import React from 'react';
import type { ResumeItem } from '../utils/storage';
import { downloadResume, resumeToHtml } from '../utils/resumeExport';

interface Props {
  item: ResumeItem | null;
  onClose: () => void;
}

export const ResumePreviewModal: React.FC<Props> = ({ item, onClose }) => {
  if (!item) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
    <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-paper shadow-card animate-fade-in" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="min-w-0"><h2 className="truncate font-serif text-xl font-semibold">预览：{item.name}</h2><p className="mt-1 text-xs text-ink-secondary">{item.type === 'customized' ? '定制简历' : '原始简历'} · 可下载为 HTML 文件</p></div>
        <div className="ml-4 flex shrink-0 items-center gap-3"><button onClick={() => void downloadResume(item)} className="btn-primary h-9 px-4 text-xs">下载{item.sourceFileData ? '原文件' : ''}</button><button onClick={onClose} className="text-ink-weak transition-colors hover:text-ink" aria-label="关闭简历预览"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
      </header>
      <iframe title={`预览${item.name}`} srcDoc={resumeToHtml(item)} sandbox="" className="min-h-0 flex-1 bg-canvas" />
    </div>
  </div>;
};

export default ResumePreviewModal;
