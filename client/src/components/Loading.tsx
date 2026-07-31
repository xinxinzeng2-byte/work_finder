import React from 'react';

interface Props {
  text?: string;
  subtext?: string;
}

export const Loading: React.FC<Props> = ({ text = 'AI 正在思考中...', subtext }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 border-2 border-terra-border rounded-full"></div>
        <div className="absolute inset-0 border-2 border-terra border-t-transparent rounded-full animate-spin"></div>
      </div>
      <p className="mt-4 text-sm text-ink-secondary font-serif">{text}</p>
      {subtext && <p className="mt-1 text-xs text-ink-weak">{subtext}</p>}
    </div>
  );
};

interface InlineLoadingProps {
  text?: string;
}

export const InlineLoading: React.FC<InlineLoadingProps> = ({ text = '加载中' }) => {
  return (
    <span className="inline-flex items-center gap-2 text-ink-secondary">
      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {text}
    </span>
  );
};
