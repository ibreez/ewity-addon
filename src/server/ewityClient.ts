/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EwityLocation,
  EwityUser,
  EwityBillSummary,
  EwityBillDetail,
  EwityBillListResponse,
  TestConnectionResult,
} from '../types/ewity';

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
  note?: string;
}

export class EwityApiClient {
  private baseUrl: string;
  private apiKey: string;
  private storeId: string;
  private timeoutMs: number;
  private maxRetries: number;
  private recentLogs: RequestLog[] = [];
  private isAppAccessAuthorized: boolean | null = null;
  private lastSuccessfulApiRequestAt: number | null = null;

  constructor(config: EwityClientConfig) {
    this.baseUrl = (config.baseUrl || 'https://api.ewitypos.com/apps-v1').replace(/\/$/, '');
    this.apiKey = (config.apiKey || '').trim();
    this.storeId = config.storeId && !config.storeId.startsWith('http') ? config.storeId.trim() : '';
    this.timeoutMs = config.timeoutMs || 10000;
    this.maxRetries = config.maxRetries || 3;
  }

  public getLastSuccessfulApiRequestAt(): number | null {
    return this.lastSuccessfulApiRequestAt;
  }

  public updateCredentials(apiKey: string, storeId: string, baseUrl?: string) {
    this.apiKey = (apiKey || '').trim();
    this.storeId = storeId && !storeId.startsWith('http') ? storeId.trim() : '';
    this.isAppAccessAuthorized = null;
    if (baseUrl && baseUrl.startsWith('http')) {
      this.baseUrl = baseUrl.replace(/\/$/, '');
    }
  }

  public hasAuthorizedAppAccess(): boolean {
    return this.isAppAccessAuthorized === true;
  }

  public resetAppAccessState() {
    this.isAppAccessAuthorized = null;
  }

  public isPlatformKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('plt_'));
  }

  public isPlatformMode(): boolean {
    return this.baseUrl.includes('platform-v1') || this.isPlatformKey();
  }

  public hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim() !== '');
  }

  public hasStoreId(): boolean {
    return Boolean(this.storeId && this.storeId.trim() !== '' && !this.storeId.startsWith('http'));
  }

  /**
   * STRICT: An Ewity Apps API restaurant connection requires BOTH an API key
   * and the specific merchant store installation ID ('X-Ewity-Store').
   */
  public hasCredentials(): boolean {
    return this.hasApiKey() && this.hasStoreId();
  }

  public getMaskedCredentials() {
    return {
      baseUrl: this.baseUrl,
      apiKeyMasked: this.apiKey
        ? `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}`
        : '(not configured)',
      storeId: this.storeId || '(not configured)',
      hasApiKey: this.hasApiKey(),
      hasStoreId: this.hasStoreId(),
      isPlatformMode: this.isPlatformMode(),
      isPlatformKeyWarning: this.isPlatformKey(),
      isAppAccessAuthorized: this.isAppAccessAuthorized,
    };
  }

  /**
   * Executes a genuine, read-only test request against the Ewity Apps API
   * with the currently configured API key and store ID.
   * Path: GET https://api.ewitypos.com/apps-v1/locations/user
   * Headers:
   *   Authorization: Bearer <EWITY_APP_API_KEY>
   *   X-Ewity-Store: <STORE_ID>
   *
   * Accurately categorizes all outcome states:
   * - NOT CONFIGURED (missing key or store ID)
   * - AUTHENTICATION FAILED (invalid/expired credentials)
   * - AWAITING MERCHANT APPROVAL (store app not yet approved by merchant)
   * - PERMISSION ERROR (insufficient permissions)
   * - CONNECTION ERROR (network failure, timeout, 5xx)
   * - LIVE CONNECTED (successful authenticated Apps API response)
   */
  public async testAppsApiConnection(): Promise<TestConnectionResult> {
    const testedAt = Date.now();
    const endpoint = 'https://api.ewitypos.com/apps-v1/locations/user';
    const isPlatformWarning = this.isPlatformKey();

    if (!this.hasApiKey()) {
      return {
        outcome: 'NOT CONFIGURED',
        success: false,
        message: 'Missing API key. Provide EWITY_APP_API_KEY for the installed app.',
        testedAt,
        endpoint,
        isPlatformKeyWarning: isPlatformWarning,
      };
    }

    if (!this.hasStoreId()) {
      return {
        outcome: 'NOT CONFIGURED',
        success: false,
        message: 'Missing Store ID. The Apps API requires X-Ewity-Store specifying the installed store ID.',
        testedAt,
        endpoint,
        isPlatformKeyWarning: isPlatformWarning,
      };
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Ewity-Store': this.storeId,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startTime = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const status = response.status;

      let responseText = '';
      let responseJson: any = null;
      try {
        responseText = await response.text();
        responseJson = JSON.parse(responseText);
      } catch {
        // text is in responseText
      }

      const errorText = responseJson?.message || responseText || response.statusText;

      this.log({
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: '/locations/user',
        statusCode: status,
        durationMs,
        error: response.ok ? undefined : `HTTP ${status}: ${errorText}`,
      });

      if (response.ok) {
        this.lastSuccessfulApiRequestAt = Date.now();
        this.isAppAccessAuthorized = true;
        const locations = Array.isArray(responseJson)
          ? responseJson
          : Array.isArray(responseJson?.data)
          ? responseJson.data
          : [];

        return {
          outcome: 'LIVE CONNECTED',
          success: true,
          message: `Successfully connected to Ewity Apps API for store #${this.storeId}. Verified ${locations.length} location(s).`,
          testedAt: Date.now(),
          httpStatus: 200,
          endpoint,
          storeId: this.storeId,
          locationsCount: locations.length,
          isPlatformKeyWarning: isPlatformWarning,
        };
      }

      if (status === 401) {
        this.isAppAccessAuthorized = false;
        const lowerErr = errorText.toLowerCase();
        if (
          lowerErr.includes('not authorized app access') ||
          lowerErr.includes('install the app') ||
          lowerErr.includes('approve its permissions')
        ) {
          return {
            outcome: 'AWAITING MERCHANT APPROVAL',
            success: false,
            message: `Merchant authorization pending: Store #${this.storeId} has not approved app access. The business must install the app and approve permissions in the Ewity App Store.`,
            testedAt: Date.now(),
            httpStatus: 401,
            endpoint,
            storeId: this.storeId,
            isPlatformKeyWarning: isPlatformWarning,
          };
        }

        return {
          outcome: 'AUTHENTICATION FAILED',
          success: false,
          message: isPlatformWarning
            ? `Authentication failed: The configured key starts with "plt_", which is a Platform API token. The restaurant POS integration requires an Apps API key from an installed app.`
            : `Authentication failed: Invalid or expired API credentials for store #${this.storeId}.`,
          testedAt: Date.now(),
          httpStatus: 401,
          endpoint,
          storeId: this.storeId,
          isPlatformKeyWarning: isPlatformWarning,
        };
      }

      if (status === 403) {
        this.isAppAccessAuthorized = false;
        return {
          outcome: 'PERMISSION ERROR',
          success: false,
          message: `Permission denied: Store #${this.storeId} credentials lack required access permissions.`,
          testedAt: Date.now(),
          httpStatus: 403,
          endpoint,
          storeId: this.storeId,
          isPlatformKeyWarning: isPlatformWarning,
        };
      }

      return {
        outcome: 'CONNECTION ERROR',
        success: false,
        message: `Ewity Apps API responded with HTTP ${status}: ${errorText}`,
        testedAt: Date.now(),
        httpStatus: status,
        endpoint,
        storeId: this.storeId,
        isPlatformKeyWarning: isPlatformWarning,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout =
        err.name === 'AbortError' ||
        err.message?.includes('timeout') ||
        err.message?.includes('aborted');
      return {
        outcome: 'CONNECTION ERROR',
        success: false,
        message: isTimeout
          ? `Connection timed out after ${this.timeoutMs}ms while contacting Ewity Apps API.`
          : `Network error contacting Ewity Apps API: ${err.message}`,
        testedAt: Date.now(),
        endpoint,
        storeId: this.storeId,
        isPlatformKeyWarning: isPlatformWarning,
      };
    }
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
    if (entry.note) {
      console.log(`[EWITY-API] ${entry.method} ${entry.path} - Status: ${entry.statusCode || 200} (${entry.durationMs}ms) Notice: ${entry.note}`);
    } else {
      console.log(`[EWITY-API] ${entry.method} ${entry.path} - Status: ${entry.statusCode || 'ERR'} (${entry.durationMs}ms) ${entry.error ? `Error: ${entry.error}` : ''}`);
    }
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
      throw new Error('Ewity Apps API credentials not configured. Please supply both EWITY_APP_API_KEY and EWITY_STORE_ID.');
    }

    // Properly route Apps API endpoints (/sales/*, /users/*, /locations/user) to apps-v1
    let targetBase = this.baseUrl;
    if (
      path.startsWith('/sales') ||
      path.startsWith('/users') ||
      path.startsWith('/locations/user') ||
      path.startsWith('/locations/min-list')
    ) {
      targetBase = 'https://api.ewitypos.com/apps-v1';
    } else if (path.startsWith('/stores')) {
      targetBase = 'https://api.ewitypos.com/platform-v1';
    }

    const url = `${targetBase}${path.startsWith('/') ? path : `/${path}`}`;
    const startTime = Date.now();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.storeId && this.storeId.trim() !== '' && !this.storeId.startsWith('http')) {
      headers['X-Ewity-Store'] = this.storeId;
    }

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

        const isAppAccessPending =
          statusCode === 401 &&
          (errorBody.includes('not authorized app access') ||
            errorBody.includes('approve its permissions') ||
            errorBody.includes('must install the app'));

        if (isAppAccessPending) {
          this.isAppAccessAuthorized = false;
          this.log({
            timestamp: new Date().toISOString(),
            method: options.method || 'GET',
            path,
            statusCode: 401,
            durationMs,
            note: 'Store app access approval pending in Ewity POS. Fallback monitoring active.',
          });

          const pendingErr: any = new Error(`Ewity store app installation pending: ${errorBody}`);
          pendingErr.isAppAccessPending = true;
          pendingErr.alreadyLogged = true;
          throw pendingErr;
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

        const httpErr: any =
          statusCode === 401
            ? new Error(`Ewity 401 Unauthorized: Invalid or expired API credentials. ${errorBody}`)
            : statusCode === 403
            ? new Error(`Ewity 403 Forbidden: Missing approved role permission on merchant store. ${errorBody}`)
            : new Error(errMsg);
        httpErr.alreadyLogged = true;
        throw httpErr;
      }

      const data = await response.json();
      this.lastSuccessfulApiRequestAt = Date.now();
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

      if (!err.alreadyLogged) {
        this.log({
          timestamp: new Date().toISOString(),
          method: options.method || 'GET',
          path,
          durationMs,
          error: errMsg,
        });
      }
      throw err;
    }
  }

  /**
   * Bootstraps and verifies user session & authorities.
   * - Platform API: Calls GET /stores
   * - Apps API: Calls GET /users/me, falling back to /stores if /users/me is not supported (404)
   */
  public async getCurrentUser(): Promise<EwityUser> {
    if (this.isPlatformMode()) {
      return this.getCurrentUserFromPlatform();
    }

    try {
      return await this.executeRequest<EwityUser>('/users/me');
    } catch (err: any) {
      // If /users/me returns 404 (Invalid API endpoint), fallback to Platform API /stores
      if (err.message?.includes('404') || err.message?.includes('Invalid API endpoint')) {
        return await this.getCurrentUserFromPlatform();
      }
      throw err;
    }
  }

  /**
   * Authenticates against Ewity Platform API (GET /platform-v1/stores).
   * Discovers store client_id and available merchant locations.
   */
  public async getCurrentUserFromPlatform(): Promise<EwityUser> {
    const platformBase = this.baseUrl.includes('platform-v1')
      ? this.baseUrl
      : 'https://api.ewitypos.com/platform-v1';

    const url = `${platformBase}/stores`;
    const startTime = Date.now();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        let errorBody = '';
        try {
          const jsonErr = await response.json();
          errorBody = jsonErr.message || JSON.stringify(jsonErr);
        } catch {
          errorBody = await response.text();
        }
        const errMsg = `HTTP ${response.status}: ${errorBody || response.statusText}`;
        this.log({
          timestamp: new Date().toISOString(),
          method: 'GET',
          path: '/stores',
          statusCode: response.status,
          durationMs,
          error: errMsg,
        });
        throw new Error(errMsg);
      }

      const result = await response.json();
      this.lastSuccessfulApiRequestAt = Date.now();
      this.log({
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: '/stores',
        statusCode: 200,
        durationMs,
      });

      const stores = Array.isArray(result.data) ? result.data : [];
      if (stores.length === 0) {
        throw new Error('No stores associated with this Ewity API credential.');
      }

      const store = stores[0];
      if (store.client_id) {
        this.storeId = store.client_id;
      }

      const primaryLoc = store.online_locations?.[0];
      const storeName = primaryLoc?.offline_location?.name || primaryLoc?.name || `Ewity Store #${store.id}`;

      const locations: EwityLocation[] = (store.online_locations || []).map((loc: any) => ({
        id: loc.id,
        name: loc.offline_location?.name ? `${loc.offline_location.name} (${loc.name})` : loc.name,
        display_name: loc.name,
        type: loc.offline_location?.type || 'restaurant',
        city: loc.address || undefined,
        phone: loc.contact_number || undefined,
      }));

      return {
        id: store.id,
        name: storeName,
        email: primaryLoc?.email || 'merchant@ewitypos.com',
        company: {
          id: store.company_id,
          name: storeName,
          domain: primaryLoc?.slug || 'ewity-store',
        },
        locations,
        authorities: [
          'p/r-bill-history',
          'p/r-bill',
          'p/r-store',
          'p/r-location',
          'p/r-order',
          'p/r-catalogue',
        ],
      };
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;
      this.log({
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: '/stores',
        durationMs,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Lists locations authorized for current app installation.
   * Path: GET /locations/user or /locations/min-list or /stores
   */
  public async getLocations(): Promise<EwityLocation[]> {
    if (this.isPlatformMode()) {
      try {
        const user = await this.getCurrentUserFromPlatform();
        if (user.locations && user.locations.length > 0) {
          return user.locations;
        }
      } catch {
        // Fall back below
      }
    }

    try {
      const res = await this.executeRequest<any>('/locations/user');
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    } catch {
      // Fallback to minimal locations list or platform stores
      try {
        const minRes = await this.executeRequest<any>('/locations/min-list');
        if (Array.isArray(minRes)) return minRes;
        if (minRes && Array.isArray(minRes.data)) return minRes.data;
      } catch {
        try {
          const user = await this.getCurrentUserFromPlatform();
          return user.locations || [];
        } catch {
          return [];
        }
      }
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
    if (this.isAppAccessAuthorized === false) {
      return {
        data: [],
        pagination: {
          pageSize: params.limit || 20,
          current: params.page || 1,
          total: 0,
          hasMorePages: false,
        },
        appAccessPending: true,
      };
    }

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

    try {
      const res = await this.executeRequest<any>(endpoint);
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
        appAccessPending: false,
      };
    } catch (err: any) {
      // If store app access is not yet approved in App Store, return empty list gracefully
      if (
        err.isAppAccessPending ||
        err.message?.includes('not authorized app access') ||
        err.message?.includes('401') ||
        err.message?.includes('403') ||
        err.message?.includes('404')
      ) {
        return {
          data: [],
          pagination: { pageSize: params.limit || 20, current: params.page || 1, total: 0, hasMorePages: false },
          appAccessPending: true,
        };
      }
      throw err;
    }
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
    try {
      const res = await this.executeRequest<any>(`/sales/open-bills/location/${locationId}`);
      return Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
    } catch {
      return [];
    }
  }
}
