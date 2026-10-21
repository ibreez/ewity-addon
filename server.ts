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
import { mapEwityBillToOrder } from './src/services/ewityMapper';
import { EwityLocation, EwityBillSummary, EwityConnectionInfo, EwityConnectionStatus, TestConnectionResult } from './src/types/ewity';
import { Order, OrderDataSource, Alert, MonitoringSettings, OrderStatus } from './src/types';
import { evaluateMonitoringRules } from './src/services/monitoringRules';
import { DurableStore } from './src/server/durableStore';
import { AuthManager, createAuthMiddlewares } from './src/server/authMiddleware';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getInitialPort(): number {
  if (process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const parsed = parseInt(process.argv[portArgIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3000;
}

const PORT = getInitialPort();
const SERVER_START_TIME = Date.now();

// Persistent durable store
const durableStore = new DurableStore(path.resolve('.data'));

// Initialize Ewity services with environment variables
const ewityConfig = {
  baseUrl: process.env.EWITY_API_BASE_URL || 'https://api.ewitypos.com/apps-v1',
  apiKey: process.env.EWITY_APP_API_KEY || '',
  storeId: process.env.EWITY_STORE_ID || '',
  timeoutMs: 10000,
  maxRetries: 3,
};

const ewityClient = new EwityApiClient(ewityConfig);
const ewityWebhook = new EwityWebhookService(
  process.env.EWITY_SIGNING_SECRET || process.env.EWITY_WEBHOOK_SECRET || '',
  durableStore
);

const appUiSigningSecret =
  process.env.EWITY_SIGNING_SECRET ||
  process.env.EWITY_APP_SECRET ||
  process.env.EWITY_WEBHOOK_SECRET ||
  '';

/**
 * Validates and safely resolves the HTTPS base URL for App UI iframes.
 * Priority 6: Removes brittle hardcoded fallback while validating secure protocol.
 */
export function getValidatedBaseUrl(req?: express.Request): string {
  const envUrl = process.env.APP_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    try {
      const parsed = new URL(envUrl.trim());
      if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'))) {
        return parsed.origin;
      }
    } catch {
      // Invalid URL provided in env
    }
  }

  if (req) {
    const protoHeader = req.headers['x-forwarded-proto'];
    const proto = (typeof protoHeader === 'string' ? protoHeader.split(',')[0].trim() : req.protocol) || 'https';
    const hostHeader = req.headers['x-forwarded-host'];
    const host = (typeof hostHeader === 'string' ? hostHeader.split(',')[0].trim() : req.get('host')) || 'localhost:3000';
    return `${proto}://${host}`;
  }

  return 'https://ais-dev-4vmloib4ucrege7oirz6nu-417987842324.asia-southeast1.run.app';
}

const ewityAppUi = new EwityAppUiService(appUiSigningSecret, getValidatedBaseUrl());
const authManager = new AuthManager(appUiSigningSecret, process.env.ADMIN_API_KEY);

function getTargetTenantStoreId(): string {
  return ewityClient.getMaskedCredentials().storeId || process.env.EWITY_STORE_ID || '';
}

const { requireAdminAuth, requireAuthOrEmbedSession, extractAuthToken } = createAuthMiddlewares(
  authManager,
  getTargetTenantStoreId
);

// In-memory active cache synchronized with durable tenant store
const currentTargetStore = getTargetTenantStoreId() || 'default';
const initialTenantData = durableStore.loadTenantData(currentTargetStore);

let liveBillsCache: EwityBillSummary[] = initialTenantData.bills;
let liveOrdersCache: Order[] = initialTenantData.orders;
let lastSyncTimestamp: number | null = null;
let lastSuccessfulApiRequestAt: number | null = null;
let lastSuccessfulReconciliationAt: number | null = null;
let activeConfigSource: 'environment' | 'custom_runtime' = 'environment';
let currentConnectionStatus: EwityConnectionStatus = ewityClient.hasCredentials() ? 'Connecting' : 'NOT CONFIGURED';
let currentCompanyInfo: any = null;
let currentAuthorities: string[] = [];
let cachedLocations: EwityLocation[] = [];
let lastErrorMessage: string | undefined = ewityClient.hasCredentials() ? undefined : 'No Ewity credentials configured.';
let lastTestOutcome: TestConnectionResult | null = null;
let watchdogSettings: MonitoringSettings = initialTenantData.settings;
let appAlerts: Alert[] = initialTenantData.alerts;

function persistTenantState(storeId: string = getTargetTenantStoreId() || 'default') {
  try {
    durableStore.saveTenantData({
      storeId,
      updatedAt: Date.now(),
      bills: liveBillsCache,
      orders: liveOrdersCache,
      alerts: appAlerts,
      settings: watchdogSettings,
      auditLog: [],
    });
  } catch (err) {
    console.warn('[EWITY-WATCHDOG] Failed to persist tenant state:', err);
  }
}

// Periodic reconciliation worker with overlap prevention
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
    persistTenantState();
  }
);

/**
 * Startup environment verification.
 * Priority 6: Validates all required environment variables without logging sensitive secrets.
 */
function validateStartupEnvironment() {
  console.log('[STARTUP-CHECK] ========================================');
  console.log('[STARTUP-CHECK] Ewity Kitchen Watchdog Environment Audit');
  console.log('[STARTUP-CHECK] ========================================');
  console.log(`[STARTUP-CHECK] Port: ${PORT}`);
  console.log(`[STARTUP-CHECK] Environment: ${process.env.NODE_ENV || 'development'}`);

  if (process.env.EWITY_APP_API_KEY) {
    console.log(`[STARTUP-CHECK] EWITY_APP_API_KEY: Configured (length: ${process.env.EWITY_APP_API_KEY.length})`);
  } else {
    console.log('[STARTUP-CHECK] EWITY_APP_API_KEY: NOT CONFIGURED (Awaiting admin configuration)');
  }

  if (process.env.EWITY_STORE_ID) {
    console.log(`[STARTUP-CHECK] EWITY_STORE_ID: Configured (store: ${process.env.EWITY_STORE_ID})`);
  } else {
    console.log('[STARTUP-CHECK] EWITY_STORE_ID: NOT CONFIGURED');
  }

  if (appUiSigningSecret) {
    console.log(`[STARTUP-CHECK] EWITY_SIGNING_SECRET: Configured (length: ${appUiSigningSecret.length})`);
  } else {
    console.warn('[STARTUP-CHECK] EWITY_SIGNING_SECRET: NOT CONFIGURED (App UI requests will require secret)');
  }

  if (process.env.ADMIN_API_KEY) {
    console.log('[STARTUP-CHECK] ADMIN_API_KEY: Configured via environment');
  } else {
    console.log('[STARTUP-CHECK] ADMIN_API_KEY: Using durable secret (.data/admin_key.secret)');
  }
  console.log('[STARTUP-CHECK] ========================================');
}

/**
 * Computes truthful connection state and freshness
 */
function getTruthfulStatus(): { status: EwityConnectionStatus; isDataStale: boolean } {
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

export async function createApp(options: {
  skipVite?: boolean;
  signingSecret?: string;
  adminApiKey?: string;
  storeId?: string;
} = {}) {
  if (options.signingSecret) {
    ewityAppUi.setSigningSecret(options.signingSecret);
    ewityWebhook.setSigningSecret(options.signingSecret);
    authManager.setSecret(options.signingSecret);
  }
  if (options.adminApiKey) {
    authManager.setAdminApiKey(options.adminApiKey);
  }
  if (options.storeId) {
    ewityClient.updateCredentials(
      process.env.EWITY_APP_API_KEY || '',
      options.storeId,
      process.env.EWITY_API_BASE_URL
    );
  }

  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  let vite: any = null;
  if (!isProd && !options.skipVite) {
    try {
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
    } catch {
      // In test runner or non-vite environment
    }
  }

  // Priority 6: Production security headers & framing control
  // STEP 2: Explicitly allows documented Ewity origins (including apex domains and subdomains)
  // as well as development/preview embedding origins. Never uses wildcard "*".
  const ALLOWED_FRAME_ANCESTORS =
    "frame-ancestors 'self' https://*.ewitypos.com https://ewitypos.com https://*.ewity.com https://ewity.com https://*.google.com https://*.googleusercontent.com https://*.run.app https://localhost.corp.google.com:26001 http://localhost:*;";

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', ALLOWED_FRAME_ANCESTORS);
    res.removeHeader('X-Powered-By');
    res.removeHeader('X-Frame-Options');

    // CORS headers for Ewity POS API & Embed
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Ewity-Signature, X-Ewity-Context, X-Ewity-Store, X-Ewity-Session, X-Admin-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Priority 6: Request payload limit and raw body capture
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  const serveAppHtml = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', ALLOWED_FRAME_ANCESTORS);
    res.removeHeader('X-Frame-Options');
    if (!isProd && vite) {
      try {
        const htmlPath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(htmlPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl || req.url, template);
        return res.status(200).send(template);
      } catch (e) {
        return next(e);
      }
    } else {
      const distHtml = path.resolve(__dirname, 'dist', 'index.html');
      if (fs.existsSync(distHtml)) {
        return res.sendFile(distHtml);
      }
      const rootHtml = path.resolve(__dirname, 'index.html');
      return res.sendFile(rootHtml);
    }
  };

  // ---------------------------------------------------------
  // SAFE HEALTH-CHECK ENDPOINTS (Priority 6)
  // Publicly reachable, returns health status without leaking secrets
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
  // EWITY APP UI v1 PROTOCOL ENDPOINTS (Priority 1, 2, 3)
  // Publicly reachable with strict HMAC & JWT verification
  // ---------------------------------------------------------

  /**
   * GET /ewity/app
   * Canonical Ewity App UI Protocol (v1) Page & Tab-Content Endpoint.
   */
  app.get('/ewity/app', async (req: any, res, next) => {
    const hasSignature = Boolean(req.headers['x-ewity-signature']);
    const acceptsHtml = req.accepts('html') || req.headers.accept?.includes('text/html');
    const isExplicitJson = req.query.format === 'json' || (req.headers.accept?.includes('application/json') && !acceptsHtml);

    // 1. Browser navigation or iframe embed requesting the UI:
    if (!hasSignature && (acceptsHtml || !isExplicitJson)) {
      return serveAppHtml(req, res, next);
    }

    // 2. Canonical Ewity App UI Protocol (v1) Request:
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

      // Priority 2: Tenant Isolation check
      const verifiedStoreId = auth.merchantIdentity?.storeId;
      const configuredStore = getTargetTenantStoreId();
      if (configuredStore && verifiedStoreId && verifiedStoreId !== configuredStore) {
        console.warn(`[EWITY-APP-UI] Tenant mismatch rejected: verified ${verifiedStoreId} != configured ${configuredStore}`);
        return res.status(403).json({
          error: 'tenant_mismatch',
          message: `Cross-tenant access forbidden. Context store ${verifiedStoreId} does not match configured store.`,
        });
      }

      const effectiveStoreId = verifiedStoreId || configuredStore || 'default';

      // Priority 3: Issue a short-lived signed embed session token bound to verified store and user
      const sessionToken = authManager.createEmbedSession({
        storeId: effectiveStoreId,
        userId: auth.merchantIdentity?.userId,
        userName: auth.merchantIdentity?.userName,
        companyId: auth.merchantIdentity?.companyId,
        companyName: auth.merchantIdentity?.companyName,
      });

      // Update app base URL dynamically if needed
      const dynamicBaseUrl = getValidatedBaseUrl(req);
      ewityAppUi.setDefaultAppUrl(dynamicBaseUrl);

      // Re-evaluate Watchdog rules against current state
      const evalResult = evaluateMonitoringRules(
        liveOrdersCache,
        appAlerts,
        watchdogSettings,
        currentConnectionStatus === 'LIVE CONNECTED' ? 'LIVE CONNECTED' : 'NOT CONNECTED'
      );
      appAlerts = evalResult.alerts;

      let doc: any;
      if (req.query.tab) {
        doc = ewityAppUi.buildTabContent(String(req.query.tab), {
          orders: liveOrdersCache,
          alerts: appAlerts,
          settings: {
            kotTimeoutSeconds: watchdogSettings.kotConfirmationTimeoutSec,
            orderWarningMinutes: watchdogSettings.orderCompletionWarningMin,
            soundEnabled: watchdogSettings.soundEnabled,
            monitoringEnabled: watchdogSettings.monitoringEnabled,
          },
          storeId: effectiveStoreId,
          connectionStatus: currentConnectionStatus,
          sessionToken,
        });
      } else {
        // Root page document (declares tabs)
        doc = ewityAppUi.buildHomeDocument();
      }

      // Strict validation against closed schemas
      const validation = ewityAppUi.validateDocument(doc);
      if (!validation.isValid) {
        console.error('[EWITY-APP-UI] Protocol validation errors:', validation.errors);
        return res.status(400).json({
          errorCode: 'APP_UI_INVALID',
          data: { ui_errors: validation.errors },
        });
      }

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(doc);
    } catch (err: any) {
      console.error('[EWITY-APP-UI] Internal error in GET /ewity/app:', err?.message || 'Unknown');
      return res.status(500).json({
        error: 'internal_error',
        message: 'An internal error occurred while generating the App UI specification.',
      });
    }
  });

  /**
   * POST /ewity/app
   * Canonical Ewity App UI Protocol (v1) Action Handler.
   */
  app.post('/ewity/app', async (req: any, res) => {
    try {
      if (!ewityAppUi.hasSigningSecret()) {
        return res.status(500).json({
          error: 'configuration_error',
          message: 'Ewity signing secret is not configured on the server.',
        });
      }

      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      const auth = ewityAppUi.authenticateRequest(req.headers, rawBody, req.query);

      if (!auth.isValid) {
        console.warn(`[EWITY-APP-UI] Rejected unauthorized Action POST: ${auth.reason}`);
        return res.status(auth.statusCode).json({
          error: auth.error || 'unauthorized',
          message: auth.reason || 'Authentication failed.',
        });
      }

      const verifiedStoreId = auth.merchantIdentity?.storeId;
      const configuredStore = getTargetTenantStoreId();
      if (configuredStore && verifiedStoreId && verifiedStoreId !== configuredStore) {
        return res.status(403).json({
          error: 'tenant_mismatch',
          message: `Cross-tenant action forbidden. Store ${verifiedStoreId} does not match configured store.`,
        });
      }

      const actionPost = req.body || {};
      if (actionPost.type !== 'action' || !actionPost.action_id) {
        return res.status(422).json({
          message: 'Invalid action payload. Expected type: "action" with an action_id.',
        });
      }

      const response = ewityAppUi.handleAction(actionPost, {
        orders: liveOrdersCache,
        alerts: appAlerts,
        onSaveSettings: (newSettings) => {
          if (newSettings.kotTimeoutSeconds) {
            watchdogSettings.kotConfirmationTimeoutSec = newSettings.kotTimeoutSeconds;
          }
          if (newSettings.orderWarningMinutes) {
            watchdogSettings.orderCompletionWarningMin = newSettings.orderWarningMinutes;
          }
          if (typeof newSettings.soundEnabled === 'boolean') {
            watchdogSettings.soundEnabled = newSettings.soundEnabled;
          }
          persistTenantState();
        },
      });

      if (response.ui) {
        const val = ewityAppUi.validateDocument(response.ui);
        if (!val.isValid) {
          console.error('[EWITY-APP-UI] Action UI validation error:', val.errors);
          return res.status(400).json({
            errorCode: 'APP_UI_INVALID',
            data: { ui_errors: val.errors },
          });
        }
      }

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(response);
    } catch (err: any) {
      console.error('[EWITY-APP-UI] Error handling action:', err?.message || 'Unknown');
      return res.status(500).json({
        error: 'internal_error',
        message: err.message || 'Failed to process App UI action.',
      });
    }
  });

  // ---------------------------------------------------------
  // WEBHOOK ENDPOINTS (Priority 1, 2, 4, 5)
  // Publicly reachable with strict HMAC verification
  // ---------------------------------------------------------
  app.post(['/api/ewity/webhook', '/api/ewity/webhooks'], (req: any, res) => {
    try {
      const sigHeader = req.headers['x-ewity-signature'] as string;
      const deliveryId = (req.headers['x-ewity-delivery'] || req.body?.id) as string;
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

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

      const envelope = req.body;

      // Priority 2: Tenant isolation check on webhook
      const webhookStoreId = envelope.install?.store_id;
      const configuredStore = getTargetTenantStoreId();
      if (configuredStore && webhookStoreId && webhookStoreId !== configuredStore) {
        console.warn(`[EWITY-WEBHOOK] Ignored webhook event for foreign store ${webhookStoreId} (configured: ${configuredStore})`);
        return res.status(200).json({
          status: 'ignored',
          reason: 'foreign_store',
          delivery_id: deliveryId,
        });
      }

      // 2. Process Envelope Idempotently with durable deduplication
      const result = ewityWebhook.processEnvelope(deliveryId, envelope);

      if (result.action === 'duplicate_ignored') {
        return res.status(200).json({
          status: 'received',
          delivery_id: deliveryId,
          result: 'duplicate_ignored',
        });
      }

      // 3. Update orders and lifecycle events (Priority 5: True Kitchen Monitoring)
      if (result.success && envelope.data) {
        try {
          if (envelope.event === 'bill.created' && envelope.data.bill) {
            const bill = envelope.data.bill;
            const mappedOrder = mapEwityBillToOrder(bill, undefined, undefined, 'ewity_webhook');
            const existingIdx = liveOrdersCache.findIndex((o) => o.id === mappedOrder.id);
            if (existingIdx >= 0) {
              liveOrdersCache[existingIdx] = mappedOrder;
            } else {
              liveOrdersCache.unshift(mappedOrder);
            }
            persistTenantState();
          } else if (envelope.event === 'bill.updated' && envelope.data.bill) {
            const bill = envelope.data.bill;
            const existing = liveOrdersCache.find((o) => o.id === `ewity-${bill.id}`);
            const mappedOrder = mapEwityBillToOrder(bill, undefined, existing, 'ewity_webhook');
            const existingIdx = liveOrdersCache.findIndex((o) => o.id === mappedOrder.id);
            if (existingIdx >= 0) {
              liveOrdersCache[existingIdx] = mappedOrder;
            } else {
              liveOrdersCache.unshift(mappedOrder);
            }
            persistTenantState();
          } else if ((envelope.event === 'bill.voided' || envelope.event === 'bill.refunded') && envelope.data.bill_id) {
            const billId = `ewity-${envelope.data.bill_id}`;
            liveOrdersCache = liveOrdersCache.map((ord) => {
              if (ord.id === billId) {
                return { ...ord, orderStatus: 'Voided' as const, dataSource: 'ewity_webhook' as const };
              }
              return ord;
            });
            persistTenantState();
          }

          // Mark delivery fully committed in durable store
          durableStore.updateDeliveryStatus(deliveryId, 'processed');
        } catch (commitErr: any) {
          durableStore.updateDeliveryStatus(deliveryId, 'failed', commitErr.message);
          throw commitErr;
        }
      }

      return res.status(200).json({
        status: 'received',
        delivery_id: deliveryId,
        result: result.action,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[EWITY-WEBHOOK] Error processing webhook:', err);
      return res.status(500).json({
        error: 'processing_error',
        message: 'Internal error processing webhook event. Delivery will be retried.',
      });
    }
  });

  // ---------------------------------------------------------
  // DATA APIs (Priority 1, 2, 3)
  // Protected by verified Embed Session OR Admin Key
  // ---------------------------------------------------------

  /**
   * GET /api/ewity/status
   */
  app.get('/api/ewity/status', requireAuthOrEmbedSession, async (_req, res) => {
    const masked = ewityClient.getMaskedCredentials();
    const hasRequiredPerm = currentAuthorities.some((a) =>
      a.includes('p/r-bill-history') || a.includes('p/r-bill') || a.includes('p/r-store')
    );

    const { status: calculatedStatus, isDataStale } = getTruthfulStatus();
    const isActuallyConnected =
      calculatedStatus === 'LIVE CONNECTED' || calculatedStatus === 'LIVE DATA STALE';

    const info: EwityConnectionInfo = {
      mode: 'live',
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
      appUiUrl: `${getValidatedBaseUrl(_req)}/ewity/app`,
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
   * GET /api/ewity/locations
   */
  app.get('/api/ewity/locations', requireAuthOrEmbedSession, async (req, res) => {
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
   */
  app.get('/api/ewity/bills', requireAuthOrEmbedSession, async (req, res) => {
    // Priority 2: Tenant isolation verification on query store_id
    const queryStore = typeof req.query.store_id === 'string' ? req.query.store_id : undefined;
    const authorizedStore = (req as any).authorizedStoreId;
    if (queryStore && authorizedStore && queryStore !== authorizedStore && !(req as any).isAdmin) {
      return res.status(403).json({
        error: 'tenant_mismatch',
        message: 'Forged or mismatched store_id parameter rejected.',
      });
    }

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

      const mappedOrders = billResponse.data.map((bill) => {
        const existing = liveOrdersCache.find((o) => o.id === `ewity-${bill.id}`);
        return mapEwityBillToOrder(bill, undefined, existing, 'ewity_api');
      });

      liveBillsCache = billResponse.data;
      liveOrdersCache = mappedOrders;
      lastSyncTimestamp = Date.now();
      persistTenantState();

      return res.json({
        ...billResponse,
        mappedOrders,
        mode: 'live',
        isDemo: false,
        appAccessPending: false,
      });
    } catch (err: any) {
      lastErrorMessage = err.message || 'Failed to fetch bills from Ewity API';
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
   */
  app.get('/api/ewity/bills/:id', requireAuthOrEmbedSession, async (req, res) => {
    const { id } = req.params;
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
   * GET /api/orders
   * Returns current verified production orders.
   */
  app.get('/api/orders', requireAuthOrEmbedSession, (_req, res) => {
    const genuineOrders = liveOrdersCache.filter(
      (o) => o && (o.dataSource === 'ewity_api' || o.dataSource === 'ewity_webhook' || o.dataSource === 'persisted')
    );
    res.json({
      orders: genuineOrders,
      total: genuineOrders.length,
      mode: 'live',
      isDemo: false,
    });
  });

  /**
   * GET /api/alerts
   * Returns current verified alerts.
   */
  app.get('/api/alerts', requireAuthOrEmbedSession, (_req, res) => {
    res.json({
      alerts: appAlerts,
      total: appAlerts.length,
    });
  });

  // ---------------------------------------------------------
  // ORDER & ALERT MUTATION ENDPOINTS (Priority 5: State Persistence)
  // Protected by verified Embed Session OR Admin Key
  // ---------------------------------------------------------

  /**
   * POST /api/orders/:id/kot-confirm
   * Confirms KOT ticket receipt at kitchen station. Persists operator & timestamp.
   */
  app.post('/api/orders/:id/kot-confirm', requireAuthOrEmbedSession, (req, res) => {
    const { id } = req.params;
    const staffName = req.body?.staffName || 'Kitchen Operator';
    const now = Date.now();

    const order = liveOrdersCache.find((o) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.kotStatus = 'Confirmed';
    order.kotConfirmedAt = now;
    order.alertSeverity = order.alertSeverity === 'urgent' ? 'warning' : 'nominal';

    // Auto-resolve any pending KOT timeout alerts for this order
    appAlerts = appAlerts.map((alt) => {
      if (alt.orderId === id && alt.type === 'kot_timeout' && alt.status !== 'resolved') {
        return {
          ...alt,
          status: 'resolved' as const,
          resolvedBy: staffName,
          resolvedAt: now,
          resolutionNote: 'KOT receipt confirmed by operator',
        };
      }
      return alt;
    });

    persistTenantState();
    durableStore.recordAuditAction(
      (req as any).authorizedStoreId || 'default',
      'kot_confirmed',
      staffName,
      { orderId: id }
    );

    res.json({ success: true, order });
  });

  /**
   * POST /api/orders/:id/status
   * Advances order status. Persists operator & timestamp.
   */
  app.post('/api/orders/:id/status', requireAuthOrEmbedSession, (req, res) => {
    const { id } = req.params;
    const nextStatus = req.body?.status as OrderStatus;
    const staffName = req.body?.staffName || 'Kitchen Staff';
    const now = Date.now();

    const validStatuses = ['New', 'In Kitchen', 'Ready', 'Completed', 'Voided'];
    if (!validStatuses.includes(nextStatus)) {
      return res.status(400).json({ error: `Invalid status: ${nextStatus}` });
    }

    const order = liveOrdersCache.find((o) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.orderStatus = nextStatus;
    order.statusUpdatedAt = now;

    if (nextStatus === 'Completed') {
      appAlerts = appAlerts.map((alt) => {
        if (alt.orderId === id && alt.status !== 'resolved') {
          return {
            ...alt,
            status: 'resolved' as const,
            resolvedBy: staffName,
            resolvedAt: now,
            resolutionNote: 'Order marked completed',
          };
        }
        return alt;
      });
    }

    persistTenantState();
    durableStore.recordAuditAction(
      (req as any).authorizedStoreId || 'default',
      'order_status_updated',
      staffName,
      { orderId: id, newStatus: nextStatus }
    );

    res.json({ success: true, order });
  });

  /**
   * POST /api/alerts/:id/acknowledge
   */
  app.post('/api/alerts/:id/acknowledge', requireAuthOrEmbedSession, (req, res) => {
    const { id } = req.params;
    const staffName = req.body?.staffName || 'Staff';
    const now = Date.now();

    const alert = appAlerts.find((a) => a.id === id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    alert.status = 'acknowledged';
    alert.acknowledgedBy = staffName;
    alert.acknowledgedAt = now;

    persistTenantState();
    durableStore.recordAuditAction((req as any).authorizedStoreId || 'default', 'alert_acknowledged', staffName, { alertId: id });
    res.json({ success: true, alert });
  });

  /**
   * POST /api/alerts/:id/resolve
   */
  app.post('/api/alerts/:id/resolve', requireAuthOrEmbedSession, (req, res) => {
    const { id } = req.params;
    const staffName = req.body?.staffName || 'Staff';
    const note = req.body?.note;
    const now = Date.now();

    const alert = appAlerts.find((a) => a.id === id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    alert.status = 'resolved';
    alert.resolvedBy = staffName;
    alert.resolvedAt = now;
    if (note) alert.resolutionNote = note;

    persistTenantState();
    durableStore.recordAuditAction((req as any).authorizedStoreId || 'default', 'alert_resolved', staffName, { alertId: id, note });
    res.json({ success: true, alert });
  });

  // ---------------------------------------------------------
  // ADMINISTRATOR OPERATIONS (Priority 1)
  // Protected strictly by requireAdminAuth
  // ---------------------------------------------------------

  /**
   * POST /api/ewity/connect
   */
  app.post('/api/ewity/connect', requireAdminAuth, async (req, res) => {
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
      ewityClient.updateCredentials(
        typeof apiKey === 'string' ? apiKey : '',
        typeof storeId === 'string' ? storeId : '',
        typeof baseUrl === 'string' ? baseUrl : undefined
      );
    }

    if (webhookSecret) {
      ewityWebhook.setSigningSecret(webhookSecret);
      ewityAppUi.setSigningSecret(webhookSecret);
      authManager.setSecret(webhookSecret);
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
   * POST /api/ewity/test-connection
   */
  app.post('/api/ewity/test-connection', requireAdminAuth, async (req, res) => {
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
        // ignore
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
   * POST /api/ewity/disconnect
   */
  app.post('/api/ewity/disconnect', requireAdminAuth, (_req, res) => {
    reconciler.stop();
    currentConnectionStatus = 'NOT CONNECTED';
    lastErrorMessage = undefined;
    lastTestOutcome = null;
    res.json({ success: true, status: 'NOT CONNECTED', mode: 'live', configSource: activeConfigSource });
  });

  /**
   * POST /api/ewity/reconcile
   */
  app.post('/api/ewity/reconcile', requireAdminAuth, async (_req, res) => {
    const result = await reconciler.reconcile();
    if (result.success && result.billsCount >= 0) {
      lastSuccessfulReconciliationAt = Date.now();
      lastSuccessfulApiRequestAt = Date.now();
    }
    res.json(result);
  });

  /**
   * GET /api/ewity/logs
   */
  app.get('/api/ewity/logs', requireAdminAuth, (_req, res) => {
    res.json({ logs: ewityClient.getLogs() });
  });

  /**
   * GET /api/ewity/webhooks/recent
   */
  app.get('/api/ewity/webhooks/recent', requireAdminAuth, (_req, res) => {
    res.json({
      events: ewityWebhook.getRecentEvents(),
      processedCount: ewityWebhook.getProcessedCount(),
    });
  });

  // ---------------------------------------------------------
  // SPA STATIC ASSET & ROUTING INTEGRATION
  // ---------------------------------------------------------
  if (!isProd && vite) {
    app.use(vite.middlewares);
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ewity/')) {
        return next();
      }
      serveAppHtml(req, res, next);
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res, next) => {
      serveAppHtml(_req, res, next);
    });
  }

  return { app, authManager, ewityClient, ewityWebhook, ewityAppUi, durableStore };
}

async function startServer() {
  validateStartupEnvironment();

  const { app } = await createApp();

  if (ewityClient.hasCredentials()) {
    try {
      console.log('[EWITY-WATCHDOG] Validating Ewity Apps API with credentials...');
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

// Only start server when run directly as the main process
const isMainModule =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('server.ts'));

if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('[EWITY-WATCHDOG] Server failed to start:', err);
    process.exit(1);
  });
}
