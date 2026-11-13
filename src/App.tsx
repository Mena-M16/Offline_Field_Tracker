import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { seedInitialDatabaseIfEmpty } from './db';
import { TopNav } from './components/layout/TopNav';
import { BottomNav } from './components/layout/BottomNav';
import { OfflineBanner } from './components/sync/OfflineBanner';
import { ToastNotifications } from './components/sync/ToastNotifications';
import { QueueDrawer } from './components/sync/QueueDrawer';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { WorkerDashboard } from './pages/WorkerDashboard';
import { CoordDashboard } from './pages/CoordDashboard';
import { CreateReportPage } from './pages/CreateReportPage';
import { MyReportsPage } from './pages/MyReportsPage';
import { AllReportsPage } from './pages/AllReportsPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { ActivityHistoryPage } from './pages/ActivityHistoryPage';
import { ProfilePage } from './pages/ProfilePage';

function AppContent() {
  const { role, isAuthenticated, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>('landing');
  const [selectedReportId, setSelectedReportId] = useState<string | number | undefined>(undefined);
  const [editDraftId, setEditDraftId] = useState<number | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Initialize seed data on first launch
  useEffect(() => {
    seedInitialDatabaseIfEmpty().catch(console.error);
  }, []);

  const handleNavigate = (page: string, reportId?: string | number) => {
    if (page === 'create-report' && typeof reportId === 'number') {
      setEditDraftId(reportId);
    } else {
      setEditDraftId(null);
    }

    if (reportId !== undefined) {
      setSelectedReportId(reportId);
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderPage = () => {
    const publicPages = ['landing', 'login', 'register'];
    if (isLoading && !publicPages.includes(currentPage)) {
      return (
        <div className="max-w-md mx-auto px-4 py-20 text-center space-y-3">
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Restoring authenticated session...
          </p>
        </div>
      );
    }

    if (!isAuthenticated && !publicPages.includes(currentPage)) {
      return <LoginPage onNavigate={handleNavigate} />;
    }

    if ((currentPage === 'coord-dashboard' || currentPage === 'all-reports') && role !== 'coordinator') {
      return (
        <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Coordinator Access Required</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your active account has <code>field_worker</code> permissions. Operations triage and all-reports management require a Coordinator role.
            </p>
            <button
              onClick={() => handleNavigate('worker-dashboard')}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950"
            >
              Return to Field Worker Dashboard
            </button>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'landing':
        return <LandingPage onNavigate={handleNavigate} />;
      case 'login':
        return <LoginPage onNavigate={handleNavigate} />;
      case 'register':
        return <RegisterPage onNavigate={handleNavigate} />;
      case 'worker-dashboard':
        return <WorkerDashboard onNavigate={handleNavigate} />;
      case 'coord-dashboard':
        return <CoordDashboard onNavigate={handleNavigate} />;
      case 'create-report':
        return <CreateReportPage editDraftId={editDraftId} onNavigate={handleNavigate} />;
      case 'my-reports':
        return <MyReportsPage onNavigate={handleNavigate} />;
      case 'all-reports':
        return <AllReportsPage onNavigate={handleNavigate} />;
      case 'report-detail':
        return <ReportDetailPage reportId={selectedReportId || 1} onNavigate={handleNavigate} />;
      case 'activity-history':
        return <ActivityHistoryPage onNavigate={handleNavigate} />;
      case 'profile':
        return <ProfilePage onNavigate={handleNavigate} />;
      default:
        return <LandingPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <TopNav currentPage={currentPage} onNavigate={handleNavigate} onOpenQueue={() => setIsQueueOpen(true)} />
      <OfflineBanner />

      <main className="flex-1">
        {renderPage()}
      </main>

      {/* Mobile Ergonomic Thumb-Zone Bottom Nav */}
      <BottomNav currentPage={currentPage} onNavigate={handleNavigate} />

      {/* Global Real-Time Sync & Status Toasts */}
      <ToastNotifications />

      {/* Slide-over Queue Inspector Drawer */}
      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        onSelectReport={(id) => handleNavigate('report-detail', id)}
      />

      {/* Quiet Professional Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 py-6 text-center text-xs text-slate-500 dark:text-slate-400 mt-auto hidden md:block">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            FieldTrack © 2026 · Offline-First Infrastructure Problem Reporting System
          </p>
          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
            <span>Dexie.js IndexedDB</span>
            <span>·</span>
            <span>Client UUID v4 Idempotency</span>
            <span>·</span>
            <span>PostgreSQL RLS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <AppContent />
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
