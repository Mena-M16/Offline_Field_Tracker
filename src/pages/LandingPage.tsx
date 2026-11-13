import React from 'react';
import {
  HardHat,
  Shield,
  WifiOff,
  CheckCircle2,
  Database,
  ArrowRight,
  MapPin,
  Clock,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LandingPageProps {
  onNavigate: (page: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { isAuthenticated, role, isDemoMode, switchRole } = useAuth();

  const handleLaunchWorker = () => {
    if (!isDemoMode) {
      if (!isAuthenticated) {
        onNavigate('login');
        return;
      }
      onNavigate('worker-dashboard');
      return;
    }
    switchRole('field_worker');
    onNavigate('worker-dashboard');
  };

  const handleLaunchCoordinator = () => {
    if (!isDemoMode) {
      if (!isAuthenticated) {
        onNavigate('login');
        return;
      }
      onNavigate('coord-dashboard');
      return;
    }
    switchRole('coordinator');
    onNavigate('coord-dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Mission & CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Offline-First Field Issue Management System</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
                Zero-Loss Infrastructure Problem Reporting in Low-Connectivity Zones
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Empowering field technicians to document broken water boreholes, electrical substations, and equipment failures without cellular signal. Reports, GPS coordinates, and photos are committed immediately to local IndexedDB and synchronized deterministically with full idempotency.
              </p>

              {/* Persona Portals */}
              <div className="pt-2 flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleLaunchWorker}
                  className="flex-1 flex items-center justify-between p-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/10 transition-transform active:scale-[0.98] group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-950 text-amber-400 flex items-center justify-center shrink-0">
                      <HardHat className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="block text-sm font-extrabold">Field Worker Portal</span>
                      <span className="block text-xs font-medium text-slate-800">
                        Capture offline reports, GPS & photos
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-950 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={handleLaunchCoordinator}
                  className="flex-1 flex items-center justify-between p-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold border border-slate-700 transition-transform active:scale-[0.98] group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="block text-sm font-extrabold">Coordinator Control</span>
                      <span className="block text-xs font-medium text-slate-300">
                        Triage, assign, state machine & SLAs
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-400 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Technical badges */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-amber-500" />
                  IndexedDB Durable Queue
                </span>
                <span className="flex items-center gap-1.5">
                  <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                  Active Health Probing
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                  PostgreSQL Unique Idempotency
                </span>
              </div>
            </div>

            {/* Right Column: High-Res Real Inspection Photo */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl bg-slate-900 group">
                <img
                  src="/src/assets/images/hero_field_inspection_1794502044492.jpg"
                  alt="Field engineer conducting infrastructure valve inspection"
                  className="w-full h-[380px] lg:h-[440px] object-cover group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold">Active Inspection: Sector 3 Water Works</p>
                      <p className="text-[11px] text-slate-400 font-mono">Borehole Inverter E-04 · Lat -1.286389, Lon 36.817223</p>
                    </div>
                    <span className="text-[11px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
                      In Progress
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Highlights Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
            Defensive Engineering
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">
            Engineered for Severe Environmental & Network Constraints
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            No mock persistence or fake status indicators. Every architectural layer addresses a real failure mode in distributed civil reporting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-all hover:border-amber-500/50">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              IndexedDB Persistent Queue
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Dexie.js-backed offline storage stores complete report payloads, high-res photos as binary Blobs, and draft revisions. Reports survive browser refreshes, device reboots, and weeks of offline usage.
            </p>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">
              zero-data-loss · client_id UUID v4
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-all hover:border-amber-500/50">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
              <WifiOff className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Active Health Probing & Jitter
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Bypasses deceptive captive portals and dead Wi-Fi by issuing periodic 3-second timeout HTTP probes to central health checks. Automatic queue drains execute with randomized exponential backoff.
            </p>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">
              HEAD /api/v1/health · 3s timeout
            </div>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-all hover:border-amber-500/50">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Strict Finite State Machine
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Arbitrary status jumps are barred. Transitions enforce the lifecycle: Draft → Submitted → Assigned → In Progress → Resolved. Rejections require a mandatory 10+ character reason recorded in immutable audit logs.
            </p>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">
              optimistic version lock · append-only logs
            </div>
          </div>
        </div>
      </section>

      {/* Role Comparison Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 rounded-2xl bg-slate-900 text-white border border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                {!isDemoMode ? 'Role-Based Access Control' : 'Role Evaluation Guide'}
              </span>
              <h3 className="text-xl font-bold mt-1">
                {!isDemoMode ? 'Authenticated Field & Dispatch Portals' : 'Dual-Role Persona Testing'}
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {!isDemoMode
                  ? 'Access permissions are enforced via Supabase Auth JWTs and PostgreSQL Row Level Security. Sign in with your assigned operational credentials to open your workspace.'
                  : 'Test both user workflows instantly. Switch roles at any time using the role selector in the top navigation bar or the portal buttons above.'}
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <strong>Field Worker:</strong> Create reports, test simulated offline mode, save drafts, check sync queue.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <strong>Coordinator:</strong> Access triage data grid, assign technicians, reject with reason, view global KPIs.
                </li>
              </ul>
            </div>

            {!isDemoMode ? (
              <div className="flex flex-col sm:flex-row gap-3 justify-end">
                {isAuthenticated ? (
                  <button
                    onClick={() => onNavigate(role === 'coordinator' ? 'coord-dashboard' : 'worker-dashboard')}
                    className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
                  >
                    Open My Dashboard
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => onNavigate('login')}
                      className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => onNavigate('register')}
                      className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-colors"
                    >
                      Register Field Worker
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  onClick={handleLaunchWorker}
                  className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
                >
                  Log In as Samuel (Field Worker)
                </button>
                <button
                  onClick={handleLaunchCoordinator}
                  className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-colors"
                >
                  Log In as Elena (Coordinator)
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
