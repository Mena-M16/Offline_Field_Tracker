import { apiClient, type ApiResponse } from './client';
import type { LocalReport, ReportStatus, ActivityLog, DashboardStats } from '../types';

export async function fetchAllReports(): Promise<ApiResponse<LocalReport[]>> {
  return apiClient.get<LocalReport[]>('/reports');
}

export async function fetchReportById(id: string): Promise<ApiResponse<LocalReport>> {
  return apiClient.get<LocalReport>(`/reports/${id}`);
}

export async function createReport(report: Partial<LocalReport>): Promise<ApiResponse<LocalReport>> {
  return apiClient.post<LocalReport>('/reports', report);
}

export async function updateReportStatus(
  id: string,
  status: ReportStatus,
  assignedTo?: string,
  rejectionReason?: string,
  version: number = 1,
  note?: string
): Promise<ApiResponse<LocalReport>> {
  return apiClient.patch<LocalReport>(`/reports/${id}/status`, {
    status,
    assigned_to: assignedTo,
    rejection_reason: rejectionReason,
    expected_version: version,
    note,
  });
}

export async function fetchReportHistory(id: string): Promise<ApiResponse<ActivityLog[]>> {
  return apiClient.get<ActivityLog[]>(`/reports/${id}/history`);
}

export async function fetchDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  return apiClient.get<DashboardStats>('/dashboard/stats');
}
