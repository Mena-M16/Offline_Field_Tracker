import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Sun,
  Moon,
  Shield,
  HardHat,
  UserCheck,
  ChevronDown,
  LogOut,
  SlidersHorizontal,
  Database,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { useTheme } from '../../context/ThemeContext';

interface TopNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenQueue?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ currentPage, onNavigate, onOpenQueue }) => {
  const { user, role, isAuthenticated, isDemoMode, isLoading, switchRole, logout } = useAuth();
  const { isOnline, isSimulatedOffline, toggleSimulateOffline, isSyncing, pendingCount, failedCount, triggerSyncNow } = useSync();
  const { theme, toggleTheme } = useTheme();
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const totalWaitingSync = pendingCount + failedCount;

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('landing')}
              className="flex items-center gap-2.5 text-left group focus:outline-none"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black shadow-sm group-hover:bg-amber-400 transition-colors">
                <HardHat className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white block leading-tight">
                  FieldTrack
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block leading-none">
                  Offline Issue System
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation Links */}
          {!isLoading && isAuthenticated && (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <button
                onClick={() => onNavigate(role === 'coordinator' ? 'coord-dashboard' : 'worker-dashboard')}
                className={`hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 ${
                  currentPage === 'worker-dashboard' || currentPage === 'coord-dashboard'
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : ''
                }`}
              >
                Dashboard
              </button>

              {role === 'field_worker' && (
                <>
                  <button
                    onClick={() => onNavigate('create-report')}
                    className={`hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 ${
                      currentPage === 'create-report' ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''
                    }`}
                  >
                    Create Report
                  </button>
                  <button
                    onClick={() => onNavigate('my-reports')}
                    className={`hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 ${
                      currentPage === 'my-reports' ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''
                    }`}
                  >
                    My Reports
                  </button>
                </>
              )}

              {role === 'coordinator' && (
                <button
                  onClick={() => onNavigate('all-reports')}
                  className={`hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 ${
                    currentPage === 'all-reports' ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''
                  }`}
                >
                  Triage &amp; All Reports
                </button>
              )}

              <button
                onClick={() => onNavigate('activity-history')}
                className={`hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 ${
                  currentPage === 'activity-history' ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''
                }`}
              >
                Activity Audit
              </button>
            </nav>
          )}

          {/* Zone 3: Interactive Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={toggleSimulateOffline}
              title={isSimulatedOffline ? 'Click to restore online network' : 'Click to simulate offline field disconnection'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60 hover:bg-rose-100'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>{isSimulatedOffline ? 'Sim Offline' : 'Offline'}</span>
                </>
              )}
            </button>

            {!isLoading && isAuthenticated && (
              <>
                <button
                  onClick={() => triggerSyncNow()}
                  disabled={isSyncing || !isOnline}
                  title={
                    !isOnline
                      ? 'Cannot sync while offline'
                      : totalWaitingSync > 0
                      ? `Sync ${totalWaitingSync} queued reports to server`
                      : 'Manual health & sync check'
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    totalWaitingSync > 0
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-slate-900' : ''}`} />
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
                  {totalWaitingSync > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] font-bold bg-slate-950 text-amber-400 rounded-full tabular-nums">
                      {totalWaitingSync}
                    </span>
                  )}
                </button>

                {onOpenQueue && (
                  <button
                    onClick={onOpenQueue}
                    title="Inspect local IndexedDB queue"
                    className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
                  >
                    <Database className="w-4 h-4 text-amber-500" />
                    {totalWaitingSync > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </button>
                )}
              </>
            )}

            <button
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {isLoading ? (
              <div
                aria-label="Restoring session"
                className="h-8 w-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse border border-slate-200 dark:border-slate-700"
              />
            ) : isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowRoleMenu(!showRoleMenu)}
                  className="flex items-center gap-2 pl-2 pr-1.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-[11px]">
                    {role === 'coordinator' ? <Shield className="w-3.5 h-3.5" /> : <HardHat className="w-3.5 h-3.5" />}
                  </div>
                  <div className="text-left hidden lg:block">
                    <span className="font-semibold block truncate max-w-[90px]">{user?.full_name?.split(' ')[0]}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block -mt-0.5 capitalize">
                      {role.replace('_', ' ')}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showRoleMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50">
                    <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user?.full_name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                        {role.replace('_', ' ')}
                      </span>
                    </div>

                    {isDemoMode && (
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1">
                          Switch Role
                        </p>
                        <button
                          onClick={() => {
                            switchRole('field_worker');
                            setShowRoleMenu(false);
                            onNavigate('worker-dashboard');
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left ${
                            role === 'field_worker'
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <HardHat className="w-4 h-4" />
                            Field Worker (Samuel)
                          </span>
                          {role === 'field_worker' && <UserCheck className="w-4 h-4 text-amber-600" />}
                        </button>

                        <button
                          onClick={() => {
                            switchRole('coordinator');
                            setShowRoleMenu(false);
                            onNavigate('coord-dashboard');
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left ${
                            role === 'coordinator'
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Coordinator (Elena)
                          </span>
                          {role === 'coordinator' && <UserCheck className="w-4 h-4 text-amber-600" />}
                        </button>
                      </div>
                    )}

                    <div className="border-t border-slate-100 dark:border-slate-800 px-2 pt-1.5">
                      <button
                        onClick={() => {
                          setShowRoleMenu(false);
                          onNavigate('profile');
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left"
                      >
                        <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                        Settings &amp; Local Storage
                      </button>
                      <button
                        onClick={async () => {
                          setShowRoleMenu(false);
                          await logout();
                          onNavigate('login');
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate('login')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onNavigate('register')}
                  className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
