import React, { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const features = [
  { title: '简历管理', detail: '导入和管理原始简历，并为目标岗位生成、管理定制简历。' },
  { title: '经历与能力库', detail: '从原始简历中解析、合并能力与经历，并保留内容来源。' },
  { title: '岗位匹配分析', detail: '对照岗位描述与已有经历，查看匹配分数、优势项和差距项。' },
  { title: '求职准备', detail: '根据能力缺口补录经历，继续生成定制简历与面试准备内容。' },
];

const steps = [
  '在设置页填入 DeepSeek API Key',
  '导入简历（PDF/HTML）',
  '复制 Boss 直聘岗位 JD 到平台',
  '查看匹配分数与差异点',
  '根据缺口补录经历',
  '生成针对该岗位的定制简历',
];

export const AboutModal: React.FC<Props> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-paper shadow-card animate-fade-in"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex items-start justify-between border-b border-line px-7 py-5">
        <div>
          <p className="eyebrow">ABOUT</p>
          <h2 id="about-title" className="mt-2 font-serif text-2xl font-semibold text-ink">关于本站</h2>
          <p className="mt-1 text-sm text-ink-secondary">了解 AI 求职助手的服务对象、主要能力与使用方式。</p>
        </div>
        <button type="button" onClick={onClose} className="ml-4 p-1 text-ink-weak transition-colors hover:text-ink" aria-label="关闭关于本站弹窗">
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-7 py-6">
        <section aria-labelledby="about-audience">
          <h3 id="about-audience" className="font-serif text-lg font-semibold text-ink">目标群体与核心目标</h3>
          <div className="mt-3 rounded-lg border border-line bg-canvas px-5 py-4 text-sm leading-7 text-ink-secondary">
            <p>面向使用 Boss 直聘、猎聘等招聘平台的积极求职者，包括多岗位投递者、岗位评估者和面试备战者。</p>
            <p className="mt-2">帮助求职者根据目标岗位快速优化求职材料，减少逐个 JD 手工修改的时间和关键信息遗漏。</p>
          </div>
        </section>

        <section aria-labelledby="about-features">
          <h3 id="about-features" className="font-serif text-lg font-semibold text-ink">核心功能</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {features.map((feature, index) => <article key={feature.title} className="rounded-lg border border-line p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terra-light text-xs font-semibold text-terra">{index + 1}</span>
                <h4 className="text-sm font-semibold text-ink">{feature.title}</h4>
              </div>
              <p className="mt-2 pl-10 text-xs leading-6 text-ink-secondary">{feature.detail}</p>
            </article>)}
          </div>
        </section>

        <section aria-labelledby="about-flow">
          <h3 id="about-flow" className="font-serif text-lg font-semibold text-ink">使用流程</h3>
          <ol className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {steps.map((step, index) => <li key={step} className="flex items-start gap-3 text-sm text-ink-secondary">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-terra-border bg-terra-light text-xs font-medium text-terra">{index + 1}</span>
              <span className="pt-0.5 leading-6">{step}</span>
            </li>)}
          </ol>
        </section>

        <section aria-labelledby="about-source">
          <h3 id="about-source" className="font-serif text-lg font-semibold text-ink">开源地址</h3>
          <a
            href="https://github.com/xinxinzeng2-byte/work_finder"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-sm text-ink-secondary transition hover:border-terra hover:text-terra"
          >
            <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.02c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.57-.3-5.28-1.29-5.28-5.7 0-1.26.45-2.3 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.16 1.18a10.95 10.95 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.77.11 3.06.74.8 1.19 1.84 1.19 3.1 0 4.43-2.71 5.4-5.29 5.69.42.36.79 1.07.79 2.16v3.04c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
            </svg>
            <span className="min-w-0 flex-1 break-all">github.com/xinxinzeng2-byte/work_finder</span>
            <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-8 8M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
        </section>
      </div>

      <footer className="flex justify-end border-t border-line px-7 py-4">
        <button type="button" onClick={onClose} className="btn-ghost h-9 px-5 text-xs">关闭</button>
      </footer>
    </section>
  </div>;
};

export default AboutModal;
