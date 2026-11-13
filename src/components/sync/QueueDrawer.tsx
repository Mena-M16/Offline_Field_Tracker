import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  Database,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { reportRepository } from '../../db/reportRepository';
import type { LocalReport } from '../../types';
import { useSync } from '../../context/SyncContext';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectReport: (id: string | number) => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  onSelectReport,
}) => {
  const { isOnline, isSyncing, triggerSyncNow, lastSyncTime } = useSync();
  const [reports, setReports] = useState<LocalReport[]>([]);

  const loadQueue = async () => {
    const all = await reportRepository.getAllReports();
    setReports(all);
  };

  useEffect(() => {
    if (isOpen) {
      loadQueue();
    }
  }, [isOpen, isSyncing]);

  if (!isOpen) return null;

  const pending = reports.filter((r) => r.sync_status === 'pending' || r.sync_status === 'failed');
  const synchronized = reports.filter((r) => r.sync_status === 'synchronized');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                IndexedDB Sync Queue
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {isOnline ? 'Online Verified' : 'Offline Mode (Local Only)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Controls Banner */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">Queue State:</span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
              {pending.length} Waiting · {synchronized.length} Synced
            </span>
          </div>

          <button
            onClick={() => triggerSyncNow()}
            disabled={!isOnline || isSyncing || pending.length === 0}
            className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Draining Sync Queue...' : 'Drain Pending Reports Now'}</span>
          </button>

          {lastSyncTime && (
            <p className="text-[10px] text-center text-slate-400 font-mono">
              Last sync attempt: {new Date(lastSyncTime).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Queue Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {reports.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-8">
              No reports stored in local IndexedDB.
            </p>
          ) : (
            reports.map((item) => {
              const isPending = item.sync_status === 'pending' || item.sync_status === 'failed';
              return (
                <div
                  key={item.client_id}
                  onClick={() => {
                    onClose();
                    onSelectReport(item.id || item.client_id);
                  }}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all hover:border-amber-500/60 ${
                    item.sync_status === 'failed'
                      ? 'bg-rose-500/5 border-rose-500/30 text-slate-900 dark:text-white'
                      : isPending
                      ? 'bg-amber-500/5 border-amber-500/30 text-slate-900 dark:text-white'
                      : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[180px]">
                      {item.client_id}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                        item.sync_status === 'synchronized'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : item.sync_status === 'failed'
                          ? 'text-rose-600 dark:text-rose-400'
                          : item.sync_status === 'pending' || item.sync_status === 'synchronizing'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {item.sync_status}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 dark:text-white truncate">
                    {item.title}
                  </h4>

                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span>{item.location_name}</span>
                    <span className="font-mono">Attempts: {item.sync_attempts}</span>
                  </div>

                  {item.last_sync_error && (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-rose-500 font-mono truncate">
                        Error: {item.last_sync_error}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerSyncNow();
                        }}
                        disabled={!isOnline || isSyncing}
                        className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold shrink-0 disabled:opacity-40"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
