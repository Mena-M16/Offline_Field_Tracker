import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { db } from '../db';
import { reportRepository } from '../db/reportRepository';
import type { ActivityLog } from '../types';
import { syncBatchReports } from '../api/sync';

export interface SyncNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
}

interface SyncContextType {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  toggleSimulateOffline: () => void;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncTime: string | null;
  notifications: SyncNotification[];
  dismissNotification: (id: string) => void;
  triggerSyncNow: () => Promise<{ success: boolean; syncedCount: number; errors: string[] }>;
  checkHealth: () => Promise<boolean>;
}

export const SyncContext = createContext<SyncContextType | undefined>(undefined);

function computeBackoffWithJitter(attempt: number): number {
  const baseMs = Math.min(60000, 2000 * Math.pow(2, Math.max(0, attempt)));
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(baseMs * jitterFactor);
}

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [browserOnline, setBrowserOnline] = useState<boolean>(navigator.onLine);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem('field_track_last_sync');
  });
  const [notifications, setNotifications] = useState<SyncNotification[]>([]);

  const isOnline = browserOnline && !isSimulatedOffline;
  const isSyncingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const addNotification = useCallback((type: SyncNotification['type'], title: string, message: string) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newNotif: SyncNotification = {
      id,
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 4)]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 6000);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const refreshQueueCounts = useCallback(async () => {
    try {
      const pending = await db.reports.where('sync_status').equals('pending').count();
      const failed = await db.reports.where('sync_status').equals('failed').count();
      setPendingCount(pending);
      setFailedCount(failed);
    } catch {
      // Database may still be initializing
    }
  }, []);

  // Active reachability probe against /api/v1/health with 3-second timeout
  const checkHealth = useCallback(async (): Promise<boolean> => {
    if (isSimulatedOffline || !navigator.onLine) return false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('/api/v1/health', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const body = await res.json().catch(() => null);
      return Boolean(body && (body.success === true || body.data?.status === 'healthy' || body.status === 'healthy'));
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [isSimulatedOffline]);

  const triggerSyncNow = useCallback(async (): Promise<{ success: boolean; syncedCount: number; errors: string[] }> => {
    if (isSyncingRef.current) {
      return { success: false, syncedCount: 0, errors: ['Sync already in progress'] };
    }

    if (!isOnline) {
      addNotification(
        'warning',
        'Device Offline',
        'Cannot synchronize while offline or simulated offline. Reports remain safely saved in IndexedDB.'
      );
      return { success: false, syncedCount: 0, errors: ['Offline'] };
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const pendingReports = await reportRepository.getPendingOrFailedReports();

      if (pendingReports.length === 0) {
        await refreshQueueCounts();
        return { success: true, syncedCount: 0, errors: [] };
      }

      // Active health probe before draining queue
      const healthy = await checkHealth();
      if (!healthy) {
        const probeErr = 'Backend health probe unreachable (/api/v1/health)';
        for (const rep of pendingReports) {
          if (rep.id) {
            await reportRepository.updateReportFields(rep.id, {
              sync_status: 'failed',
              sync_attempts: rep.sync_attempts + 1,
              last_sync_error: probeErr,
            });
          }
        }
        addNotification(
          'error',
          'Server Unreachable',
          'Health check failed. Pending reports stay safely queued in IndexedDB for automatic retry.'
        );
        await refreshQueueCounts();
        return { success: false, syncedCount: 0, errors: [probeErr] };
      }

      // Mark reports as actively synchronizing
      for (const rep of pendingReports) {
        if (rep.id) {
          await reportRepository.updateReportFields(rep.id, { sync_status: 'synchronizing' });
        }
      }

      await reportRepository.addActivityLog({
        id: `log-sync-start-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        report_id: pendingReports[0].server_id || `client-${pendingReports[0].client_id}`,
        client_id: pendingReports[0].client_id,
        actor_id: pendingReports[0].created_by,
        actor_name: pendingReports[0].creator_name,
        actor_role: 'field_worker',
        event_type: 'sync_started',
        details: { note: `Initiated batch synchronization for ${pendingReports.length} queued report(s).` },
        created_at: new Date().toISOString(),
      });

      const serverResponse = await syncBatchReports(pendingReports);
      const serverResultsMap = new Map<string, string>();
      if (serverResponse.success && serverResponse.data) {
        for (const item of serverResponse.data.results) {
          serverResultsMap.set(item.client_id, item.server_id);
        }
      }

      const batchErrorMsg = !serverResponse.success
        ? serverResponse.error?.message || 'Batch synchronization rejected by server'
        : 'Server did not acknowledge report persistence';

      let syncedCount = 0;
      const errors: string[] = [];

      for (const rep of pendingReports) {
        const confirmedServerId = serverResultsMap.get(rep.client_id);
        const nowStr = new Date().toISOString();

        if (confirmedServerId) {
          if (rep.id) {
            await reportRepository.updateReportFields(rep.id, {
              server_id: confirmedServerId,
              sync_status: 'synchronized',
              updated_at: nowStr,
              sync_attempts: rep.sync_attempts + 1,
              last_sync_error: null,
            });
          }

          const syncLog: ActivityLog = {
            id: `log-sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            report_id: confirmedServerId,
            client_id: rep.client_id,
            actor_id: rep.created_by,
            actor_name: rep.creator_name,
            actor_role: 'field_worker',
            event_type: 'sync_completed',
            details: {
              note: `Report '${rep.title}' confirmed persisted on central server (ID: ${confirmedServerId}).`,
            },
            created_at: nowStr,
          };
          await reportRepository.addActivityLog(syncLog);
          syncedCount++;
        } else {
          errors.push(`${rep.title}: ${batchErrorMsg}`);
          if (rep.id) {
            await reportRepository.updateReportFields(rep.id, {
              sync_status: 'failed',
              sync_attempts: rep.sync_attempts + 1,
              last_sync_error: batchErrorMsg,
            });
          }

          await reportRepository.addActivityLog({
            id: `log-sync-fail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            report_id: rep.server_id || `client-${rep.client_id}`,
            client_id: rep.client_id,
            actor_id: rep.created_by,
            actor_name: rep.creator_name,
            actor_role: 'field_worker',
            event_type: 'sync_failed',
            details: {
              error: batchErrorMsg,
              note: `Sync attempt #${rep.sync_attempts + 1} failed for '${rep.title}'.`,
            },
            created_at: nowStr,
          });
        }
      }

      if (syncedCount > 0) {
        const syncTimestamp = new Date().toISOString();
        setLastSyncTime(syncTimestamp);
        localStorage.setItem('field_track_last_sync', syncTimestamp);
        addNotification(
          'success',
          'Sync Completed',
          `Successfully synchronized ${syncedCount} report${syncedCount > 1 ? 's' : ''} to central server.`
        );
      }

      if (errors.length > 0) {
        addNotification(
          'error',
          'Sync Partially Failed',
          `${errors.length} report(s) failed to sync and remain queued for retry.`
        );

        // Schedule exponential backoff retry
        const maxAttempts = Math.max(...pendingReports.map((r) => r.sync_attempts + 1), 1);
        const delayMs = computeBackoffWithJitter(maxAttempts);
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          triggerSyncNow();
        }, delayMs);
      }

      await refreshQueueCounts();
      return { success: errors.length === 0, syncedCount, errors };
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [isOnline, checkHealth, addNotification, refreshQueueCounts]);

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      addNotification(
        'info',
        'Network Reconnected',
        'Device detected connectivity. Verifying server reachability before draining queue.'
      );
    };
    const handleOffline = () => {
      setBrowserOnline(false);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      addNotification(
        'warning',
        'Network Lost',
        'Device is offline. New reports will be saved safely in local IndexedDB.'
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    refreshQueueCounts();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
  }, [addNotification, refreshQueueCounts]);

  // Auto-sync when online and pending items exist
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncingRef.current) {
      const timer = window.setTimeout(() => {
        triggerSyncNow();
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline, pendingCount, triggerSyncNow]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshQueueCounts();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [refreshQueueCounts]);

  const toggleSimulateOffline = () => {
    setIsSimulatedOffline((prev) => {
      const next = !prev;
      if (next) {
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        addNotification(
          'warning',
          'Simulated Offline Mode Active',
          'Network traffic paused. Reports and drafts are preserved locally in IndexedDB.'
        );
      } else {
        addNotification(
          'info',
          'Live Network Mode Restored',
          'Running server health check and draining queued reports.'
        );
      }
      return next;
    });
  };

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        isSimulatedOffline,
        toggleSimulateOffline,
        isSyncing,
        pendingCount,
        failedCount,
        lastSyncTime,
        notifications,
        dismissNotification,
        triggerSyncNow,
        checkHealth,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within SyncProvider');
  return context;
};
