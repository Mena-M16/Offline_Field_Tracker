import React, { useState, useEffect } from 'react';
import {
  Shield,
  CheckCircle2,
  ChevronRight,
  Layers,
  MapPin,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { reportRepository } from '../db/reportRepository';
import type { ActivityLog, LocalReport } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { PriorityIndicator, StatusIndicator } from '../components/common/StatusBadge';

interface CoordDashboardProps {
  onNavigate: (page: string, reportId?: string | number) => void;
}

export const CoordDashboard: React.FC<CoordDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { pendingCount } = useSync();
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [operationalReports, logs] = await Promise.all([
        reportRepository.getOperationalReports(),
        reportRepository.getAllActivityLogs(),
      ]);
      setReports(operationalReports);
      setRecentLogs(logs.slice(0, 6));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [pendingCount]);

  const submittedReports = reports.filter((r) => r.status === 'submitted');
  const assignedReports = reports.filter((r) => r.status === 'assigned');
  const inProgressReports = reports.filter((r) => r.status === 'in_progress');
  const resolvedReports = reports.filter((r) => r.status === 'resolved');
  const rejectedReports = reports.filter((r) => r.status === 'rejected');
  const criticalReports = reports.filter(
    (r) => r.priority === 'critical' && r.status !== 'resolved' && r.status !== 'rejected'
  );

  const categoryCounts = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  const priorityCounts = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.priority] = (acc[r.priority] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Shield className="w-3.5 h-3.5" />
              Central Operations Room
            </span>
            <span>·</span>
            <span>{user?.organization}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Infrastructure Issue Coordination Center
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('all-reports')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span>Open All Reports ({reports.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500">Total Submitted</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : reports.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Operational field reports</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-medium text-sky-600 dark:text-sky-400">Pending Triage</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : submittedReports.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Awaiting assignment</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Active Work</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : inProgressReports.length + assignedReports.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Assigned &amp; in progress</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Resolved</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {loading ? '—' : resolvedReports.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Repairs completed</p>
        </div>

        <div className="col-span-2 lg:col-span-1 p-4 rounded-xl bg-rose-50/20 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-950/60">
          <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Critical Priority</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-2">
            {loading ? '—' : criticalReports.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Urgent safety &amp; outages</p>
        </div>
      </div>

      {/* Operations Room Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Urgent Triage & Recent Reports (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Urgent Triage &amp; Assignment Queue
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Newly submitted reports requiring technician assignment or validation
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                {submittedReports.length} Unassigned
              </span>
            </div>

            {loading ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                Loading triage queue...
              </div>
            ) : submittedReports.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Triage Queue Clear</h3>
                <p className="text-xs text-slate-500 mt-1">
                  All submitted issues have been assigned to field teams.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {submittedReports.map((report) => (
                  <div
                    key={report.client_id}
                    onClick={() => onNavigate('report-detail', report.id || report.client_id)}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 cursor-pointer transition-all shadow-sm group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <PriorityIndicator priority={report.priority} />
                      <span className="text-[11px] font-mono text-slate-400">
                        Reported {new Date(report.reported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-600 transition-colors">
                      {report.title}
                    </h3>

                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                      {report.description}
                    </p>

                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1 truncate max-w-[240px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{report.location_name}</span>
                      </span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                        Assign Crew <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Operational Reports */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Operational Reports</h3>
              <button
                onClick={() => onNavigate('all-reports')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
              >
                Manage All
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.slice(0, 4).map((rep) => (
                <div
                  key={rep.client_id}
                  onClick={() => onNavigate('report-detail', rep.id || rep.client_id)}
                  className="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{rep.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">{rep.location_name}</p>
                  </div>
                  <StatusIndicator status={rep.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analytics Charts & Recent Activity (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Status & Priority Distribution Charts */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Status &amp; Priority Distribution
              </h3>
              <p className="text-xs text-slate-500">Live workflow and severity breakdown</p>
            </div>

            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">By Lifecycle Status</p>
              {[
                { label: 'Submitted', count: submittedReports.length, color: 'bg-sky-500' },
                { label: 'Assigned', count: assignedReports.length, color: 'bg-amber-500' },
                { label: 'In Progress', count: inProgressReports.length, color: 'bg-indigo-500' },
                { label: 'Resolved', count: resolvedReports.length, color: 'bg-emerald-500' },
                { label: 'Rejected', count: rejectedReports.length, color: 'bg-rose-500' },
              ].map((st) => {
                const pct = reports.length > 0 ? Math.round((st.count / reports.length) * 100) : 0;
                return (
                  <div key={st.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{st.label}</span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {st.count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full ${st.color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">By Priority Level</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'critical', label: 'Critical', cls: 'text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50' },
                  { key: 'high', label: 'High', cls: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50' },
                  { key: 'medium', label: 'Medium', cls: 'text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/50' },
                  { key: 'low', label: 'Low', cls: 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
                ].map((p) => (
                  <div key={p.key} className={`p-2.5 rounded-xl border text-center bg-slate-50/50 dark:bg-slate-800/30 ${p.cls}`}>
                    <div className="text-lg font-bold font-mono tabular-nums">{priorityCounts[p.key] || 0}</div>
                    <div className="text-[10px] font-bold uppercase">{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Category Distribution */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Category Distribution</h3>
              <p className="text-xs text-slate-500">Breakdown of reported civil assets</p>
            </div>

            <div className="space-y-3">
              {[
                { key: 'water_infrastructure', label: 'Water Infrastructure', count: categoryCounts['water_infrastructure'] || 0, color: 'bg-sky-500' },
                { key: 'equipment_damage', label: 'Equipment Damage', count: categoryCounts['equipment_damage'] || 0, color: 'bg-amber-500' },
                { key: 'safety_concern', label: 'Safety Concerns', count: categoryCounts['safety_concern'] || 0, color: 'bg-rose-500' },
                { key: 'service_interruption', label: 'Service Outages', count: categoryCounts['service_interruption'] || 0, color: 'bg-indigo-500' },
                { key: 'maintenance', label: 'Maintenance', count: categoryCounts['maintenance'] || 0, color: 'bg-slate-400' },
              ].map((cat) => {
                const pct = reports.length > 0 ? Math.round((cat.count / reports.length) * 100) : 0;
                return (
                  <div key={cat.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{cat.label}</span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {cat.count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full ${cat.color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Activity</h3>
              </div>
              <button
                onClick={() => onNavigate('activity-history')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
              >
                Full Audit Log
              </button>
            </div>
            <div className="space-y-2.5">
              {recentLogs.map((log) => (
                <div key={log.id} className="text-xs border-l-2 border-amber-500/60 pl-3 py-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{log.actor_name}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 capitalize">
                    {log.event_type.replace('_', ' ')}
                    {log.details.new_status ? ` → ${log.details.new_status}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* SLA Performance Guidelines */}
          <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Coordinator SLA Standards
            </h4>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span>Critical (Water outage / Hazard)</span>
                <span className="font-mono text-rose-400 font-bold">&lt; 2 Hours</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span>High (Transformer / Main leak)</span>
                <span className="font-mono text-amber-400 font-bold">&lt; 8 Hours</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Medium / Low (Maintenance)</span>
                <span className="font-mono text-slate-400 font-bold">&lt; 48 Hours</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
