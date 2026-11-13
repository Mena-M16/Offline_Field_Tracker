import React from 'react';
import { LayoutDashboard, PlusCircle, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';

interface BottomNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentPage, onNavigate }) => {
  const { role, isAuthenticated, isLoading } = useAuth();
  const { pendingCount, failedCount, isSyncing, triggerSyncNow, isOnline } = useSync();

  if (isLoading || !isAuthenticated) return null;

  const totalWaitingSync = pendingCount + failedCount;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe shadow-lg">
      <div className="grid grid-cols-4 items-center h-16 px-2">
        <button
          onClick={() => onNavigate(role === 'coordinator' ? 'coord-dashboard' : 'worker-dashboard')}
          className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
            currentPage === 'worker-dashboard' || currentPage === 'coord-dashboard'
              ? 'text-amber-600 dark:text-amber-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-1">Dashboard</span>
        </button>

        {role === 'field_worker' ? (
          <button
            onClick={() => onNavigate('create-report')}
            className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
              currentPage === 'create-report'
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-1">New Report</span>
          </button>
        ) : (
          <button
            onClick={() => onNavigate('all-reports')}
            className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
              currentPage === 'all-reports'
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-1">Triage</span>
          </button>
        )}

        <button
          onClick={() => onNavigate(role === 'field_worker' ? 'my-reports' : 'activity-history')}
          className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
            currentPage === 'my-reports' || currentPage === 'activity-history'
              ? 'text-amber-600 dark:text-amber-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-1">
            {role === 'field_worker' ? 'My Reports' : 'Audit'}
          </span>
        </button>

        <button
          onClick={() => triggerSyncNow()}
          disabled={!isOnline || isSyncing}
          className="flex flex-col items-center justify-center min-h-[44px] text-slate-500 dark:text-slate-400 relative disabled:opacity-40"
        >
          <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-amber-500' : ''}`} />
          <span className="text-[10px] font-medium tracking-tight mt-1">
            {isSyncing ? 'Syncing' : 'Sync'}
          </span>
          {totalWaitingSync > 0 && (
            <span className="absolute top-1.5 right-6 px-1.5 py-0.2 text-[9px] font-bold bg-amber-500 text-slate-950 rounded-full tabular-nums">
              {totalWaitingSync}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
};
