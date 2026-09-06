import React, { useState } from 'react';
import type { CapabilityDimension, CapabilityDimensionKey, CapabilityRadarResult, MatchDimensionKey, MatchItem } from '../types';

interface Props {
  data?: CapabilityRadarResult;
  items?: MatchItem[];
  selectedDimension?: MatchDimensionKey | 'all';
  onReanalyze?: () => void;
  onDimensionSelect?: (key: CapabilityDimensionKey) => void;
}

const pointAt = (index: number, value: number) => {
  const angle = (-90 + index * 60) * Math.PI / 180;
  const distance = 97 * Math.max(0, Math.min(100, value)) / 100;
  return { x: 225 + Math.cos(angle) * distance, y: 140 + Math.sin(angle) * distance };
};
const points = (values: number[]) => values.map((value, index) => { const p = pointAt(index, value); return `${p.x},${p.y}`; }).join(' ');
const labelPositions = [[225, 18], [366, 81], [366, 202], [225, 263], [84, 202], [84, 81]];
const dimensionOrder: CapabilityDimensionKey[] = ['skill', 'experience', 'project', 'achievement', 'education', 'industry'];
const statusOrder = ['missing', 'partial', 'matched'] as const;
const statusLabels = { missing: '未发现', partial: '部分匹配', matched: '已匹配' };
const statusSymbols = { missing: '○', partial: '△', matched: '✓' };

const RadarChart: React.FC<{ dimensions: CapabilityDimension[]; selected: string; onSelect: (key: CapabilityDimensionKey) => void }> = ({ dimensions, selected, onSelect }) => (
  <svg viewBox="0 0 450 280" aria-label="简历能力与岗位要求六维雷达图" className="analysis-radar-chart">
    {[100, 75, 50, 25].map(level => <polygon key={level} points={points(dimensions.map(() => level))} fill={level === 100 ? '#fcfbf9' : 'none'} stroke="#e8e4df" />)}
    {dimensions.map((dimension, index) => { const p = pointAt(index, 100); return <line key={dimension.key} x1="225" y1="140" x2={p.x} y2={p.y} stroke="#e8e4df" />; })}
    {[25, 50, 75, 100].map(level => <text key={level} x="231" y={144 - 97 * level / 100} fontSize="9" fill="#aaa49c">{level}</text>)}
    <polygon points={points(dimensions.map(item => item.jobScore))} fill="#96958f08" stroke="#92928b" strokeWidth="1.8" strokeDasharray="5 5" />
    <polygon points={points(dimensions.map(item => item.resumeScore))} fill="#c45a3c20" stroke="#c45a3c" strokeWidth="2.4" />
    {dimensions.map((item, index) => {
      const p = pointAt(index, item.resumeScore);
      const [x, y] = labelPositions[index];
      const active = item.key === selected;
      return <g key={item.key}>
        <circle cx={p.x} cy={p.y} r={active ? 5 : 3} fill="#c45a3c" stroke="white" strokeWidth="1.5" />
        <g role="button" aria-label={`选择${item.label}维度`} aria-pressed={active} tabIndex={0} onClick={() => onSelect(item.key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.key); } }} className="analysis-axis-button">
          <rect x={x - 44} y={y - 16} width="88" height="32" rx="6" fill={active ? '#f7e9e0' : 'transparent'} />
          <text x={x} y={y + 5} textAnchor="middle" fill={active ? '#c45a3c' : '#77736e'} fontSize="14" fontWeight={active ? 600 : 400}>{item.label}</text>
        </g>
      </g>;
    })}
  </svg>
);

export const CapabilityRadar: React.FC<Props> = ({ data, items, selectedDimension, onReanalyze, onDimensionSelect }) => {
  const [internalSelected, setInternalSelected] = useState<CapabilityDimensionKey>('skill');
  const selected = selectedDimension ?? internalSelected;
  const valid = data && data.dimensions.length === 6 && dimensionOrder.every(key => data.dimensions.some(item => item.key === key));
  const select = (key: CapabilityDimensionKey) => { setInternalSelected(key); onDimensionSelect?.(key); };
  if (!valid) return <section className="analysis-radar-panel"><h2>能力雷达图</h2><div className="analysis-radar-empty"><p>当前历史记录缺少真实六维数据</p><small>重新分析后可查看雷达图与维度能力分数。</small>{onReanalyze && <button type="button" onClick={onReanalyze} className="btn-primary mt-4">重新分析</button>}</div></section>;
  const dimensions = dimensionOrder.map(key => data.dimensions.find(item => item.key === key)!);
  const dimension = dimensions.find(item => item.key === selected);
  const details = (items ? items.filter(item => selected === 'all' || (selected === 'other' ? !dimensionOrder.includes(item.dimension as CapabilityDimensionKey) : item.dimension === selected)).map(item => ({ ...item, status: item.status || (item.matched ? 'matched' as const : 'missing' as const) })) : dimension?.details || []);
  return <section className="analysis-radar-panel" aria-labelledby="capability-radar-title">
    <div className="analysis-radar-heading"><h2 id="capability-radar-title">能力雷达图</h2><div className="analysis-radar-legend"><span><i />简历能力</span><span><i />岗位能力</span></div></div>
    <div className="analysis-radar-visual">
      <RadarChart dimensions={dimensions} selected={selected} onSelect={select} />
      <p className="analysis-chart-caption">点击维度名称，查看能力分数与匹配概况</p>
    </div>
    <div className="analysis-dimension-detail" aria-live="polite">
      <div className="analysis-dimension-heading"><h3><small>{dimension ? '当前维度' : '当前范围'}</small>{dimension?.label || (selected === 'other' ? '其他要求' : '全部要求')}</h3><span>{dimension ? `${String(dimensions.indexOf(dimension) + 1).padStart(2, '0')} / 06` : `${details.length} 项要求`}</span></div>
      {dimension ? <div className="analysis-metric-row"><div><strong>{dimension.resumeScore}<small>/ 100</small></strong><span>简历能力</span></div><div><strong>{dimension.jobScore}<small>/ 100</small></strong><span>岗位能力</span></div><div><strong>{dimension.weight}<small>%</small></strong><span>岗位权重</span></div></div> : <p className="analysis-scope-note">{selected === 'other' ? '其他要求单独保留，不参与六维雷达评分。' : '包含六个维度及其他要求，选择维度查看对应分数。'}</p>}
      <div className="analysis-status-counts">{statusOrder.map(status => <span key={status} className={`analysis-${status}`}>{statusSymbols[status]} {statusLabels[status]} {details.filter(item => item.status === status).length}</span>)}</div>
    </div>
    {onReanalyze && <button type="button" onClick={onReanalyze} className="analysis-reanalyze">重新分析 ↗</button>}
  </section>;
};
