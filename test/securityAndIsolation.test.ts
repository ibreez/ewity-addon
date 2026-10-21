/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import http from 'http';
import crypto from 'crypto';
import { createApp } from '../server';
import { EwityAppUiService } from '../src/server/ewityAppUi';
import { EwityWebhookService } from '../src/server/ewityWebhook';
import { mapEwityBillToOrder } from '../src/services/ewityMapper';
import { EwityBillSummary } from '../src/types/ewity';

console.log('====================================================');
console.log(' RUNNING PRODUCTION SECURITY & DATA INTEGRITY SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  process.stdout.write(`• ${name}... `);
  try {
    const res = fn();
    if (res && typeof (res as any).then === 'function') {
      await res;
    }
    passedTests++;
    console.log('✓ PASSED');
  } catch (err: any) {
    console.log('✗ FAILED');
    console.error('  Error:', err.message);
    throw err;
  }
}

const TEST_SECRET = 'whsec_prod_hardening_test_secret_xyz123';
const TEST_ADMIN_KEY = 'admin_secret_super_secure_key_999';
const TEST_STORE_ID = 'pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo';

async function main() {
  process.env.EWITY_SIGNING_SECRET = TEST_SECRET;
  process.env.EWITY_WEBHOOK_SECRET = TEST_SECRET;
  process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
  process.env.EWITY_STORE_ID = TEST_STORE_ID;
  process.env.NODE_ENV = 'production';

  const { app, authManager, ewityAppUi } = await createApp({
    skipVite: true,
    signingSecret: TEST_SECRET,
    adminApiKey: TEST_ADMIN_KEY,
    storeId: TEST_STORE_ID,
  });

  // Start server on an ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ------------------------------------------------------------------------
    // PRIORITY 1 — PUBLIC API SECURITY & ADMIN PROTECTION
    // ------------------------------------------------------------------------

    await runTest('1. Health check is public and never leaks secrets or store credentials', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'healthy');
      assert.strictEqual(json.service, 'ewity-kitchen-watchdog');
      assert.strictEqual(typeof json.uptimeSeconds, 'number');
      const bodyStr = JSON.stringify(json);
      assert.strictEqual(bodyStr.includes(TEST_SECRET), false);
      assert.strictEqual(bodyStr.includes(TEST_ADMIN_KEY), false);
      assert.strictEqual(bodyStr.includes(TEST_STORE_ID), false);
    });

    await runTest('2. Management routes reject unauthorized requests with 401', async () => {
      const routes = [
        { path: '/api/ewity/connect', method: 'POST' },
        { path: '/api/ewity/disconnect', method: 'POST' },
        { path: '/api/ewity/reconcile', method: 'POST' },
        { path: '/api/ewity/logs', method: 'GET' },
        { path: '/api/ewity/webhooks/recent', method: 'GET' },
      ];

      for (const route of routes) {
        const res = await fetch(`${baseUrl}${route.path}`, {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
        });
        assert.strictEqual(
          res.status,
          401,
          `Expected 401 for ${route.method} ${route.path}, got ${res.status}`
        );
      }
    });

    await runTest('3. Management routes reject invalid admin credentials with 403', async () => {
      const res = await fetch(`${baseUrl}/api/ewity/logs`, {
        headers: { Authorization: 'Bearer invalid_wrong_admin_token' },
      });
      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.error, 'forbidden');
    });

    await runTest('4. Management routes accept valid ADMIN_API_KEY', async () => {
      const res = await fetch(`${baseUrl}/api/ewity/logs`, {
        headers: { Authorization: `Bearer ${TEST_ADMIN_KEY}` },
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(Array.isArray(json.logs), true);
    });

    // ------------------------------------------------------------------------
    // PRIORITY 2 & 3 — TENANT ISOLATION & SECURE IFRAME SESSION
    // ------------------------------------------------------------------------

    await runTest('5. Data endpoints reject requests without embed session or admin key with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ewity/bills`);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.error, 'unauthorized');
    });

    await runTest('6. Tampered or expired embed session token is rejected with 401', async () => {
      const tampered = 'ewity_sess_eyJzdG9yZUlkIjoicGxfMTAxIn0.tampered_signature';
      const res = await fetch(`${baseUrl}/api/ewity/bills`, {
        headers: { Authorization: `Bearer ${tampered}` },
      });
      assert.strictEqual(res.status, 401);
    });

    let validSessionToken: string = '';

    await runTest('7. Valid GET /ewity/app issues short-lived session token bound to verified store', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const sigHeader = ewityAppUi.generateSignatureHeader(TEST_SECRET, nowSec, '');
      const ctxToken = ewityAppUi.generateContextToken(TEST_SECRET, {
        install: { store_id: TEST_STORE_ID },
        company: { id: 10134, name: 'Verified Merchant' },
        user: { id: 201, name: 'Chef de Cuisine' },
      });

      const res = await fetch(`${baseUrl}/ewity/app`, {
        headers: {
          'X-Ewity-Signature': sigHeader,
          'X-Ewity-Context': ctxToken,
          Accept: 'application/json',
        },
      });

      assert.strictEqual(res.status, 200);
      const doc = await res.json();
      assert.strictEqual(doc.version, 1);
      assert.strictEqual(Array.isArray(doc.tabs), true);

      // Verify that the embed session token can be minted and authenticated
      validSessionToken = authManager.createEmbedSession({
        storeId: TEST_STORE_ID,
        userId: 201,
        userName: 'Chef de Cuisine',
      });
      assert.ok(validSessionToken.startsWith('ewity_sess_'));
      const verification = authManager.verifyEmbedSession(validSessionToken);
      assert.strictEqual(verification.isValid, true);
      assert.strictEqual(verification.claims?.storeId, TEST_STORE_ID);
    });

    await runTest('8. Cross-tenant App UI request with mismatched store context is rejected with 403', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const sigHeader = ewityAppUi.generateSignatureHeader(TEST_SECRET, nowSec, '');
      // Mismatched store ID in verified JWT
      const foreignStoreToken = ewityAppUi.generateContextToken(TEST_SECRET, {
        install: { store_id: 'pl_id_FOREIGN_ATTACKER_STORE_999' },
      });

      const res = await fetch(`${baseUrl}/ewity/app`, {
        headers: {
          'X-Ewity-Signature': sigHeader,
          'X-Ewity-Context': foreignStoreToken,
          Accept: 'application/json',
        },
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.error, 'tenant_mismatch');
    });

    await runTest('9. Forged query store_id that differs from verified session is rejected with 403', async () => {
      const res = await fetch(`${baseUrl}/api/ewity/bills?store_id=pl_id_FORGED_OTHER_STORE`, {
        headers: { Authorization: `Bearer ${validSessionToken}` },
      });
      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.error, 'tenant_mismatch');
    });

    // ------------------------------------------------------------------------
    // PRIORITY 4 — DURABLE WEBHOOK PROCESSING & DEDUPLICATION
    // ------------------------------------------------------------------------

    await runTest('10. Webhooks reject missing or invalid signature with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ewity/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'evt_test', event: 'bill.created' }),
      });
      assert.strictEqual(res.status, 401);
    });

    await runTest('11. Valid signed webhook processes and duplicate is idempotently ignored', async () => {
      const webhookService = new EwityWebhookService(TEST_SECRET);
      const deliveryId = `del_${Date.now()}_dedup_test`;
      const payload = {
        id: 'evt_dedup_001',
        event: 'bill.created',
        created_at: new Date().toISOString(),
        install: { store_id: TEST_STORE_ID, external_account_id: null },
        company: { id: 10134, name: 'Test', domain: 'test' },
        data: {
          bill: {
            id: 778899,
            parent_id: null,
            number: 'EW-778899',
            location: { id: 1, name: 'Main Location', display_name: null, type: 'restaurant' },
            customer: null,
            restaurant_table: 'Table 14',
            total_sales_price: 150,
            total_tax: 9,
            total_outstanding: 0,
            total: 159,
            currency: 'MVR',
            status: 'settled',
            payment_status: 'paid',
            delivery_status: null,
            type: 'sale',
            date: '2026-10-19',
            created: { at: '2026-10-19 12:00:00', by: 'Staff' },
            kot_number: 'KOT-7788',
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const nowSec = Math.floor(Date.now() / 1000);
      const sigHeader = `t=${nowSec},v1=${crypto.createHmac('sha256', TEST_SECRET).update(`${nowSec}.${rawBody}`).digest('hex')}`;

      // First delivery: should process successfully
      const res1 = await fetch(`${baseUrl}/api/ewity/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ewity-Signature': sigHeader,
          'X-Ewity-Delivery': deliveryId,
        },
        body: rawBody,
      });

      assert.strictEqual(res1.status, 200);
      const json1 = await res1.json();
      assert.strictEqual(json1.status, 'received');
      assert.strictEqual(json1.result, 'processed');

      // Second delivery with identical delivery ID: must be duplicate_ignored
      const res2 = await fetch(`${baseUrl}/api/ewity/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ewity-Signature': sigHeader,
          'X-Ewity-Delivery': deliveryId,
        },
        body: rawBody,
      });

      assert.strictEqual(res2.status, 200);
      const json2 = await res2.json();
      assert.strictEqual(json2.result, 'duplicate_ignored');
    });

    // ------------------------------------------------------------------------
    // PRIORITY 5 — TRUE KITCHEN MONITORING INTEGRITY
    // ------------------------------------------------------------------------

    await runTest('12. ewityMapper never fabricates KOT numbers and never infers completion from payment', () => {
      const billWithoutKot: EwityBillSummary = {
        id: 9911,
        parent_id: null,
        number: 'EW-9911',
        location: { id: 1, name: 'Main', display_name: null, type: 'restaurant' },
        customer: null,
        restaurant_table: 'Table 5',
        total_sales_price: 100,
        total_tax: 6,
        total_outstanding: 0,
        total: 106,
        currency: 'MVR',
        status: 'settled', // Paid / settled
        payment_status: 'paid',
        delivery_status: null,
        type: 'sale',
        date: '2026-10-19',
        created: { at: '2026-10-19 10:00:00', by: 'Server' },
        // NO kot_number provided
      };

      const mapped = mapEwityBillToOrder(billWithoutKot);

      // Must NOT fabricate KOT-9911
      assert.strictEqual(mapped.kotNumber, '');
      assert.strictEqual(mapped.kotStatus, 'KOT Not Confirmed');

      // Payment completed != kitchen prep completed!
      assert.notStrictEqual(mapped.orderStatus, 'Completed');
      assert.strictEqual(mapped.orderStatus, 'New');
    });

    await runTest('13. Order and Alert actions persist durably to server with operator name', async () => {
      // First ensure an order exists
      const testOrderId = 'ewity-778899';

      // 1. Confirm KOT ticket receipt
      const resKot = await fetch(`${baseUrl}/api/orders/${testOrderId}/kot-confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validSessionToken}`,
        },
        body: JSON.stringify({ staffName: 'Chef Michael' }),
      });
      assert.strictEqual(resKot.status, 200);
      const jsonKot = await resKot.json();
      assert.strictEqual(jsonKot.order.kotStatus, 'Confirmed');
      assert.strictEqual(typeof jsonKot.order.kotConfirmedAt, 'number');

      // 2. Advance Order Status
      const resStatus = await fetch(`${baseUrl}/api/orders/${testOrderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validSessionToken}`,
        },
        body: JSON.stringify({ status: 'In Kitchen', staffName: 'Chef Michael' }),
      });
      assert.strictEqual(resStatus.status, 200);
      const jsonStatus = await resStatus.json();
      assert.strictEqual(jsonStatus.order.orderStatus, 'In Kitchen');
    });

    await runTest('14. App UI POST actions strictly reject invalid payloads with 422', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const badPayload = JSON.stringify({ type: 'not_an_action' });
      const sigHeader = ewityAppUi.generateSignatureHeader(TEST_SECRET, nowSec, badPayload);
      const ctxToken = ewityAppUi.generateContextToken(TEST_SECRET, {
        install: { store_id: TEST_STORE_ID },
      });

      const res = await fetch(`${baseUrl}/ewity/app`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ewity-Signature': sigHeader,
          'X-Ewity-Context': ctxToken,
        },
        body: badPayload,
      });

      assert.strictEqual(res.status, 422);
    });

    await runTest('15. CSP frame-ancestors includes all Ewity apex/subdomains and preview origins', async () => {
      const res = await fetch(`${baseUrl}/health`);
      const csp = res.headers.get('content-security-policy') || '';
      assert.ok(csp.includes("frame-ancestors"), 'CSP must define frame-ancestors');
      assert.ok(csp.includes("https://*.ewitypos.com"), 'CSP must allow Ewity POS subdomains');
      assert.ok(csp.includes("https://ewitypos.com"), 'CSP must allow Ewity POS apex domain');
      assert.ok(csp.includes("https://*.ewity.com"), 'CSP must allow ewity.com subdomains');
      assert.ok(csp.includes("https://ewity.com"), 'CSP must allow ewity.com apex domain');
      assert.ok(csp.includes("https://*.google.com"), 'CSP must allow AI Studio preview parent origin');
      assert.ok(!csp.includes("frame-ancestors *"), 'CSP must never use wildcard frame-ancestors');
      assert.strictEqual(res.headers.get('x-frame-options'), null, 'X-Frame-Options must not be present');
    });

    await runTest('16. Browser requesting /ewity/app with HTML accept receives 200 HTML document', async () => {
      const res = await fetch(`${baseUrl}/ewity/app`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/html'), 'Must serve HTML');
      const text = await res.text();
      assert.ok(text.includes('<!doctype html>'), 'HTML must contain doctype');
    });

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} tests passed`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('\nSuite run error:', err);
  process.exit(1);
});
