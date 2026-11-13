import React, { useState, useEffect } from 'react';
import {
  Search,
  PlusCircle,
  MapPin,
  Calendar,
  AlertCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { reportRepository } from '../db/reportRepository';
import type { LocalReport } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { StatusIndicator, PriorityIndicator, SyncIndicator } from '../components/common/StatusBadge';

interface MyReportsPageProps {
  onNavigate: (page: string, reportId?: string | number) => void;
}

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const MyReportsPage: React.FC<MyReportsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { pendingCount, failedCount, triggerSyncNow, isSyncing, isOnline } = useSync();

  const [reports, setReports] = useState<LocalReport[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    try {
      setLoading(true);
      const userReports = await reportRepository.getReportsByCreator(user?.id || 'worker-samuel-id');
      setReports(userReports);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [user, pendingCount, failedCount]);

  const waitingSyncCount = pendingCount + failedCount;

  const filteredReports = reports
    .filter((r) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.location_name.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'pending_sync'
          ? r.sync_status === 'pending' || r.sync_status === 'failed'
          : r.status === statusFilter;

      const matchesPriority = priorityFilter === 'all' ? true : r.priority === priorityFilter;
      const matchesCategory = categoryFilter === 'all' ? true : r.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
      }
      if (sortBy === 'priority') {
        return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      }
      return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
    });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            My Field Issue Reports
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tracking all locally saved drafts, pending offline queues, and confirmed submissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {waitingSyncCount > 0 && (
            <button
              onClick={() => triggerSyncNow()}
              disabled={!isOnline || isSyncing}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync {waitingSyncCount} Queued</span>
            </button>
          )}

          <button
            onClick={() => onNavigate('create-report')}
            className="flex items-center gap-2 px-4 py-2 text-xs font-extrabold rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Report</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title, equipment description, or landmark..."
              className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">Highest Priority</option>
          </select>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
          {[
            { key: 'all', label: 'All' },
            { key: 'pending_sync', label: `Pending Sync (${waitingSyncCount})` },
            { key: 'draft', label: 'Drafts' },
            { key: 'submitted', label: 'Submitted' },
            { key: 'assigned', label: 'Assigned' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'resolved', label: 'Resolved' },
            { key: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
          Loading your field reports...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No reports match your filters</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search query, status tabs, or priority filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <div
              key={report.client_id}
              onClick={() => onNavigate('report-detail', report.id || report.client_id)}
              className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/60 cursor-pointer transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-4">
                {report.photo_url ? (
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <img
                      src={report.photo_url}
                      alt={report.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-400 font-mono text-[10px]">
                    No Photo
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <PriorityIndicator priority={report.priority} />
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-xs text-slate-500 capitalize">
                      {report.category.replace('_', ' ')}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                    {report.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{report.location_name}</span>
                    </span>
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{new Date(report.reported_at).toLocaleDateString()}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800 gap-2 shrink-0">
                <StatusIndicator status={report.status} />
                <SyncIndicator status={report.sync_status} />
                {report.sync_status === 'failed' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerSyncNow();
                    }}
                    disabled={!isOnline || isSyncing}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold disabled:opacity-40"
                  >
                    Retry Sync
                  </button>
                )}
                <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 group-hover:text-amber-600 transition-colors">
                  <span>View Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
