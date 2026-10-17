/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EwityLocation, EwityUser, EwityBillSummary, EwityBillDetail, EwityBillListResponse } from '../types/ewity';

export interface EwityClientConfig {
  baseUrl: string;
  apiKey: string;
  storeId: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  statusCode?: number;
  durationMs: number;
  error?: string;
}

export class EwityApiClient {
  private baseUrl: string;
  private apiKey: string;
  private storeId: string;
  private timeoutMs: number;
  private maxRetries: number;
  private recentLogs: RequestLog[] = [];

  constructor(config: EwityClientConfig) {
    this.baseUrl = (config.baseUrl || 'https://api.ewitypos.com/apps-v1').replace(/\/$/, '');
    this.apiKey = config.apiKey || '';
    this.storeId = config.storeId || '';
    this.timeoutMs = config.timeoutMs || 10000;
    this.maxRetries = config.maxRetries || 3;
  }

  public updateCredentials(apiKey: string, storeId: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.storeId = storeId;
    if (baseUrl) {
      this.baseUrl = baseUrl.replace(/\/$/, '');
    }
  }

  public hasCredentials(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim() !== '' && this.storeId && this.storeId.trim() !== '');
  }

  public getMaskedCredentials() {
    return {
      baseUrl: this.baseUrl,
      apiKeyMasked: this.apiKey ? `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}` : '(not configured)',
      storeId: this.storeId || '(not configured)',
      hasApiKey: Boolean(this.apiKey),
      hasStoreId: Boolean(this.storeId),
    };
  }

  public getLogs(): RequestLog[] {
    return [...this.recentLogs];
  }

  private log(entry: RequestLog) {
    this.recentLogs.unshift(entry);
    if (this.recentLogs.length > 50) {
      this.recentLogs.pop();
    }
    // Safe structured logging to stdout (never print secrets)
    console.log(`[EWITY-API] ${entry.method} ${entry.path} - Status: ${entry.statusCode || 'ERR'} (${entry.durationMs}ms) ${entry.error ? `Error: ${entry.error}` : ''}`);
  }

  /**
   * Internal HTTP execution engine with timeout, rate limit handling, and exponential backoff
   */
  private async executeRequest<T>(
    path: string,
    options: RequestInit = {},
    attempt: number = 1
  ): Promise<T> {
    if (!this.hasCredentials()) {
      throw new Error('Ewity API credentials not configured. Please supply EWITY_APP_API_KEY and EWITY_STORE_ID.');
    }

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const startTime = Date.now();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Ewity-Store': this.storeId,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutTimer);

      const durationMs = Date.now() - startTime;
      const statusCode = response.status;

      // Handle 429 Too Many Requests
      if (statusCode === 429 && attempt <= this.maxRetries) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.pow(2, attempt);
        const backoffMs = Math.min(retryAfterSec * 1000, 10000);

        this.log({
          timestamp: new Date().toISOString(),
          method: options.method || 'GET',
          path,
          statusCode: 429,
          durationMs,
          error: `Rate limit exceeded (300 req/min). Retrying in ${backoffMs}ms (Attempt ${attempt}/${this.maxRetries})`,
        });

        await new Promise((r) => setTimeout(r, backoffMs));
        return this.executeRequest<T>(path, options, attempt + 1);
      }

      // Handle 5xx Gateway / Transient Errors
      if (statusCode >= 500 && attempt <= this.maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 500;
        this.log({
          timestamp: new Date().toISOString(),
          method: options.method || 'GET',
          path,
          statusCode,
          durationMs,
          error: `Gateway transient failure. Retrying in ${backoffMs}ms (Attempt ${attempt}/${this.maxRetries})`,
        });

        await new Promise((r) => setTimeout(r, backoffMs));
        return this.executeRequest<T>(path, options, attempt + 1);
      }

      if (!response.ok) {
        let errorBody = '';
        try {
          const jsonErr = await response.json();
          errorBody = jsonErr.message || JSON.stringify(jsonErr);
        } catch {
          errorBody = await response.text();
        }

        const errMsg = `HTTP ${statusCode}: ${errorBody || response.statusText}`;
        this.log({
          timestamp: new Date().toISOString(),
          method: options.method || 'GET',
          path,
          statusCode,
          durationMs,
          error: errMsg,
        });

        if (statusCode === 401) {
          throw new Error(`Ewity 401 Unauthorized: Invalid or expired EWITY_APP_API_KEY. Verify Credentials in Developer Portal.`);
        }
        if (statusCode === 403) {
          throw new Error(`Ewity 403 Forbidden: Missing approved role permission on merchant store (requires 'p/r-bill-history'). ${errorBody}`);
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      this.log({
        timestamp: new Date().toISOString(),
        method: options.method || 'GET',
        path,
        statusCode,
        durationMs,
      });

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;
      const isAbort = err.name === 'AbortError';
      const errMsg = isAbort ? `Request timeout after ${this.timeoutMs}ms` : err.message;

      if ((isAbort || err.code === 'ECONNRESET') && attempt <= this.maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 400;
        this.log({
          timestamp: new Date().toISOString(),
          method: options.method || 'GET',
          path,
          durationMs,
          error: `${errMsg}. Retrying in ${backoffMs}ms (Attempt ${attempt}/${this.maxRetries})`,
        });
        await new Promise((r) => setTimeout(r, backoffMs));
        return this.executeRequest<T>(path, options, attempt + 1);
      }

      this.log({
        timestamp: new Date().toISOString(),
        method: options.method || 'GET',
        path,
        durationMs,
        error: errMsg,
      });
      throw new Error(errMsg);
    }
  }

  /**
   * Bootstraps and verifies user session & authorities.
   * Path: GET /users/me
   */
  public async getCurrentUser(): Promise<EwityUser> {
    return this.executeRequest<EwityUser>('/users/me');
  }

  /**
   * Lists locations authorized for current app installation.
   * Path: GET /locations/user or /locations/min-list
   */
  public async getLocations(): Promise<EwityLocation[]> {
    try {
      const res = await this.executeRequest<any>('/locations/user');
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    } catch {
      // Fallback to minimal locations list
      const minRes = await this.executeRequest<any>('/locations/min-list');
      if (Array.isArray(minRes)) return minRes;
      if (minRes && Array.isArray(minRes.data)) return minRes.data;
      return [];
    }
  }

  /**
   * Lists bills for a location with full pagination and filters.
   * Path: GET /sales/bills/location/{id}
   * Supported filters: q_kot_number, q_number, q_status, q_type, q_payment_status, etc.
   */
  public async listBills(
    locationId: string = 'all',
    params: {
      page?: number;
      limit?: number;
      order_by?: string;
      q_kot_number?: string;
      q_number?: string;
      q_status?: string;
      q_type?: string;
      q_payment_status?: string;
    } = {}
  ): Promise<EwityBillListResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.order_by) query.set('order_by', params.order_by);
    if (params.q_kot_number) query.set('q_kot_number', params.q_kot_number);
    if (params.q_number) query.set('q_number', params.q_number);
    if (params.q_status) query.set('q_status', params.q_status);
    if (params.q_type) query.set('q_type', params.q_type);
    if (params.q_payment_status) query.set('q_payment_status', params.q_payment_status);

    const queryString = query.toString();
    const endpoint = `/sales/bills/location/${locationId}${queryString ? `?${queryString}` : ''}`;
    
    const res = await this.executeRequest<any>(endpoint);
    
    // Normalize response shape
    const data: EwityBillSummary[] = Array.isArray(res.data) ? res.data : [];
    const pagination = res.simplePagination || res.pagination || {
      pageSize: params.limit || 20,
      current: params.page || 1,
      hasMorePages: data.length >= (params.limit || 20),
    };

    return {
      data,
      pagination: {
        pageSize: pagination.pageSize || 20,
        current: pagination.current || 1,
        total: pagination.total,
        hasMorePages: Boolean(pagination.hasMorePages),
      },
      search: res.search,
    };
  }

  /**
   * Retrieves single bill detail including line items, variants, and payments.
   * Path: GET /sales/bills/{id}
   */
  public async getBillDetail(billId: number | string): Promise<EwityBillDetail> {
    const res = await this.executeRequest<any>(`/sales/bills/${billId}`);
    return res.data || res;
  }

  /**
   * Retrieves live unsettled bills currently open in POS registers.
   * Path: GET /sales/open-bills/location/{id}
   */
  public async listOpenBills(locationId: string = 'all'): Promise<any[]> {
    const res = await this.executeRequest<any>(`/sales/open-bills/location/${locationId}`);
    return Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
  }
}
