import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  MapPin,
  User,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  RefreshCw,
  ExternalLink,
  FileEdit,
  Volume2,
} from 'lucide-react';
import { reportRepository } from '../db/reportRepository';
import { updateReportStatus } from '../api/reports';
import type { LocalReport, ReportStatus, ActivityLog, AuditEventType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { StatusIndicator, PriorityIndicator, SyncIndicator } from '../components/common/StatusBadge';
import { GeoMapCard } from '../components/common/GeoMapCard';
import { StatusTimeline } from '../components/reports/StatusTimeline';

interface ReportDetailPageProps {
  reportId: string | number;
  onNavigate: (page: string, reportId?: string | number) => void;
}

const ASSIGNEE_OPTIONS = [
  { id: 'worker-samuel-id', label: 'Samuel Kiprop (North Ward Rapid Crew)' },
  { id: 'crew-electrical-2', label: 'Electrical Specialist Unit 2' },
  { id: 'crew-civil-earthworks', label: 'Civil Earthworks & Culvert Team' },
];

export const ReportDetailPage: React.FC<ReportDetailPageProps> = ({ reportId, onNavigate }) => {
  const { user, role } = useAuth();
  const { isOnline, isSyncing, triggerSyncNow } = useSync();

  const [report, setReport] = useState<LocalReport | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [targetStatus, setTargetStatus] = useState<ReportStatus | ''>('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>(ASSIGNEE_OPTIONS[0].id);
  const [rejectionReason, setRejectionReason] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSuccess, setStatusSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const loadReportDetails = async () => {
    try {
      setLoading(true);
      const found = await reportRepository.getReportByIdOrClientId(reportId);
      if (found) {
        setReport(found);
        const relatedLogs = await reportRepository.getLogsForReport(found.client_id, found.server_id);
        setLogs(relatedLogs);
      } else {
        setReport(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportDetails();
  }, [reportId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-xs text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
        Loading report telemetry...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Report Not Found</h2>
        <p className="text-xs text-slate-500">The requested report record could not be loaded from local storage.</p>
        <button
          onClick={() => onNavigate(role === 'coordinator' ? 'coord-dashboard' : 'worker-dashboard')}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 text-slate-950"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const getPermittedTransitions = (current: ReportStatus): ReportStatus[] => {
    switch (current) {
      case 'submitted':
        return ['assigned', 'rejected'];
      case 'assigned':
        return ['in_progress', 'rejected'];
      case 'in_progress':
        return ['resolved', 'rejected'];
      case 'draft':
        return ['submitted'];
      default:
        return [];
    }
  };

  const permitted = getPermittedTransitions(report.status);

  const handleExecuteTransition = async () => {
    if (!targetStatus) return;
    setStatusError('');
    setStatusSuccess('');

    if (targetStatus === 'rejected') {
      if (!rejectionReason.trim() || rejectionReason.trim().length < 10) {
        setStatusError('A detailed explanation is required for rejection (minimum 10 characters).');
        return;
      }
    }

    const chosenAssignee = ASSIGNEE_OPTIONS.find((a) => a.id === selectedAssigneeId) || ASSIGNEE_OPTIONS[0];

    setIsUpdating(true);
    try {
      const now = new Date().toISOString();
      const newVersion = (report.version || 1) + 1;

      if (isOnline && report.server_id) {
        const apiRes = await updateReportStatus(
          report.server_id,
          targetStatus,
          targetStatus === 'assigned' ? chosenAssignee.id : undefined,
          targetStatus === 'rejected' ? rejectionReason.trim() : undefined,
          report.version || 1,
          statusNote.trim() || undefined
        );

        if (!apiRes.success && apiRes.error?.code === 'VERSION_CONFLICT') {
          setStatusError(apiRes.error.message);
          return;
        }
      }

      if (report.id) {
        await reportRepository.updateReportFields(report.id, {
          status: targetStatus,
          assigned_to: targetStatus === 'assigned' ? chosenAssignee.id : report.assigned_to,
          assignee_name: targetStatus === 'assigned' ? chosenAssignee.label : report.assignee_name,
          rejection_reason: targetStatus === 'rejected' ? rejectionReason.trim() : report.rejection_reason,
          version: newVersion,
          updated_at: now,
        });
      }

      let eventType: AuditEventType = 'status_changed';
      if (targetStatus === 'assigned') eventType = 'report_assigned';
      if (targetStatus === 'rejected') eventType = 'report_rejected';

      const newLog: ActivityLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        report_id: report.server_id || `client-${report.client_id}`,
        client_id: report.client_id,
        actor_id: user?.id || 'coord-elena-id',
        actor_name: user?.full_name || 'Elena Morales',
        actor_role: role,
        event_type: eventType,
        details: {
          previous_status: report.status,
          new_status: targetStatus,
          assigned_to: targetStatus === 'assigned' ? chosenAssignee.id : undefined,
          assignee_name: targetStatus === 'assigned' ? chosenAssignee.label : undefined,
          reason: targetStatus === 'rejected' ? rejectionReason.trim() : undefined,
          note: statusNote.trim() || undefined,
        },
        created_at: now,
      };

      await reportRepository.addActivityLog(newLog);

      setTargetStatus('');
      setRejectionReason('');
      setStatusNote('');
      setStatusSuccess(`Report status transitioned to ${targetStatus.replace('_', ' ').toUpperCase()}.`);
      await loadReportDetails();
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update report status.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 pb-28 md:pb-16">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => onNavigate(role === 'coordinator' ? 'all-reports' : 'my-reports')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to {role === 'coordinator' ? 'All Reports' : 'My Reports'}</span>
        </button>

        <div className="flex items-center gap-2">
          {report.status === 'draft' && report.id && (
            <button
              onClick={() => onNavigate('create-report', report.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
            >
              <FileEdit className="w-3.5 h-3.5" />
              <span>Edit Draft</span>
            </button>
          )}

          {(report.sync_status === 'pending' || report.sync_status === 'failed') && (
            <button
              onClick={async () => {
                await triggerSyncNow();
                await loadReportDetails();
              }}
              disabled={!isOnline || isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 text-xs font-bold disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{report.sync_status === 'failed' ? 'Retry Sync' : 'Sync Now'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityIndicator priority={report.priority} />
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs font-medium text-slate-500 capitalize">
              {report.category.replace('_', ' ')}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <SyncIndicator status={report.sync_status} />
          </div>

          <div className="flex items-center gap-2">
            <StatusIndicator status={report.status} />
            <span className="text-xs font-mono text-slate-400">
              v{report.version}
            </span>
          </div>
        </div>

        <StatusTimeline currentStatus={report.status} />

        {report.sync_status === 'failed' && report.last_sync_error && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
            <span>
              <strong>Sync Error:</strong> {report.last_sync_error} (Attempt #{report.sync_attempts})
            </span>
            <button
              onClick={async () => {
                await triggerSyncNow();
                await loadReportDetails();
              }}
              disabled={!isOnline || isSyncing}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold shrink-0 disabled:opacity-40"
            >
              Retry
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
            {report.title}
          </h1>

          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {report.description}
          </p>
        </div>

        {report.status === 'rejected' && report.rejection_reason && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-400">
              <XCircle className="w-4 h-4" />
              <span>Report Rejected by Operations Coordinator</span>
            </div>
            <p className="text-rose-600 dark:text-rose-300">{report.rejection_reason}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
              <MapPin className="w-4 h-4 text-amber-500" />
              <span>Location Telemetry</span>
            </div>
            <p className="text-xs font-medium text-slate-900 dark:text-white">
              {report.location_name}
            </p>
            {report.latitude !== null && report.longitude !== null && (
              <div className="text-[11px] font-mono text-slate-500 space-y-0.5 pt-1">
                <div>Latitude: <strong className="text-slate-800 dark:text-slate-200">{report.latitude}</strong></div>
                <div>Longitude: <strong className="text-slate-800 dark:text-slate-200">{report.longitude}</strong></div>
                <div>GPS Accuracy: ±{report.accuracy_meters || 4.0}m</div>
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
              <User className="w-4 h-4 text-amber-500" />
              <span>Personnel &amp; Assignment</span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div>
                Reported by: <strong className="text-slate-900 dark:text-white">{report.creator_name}</strong>
              </div>
              <div>
                Assigned technician: <strong className="text-amber-600 dark:text-amber-400">{report.assignee_name || 'Unassigned'}</strong>
              </div>
              <div className="text-[11px] font-mono text-slate-500 pt-1">
                Timestamp: {new Date(report.reported_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <GeoMapCard
            latitude={report.latitude}
            longitude={report.longitude}
            locationName={report.location_name}
            accuracyMeters={report.accuracy_meters}
          />
        </div>

        {report.audio_url && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
              <Volume2 className="w-4 h-4 text-amber-500" />
              <span>Attached Field Voice Memo</span>
            </div>
            <audio controls src={report.audio_url} className="w-full h-9" />
          </div>
        )}

        {report.photo_url && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-amber-500" />
                <span>Site Photographic Evidence</span>
              </span>
              <button
                onClick={() => setShowPhotoModal(true)}
                className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                <span>Expand Fullscreen</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div
              onClick={() => setShowPhotoModal(true)}
              className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-80 cursor-pointer bg-slate-950 group"
            >
              <img
                src={report.photo_url}
                alt={report.title}
                className="w-full h-80 object-cover group-hover:scale-102 transition-transform duration-300"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <span>Client UUID: {report.client_id}</span>
          <span>Server ID: {report.server_id || 'Pending Server Assignment'}</span>
        </div>
      </div>

      {showPhotoModal && report.photo_url && (
        <div
          onClick={() => setShowPhotoModal(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={report.photo_url}
              alt={report.title}
              className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <p className="text-center text-xs text-slate-300 mt-2 font-mono">
              Click anywhere to dismiss
            </p>
          </div>
        </div>
      )}

      {role === 'coordinator' && (
        <div className="p-6 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/30 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Coordinator Lifecycle State Machine
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current status: <strong className="uppercase">{report.status.replace('_', ' ')}</strong>. Transitioning advances optimistic lock version.
              </p>
            </div>
          </div>

          {statusSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {statusSuccess}
            </div>
          )}

          {permitted.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400">
              This report has reached terminal state (<strong className="capitalize">{report.status}</strong>). Further state transitions are locked.
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {permitted.map((nextSt) => (
                  <button
                    key={nextSt}
                    type="button"
                    onClick={() => {
                      setTargetStatus(nextSt);
                      setStatusError('');
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      targetStatus === nextSt
                        ? nextSt === 'rejected'
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500'
                          : 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-slate-900 dark:text-white ring-2 ring-amber-500'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Transition to {nextSt.replace('_', ' ')}
                      </span>
                      {targetStatus === nextSt && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {nextSt === 'assigned' && 'Designate technician or response crew'}
                      {nextSt === 'in_progress' && 'Confirm on-site diagnostic/repair work underway'}
                      {nextSt === 'resolved' && 'Certify verified restoration of service'}
                      {nextSt === 'rejected' && 'Reject duplicate or invalid report (reason required)'}
                      {nextSt === 'submitted' && 'Promote draft to submitted queue'}
                    </p>
                  </button>
                ))}
              </div>

              {targetStatus === 'assigned' && (
                <div className="space-y-1.5 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    Assign Technician / Crew *
                  </label>
                  <select
                    value={selectedAssigneeId}
                    onChange={(e) => setSelectedAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {ASSIGNEE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetStatus === 'rejected' && (
                <div className="space-y-1.5 p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900">
                  <label className="block text-xs font-bold text-rose-700 dark:text-rose-300">
                    Mandatory Rejection Explanation (min 10 characters) *
                  </label>
                  <textarea
                    rows={2}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Specify why report cannot proceed (e.g. duplicate of #101, outside municipal jurisdiction, already rectified)..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              )}

              {targetStatus && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Optional coordinator audit note..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                  {statusError && <p className="text-xs text-rose-500 font-medium">{statusError}</p>}

                  <button
                    onClick={handleExecuteTransition}
                    disabled={isUpdating}
                    className="px-5 py-2.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isUpdating ? 'Recording State Change...' : `Confirm & Commit Status to ${targetStatus.replace('_', ' ').toUpperCase()}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Immutable Activity History &amp; Audit Log
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {logs.length} event(s) recorded
          </span>
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No activity history yet.</p>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {logs.map((log) => (
              <div key={log.id} className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-amber-500 flex items-center justify-center" />

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <strong className="text-slate-900 dark:text-white">{log.actor_name}</strong>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-mono">
                      ({log.actor_role})
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {log.event_type.replace('_', ' ')}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>

                  {log.details.note && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 mt-1">
                      {log.details.note}
                    </p>
                  )}

                  {log.details.reason && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900 mt-1">
                      Reason: {log.details.reason}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
