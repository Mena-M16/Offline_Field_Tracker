import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  HardHat,
  Database,
  Trash2,
  Download,
  Save,
} from 'lucide-react';
import { db, seedInitialDatabaseIfEmpty } from '../db';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';

interface ProfilePageProps {
  onNavigate: (page: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { user, role, isSupabaseAuth, isDemoMode, switchRole, updateProfile } = useAuth();
  const { pendingCount, failedCount, isOnline } = useSync();

  const [reportCount, setReportCount] = useState<number>(0);
  const [logCount, setLogCount] = useState<number>(0);
  const [storageEstimate, setStorageEstimate] = useState<string>('0 KB');
  const [resetMessage, setResetMessage] = useState<string>('');
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  const [fullNameInput, setFullNameInput] = useState<string>(user?.full_name || '');
  const [phoneInput, setPhoneInput] = useState<string>(user?.phone_number || '');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileSavedMsg, setProfileSavedMsg] = useState<string>('');
  const [profileErrorMsg, setProfileErrorMsg] = useState<string>('');

  useEffect(() => {
    setFullNameInput(user?.full_name || '');
    setPhoneInput(user?.phone_number || '');
  }, [user]);

  const loadDiagnostics = async () => {
    const rc = await db.reports.count();
    const lc = await db.activityLogs.count();
    setReportCount(rc);
    setLogCount(lc);

    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedKb = Math.round((estimate.usage || 0) / 1024);
      setStorageEstimate(`${usedKb} KB`);
    } else {
      setStorageEstimate('Available');
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSavedMsg('');
    setProfileErrorMsg('');
    if (fullNameInput.trim().length < 2) {
      setProfileErrorMsg('Display name must be at least 2 characters.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const result = await updateProfile({
        full_name: fullNameInput.trim(),
        phone_number: phoneInput.trim(),
      });
      if (!result.success) {
        setProfileErrorMsg(result.error || 'Unable to save profile changes.');
        return;
      }
      setProfileSavedMsg(
        isSupabaseAuth
          ? 'Profile updated in Supabase database.'
          : 'Profile preferences saved locally.'
      );
      setTimeout(() => setProfileSavedMsg(''), 3000);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleConfirmResetData = async () => {
    await db.reports.clear();
    await db.activityLogs.clear();
    await seedInitialDatabaseIfEmpty();
    await loadDiagnostics();
    setConfirmReset(false);
    setResetMessage('Database re-seeded successfully with clean demonstration records.');
    setTimeout(() => setResetMessage(''), 4000);
  };

  const exportDiagnosticsJSON = async () => {
    const allReports = await db.reports.toArray();
    const allLogs = await db.activityLogs.toArray();
    const payload = {
      timestamp: new Date().toISOString(),
      online: isOnline,
      user,
      reports: allReports,
      logs: allLogs,
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fieldtrack_diagnostics_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            User Profile &amp; Local Storage
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage your credentials and inspect on-device IndexedDB persistence.
          </p>
        </div>

        <button
          onClick={() => onNavigate(role === 'coordinator' ? 'coord-dashboard' : 'worker-dashboard')}
          className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 self-start"
        >
          Back to Dashboard
        </button>
      </div>

      {/* User Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-amber-500/20 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-amber-500" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{user?.full_name}</h2>
                <span className="text-[10px] font-mono uppercase font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded">
                  {role.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user?.email}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user?.organization}</p>
            </div>
          </div>

          {isDemoMode && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Switch Demo Persona
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => switchRole('field_worker')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                    role === 'field_worker'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <HardHat className="w-3.5 h-3.5" />
                  Field Worker
                </button>
                <button
                  onClick={() => switchRole('coordinator')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                    role === 'coordinator'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Coordinator
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={handleSaveProfile} className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={fullNameInput}
              onChange={(e) => setFullNameInput(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
              Field Contact Phone
            </label>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+254 712 345 678"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={isSavingProfile}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 hover:bg-slate-800 flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingProfile ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </form>
        {profileSavedMsg && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{profileSavedMsg}</p>
        )}
        {profileErrorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{profileErrorMsg}</p>
        )}
      </div>

      {/* IndexedDB Persistence Telemetry */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-amber-500" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              IndexedDB Storage &amp; Telemetry (Dexie.js)
            </h3>
            <p className="text-xs text-slate-500">
              Zero-data-loss architecture: local client stores reports and binary media indefinitely.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">Total Stored Reports</span>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
              {reportCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">Activity Log Entries</span>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
              {logCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">Estimated Disk Usage</span>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
              {storageEstimate}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">Queued / Failed Sync</span>
            <div className="text-xl font-bold font-mono text-amber-500 mt-1">
              {pendingCount + failedCount}
            </div>
          </div>
        </div>

        {resetMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            {resetMessage}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <button
            onClick={exportDiagnosticsJSON}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Diagnostic JSON</span>
          </button>

          {confirmReset ? (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <span className="text-xs text-rose-700 dark:text-rose-300 font-semibold px-1">
                Clear local data &amp; re-seed?
              </span>
              <button
                onClick={handleConfirmResetData}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
              >
                Confirm Reset
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset to Clean Demo State</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
