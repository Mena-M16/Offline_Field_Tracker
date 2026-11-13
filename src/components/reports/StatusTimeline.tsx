import React from 'react';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import type { ReportStatus } from '../../types';

interface StatusTimelineProps {
  currentStatus: ReportStatus;
}

const MAIN_STEPS: { key: ReportStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

export const StatusTimeline: React.FC<StatusTimelineProps> = ({ currentStatus }) => {
  const isRejected = currentStatus === 'rejected';
  const activeIndex = MAIN_STEPS.findIndex((s) => s.key === currentStatus);

  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Report Lifecycle Workflow
        </span>
        {isRejected && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
            <XCircle className="w-3.5 h-3.5" />
            <span>Rejected</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {MAIN_STEPS.map((step, index) => {
          const isCompleted = !isRejected && activeIndex > index;
          const isCurrent = !isRejected && activeIndex === index;

          return (
            <div
              key={step.key}
              className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${
                isCurrent
                  ? 'border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white font-bold'
                  : isCompleted
                  ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-400'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : isCurrent ? (
                <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300 dark:text-slate-700 shrink-0" />
              )}
              <span className="truncate">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
