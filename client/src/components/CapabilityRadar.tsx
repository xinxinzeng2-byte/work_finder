import React, { useEffect, useState } from 'react';
import type {
  CapabilityDimension,
  CapabilityDimensionKey,
  CapabilityDimensionV2,
  CapabilityImportance,
  CapabilityRadarResult,
  CapabilityRadarResultV2,
  MatchDimensionKey,
  MatchItem,
} from '../types';

type RadarData = CapabilityRadarResult | CapabilityRadarResultV2;
type RadarDimension = CapabilityDimension | CapabilityDimensionV2;

interface Props {
  data?: RadarData;
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
const importanceLabels: Record<CapabilityImportance, string> = { core: '核心要求', important: '明确要求', normal: '一般要求', bonus: '加分项' };

const isV2Radar = (data: RadarData): data is CapabilityRadarResultV2 => data.scoringVersion === 'radar-v2' && 'totalImportance' in data;
const isV2Dimension = (dimension: RadarDimension): dimension is CapabilityDimensionV2 => 'displayWeight' in dimension;
const displayStatus = (status?: string): typeof statusOrder[number] => status === 'matched' ? 'matched' : status === 'partial' ? 'partial' : 'missing';

const RadarChart: React.FC<{ dimensions: RadarDimension[]; selected: string; onSelect: (key: CapabilityDimensionKey) => void }> = ({ dimensions, selected, onSelect }) => (
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

const Metric: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => <div><strong>{value}</strong><span>{label}</span></div>;

export const CapabilityRadar: React.FC<Props> = ({ data, items, selectedDimension, onReanalyze, onDimensionSelect }) => {
  const [internalSelected, setInternalSelected] = useState<CapabilityDimensionKey>('skill');
  const [calculationOpen, setCalculationOpen] = useState(false);
  const selected = selectedDimension ?? internalSelected;
  useEffect(() => {
    if (!calculationOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCalculationOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [calculationOpen]);
  const valid = data && data.dimensions.length === 6 && dimensionOrder.every(key => data.dimensions.some(item => item.key === key));
  const select = (key: CapabilityDimensionKey) => { setInternalSelected(key); onDimensionSelect?.(key); };
  if (!valid || !data) return <section className="analysis-radar-panel"><h2>能力雷达图</h2><div className="analysis-radar-empty"><p>当前记录缺少完整的真实六维数据</p><small>系统不会猜测或补造分数，请重新分析后查看。</small>{onReanalyze && <button type="button" onClick={onReanalyze} className="btn-primary mt-4">重新分析</button>}</div></section>;
  const v2 = isV2Radar(data);
  const dimensions: RadarDimension[] = dimensionOrder.map(key => data.dimensions.find(item => item.key === key)!);
  const dimension = dimensions.find(item => item.key === selected);
  const details = dimension
    ? dimension.details || []
    : items?.filter(item => selected === 'all' || (selected === 'other' ? !dimensionOrder.includes(item.dimension as CapabilityDimensionKey) : item.dimension === selected)) || [];
  const normalizedStatuses = details.map(item => displayStatus(item.status));
  const displayWeight = dimension ? (isV2Dimension(dimension) ? dimension.displayWeight : dimension.weight) : null;

  return <section className="analysis-radar-panel" aria-labelledby="capability-radar-title">
    <div className="analysis-radar-heading"><h2 id="capability-radar-title">能力雷达图</h2><div className="analysis-radar-legend"><span><i />简历证据强度</span><span><i />岗位要求强度</span></div></div>
    <div className="analysis-radar-visual"><RadarChart dimensions={dimensions} selected={selected} onSelect={select} /><p className="analysis-chart-caption">点击或用键盘选择维度，查看完整文本数据</p></div>
    <div className="analysis-dimension-detail" aria-live="polite">
      <div className="analysis-dimension-heading"><h3><small>{dimension ? '当前维度' : '当前范围'}</small>{dimension?.label || (selected === 'other' ? '其他要求' : '全部要求')}</h3><span>{dimension ? `${String(dimensions.indexOf(dimension) + 1).padStart(2, '0')} / 06` : `${details.length} 项要求`}</span></div>
      {dimension ? <>{!v2 && <div className="analysis-legacy-note">历史记录使用 {data.scoringVersion || 'radar-v1'} 规则，仅展示当时保存的结果。</div>}<div className="analysis-metric-row"><Metric value={<>{dimension.resumeScore}<small>/ 100</small></>} label="简历证据强度" /><Metric value={<>{dimension.jobScore}<small>/ 100</small></>} label="岗位要求强度" /><Metric value={<>{displayWeight ?? '—'}{displayWeight !== null && <small>%</small>}</>} label="岗位权重" /></div></> : <p className="analysis-scope-note">{selected === 'other' ? '其他要求单独保留，不参与六维评分。' : '选择一个维度查看分数、占比和匹配概况。'}</p>}
      <div className="analysis-status-row"><div className="analysis-status-counts">{statusOrder.map(status => <span key={status} className={`analysis-${status}`}>{statusSymbols[status]} {statusLabels[status]} {normalizedStatuses.filter(item => item === status).length}</span>)}</div>{v2 && dimension && isV2Dimension(dimension) && <button type="button" className="analysis-calculation-trigger" onClick={() => setCalculationOpen(true)} aria-haspopup="dialog">计算详情 ↗</button>}</div>
    </div>
    {v2 && dimension && isV2Dimension(dimension) && <div className="analysis-calculation-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-calculation-title" aria-hidden={!calculationOpen} hidden={!calculationOpen} onMouseDown={event => { if (event.target === event.currentTarget) setCalculationOpen(false); }}>
      <div className="analysis-calculation-modal-card">
        <div className="analysis-calculation-modal-heading"><div><p>RADAR-V2</p><h3 id="analysis-calculation-title">{dimension.label} · 计算详情</h3></div><button type="button" className="analysis-calculation-modal-close" onClick={() => setCalculationOpen(false)} aria-label="关闭计算详情">×</button></div>
        <div className="analysis-calculation-summary-body">
          <div className="analysis-calculation-grid"><span>要求项数量</span><strong>{dimension.requirementCount}</strong><span>可评分项数量</span><strong>{dimension.scoreableCount}</strong><span>重要度合计</span><strong>{dimension.importanceTotal}</strong><span>要求覆盖度</span><strong>{dimension.matchScore ?? '—'}{dimension.matchScore !== null ? '%' : ''}</strong><span>对综合分贡献</span><strong>{dimension.contribution} 分</strong></div>
          {dimension.scoreableCount > 0 ? <><p><strong>评分占比 {dimension.displayWeight}%</strong> = 该维度重要度合计 {dimension.importanceTotal} ÷ 全部评分项重要度合计 {data.totalImportance}。</p><p>要求项数量只是条目数，不是权重分母；六维占比由后端计算并在有可评分项时合计 100%。</p><ul>{dimension.details.map(item => <li key={item.id}><span>{item.title || item.requirement}</span><span>{importanceLabels[item.importance]} {item.importanceValue} · 覆盖 {item.coverageScore}% · 贡献 {item.scoreContribution} 分</span></li>)}</ul></> : <p>该维度没有可评分要求，不生成权重公式。</p>}
          <details className="analysis-radar-table"><summary>查看六维完整文本数据</summary><div>{dimensions.map(item => <p key={item.key}><strong>{item.label}</strong><span>岗位 {item.jobScore}</span><span>简历 {item.resumeScore}</span><span>覆盖 {item.matchScore ?? '—'}</span><span>占比 {isV2Dimension(item) ? item.displayWeight : item.weight}%</span></p>)}</div></details>
        </div>
      </div>
    </div>}
    {onReanalyze && <button type="button" onClick={onReanalyze} className="analysis-reanalyze">重新分析 ↗</button>}
  </section>;
};
