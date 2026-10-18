import React from 'react';
import type { ResumeItem } from '../utils/storage';
import { downloadResume, downloadResumeHtml, downloadResumePdf, resumeToHtml } from '../utils/resumeExport';
import PortfolioRenderer from './PortfolioRenderer';

interface Props {
  item: ResumeItem | null;
  onClose: () => void;
}

export const ResumePreviewModal: React.FC<Props> = ({ item, onClose }) => {
  if (!item) return null;
  const portfolioDocument = item.targetJob?.portfolioDocument;
  const portfolioThemeId = item.targetJob?.portfolioThemeId || 'clean-professional';
  const isOriginal = item.type === 'original';
  const sourceFormat = `${item.sourceMimeType || ''} ${item.fileName || ''}`.toLowerCase();
  const isPdf = sourceFormat.includes('pdf');
  const isHtml = sourceFormat.includes('html') || /\.html?$/i.test(item.fileName || '');
  const isText = sourceFormat.includes('text/plain') || /\.txt$/i.test(item.fileName || '');
  const canPreviewSource = Boolean(item.sourceFileData && (isPdf || isHtml || isText));
  const subtitle = isOriginal
    ? canPreviewSource ? `原始简历 · 按原文件格式预览${item.fileName ? ` · ${item.fileName}` : ''}` : '原始简历 · 当前没有可在浏览器中原样预览的源文件'
    : '定制简历 · 支持 HTML 与 PDF';

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
    <div className="flex h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-paper shadow-card animate-fade-in" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="min-w-0"><h2 className="truncate font-serif text-xl font-semibold">预览：{item.name}</h2><p className="mt-1 truncate text-xs text-ink-secondary">{subtitle}</p></div>
        <div className="ml-4 flex shrink-0 items-center gap-2">{isOriginal
          ? <button onClick={() => void downloadResume(item)} className="btn-primary h-9 px-3 text-xs">下载原文件</button>
          : <><button onClick={() => downloadResumeHtml(item)} className="btn-ghost h-9 px-3 text-xs">HTML</button><button onClick={() => downloadResumePdf(item)} className="btn-primary h-9 px-3 text-xs">PDF</button></>}
          <button onClick={onClose} className="ml-1 text-ink-weak transition-colors hover:text-ink" aria-label="关闭简历预览"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
      </header>
      {isOriginal
        ? canPreviewSource
          ? isPdf
            ? <iframe title={`原文件预览${item.name}`} src={item.sourceFileData} className="min-h-0 flex-1 bg-canvas" />
            : <iframe title={`原文件预览${item.name}`} src={item.sourceFileData} sandbox="" className="min-h-0 flex-1 bg-white" />
          : <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas p-8 text-center"><div><div className="text-4xl text-ink-weak">▤</div><h3 className="mt-4 font-serif text-lg font-semibold">无法在浏览器中原样预览</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-ink-secondary">{item.sourceFileData ? 'Word 文件需要使用本地 Office 或 WPS 打开，才能保持原始版式。' : '这份历史记录没有保存上传时的原文件，无法还原原始版式。请重新导入原文件。'}</p>{item.sourceFileData && <button onClick={() => void downloadResume(item)} className="btn-primary mt-5">下载原文件</button>}</div></div>
        : portfolioDocument
        ? <div className="min-h-0 flex-1 overflow-auto bg-canvas"><PortfolioRenderer document={portfolioDocument} themeId={portfolioThemeId} /></div>
        : <iframe title={`预览${item.name}`} srcDoc={resumeToHtml(item)} sandbox="" className="min-h-0 flex-1 bg-canvas" />}
    </div>
  </div>;
};

export default ResumePreviewModal;
