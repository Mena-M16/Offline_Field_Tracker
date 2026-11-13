import { db } from './index';
import type { ActivityLog, LocalReport } from '../types';
import type { ILocalOfflineStore } from '../repositories/interfaces';

export const reportRepository = {
  async getAllReports(): Promise<LocalReport[]> {
    return db.reports.reverse().sortBy('updated_at');
  },

  async getOperationalReports(): Promise<LocalReport[]> {
    const all = await db.reports.reverse().sortBy('updated_at');
    return all.filter((r) => r.status !== 'draft');
  },

  async getReportsByCreator(userId: string): Promise<LocalReport[]> {
    return db.reports
      .filter((r) => r.created_by === userId)
      .reverse()
      .sortBy('updated_at');
  },

  async getReportByIdOrClientId(reportId: string | number): Promise<LocalReport | undefined> {
    if (typeof reportId === 'number') {
      return db.reports.get(reportId);
    }

    const byClientId = await db.reports.where('client_id').equals(reportId).first();
    if (byClientId) return byClientId;

    const byServerId = await db.reports.where('server_id').equals(reportId).first();
    if (byServerId) return byServerId;

    const numId = Number(reportId);
    if (!Number.isNaN(numId) && Number.isInteger(numId)) {
      return db.reports.get(numId);
    }

    return undefined;
  },

  async saveReport(reportData: LocalReport, existingId?: number): Promise<number> {
    if (existingId !== undefined) {
      await db.reports.update(existingId, reportData);
      return existingId;
    }
    return db.reports.add(reportData);
  },

  async updateReportFields(id: number, changes: Partial<LocalReport>): Promise<number> {
    return db.reports.update(id, changes);
  },

  async deleteReport(id: number): Promise<void> {
    await db.reports.delete(id);
  },

  async getPendingOrFailedReports(): Promise<LocalReport[]> {
    return db.reports
      .filter((r) => r.sync_status === 'pending' || r.sync_status === 'failed')
      .toArray();
  },

  async getAllActivityLogs(): Promise<ActivityLog[]> {
    return db.activityLogs.reverse().sortBy('created_at');
  },

  async getLogsForReport(clientId: string, serverId?: string): Promise<ActivityLog[]> {
    return db.activityLogs
      .filter(
        (l) =>
          l.client_id === clientId ||
          (serverId ? l.report_id === serverId : false) ||
          l.report_id === `client-${clientId}`
      )
      .reverse()
      .sortBy('created_at');
  },

  async addActivityLog(log: ActivityLog): Promise<string> {
    return db.activityLogs.add(log);
  },
} satisfies ILocalOfflineStore;
