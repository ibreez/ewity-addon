/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { EwityApiClient } from './src/server/ewityClient';
import { EwityWebhookService } from './src/server/ewityWebhook';
import { EwityAppUiService } from './src/server/ewityAppUi';
import { EwityReconciliationWorker } from './src/server/ewityReconciliation';
import { runEwityMockTestSuite, MOCK_EWITY_BILLS } from './src/server/ewityMockFixtures';
import { mapEwityBillToOrder } from './src/services/ewityMapper';
import { EwityLocation, EwityBillSummary, EwityConnectionInfo, EwityConnectionStatus, TestConnectionResult } from './src/types/ewity';
import { Order, OrderDataSource } from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Port binding: In Cloud Run / production environments, PORT is injected by the platform (e.g. 8080).
// In development, defaults to 3000.
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SERVER_START_TIME = Date.now();

// Persistent storage path to preserve reconciled state across Cloud Run instance restarts
const DATA_DIR = path.resolve('.data');
const STATE_FILE = path.join(DATA_DIR, 'reconciled_state.json');

/**
 * Loads persisted genuine live state from disk.
 * STRICT RULE: Never seeds with MOCK_EWITY_BILLS!
 * If no saved genuine state exists, returns empty arrays.
 */
function loadPersistedState(): { bills: EwityBillSummary[]; orders: Order[] } {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.bills) && Array.isArray(parsed.orders)) {
        // Hygiene filter: purge any legacy mock/simulated fixtures from disk
        const genuineOrders = parsed.orders.filter(
          (o: any) =>
            o &&
            o.dataSource !== 'simulated_fixture' &&
            !String(o.id).startsWith('ord-4') &&
            !String(o.orderNumber).startsWith('EW-4')
        );
        const genuineBills = parsed.bills.filter(
          (b: any) =>
            b &&
            !String(b.id).startsWith('mock-') &&
            b.id !== 9001 &&
            b.id !== 8634 &&
            b.id !== 8635 &&
            b.id !== 8636
        );
        return { bills: genuineBills, orders: genuineOrders };
      }
    }
  } catch {
    // Fall back to empty genuine defaults
  }
  return {
    bills: [],
    orders: [],
  };
}

function persistState(bills: EwityBillSummary[], orders: Order[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Only persist genuine records
    const genuineOrders = orders.filter((o) => o && o.dataSource !== 'simulated_fixture');
    fs.writeFileSync(STATE_FILE, JSON.stringify({ bills, orders: genuineOrders }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[EWITY-WATCHDOG] Failed to persist state to disk:', err);
  }
}

// Initialize Ewity services with environment variables
const ewityConfig = {
  baseUrl: process.env.EWITY_API_BASE_URL || 'https://api.ewitypos.com/apps-v1',
  apiKey: process.env.EWITY_APP_API_KEY || '',
  storeId: process.env.EWITY_STORE_ID || '',
  timeoutMs: 10000,
  maxRetries: 3,
};

const ewityClient = new EwityApiClient(ewityConfig);
const ewityWebhook = new EwityWebhookService(process.env.EWITY_WEBHOOK_SECRET || '');

// Deployed application base URL used for embedding IframeView in Ewity POS
const DEPLOYED_APP_URL =
  process.env.APP_URL && process.env.APP_URL.includes('ais-pre-')
    ? process.env.APP_URL
    : 'https://ais-pre-4vmloib4ucrege7oirz6nu-417987842324.asia-southeast1.run.app';

const appUiSigningSecret =
  process.env.EWITY_SIGNING_SECRET ||
  process.env.EWITY_APP_SECRET ||
  process.env.EWITY_WEBHOOK_SECRET ||
  '';

const ewityAppUi = new EwityAppUiService(appUiSigningSecret, DEPLOYED_APP_URL);

// In-memory store for reconciled live orders & bills (starts empty if no genuine saved state exists)
const initialLoaded = loadPersistedState();
let liveBillsCache: EwityBillSummary[] = initialLoaded.bills;
let liveOrdersCache: Order[] = initialLoaded.orders;
let lastSyncTimestamp: number | null = null;
let lastSuccessfulApiRequestAt: number | null = null;
let lastSuccessfulReconciliationAt: number | null = null;
let activeConfigSource: 'environment' | 'custom_runtime' = 'environment';
let isDemoModeActive: boolean = false;
let currentConnectionStatus: EwityConnectionStatus = ewityClient.hasCredentials() ? 'Connecting' : 'NOT CONFIGURED';
let currentCompanyInfo: any = null;
let currentAuthorities: string[] = [];
let cachedLocations: EwityLocation[] = [];
let lastErrorMessage: string | undefined = ewityClient.hasCredentials() ? undefined : 'No Ewity credentials configured.';
let lastTestOutcome: TestConnectionResult | null = null;

// Periodic reconciliation worker
const reconciler = new EwityReconciliationWorker(
  ewityClient,
  60000,
  (reconciledBills) => {
    liveBillsCache = reconciledBills;
    liveOrdersCache = reconciledBills.map((b) => {
      const existing = liveOrdersCache.find((o) => o.id === `ewity-${b.id}`);
      return mapEwityBillToOrder(b, undefined, existing, 'ewity_api');
    });
    lastSyncTimestamp = Date.now();
    lastSuccessfulReconciliationAt = Date.now();
    lastSuccessfulApiRequestAt = Date.now();
    persistState(liveBillsCache, liveOrdersCache);
  }
);

async function startServer() {
  const app = express();

  // Raw body capture middleware for webhook signature verification.
  // Preserves exact unparsed bytes in req.rawBody without mutation.
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // ---------------------------------------------------------
  // SAFE HEALTH-CHECK ENDPOINTS
  // Requirement: Safe GET health check that returns only service health
  // and does not reveal environment variables, API credentials,
  // webhook secrets or store identifiers.
  // ---------------------------------------------------------
  const healthCheckHandler = (_req: express.Request, res: express.Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).json({
      status: 'healthy',
      service: 'ewity-kitchen-watchdog',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    });
  };

  app.get('/health', healthCheckHandler);
  app.get('/api/health', healthCheckHandler);

  // ---------------------------------------------------------
  // EWITY API ROUTES
  // ---------------------------------------------------------

  /**
   * Helper to compute truthful current connection status and freshness.
   */
  function getTruthfulStatus(): { status: EwityConnectionStatus; isDataStale: boolean } {
    if (isDemoModeActive) {
      return { status: 'DEMO MODE', isDataStale: false };
    }

    if (!ewityClient.hasCredentials()) {
      return { status: 'NOT CONFIGURED', isDataStale: false };
    }

    if (currentConnectionStatus === 'AUTHENTICATION FAILED') {
      return { status: 'AUTHENTICATION FAILED', isDataStale: false };
    }

    if (currentConnectionStatus === 'AWAITING MERCHANT APPROVAL') {
      return { status: 'AWAITING MERCHANT APPROVAL', isDataStale: false };
    }

    if (currentConnectionStatus === 'PERMISSION ERROR') {
      return { status: 'PERMISSION ERROR', isDataStale: false };
    }

    if (currentConnectionStatus === 'CONNECTION ERROR') {
      return { status: 'CONNECTION ERROR', isDataStale: false };
    }

    if (currentConnectionStatus === 'NOT CONNECTED') {
      return { status: 'NOT CONNECTED', isDataStale: false };
    }

    if (currentConnectionStatus === 'Connecting') {
      return { status: 'Connecting', isDataStale: false };
    }

    if (currentConnectionStatus === 'LIVE CONNECTED' || currentConnectionStatus === 'LIVE DATA STALE') {
      // Freshness check: if polling or reconciliation has exceeded expected interval (120s)
      const STALE_THRESHOLD_MS = 120000;
      const latestActivity = Math.max(
        lastSuccessfulApiRequestAt || 0,
        lastSuccessfulReconciliationAt || 0,
        lastSyncTimestamp || 0
      );
      const isStale = latestActivity > 0 && Date.now() - latestActivity > STALE_THRESHOLD_MS;
      return {
        status: isStale ? 'LIVE DATA STALE' : 'LIVE CONNECTED',
        isDataStale: isStale,
      };
    }

    return { status: currentConnectionStatus, isDataStale: false };
  }

  /**
   * GET /api/ewity/status
   * Reports truthful connection state, freshness, configuration source, and merchant store identity.
   * Requirement: Never shows LIVE CONNECTED unless a real authenticated Apps API request succeeded.
   */
  app.get('/api/ewity/status', async (_req, res) => {
    const masked = ewityClient.getMaskedCredentials();
    const hasRequiredPerm = currentAuthorities.some((a) =>
      a.includes('p/r-bill-history') || a.includes('p/r-bill') || a.includes('p/r-store')
    );

    const { status: calculatedStatus, isDataStale } = getTruthfulStatus();
    const isActuallyConnected =
      calculatedStatus === 'LIVE CONNECTED' || calculatedStatus === 'LIVE DATA STALE';

    const info: EwityConnectionInfo = {
      mode: isDemoModeActive ? 'demo' : 'live',
      status: calculatedStatus,
      isConnected: isActuallyConnected,
      storeId: masked.storeId,
      hasApiKey: masked.hasApiKey,
      hasStoreId: masked.hasStoreId,
      apiKeyMasked: masked.apiKeyMasked,
      isPlatformKeyWarning: masked.isPlatformKeyWarning,
      configSource: activeConfigSource,
      hasSigningSecret: ewityWebhook.hasSecret(),
      hasAppUiSecret: ewityAppUi.hasSigningSecret(),
      appUiEndpoint: '/ewity/app',
      appUiUrl: `${DEPLOYED_APP_URL}/ewity/app`,
      company: currentCompanyInfo,
      authorities: currentAuthorities,
      hasBillHistoryPermission: hasRequiredPerm,
      availableLocations: cachedLocations,
      lastSyncedAt: lastSyncTimestamp || undefined,
      lastSuccessfulApiRequestAt: lastSuccessfulApiRequestAt || undefined,
      lastSuccessfulReconciliationAt: lastSuccessfulReconciliationAt || reconciler.getStats().lastRunAt || undefined,
      lastWebhookReceivedAt: ewityWebhook.getLastReceivedAt() || undefined,
      lastWebhookEvent: ewityWebhook.getLastEventName() || undefined,
      selectedMerchantStore: currentCompanyInfo
        ? {
            id: currentCompanyInfo.id,
            name: currentCompanyInfo.name,
            domain: currentCompanyInfo.domain,
          }
        : undefined,
      latestSafeErrorMessage: lastErrorMessage,
      lastErrorMessage,
      isDataStale,
      staleThresholdSec: 120,
      lastError: lastErrorMessage,
      reconciliationActive: reconciler.getStats().isRunning,
      lastReconciliationAt: reconciler.getStats().lastRunAt || undefined,
      lastTestedAt: lastTestOutcome?.testedAt || null,
      testOutcome: lastTestOutcome,
    };

    res.json(info);
  });

  /**
   * POST /api/ewity/test-connection
   * Real, read-only test request to Ewity Apps API.
   * Tests currently configured credentials or provided test credentials.
   * Updates server status solely from the verified outcome.
   */
  app.post('/api/ewity/test-connection', async (req, res) => {
    const { apiKey, storeId, baseUrl, resetToEnv } = req.body || {};

    if (resetToEnv) {
      activeConfigSource = 'environment';
      ewityClient.updateCredentials(
        process.env.EWITY_APP_API_KEY || '',
        process.env.EWITY_STORE_ID || '',
        process.env.EWITY_API_BASE_URL
      );
    } else if (typeof apiKey === 'string' || typeof storeId === 'string' || typeof baseUrl === 'string') {
      activeConfigSource = 'custom_runtime';
      ewityClient.updateCredentials(
        typeof apiKey === 'string' ? apiKey : '',
        typeof storeId === 'string' ? storeId : '',
        typeof baseUrl === 'string' ? baseUrl : undefined
      );
    }

    const testRes = await ewityClient.testAppsApiConnection();
    lastTestOutcome = { ...testRes, configSource: activeConfigSource };

    if (testRes.success) {
      currentConnectionStatus = 'LIVE CONNECTED';
      lastErrorMessage = undefined;
      lastSuccessfulApiRequestAt = Date.now();
      lastSyncTimestamp = Date.now();
      try {
        cachedLocations = await ewityClient.getLocations();
      } catch {
        // ignore location list failure
      }
      reconciler.start();
    } else {
      currentConnectionStatus = testRes.outcome;
      lastErrorMessage = testRes.message;
      reconciler.stop();
    }

    return res.json({
      ...lastTestOutcome,
      status: currentConnectionStatus,
    });
  });

  /**
   * POST /api/ewity/connect
   * Validates credentials against Ewity Apps API.
   * STRICT: Does not silently fall back to environment variables when custom runtime credentials are submitted.
   * Sets truthful status: LIVE CONNECTED, AWAITING MERCHANT APPROVAL, AUTHENTICATION FAILED, PERMISSION ERROR, or CONNECTION ERROR.
   */
  app.post('/api/ewity/connect', async (req, res) => {
    const { apiKey, storeId, baseUrl, webhookSecret, resetToEnv } = req.body || {};

    if (resetToEnv) {
      activeConfigSource = 'environment';
      ewityClient.updateCredentials(
        process.env.EWITY_APP_API_KEY || '',
        process.env.EWITY_STORE_ID || '',
        process.env.EWITY_API_BASE_URL
      );
    } else {
      activeConfigSource = 'custom_runtime';
      // Use exact values provided; do not secretly substitute process.env
      ewityClient.updateCredentials(
        typeof apiKey === 'string' ? apiKey : '',
        typeof storeId === 'string' ? storeId : '',
        typeof baseUrl === 'string' ? baseUrl : undefined
      );
    }

    if (webhookSecret) {
      ewityWebhook.setSigningSecret(webhookSecret);
      ewityAppUi.setSigningSecret(webhookSecret);
    }

    if (!ewityClient.hasCredentials()) {
      currentConnectionStatus = 'NOT CONFIGURED';
      lastErrorMessage = !ewityClient.hasApiKey()
        ? 'Missing EWITY_APP_API_KEY. Please provide the Apps API key.'
        : 'Missing EWITY_STORE_ID. Please specify the installed merchant store ID.';
      return res.status(400).json({
        success: false,
        status: currentConnectionStatus,
        error: lastErrorMessage,
        configSource: activeConfigSource,
      });
    }

    currentConnectionStatus = 'Connecting';

    const testRes = await ewityClient.testAppsApiConnection();
    lastTestOutcome = { ...testRes, configSource: activeConfigSource };

    if (testRes.success) {
      currentConnectionStatus = 'LIVE CONNECTED';
      isDemoModeActive = false;
      lastErrorMessage = undefined;
      lastSyncTimestamp = Date.now();
      lastSuccessfulApiRequestAt = Date.now();

      try {
        cachedLocations = await ewityClient.getLocations();
      } catch {
        // ignore
      }

      reconciler.start();

      return res.json({
        success: true,
        status: currentConnectionStatus,
        message: testRes.message,
        storeId: testRes.storeId,
        locationsCount: testRes.locationsCount,
        locations: cachedLocations,
        configSource: activeConfigSource,
      });
    } else {
      currentConnectionStatus = testRes.outcome;
      lastErrorMessage = testRes.message;
      reconciler.stop();

      const httpCode = testRes.httpStatus && testRes.httpStatus >= 400 && testRes.httpStatus <= 599
        ? testRes.httpStatus
        : 400;

      return res.status(httpCode).json({
        success: false,
        status: currentConnectionStatus,
        error: testRes.message,
        outcome: testRes.outcome,
        httpStatus: testRes.httpStatus,
        isPlatformKeyWarning: testRes.isPlatformKeyWarning,
        configSource: activeConfigSource,
      });
    }
  });

  /**
   * POST /api/ewity/disconnect
   * Disconnects Ewity connection and marks status truthfully as NOT CONNECTED.
   */
  app.post('/api/ewity/disconnect', (_req, res) => {
    reconciler.stop();
    currentConnectionStatus = 'NOT CONNECTED';
    isDemoModeActive = false;
    lastErrorMessage = undefined;
    lastTestOutcome = null;
    res.json({ success: true, status: 'NOT CONNECTED', mode: 'live', configSource: activeConfigSource });
  });

  /**
   * POST /api/ewity/demo/enable
   * Explicit user activation of Demo Mode.
   */
  app.post('/api/ewity/demo/enable', (_req, res) => {
    isDemoModeActive = true;
    res.json({ success: true, status: 'DEMO MODE', mode: 'demo' });
  });

  /**
   * POST /api/ewity/demo/disable
   * Explicit user deactivation of Demo Mode, returning to Live Mode.
   */
  app.post('/api/ewity/demo/disable', (_req, res) => {
    isDemoModeActive = false;
    const { status } = getTruthfulStatus();
    res.json({ success: true, status, mode: 'live' });
  });

  /**
   * GET /api/ewity/locations
   * Lists genuine locations if connected, demo locations only in explicit Demo Mode, or empty if disconnected.
   */
  app.get('/api/ewity/locations', async (req, res) => {
    const isDemoReq = req.query.mode === 'demo' || isDemoModeActive;
    if (isDemoReq) {
      return res.json({
        locations: [
          { id: 1, name: 'Harbor Wharf Bistro (Store #101)', type: 'restaurant' },
          { id: 2, name: 'Ewity Downtown Flagship (Store #102)', type: 'restaurant' },
          { id: 3, name: 'The Garden Terrace (Store #103)', type: 'restaurant' },
        ],
        mode: 'demo',
      });
    }

    const { status } = getTruthfulStatus();
    if (status !== 'LIVE CONNECTED' && status !== 'LIVE DATA STALE') {
      return res.json({ locations: [], mode: 'live' });
    }

    try {
      const locations = await ewityClient.getLocations();
      cachedLocations = locations;
      res.json({ locations, mode: 'live' });
    } catch (err: any) {
      res.status(502).json({ error: err.message, locations: [], mode: 'live' });
    }
  });

  /**
   * GET /api/ewity/bills
   * Proxies bill listing with pagination, search, and KOT filtering.
   * Path: GET /sales/bills/location/{id}
   *
   * STRICT ZERO-FAKE-DATA RULES:
   * 1. If not connected, returns an error and EMPTY orders. Never returns mock bills.
   * 2. If API fails, returns 502 error. Never returns fallbackData containing mock records.
   * 3. Mock bills are returned ONLY when Demo Mode is explicitly active.
   */
  app.get('/api/ewity/bills', async (req, res) => {
    const isDemoReq = req.query.mode === 'demo' || isDemoModeActive;

    // 1. Explicit Demo Mode: return mock bills tagged as simulated fixtures
    if (isDemoReq) {
      const {
        page = 1,
        limit = 20,
        q_kot_number,
        q_number,
        q_status,
      } = req.query as Record<string, string>;

      let filtered = [...MOCK_EWITY_BILLS];
      if (q_kot_number) {
        filtered = filtered.filter((b) =>
          b.kot_number?.toLowerCase().includes(q_kot_number.toLowerCase())
        );
      }
      if (q_status && q_status !== 'ALL') {
        filtered = filtered.filter((b) => b.status === q_status);
      }
      if (q_number) {
        filtered = filtered.filter((b) =>
          b.number.toLowerCase().includes(q_number.toLowerCase())
        );
      }

      const mappedOrders = filtered.map((b) =>
        mapEwityBillToOrder(b, undefined, undefined, 'simulated_fixture')
      );
      return res.json({
        data: filtered,
        mappedOrders,
        pagination: {
          pageSize: Number(limit),
          current: Number(page),
          total: filtered.length,
          hasMorePages: false,
        },
        mode: 'demo',
        isDemo: true,
      });
    }

    // 2. Live Mode Check:
    // If Ewity is not authenticated, return an explicit error with EMPTY data.
    const { status: connStatus } = getTruthfulStatus();
    if (connStatus !== 'LIVE CONNECTED' && connStatus !== 'LIVE DATA STALE') {
      return res.status(400).json({
        error: 'not_connected',
        status: connStatus,
        message: lastErrorMessage || 'Ewity POS is not connected. Configure credentials to fetch live bills.',
        data: [],
        mappedOrders: [],
        mode: 'live',
        isDemo: false,
      });
    }

    const {
      location_id = 'all',
      page = 1,
      limit = 20,
      order_by = 'created_at:desc',
      q_kot_number,
      q_number,
      q_status,
      q_type,
      q_payment_status,
    } = req.query as Record<string, string>;

    // Sanitize location id
    let effectiveLocationId = location_id;
    if (cachedLocations.length > 0) {
      const isKnown = cachedLocations.some((l) => String(l.id) === location_id);
      if (!isKnown && location_id !== 'all') {
        effectiveLocationId = String(cachedLocations[0].id);
      }
    }

    try {
      const billResponse = await ewityClient.listBills(effectiveLocationId, {
        page: Number(page),
        limit: Number(limit),
        order_by,
        q_kot_number,
        q_number,
        q_status,
        q_type,
        q_payment_status,
      });

      lastSuccessfulApiRequestAt = Date.now();

      // If store app access is pending merchant installation in Ewity App Store:
      if (billResponse.appAccessPending) {
        return res.status(403).json({
          error: 'app_authorization_pending',
          status: 'PERMISSION ERROR',
          message: 'This store has not authorized app access. The merchant must install the app in the Ewity App Store.',
          data: [],
          mappedOrders: [],
          mode: 'live',
          isDemo: false,
          appAccessPending: true,
        });
      }

      // Map real bills into internal Order model with 'ewity_api' data source
      const mappedOrders = billResponse.data.map((bill) => {
        const existing = liveOrdersCache.find((o) => o.id === `ewity-${bill.id}`);
        return mapEwityBillToOrder(bill, undefined, existing, 'ewity_api');
      });

      // Update genuine cache
      liveBillsCache = billResponse.data;
      liveOrdersCache = mappedOrders;
      lastSyncTimestamp = Date.now();
      persistState(liveBillsCache, liveOrdersCache);

      return res.json({
        ...billResponse,
        mappedOrders,
        mode: 'live',
        isDemo: false,
        appAccessPending: false,
      });
    } catch (err: any) {
      lastErrorMessage = err.message || 'Failed to fetch bills from Ewity API';
      // Return clear error. NEVER return fallbackData containing mock bills!
      return res.status(502).json({
        error: lastErrorMessage,
        status: 'CONNECTION ERROR',
        message: lastErrorMessage,
        data: [],
        mappedOrders: [],
        mode: 'live',
        isDemo: false,
      });
    }
  });

  /**
   * GET /api/ewity/bills/:id
   * Retrieves single bill detail including line items and payments.
   * Returns mock bill ONLY in Demo Mode. Never returns mock bill in Live Mode.
   */
  app.get('/api/ewity/bills/:id', async (req, res) => {
    const { id } = req.params;
    const isDemoReq = req.query.mode === 'demo' || isDemoModeActive;

    if (isDemoReq) {
      const found = MOCK_EWITY_BILLS.find((b) => String(b.id) === id);
      if (found) {
        return res.json({ data: found, mode: 'demo', isDemo: true });
      }
      return res.status(404).json({ error: 'Bill not found in demo data' });
    }

    const { status: connStatus } = getTruthfulStatus();
    if (connStatus !== 'LIVE CONNECTED' && connStatus !== 'LIVE DATA STALE') {
      return res.status(400).json({
        error: 'not_connected',
        status: connStatus,
        message: 'Ewity POS is not connected.',
      });
    }

    try {
      const detail = await ewityClient.getBillDetail(id);
      lastSuccessfulApiRequestAt = Date.now();
      res.json({ data: detail, mode: 'live', isDemo: false });
    } catch (err: any) {
      res.status(502).json({ error: err.message, mode: 'live', isDemo: false });
    }
  });

  /**
   * GET /ewity/app
   * Official Ewity App UI protocol endpoint.
   * Returns Ewity's expected JSON document with version: 1 and a components
   * array containing an IframeView that embeds the existing Watchdog interface.
   *
   * Security & Authentication requirements:
   * 1. Cryptographically verify X-Ewity-Signature (HMAC-SHA256, 300s window)
   * 2. Cryptographically validate X-Ewity-Context JWT (HS256)
   * 3. Enforce merchant identity from verified JWT claims (never unsigned query params)
   * 4. Keep App UI auth separate from webhook auth
   * 5. Safe error responses, never logging secrets or raw JWTs
   */
  app.get('/ewity/app', (req: any, res) => {
    try {
      if (!ewityAppUi.hasSigningSecret()) {
        return res.status(500).json({
          error: 'configuration_error',
          message: 'Ewity signing secret is not configured on the server. Please configure EWITY_SIGNING_SECRET or EWITY_WEBHOOK_SECRET.',
        });
      }

      const rawBody = req.rawBody || Buffer.from('');
      const auth = ewityAppUi.authenticateRequest(req.headers, rawBody, req.query);

      if (!auth.isValid) {
        console.warn(`[EWITY-APP-UI] Rejected unauthorized App UI request: ${auth.reason}`);
        return res.status(auth.statusCode).json({
          error: auth.error || 'unauthorized',
          message: auth.reason || 'Authentication failed.',
        });
      }

      // Generate compliant version: 1 App UI JSON document
      const merchantStoreId = auth.merchantIdentity?.storeId;
      const doc = ewityAppUi.buildAppUiDocument(DEPLOYED_APP_URL, 900, merchantStoreId);

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(doc);
    } catch (err: any) {
      console.error('[EWITY-APP-UI] Internal error in /ewity/app:', err?.message || 'Unknown');
      return res.status(500).json({
        error: 'internal_error',
        message: 'An internal error occurred while generating the App UI specification.',
      });
    }
  });

  /**
   * POST /api/ewity/app/simulate
   * Simulates an authorized Ewity POS App UI request to test signature and JWT context validation.
   */
  app.post('/api/ewity/app/simulate', async (_req, res) => {
    try {
      if (!ewityAppUi.hasSigningSecret()) {
        return res.status(500).json({
          error: 'configuration_error',
          message: 'Ewity signing secret is not configured.',
        });
      }

      const secret = ewityAppUi.getSigningSecret();
      const nowSec = Math.floor(Date.now() / 1000);
      const signatureHeader = ewityAppUi.generateSignatureHeader(secret, nowSec, '');
      const contextToken = ewityAppUi.generateContextToken(secret, {
        install: { store_id: ewityClient.getMaskedCredentials().storeId || 'pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo' },
        company: currentCompanyInfo || { id: 10134, name: 'Test Sandbox' },
      });

      // Verify request
      const auth = ewityAppUi.authenticateRequest(
        {
          'x-ewity-signature': signatureHeader,
          'x-ewity-context': contextToken,
        },
        '',
        {}
      );

      const doc = ewityAppUi.buildAppUiDocument(
        DEPLOYED_APP_URL,
        900,
        auth.merchantIdentity?.storeId
      );

      res.json({
        success: true,
        request: {
          method: 'GET',
          path: '/ewity/app',
          headers: {
            'X-Ewity-Signature': signatureHeader,
            'X-Ewity-Context': `${contextToken.slice(0, 25)}...[REDACTED_FOR_SECURITY]`,
          },
        },
        auth: {
          isValid: auth.isValid,
          statusCode: auth.statusCode,
          merchantIdentity: auth.merchantIdentity,
        },
        response: doc,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/ewity/webhook and POST /api/ewity/webhooks
   * Official Webhook endpoint receiving signed Ewity event notifications.
   * Headers: X-Ewity-Event, X-Ewity-Delivery, X-Ewity-Signature
   * Supports both singular and plural paths to guarantee seamless integration.
   */
  app.post(['/api/ewity/webhook', '/api/ewity/webhooks'], (req: any, res) => {
    try {
      const sigHeader = req.headers['x-ewity-signature'] as string;
      const deliveryId = (req.headers['x-ewity-delivery'] || req.body?.id) as string;
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

      // Validate payload presence
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({
          error: 'invalid_payload',
          message: 'Malformed request body. Expected JSON object envelope.',
        });
      }

      // 1. Verify HMAC-SHA256 Signature against raw unmutated body
      const verification = ewityWebhook.verifySignature(sigHeader, rawBody);
      if (!verification.isValid) {
        console.warn(`[EWITY-WEBHOOK] Rejected unverified webhook delivery ${deliveryId || 'unknown'}: ${verification.reason}`);
        return res.status(401).json({
          error: 'invalid_signature',
          message: verification.reason || 'Cryptographic signature verification failed.',
        });
      }

      // 2. Process Envelope Idempotently (with delivery ID deduplication & out-of-order sequencing)
      const envelope = req.body;
      const result = ewityWebhook.processEnvelope(deliveryId, envelope);

      // 3. Update in-memory and persistent orders if applicable
      if (result.success && envelope.data) {
        if (envelope.event === 'bill.created' && envelope.data.bill) {
          const bill = envelope.data.bill;
          const mappedOrder = mapEwityBillToOrder(bill, undefined, undefined, 'ewity_webhook');
          const existingIdx = liveOrdersCache.findIndex((o) => o.id === mappedOrder.id);
          if (existingIdx >= 0) {
            liveOrdersCache[existingIdx] = mappedOrder;
          } else {
            liveOrdersCache.unshift(mappedOrder);
          }
          persistState(liveBillsCache, liveOrdersCache);
        } else if (envelope.event === 'bill.voided' && envelope.data.bill_id) {
          const billId = `ewity-${envelope.data.bill_id}`;
          liveOrdersCache = liveOrdersCache.map((ord) => {
            if (ord.id === billId) {
              return { ...ord, orderStatus: 'Voided', dataSource: 'ewity_webhook' as const };
            }
            return ord;
          });
          persistState(liveBillsCache, liveOrdersCache);
        }
      }

      // Always respond 200 OK quickly within 5s
      return res.status(200).json({
        status: 'received',
        delivery_id: deliveryId,
        result: result.action,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[EWITY-WEBHOOK] Error processing webhook:', err);
      // Return 500 so Ewity delivery scheduler will retry (after 1, 4, 8 minutes)
      return res.status(500).json({
        error: 'processing_error',
        message: 'Internal error processing webhook event. Queued for retry.',
      });
    }
  });

  /**
   * GET /api/ewity/webhooks/recent
   * Returns recent webhooks for inspector UI
   */
  app.get('/api/ewity/webhooks/recent', (_req, res) => {
    res.json({
      events: ewityWebhook.getRecentEvents(),
      processedCount: ewityWebhook.getProcessedCount(),
    });
  });

  /**
   * POST /api/ewity/reconcile
   * Triggers immediate reconciliation
   */
  app.post('/api/ewity/reconcile', async (_req, res) => {
    const result = await reconciler.reconcile();
    if (result.success && result.billsCount >= 0) {
      lastSuccessfulReconciliationAt = Date.now();
      lastSuccessfulApiRequestAt = Date.now();
    }
    res.json(result);
  });

  /**
   * POST /api/ewity/tests/run
   * Runs the complete mock API test suite
   */
  app.post('/api/ewity/tests/run', async (_req, res) => {
    const results = await runEwityMockTestSuite();
    res.json({
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
    });
  });

  /**
   * GET /api/ewity/logs
   * Returns structured request logs (without secrets)
   */
  app.get('/api/ewity/logs', (_req, res) => {
    res.json({ logs: ewityClient.getLogs() });
  });

  // ---------------------------------------------------------
  // VITE DEV SERVER INTEGRATION
  // ---------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  // Automatically verify against official Ewity Apps API on startup if environment credentials are provided
  if (ewityClient.hasCredentials()) {
    try {
      console.log('[EWITY-WATCHDOG] Validating Ewity Apps API with environment credentials...');
      const testRes = await ewityClient.testAppsApiConnection();
      lastTestOutcome = { ...testRes, configSource: 'environment' };

      if (testRes.success) {
        currentConnectionStatus = 'LIVE CONNECTED';
        lastErrorMessage = undefined;
        lastSyncTimestamp = Date.now();
        lastSuccessfulApiRequestAt = Date.now();
        try {
          cachedLocations = await ewityClient.getLocations();
        } catch {
          // ignore location list failure
        }
        reconciler.start();
        console.log(`[EWITY-WATCHDOG] ✓ ${testRes.message}`);
      } else {
        currentConnectionStatus = testRes.outcome;
        lastErrorMessage = testRes.message;
        console.warn(`[EWITY-WATCHDOG] ⚠ Connection check failed (${testRes.outcome}): ${testRes.message}`);
      }
    } catch (err: any) {
      console.warn('[EWITY-WATCHDOG] Initial connection verification error:', err.message);
      currentConnectionStatus = 'CONNECTION ERROR';
      lastErrorMessage = err.message || 'Failed to authenticate with Ewity API';
    }
  } else {
    currentConnectionStatus = 'NOT CONFIGURED';
    lastErrorMessage = !ewityClient.hasApiKey()
      ? 'Missing EWITY_APP_API_KEY. Please configure Apps API credentials.'
      : 'Missing EWITY_STORE_ID. Specify the installed merchant store ID.';
    console.log(`[EWITY-WATCHDOG] Credentials not fully configured: ${lastErrorMessage}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EWITY-WATCHDOG] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[EWITY-WATCHDOG] Server failed to start:', err);
  process.exit(1);
});
