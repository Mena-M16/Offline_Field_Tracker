import { getFrontendEnvStatus } from '../config/env';

/**
 * Typed API Client Layer
 * Standardizes request formatting, error envelopes, and bearer authentication.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown[];
  };
  meta?: {
    timestamp: string;
    version?: number;
  };
}

export type AccessTokenProvider = () => Promise<string | null> | string | null;

export class ApiClient {
  private baseUrl: string = getFrontendEnvStatus().apiBaseUrl;
  private tokenProvider: AccessTokenProvider | null = null;

  /**
   * Registers a dynamic Bearer token provider (used for Supabase Auth sessions).
   */
  setAccessTokenProvider(provider: AccessTokenProvider | null): void {
    this.tokenProvider = provider;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.tokenProvider) {
      const dynamicToken = await this.tokenProvider();
      const trimmedToken = typeof dynamicToken === 'string' ? dynamicToken.trim() : '';
      if (trimmedToken) {
        headers['Authorization'] = `Bearer ${trimmedToken}`;
      }
    }
    return headers;
  }

  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      return (await response.json()) as ApiResponse<T>;
    } catch {
      return {
        success: false,
        error: {
          code: response.ok ? 'INVALID_RESPONSE' : `HTTP_${response.status}`,
          message: response.statusText || 'Invalid server response payload.',
        },
      };
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: await this.getHeaders(),
      });
      return await this.parseResponse<T>(response);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network request failed';
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: msg },
      };
    }
  }

  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(body),
      });
      return await this.parseResponse<T>(response);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network request failed';
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: msg },
      };
    }
  }

  async patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(body),
      });
      return await this.parseResponse<T>(response);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network request failed';
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: msg },
      };
    }
  }
}

export const apiClient = new ApiClient();
