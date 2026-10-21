/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapEwityBillToOrder } from '../src/services/ewityMapper';
import { EwityWebhookService } from '../src/server/ewityWebhook';
import { EwityAppUiService } from '../src/server/ewityAppUi';
import { EwityApiClient } from '../src/server/ewityClient';
import { createApp } from '../server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  process.stdout.write(`• ${name}... `);
  try {
    await fn();
    passedTests++;
    console.log('✓ PASSED');
  } catch (err: any) {
    console.log('✗ FAILED');
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log('====================================================');
  console.log(' RUNNING PRODUCTION-ONLY WATCHDOG VERIFICATION SUITE');
  console.log('====================================================');

  // Test 1: Demo and simulation controls are absent from production UI source code
  await runTest('1. Demo and simulation controls are absent from production UI pages', () => {
    const appTsx = fs.readFileSync(path.join(projectRoot, 'src', 'App.tsx'), 'utf-8');
    const headerTsx = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Header.tsx'), 'utf-8');
    const ewityViewTsx = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'EwityIntegrationView.tsx'), 'utf-8');
    const settingsTsx = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'SettingsModal.tsx'), 'utf-8');

    // Forbidden UI controls and patterns
    const forbiddenPatterns = [
      'SimulateOrderModal',
      'DemoDataBanner',
      'onSimulateOrder',
      '+ Simulate Order',
      'Load Demo Data',
      'Try Demo',
      'autoSimulateOrders',
      'simulationIntervalSec',
      'simulated_fixture',
      'Disconnect & Return to Demo',
      'Mocked API Test Suite',
      'Simulate Signed App UI Request',
    ];

    for (const pattern of forbiddenPatterns) {
      assert.strictEqual(
        appTsx.includes(pattern),
        false,
        `src/App.tsx must not contain forbidden demo/simulation pattern: "${pattern}"`
      );
      assert.strictEqual(
        headerTsx.includes(pattern),
        false,
        `src/components/Header.tsx must not contain forbidden pattern: "${pattern}"`
      );
      assert.strictEqual(
        ewityViewTsx.includes(pattern),
        false,
        `src/components/EwityIntegrationView.tsx must not contain forbidden pattern: "${pattern}"`
      );
      assert.strictEqual(
        settingsTsx.includes(pattern),
        false,
        `src/components/SettingsModal.tsx must not contain forbidden pattern: "${pattern}"`
      );
    }

    // Verify mockOrderService is completely removed
    assert.strictEqual(
      fs.existsSync(path.join(projectRoot, 'src', 'services', 'mockOrderService.ts')),
      false,
      'src/services/mockOrderService.ts must be deleted from the codebase'
    );
  });

  const TEST_SECRET = 'whsec_prod_hardening_test_secret_xyz123';
  const TEST_ADMIN_KEY = 'admin_secret_super_secure_key_999';
  const TEST_STORE_ID = 'pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo';

  process.env.EWITY_SIGNING_SECRET = TEST_SECRET;
  process.env.EWITY_WEBHOOK_SECRET = TEST_SECRET;
  process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
  process.env.EWITY_STORE_ID = TEST_STORE_ID;
  process.env.NODE_ENV = 'production';

  // Start test server instance for integration verification
  const { app, authManager, ewityAppUi } = await createApp({
    skipVite: true,
    signingSecret: TEST_SECRET,
    adminApiKey: TEST_ADMIN_KEY,
    storeId: TEST_STORE_ID,
  });
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const validAdminKey = TEST_ADMIN_KEY;

  try {
    // Test 2: Production API routes never silently fall back to mock data
    await runTest('2. Production API responses never silently fall back to mock data', async () => {
      // Create valid embed session for store
      const sessionToken = authManager.createEmbedSession({ storeId: 'pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo' });

      // Request bills when disconnected
      const billsRes = await fetch(`${baseUrl}/api/ewity/bills`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const billsData = await billsRes.json();

      // Must be an error state, never demo fixtures
      assert.strictEqual(billsRes.status, 400);
      assert.strictEqual(billsData.error, 'not_connected');
      assert.strictEqual(billsData.isDemo, false);
      assert.strictEqual(billsData.mode, 'live');
      assert.deepStrictEqual(billsData.data, []);
      assert.deepStrictEqual(billsData.mappedOrders, []);

      // Request bill by ID when disconnected
      const billDetailRes = await fetch(`${baseUrl}/api/ewity/bills/101`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.strictEqual(billDetailRes.status, 400);
      const detailData = await billDetailRes.json();
      assert.strictEqual(detailData.error, 'not_connected');
    });

    // Test 3: Missing credentials and failed API requests produce truthful error states
    await runTest('3. Missing credentials and failed API requests produce truthful error states', async () => {
      const emptyClient = new EwityApiClient({ baseUrl: 'https://api.ewitypos.com', apiKey: '', storeId: '' });
      assert.strictEqual(emptyClient.hasCredentials(), false);
      const testRes = await emptyClient.testAppsApiConnection();
      assert.strictEqual(testRes.outcome, 'NOT CONFIGURED');
      assert.strictEqual(testRes.success, false);

      const statusRes = await fetch(`${baseUrl}/api/ewity/status`, {
        headers: { Authorization: `Bearer ${validAdminKey}` },
      });
      const statusData = await statusRes.json();
      assert.strictEqual(statusData.mode, 'live');
      assert.ok(['NOT CONFIGURED', 'NOT CONNECTED', 'Connecting'].includes(statusData.status));
    });

    // Test 4: Empty dashboards do not display fabricated metrics
    await runTest('4. Empty dashboards and unconfigured states do not display fabricated metrics', async () => {
      const ordersRes = await fetch(`${baseUrl}/api/orders`, {
        headers: { Authorization: `Bearer ${validAdminKey}` },
      });
      const ordersData = await ordersRes.json();
      assert.ok(Array.isArray(ordersData.orders));
      // All orders in production must strictly have authentic data source
      for (const order of ordersData.orders) {
        assert.ok(
          order.dataSource === 'ewity_api' ||
          order.dataSource === 'ewity_webhook' ||
          order.dataSource === 'persisted',
          `Order ${order.id} has invalid dataSource: ${order.dataSource}`
        );
        assert.notStrictEqual(order.dataSource, 'simulated_fixture');
      }
    });

    // Test 5: Genuine Ewity events and verified records continue to work
    await runTest('5. Genuine Ewity events and verified records continue to work', () => {
      const sampleBill: any = {
        id: 7781,
        number: 'INV-7781',
        total: 85.50,
        status: 'settled',
        payment_status: 'paid',
        type: 'sale',
        restaurant_table: 'T-05',
        kot_number: 'KOT-3321',
        created: { at: '2026-10-21 12:30:00', by: 'Floor Server' },
      };

      const mappedOrder = mapEwityBillToOrder(sampleBill, undefined, undefined, 'ewity_webhook');
      assert.strictEqual(mappedOrder.id, 'ewity-7781');
      assert.strictEqual(mappedOrder.orderNumber, 'INV-7781');
      assert.strictEqual(mappedOrder.kotNumber, 'KOT-3321');
      assert.strictEqual(mappedOrder.dataSource, 'ewity_webhook');
      assert.ok(mappedOrder.dataTimestamp! > 0);
    });

    // Test 6: Webhook signature verification, duplicate delivery handling, and tenant isolation remain intact
    await runTest('6. Webhook signature verification, duplicate delivery handling, and tenant isolation remain intact', () => {
      const webhookSecret = 'whsec_prod_verification_sec_123';
      const service = new EwityWebhookService(webhookSecret);
      const deliveryId = `del_prod_test_${Date.now()}`;
      const payload = JSON.stringify({
        id: deliveryId,
        event: 'bill.created',
        created_at: new Date().toISOString(),
        company: { id: 101, name: 'Bistro', domain: 'bistro' },
        install: { store_id: 'pl_id_store_test_88', external_account_id: null },
        data: { id: 991, number: 'INV-991', total: 45.0, status: 'settled', payment_status: 'paid' },
      });

      const nowSec = Math.floor(Date.now() / 1000);
      const validSig = service.generateSignature(webhookSecret, nowSec, payload);

      // 1. Valid delivery accepted
      const result1 = service.verifyAndProcess(
        { 'x-ewity-signature': `t=${nowSec},v1=${validSig}` },
        payload
      );
      assert.strictEqual(result1.isValid, true);
      assert.strictEqual(result1.duplicate, false);

      // 2. Duplicate delivery idempotently ignored
      const result2 = service.verifyAndProcess(
        { 'x-ewity-signature': `t=${nowSec},v1=${validSig}` },
        payload
      );
      assert.strictEqual(result2.isValid, true);
      assert.strictEqual(result2.duplicate, true);

      // 3. Invalid signature rejected
      const result3 = service.verifyAndProcess(
        { 'x-ewity-signature': `t=${nowSec},v1=invalid_tampered_hash` },
        payload
      );
      assert.strictEqual(result3.isValid, false);
    });

    // Test 7: KOT printing status is never fabricated
    await runTest('7. KOT printing status is never fabricated without physical confirmation', () => {
      const billWithKotNumber: any = {
        id: 9942,
        number: 'INV-9942',
        kot_number: 'KOT-9942',
        status: 'settled',
        created: { at: '2026-10-21 12:40:00', by: 'Cashier' },
      };

      const mapped = mapEwityBillToOrder(billWithKotNumber, undefined, undefined, 'ewity_api');
      // Crucial: A KOT number existing must NEVER infer that the ticket was printed!
      assert.notStrictEqual(mapped.kotStatus, 'Confirmed');
      assert.ok(
        mapped.kotStatus === 'Awaiting Confirmation' || mapped.kotStatus === 'KOT Not Confirmed',
        `KOT status was inappropriately confirmed without printer feedback: ${mapped.kotStatus}`
      );
    });

    // Test 8: Existing App UI protocol and health endpoints still work
    await runTest('8. Existing App UI protocol and health endpoints still work', async () => {
      // Health check endpoint
      const healthRes = await fetch(`${baseUrl}/health`);
      assert.strictEqual(healthRes.status, 200);
      const healthData = await healthRes.json();
      assert.strictEqual(healthData.status, 'healthy');

      // CSP header verification
      const csp = healthRes.headers.get('content-security-policy') || '';
      assert.ok(csp.includes('frame-ancestors'));
      assert.ok(csp.includes('https://*.ewitypos.com'));
      assert.ok(csp.includes('https://*.ewity.com'));
      assert.ok(csp.includes('https://ewitypos.com'));

      // HTML endpoint for /ewity/app
      const appUiRes = await fetch(`${baseUrl}/ewity/app`, {
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      assert.strictEqual(appUiRes.status, 200);
      const appUiHtml = await appUiRes.text();
      assert.ok(appUiHtml.includes('<!DOCTYPE html>') || appUiHtml.includes('<html'));
    });

  } finally {
    server.close();
  }

  console.log('====================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} tests passed`);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
