import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  MapPin,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { reportRepository } from '../db/reportRepository';
import type { LocalReport } from '../types';
import { StatusIndicator, PriorityIndicator, SyncIndicator } from '../components/common/StatusBadge';

interface AllReportsPageProps {
  onNavigate: (page: string, reportId?: string | number) => void;
}

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const AllReportsPage: React.FC<AllReportsPageProps> = ({ onNavigate }) => {
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [syncFilter, setSyncFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    try {
      setLoading(true);
      const operational = await reportRepository.getOperationalReports();
      setReports(operational);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const filtered = reports
    .filter((r) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.location_name.toLowerCase().includes(q) ||
        r.creator_name.toLowerCase().includes(q) ||
        r.client_id.toLowerCase().includes(q) ||
        (r.server_id ? r.server_id.toLowerCase().includes(q) : false);

      const matchesStatus = statusFilter === 'all' ? true : r.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' ? true : r.priority === priorityFilter;
      const matchesCategory = categoryFilter === 'all' ? true : r.category === categoryFilter;
      const matchesSync = syncFilter === 'all' ? true : r.sync_status === syncFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesSync;
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
      }
      if (sortBy === 'priority') {
        return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      }
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status);
      }
      return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
    });

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setSyncFilter('all');
    setSortBy('newest');
  };

  const exportCSV = () => {
    const headers = ['Client ID', 'Server ID', 'Title', 'Category', 'Priority', 'Status', 'Sync Status', 'Location', 'Reported At'];
    const rows = filtered.map((r) => [
      r.client_id,
      r.server_id || 'N/A',
      `"${r.title.replace(/"/g, '""')}"`,
      r.category,
      r.priority,
      r.status,
      r.sync_status,
      `"${r.location_name.replace(/"/g, '""')}"`,
      r.reported_at,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `infrastructure_reports_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            All Field Infrastructure Reports
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Central operations management grid with status workflow controls, sorting, and audit history.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV ({filtered.length})</span>
          </button>
        </div>
      </div>

      {/* Filter, Category, Sync, and Sort Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search ID, title, location, worker..."
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="all">All Categories</option>
          <option value="water_infrastructure">Water Infrastructure</option>
          <option value="equipment_damage">Equipment Damage</option>
          <option value="service_interruption">Service Interruption</option>
          <option value="safety_concern">Safety Concern</option>
          <option value="maintenance">Maintenance</option>
          <option value="other">Other</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="all">All Statuses</option>
          <option value="submitted">Submitted (Triage)</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="newest">Sort: Newest First</option>
          <option value="oldest">Sort: Oldest First</option>
          <option value="priority">Sort: Highest Priority</option>
          <option value="status">Sort: By Status</option>
        </select>
      </div>

      {/* Sync quick filter row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Sync State:</span>
          {['all', 'synchronized', 'pending', 'failed'].map((st) => (
            <button
              key={st}
              onClick={() => setSyncFilter(st)}
              className={`px-2.5 py-1 rounded-lg font-semibold capitalize transition-colors ${
                syncFilter === st
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <span className="font-mono text-slate-500">
          Showing {filtered.length} of {reports.length} reports
        </span>
      </div>

      {/* Data Table / Loading / Empty State */}
      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
          Loading operational reports...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No matching reports found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No operational reports match your current search query or filter selections.
          </p>
          <button
            onClick={resetFilters}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Title &amp; Location</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status &amp; Sync</th>
                  <th className="py-3 px-4">Field Worker</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((report) => (
                  <tr
                    key={report.client_id}
                    onClick={() => onNavigate('report-detail', report.id || report.client_id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {report.server_id || report.client_id.slice(0, 8)}
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white group-hover:text-amber-600 transition-colors line-clamp-1">
                        {report.title}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[220px]">{report.location_name}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 capitalize whitespace-nowrap">
                      {report.category.replace('_', ' ')}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <PriorityIndicator priority={report.priority} />
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <StatusIndicator status={report.status} />
                        <div>
                          <SyncIndicator status={report.sync_status} />
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <div className="font-medium text-slate-900 dark:text-white">{report.creator_name}</div>
                      {report.assignee_name && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">
                          Assigned: {report.assignee_name.split(' ')[0]}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(report.reported_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform">
                        Review <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
