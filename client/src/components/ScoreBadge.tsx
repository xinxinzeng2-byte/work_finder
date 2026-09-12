import React from 'react';

interface Props {
  score: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export const ScoreBadge: React.FC<Props> = ({ score, size = 'md' }) => {
  if (score === null) {
    return <div className="flex items-center gap-3"><div className={`${size === 'sm' ? 'w-12 h-12 text-base' : size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-16 h-16 text-xl'} rounded-full bg-gray-100 flex items-center justify-center font-serif font-semibold text-ink-weak`}>—</div><div><div className="text-sm font-medium text-ink-weak">无可评分项</div><div className="text-xs text-ink-weak">请查看硬性条件</div></div></div>;
  }
  const color = score >= 75 ? 'text-moss' : score >= 50 ? 'text-terra' : 'text-ink-weak';
  const bg = score >= 75 ? 'bg-mossLight' : score >= 50 ? 'bg-terra-light' : 'bg-gray-100';
  const label = score >= 75 ? '推荐投递' : score >= 50 ? '可以考虑' : '不太匹配';

  const sizeClass = {
    sm: 'w-12 h-12 text-base',
    md: 'w-16 h-16 text-xl',
    lg: 'w-20 h-20 text-2xl',
  }[size];

  return (
    <div className="flex items-center gap-3">
      <div className={`${sizeClass} ${bg} rounded-full flex flex-col items-center justify-center font-serif font-semibold ${color}`}>
        <span>{score}</span>
        {size !== 'sm' && <span className="text-[10px] font-sans font-normal opacity-80">分</span>}
      </div>
      <div>
        <div className={`text-sm font-medium ${color}`}>{label}</div>
        <div className="text-xs text-ink-weak">满分 100</div>
      </div>
    </div>
  );
};
