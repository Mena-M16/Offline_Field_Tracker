import React, { useEffect, useState } from 'react';
import {
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  WifiOff,
  Wifi,
  ChevronRight,
  MapPin,
  FileEdit,
  Trash2,
  FileText,
  Database,
} from 'lucide-react';
import { reportRepository } from '../db/reportRepository';
import type { LocalReport } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { StatusIndicator, PriorityIndicator, SyncIndicator } from '../components/common/StatusBadge';

interface WorkerDashboardProps {
  onNavigate: (page: string, reportId?: string | number) => void;
}

export const WorkerDashboard: React.FC<WorkerDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const {
    isOnline,
    isSimulatedOffline,
    toggleSimulateOffline,
    pendingCount,
    failedCount,
    isSyncing,
    triggerSyncNow,
    lastSyncTime,
  } = useSync();
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [drafts, setDrafts] = useState<LocalReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const loadWorkerData = async () => {
    try {
      setLoading(true);
      const allReports = await reportRepository.getReportsByCreator(user?.id || 'worker-samuel-id');
      const regularReports = allReports.filter((r) => r.status !== 'draft');
      const draftReports = allReports.filter((r) => r.status === 'draft');

      setReports(regularReports);
      setDrafts(draftReports);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkerData();
  }, [user, pendingCount, failedCount]);

  const handleConfirmDeleteDraft = async (id: number) => {
    await reportRepository.deleteReport(id);
    setConfirmDeleteId(null);
    await loadWorkerData();
  };

  const totalReports = reports.length + drafts.length;
  const synchronizedCount = reports.filter((r) => r.sync_status === 'synchronized').length;
  const totalInProgress = reports.filter((r) => r.status === 'in_progress' || r.status === 'assigned').length;
  const totalResolved = reports.filter((r) => r.status === 'resolved').length;
  const totalWaitingSync = pendingCount + failedCount;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Field Operations Center</span>
            <span>·</span>
            <span>{user?.organization}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Welcome back, {user?.full_name}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('create-report')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-sm transition-all active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create New Report</span>
          </button>
        </div>
      </div>

      {/* Network & Local Queue Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isOnline ? 'Online Verified Connectivity' : 'Offline Mode Active'}
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {isOnline ? 'Direct central sync available' : 'IndexedDB persistence enabled'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
                {isOnline
                  ? `Central server reachable. ${
                      totalWaitingSync > 0
                        ? `${totalWaitingSync} report(s) waiting in local queue.`
                        : 'All local reports are synchronized.'
                    }`
                  : 'No active connection. Reports, photos, voice memos, and GPS telemetry will be stored safely on this device until connectivity returns.'}
              </p>
              {lastSyncTime && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                  Last successful sync: {new Date(lastSyncTime).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
            <button
              onClick={toggleSimulateOffline}
              className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                isSimulatedOffline
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
            >
              {isSimulatedOffline ? 'Resume Live Network' : 'Simulate Offline Signal Drop'}
            </button>

            <button
              onClick={() => triggerSyncNow()}
              disabled={!isOnline || isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Pending Queue'}</span>
              {totalWaitingSync > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] bg-slate-950 text-amber-400 rounded-full tabular-nums">
                  {totalWaitingSync}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Reports</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : totalReports}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Including drafts</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Drafts</span>
            <FileEdit className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : drafts.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Device-only drafts</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Sync</span>
            <RefreshCw className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-2">
            {loading ? '—' : totalWaitingSync}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {failedCount > 0 ? `${failedCount} failed retry` : 'Saved in IndexedDB'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Synchronized</span>
            <Database className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : synchronizedCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Server confirmed</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">In Progress</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : totalInProgress}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Assigned &amp; active</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : totalResolved}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Verified repairs</p>
        </div>
      </div>

      {/* Local Drafts Drawer */}
      {drafts.length > 0 && (
        <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Unfinished Local Drafts ({drafts.length})
              </h3>
            </div>
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              Only stored on this device
            </span>
          </div>

          <div className="space-y-2">
            {drafts.map((d) => (
              <div
                key={d.client_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">{d.title || 'Untitled Draft'}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>{d.location_name || 'No location set'}</span>
                    <span>·</span>
                    <span className="font-mono">{new Date(d.updated_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onNavigate('create-report', d.id)}
                    className="px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 rounded-md hover:bg-amber-200"
                  >
                    Resume
                  </button>
                  {d.id && confirmDeleteId === d.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleConfirmDeleteDraft(d.id!)}
                        className="px-2 py-1 text-[11px] font-bold bg-rose-600 text-white rounded-md hover:bg-rose-700"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => d.id && setConfirmDeleteId(d.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                      title="Delete Draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Field Reports Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            My Recent Issue Submissions
          </h2>
          <button
            onClick={() => onNavigate('my-reports')}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
          >
            <span>View All ({reports.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((n) => (
              <div key={n} className="h-36 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">No reports submitted yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Create your first infrastructure report using the "Create New Report" button above. Works even when disconnected.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reports.slice(0, 6).map((report) => (
              <div
                key={report.client_id}
                onClick={() => onNavigate('report-detail', report.id || report.client_id)}
                className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 cursor-pointer transition-all shadow-sm flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <PriorityIndicator priority={report.priority} />
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <StatusIndicator status={report.status} />
                      <SyncIndicator status={report.sync_status} />
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
                    {report.title}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {report.description}
                  </p>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 truncate max-w-[200px]">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{report.location_name}</span>
                  </span>
                  <span className="font-mono tabular-nums shrink-0">
                    {new Date(report.reported_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
