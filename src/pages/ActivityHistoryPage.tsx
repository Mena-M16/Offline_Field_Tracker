import React, { useState, useEffect } from 'react';
import {
  Clock,
  Search,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { reportRepository } from '../db/reportRepository';
import type { ActivityLog } from '../types';

interface ActivityHistoryPageProps {
  onNavigate: (page: string, reportId?: string | number) => void;
}

export const ActivityHistoryPage: React.FC<ActivityHistoryPageProps> = ({ onNavigate }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const allLogs = await reportRepository.getAllActivityLogs();
      setLogs(allLogs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesEvent = eventTypeFilter === 'all' ? true : log.event_type === eventTypeFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      log.actor_name.toLowerCase().includes(q) ||
      (log.details.note ? log.details.note.toLowerCase().includes(q) : false) ||
      (log.details.error ? log.details.error.toLowerCase().includes(q) : false) ||
      log.event_type.toLowerCase().includes(q);
    return matchesEvent && matchesSearch;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 pb-24 md:pb-12">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <Clock className="w-3.5 h-3.5" />
          <span>Immutable Audit Log</span>
          <span>·</span>
          <span>Security &amp; Compliance</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
          System Activity History
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Complete, unalterable trail of report submissions, sync cycles, technician assignments, and status transitions.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by actor name, notes, or event..."
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="all">All Event Types</option>
          <option value="report_created">Report Created</option>
          <option value="report_saved_offline">Report Saved Offline</option>
          <option value="report_submitted">Report Submitted</option>
          <option value="sync_started">Sync Started</option>
          <option value="sync_completed">Sync Completed</option>
          <option value="sync_failed">Sync Failed</option>
          <option value="report_assigned">Report Assigned</option>
          <option value="status_changed">Status Changed</option>
          <option value="report_rejected">Report Rejected</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        {loading ? (
          <div className="py-10 text-center text-xs text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
            Loading audit events...
          </div>
        ) : filteredLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-8">No activity matching filters.</p>
        ) : (
          <div className="space-y-4">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {log.actor_name}
                    </span>
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                      [{log.actor_role}]
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {log.event_type.replace('_', ' ')}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>

                {log.details.note && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {log.details.note}
                  </p>
                )}

                {log.details.new_status && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">
                    Status transitioned: <strong>{log.details.previous_status || 'initial'}</strong> → <strong>{log.details.new_status}</strong>
                  </p>
                )}

                {log.details.assigned_to && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Assigned crew: <strong>{log.details.assignee_name || log.details.assigned_to}</strong>
                  </p>
                )}

                {log.details.error && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    Sync error: {log.details.error}
                  </p>
                )}

                {log.details.reason && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    Rejection reason: {log.details.reason}
                  </p>
                )}

                <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Report Reference: {log.report_id}</span>
                  {log.client_id && (
                    <button
                      onClick={() => onNavigate('report-detail', log.client_id)}
                      className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                    >
                      <span>Inspect Report</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
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
