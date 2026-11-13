import { apiClient, type ApiResponse } from './client';
import type { LocalReport } from '../types';

export interface BatchSyncResult {
  processed: number;
  results: {
    client_id: string;
    server_id: string;
    status: 'created' | 'already_synced' | 'conflict';
  }[];
}

export async function checkServerHealth(): Promise<boolean> {
  const res = await apiClient.get<{ status: string }>('/health');
  return res.success && res.data?.status === 'healthy';
}

export async function syncBatchReports(reports: LocalReport[]): Promise<ApiResponse<BatchSyncResult>> {
  return apiClient.post<BatchSyncResult>('/sync/batch', {
    reports: reports.map((r) => ({
      client_id: r.client_id,
      created_by: r.created_by,
      creator_name: r.creator_name,
      title: r.title,
      category: r.category,
      priority: r.priority,
      description: r.description,
      location_name: r.location_name,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy_meters: r.accuracy_meters,
      photo_url: r.photo_url,
      audio_url: r.audio_url,
      status: r.status,
      version: r.version,
      reported_at: r.reported_at,
    })),
  });
}
