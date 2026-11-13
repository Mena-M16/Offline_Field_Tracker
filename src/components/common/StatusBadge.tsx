import React from 'react';
import type { ReportStatus, ReportPriority, SyncStatus } from '../../types';

interface StatusIndicatorProps {
  status: ReportStatus;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const map: Record<ReportStatus, { label: string; textClass: string; icon: string }> = {
    draft: { label: 'Draft', textClass: 'text-slate-500 dark:text-slate-400', icon: '○' },
    submitted: { label: 'Submitted', textClass: 'text-sky-600 dark:text-sky-400 font-semibold', icon: '●' },
    assigned: { label: 'Assigned', textClass: 'text-amber-600 dark:text-amber-400 font-semibold', icon: '◆' },
    in_progress: { label: 'In Progress', textClass: 'text-indigo-600 dark:text-indigo-400 font-semibold', icon: '▲' },
    resolved: { label: 'Resolved', textClass: 'text-emerald-600 dark:text-emerald-400 font-semibold', icon: '✓' },
    rejected: { label: 'Rejected', textClass: 'text-rose-600 dark:text-rose-400 font-semibold', icon: '✕' },
  };

  const item = map[status] || { label: status, textClass: 'text-slate-500', icon: '·' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${item.textClass}`}>
      <span aria-hidden="true" className="text-[10px]">{item.icon}</span>
      <span>{item.label}</span>
    </span>
  );
};

interface PriorityIndicatorProps {
  priority: ReportPriority;
}

export const PriorityIndicator: React.FC<PriorityIndicatorProps> = ({ priority }) => {
  const map: Record<ReportPriority, { label: string; textClass: string }> = {
    low: { label: 'Low Priority', textClass: 'text-slate-500 dark:text-slate-400' },
    medium: { label: 'Medium Priority', textClass: 'text-blue-600 dark:text-blue-400 font-medium' },
    high: { label: 'High Priority', textClass: 'text-amber-600 dark:text-amber-400 font-semibold' },
    critical: { label: 'Critical Priority', textClass: 'text-rose-600 dark:text-rose-400 font-bold' },
  };

  const item = map[priority] || { label: priority, textClass: 'text-slate-500' };

  return (
    <span className={`text-xs uppercase tracking-wider ${item.textClass}`}>
      {item.label}
    </span>
  );
};

interface SyncIndicatorProps {
  status: SyncStatus;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({ status }) => {
  const map: Record<SyncStatus, { label: string; textClass: string }> = {
    draft: { label: 'Local Draft', textClass: 'text-slate-400' },
    pending: { label: 'Pending Sync', textClass: 'text-amber-600 dark:text-amber-400 font-semibold' },
    synchronizing: { label: 'Synchronizing...', textClass: 'text-sky-600 dark:text-sky-400 font-semibold animate-pulse' },
    synchronized: { label: 'Synchronized', textClass: 'text-emerald-600 dark:text-emerald-400 font-medium' },
    failed: { label: 'Sync Failed', textClass: 'text-rose-600 dark:text-rose-400 font-semibold' },
  };

  const item = map[status] || { label: status, textClass: 'text-slate-400' };

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono tabular-nums ${item.textClass}`}>
      <span>·</span>
      <span>{item.label}</span>
    </span>
  );
};
