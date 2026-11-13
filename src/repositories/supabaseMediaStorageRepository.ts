import type { SupabaseClient } from '@supabase/supabase-js';
import { getFrontendEnvStatus } from '../config/env';
import { AppDatabaseError, normalizeDatabaseError } from '../lib/databaseErrors';
import type { IMediaStorageRepository, StorageUploadInput } from './interfaces';
import { buildStorageObjectPath } from './mappers';
import type { Database } from '../types/supabase';

/**
 * Supabase Private Storage Repository (`report-media` bucket)
 *
 * Stores photos and audio memos under `<auth.uid()>/<client_id>/<filename>`
 * and resolves short-lived signed URLs in compliance with `002_storage_buckets.sql`.
 */
export class SupabaseMediaStorageRepository implements IMediaStorageRepository {
  private readonly bucketName: string;

  constructor(
    private readonly client: SupabaseClient<Database>,
    bucketName?: string
  ) {
    this.bucketName = bucketName?.trim() || getFrontendEnvStatus().storageBucket || 'report-media';
  }

  async uploadEvidence(input: StorageUploadInput): Promise<{ objectPath: string }> {
    const objectPath = buildStorageObjectPath(
      input.userId,
      input.clientId,
      input.filename
    );

    // `upsert: false` requires only INSERT permission on `storage.objects`
    // (002_storage_buckets.sql intentionally omits UPDATE policies on submitted evidence).
    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(objectPath, input.data, {
        contentType: input.contentType,
        upsert: false,
      });

    if (error) {
      const msg = typeof error.message === 'string' ? error.message.toLowerCase() : '';
      const statusCode = (error as { statusCode?: string | number }).statusCode;
      // Idempotent retry: object already uploaded for this deterministic client_id path
      if (statusCode === '409' || statusCode === 409 || msg.includes('already exists') || msg.includes('duplicate')) {
        return { objectPath };
      }
      throw normalizeDatabaseError(error);
    }

    return { objectPath };
  }

  async createSignedUrl(objectPath: string, expiresInSeconds = 3600): Promise<string> {
    const trimmed = objectPath.trim();
    if (!trimmed) {
      throw new AppDatabaseError({
        code: 'INVALID_INPUT',
        message: 'Storage object path is required.',
        httpStatus: 400,
      });
    }

    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUrl(trimmed, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw normalizeDatabaseError(error ?? new Error('Failed to generate signed media URL.'));
    }

    return data.signedUrl;
  }

  async deleteDraftEvidence(objectPath: string): Promise<void> {
    const trimmed = objectPath.trim();
    if (!trimmed) return;

    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove([trimmed]);

    if (error) {
      throw normalizeDatabaseError(error);
    }
  }
}
