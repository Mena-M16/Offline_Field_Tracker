import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useSync, type SyncNotification } from '../../context/SyncContext';

export const ToastNotifications: React.FC = () => {
  const { notifications, dismissNotification } = useSync();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map((n: SyncNotification) => {
        let icon = <Info className="w-4 h-4 text-sky-500 shrink-0" />;
        let borderClass = 'border-sky-200 dark:border-sky-900 bg-sky-50/90 dark:bg-sky-950/90';

        if (n.type === 'success') {
          icon = <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
          borderClass = 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/95 dark:bg-emerald-950/95';
        } else if (n.type === 'warning') {
          icon = <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
          borderClass = 'border-amber-200 dark:border-amber-900 bg-amber-50/95 dark:bg-amber-950/95';
        } else if (n.type === 'error') {
          icon = <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
          borderClass = 'border-rose-200 dark:border-rose-900 bg-rose-50/95 dark:bg-rose-950/95';
        }

        return (
          <div
            key={n.id}
            className={`pointer-events-auto p-3 rounded-xl border shadow-lg backdrop-blur-md flex items-start gap-2.5 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${borderClass}`}
          >
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{n.title}</p>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">{n.timestamp}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">{n.message}</p>
            </div>
            <button
              onClick={() => dismissNotification(n.id)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 -mr-1 -mt-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
