import React from 'react';

export type WorkflowStep = 'import-resume' | 'extract-skills' | 'input-job' | 'ai-match';

const STEPS: Array<{ id: WorkflowStep; label: string }> = [
  { id: 'import-resume', label: '导入简历' },
  { id: 'extract-skills', label: 'AI提取能力' },
  { id: 'input-job', label: '输入岗位' },
  { id: 'ai-match', label: 'AI匹配分析' },
];

interface Props {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  onStepClick?: (step: WorkflowStep) => void;
}

export const WorkflowProgressBar: React.FC<Props> = ({ currentStep, completedSteps, onStepClick }) => (
  <div className="border-b border-line bg-paper px-8 py-5">
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow">JOB TAILORING WORKFLOW</p>
          <h2 className="font-serif text-xl font-semibold text-ink">岗位分析工作区</h2>
        </div>
        <span className="text-xs text-ink-weak">第 {STEPS.findIndex((step) => step.id === currentStep) + 1} / {STEPS.length} 步</span>
      </div>
      <div className="flex items-start">
        {STEPS.map((step, index) => {
          const completed = completedSteps.includes(step.id);
          const current = currentStep === step.id;
          return <React.Fragment key={step.id}>
            <button disabled={!completed && !current} onClick={() => onStepClick?.(step.id)} className="flex min-w-0 flex-1 flex-col items-center gap-2 disabled:cursor-default">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition ${completed ? 'border-terra bg-terra text-white' : current ? 'border-terra bg-terra-light text-terra ring-4 ring-terra-light/40' : 'border-line bg-canvas text-ink-weak'}`}>{completed ? '✓' : index + 1}</span>
              <span className={`text-center text-xs ${current || completed ? 'font-medium text-ink' : 'text-ink-weak'}`}>{step.label}</span>
            </button>
            {index < STEPS.length - 1 && <span className={`mt-4 h-px flex-1 ${completed ? 'bg-terra' : 'bg-line'}`} />}
          </React.Fragment>;
        })}
      </div>
    </div>
  </div>
);

export default WorkflowProgressBar;
