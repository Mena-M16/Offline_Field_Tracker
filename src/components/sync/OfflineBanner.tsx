import React from 'react';
import { WifiOff, ShieldCheck, RefreshCw } from 'lucide-react';
import { useSync } from '../../context/SyncContext';

export const OfflineBanner: React.FC = () => {
  const { isOnline, isSimulatedOffline, pendingCount, triggerSyncNow, isSyncing } = useSync();

  if (isOnline) return null;

  return (
    <aside aria-label="Offline status banner" className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-medium border-b border-amber-600 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 text-slate-950" />
          <span>
            <strong>{isSimulatedOffline ? 'Simulated Offline Mode' : 'No Internet Connection'}</strong> — You can safely create reports, snap photos, and save drafts. All records are saved in local IndexedDB.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 font-semibold text-[11px] bg-amber-600/30 px-2 py-0.5 rounded">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero Data Loss Guaranteed
          </span>
          {pendingCount > 0 && (
            <span className="text-[11px] font-bold bg-slate-950 text-amber-400 px-2 py-0.5 rounded">
              {pendingCount} Pending Sync
            </span>
          )}
          {isOnline && (
            <button
              onClick={() => triggerSyncNow()}
              disabled={isSyncing}
              className="px-2.5 py-1 bg-slate-950 text-white rounded font-bold hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
