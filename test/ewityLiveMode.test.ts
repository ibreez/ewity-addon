/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import crypto from 'crypto';
import { EwityApiClient } from '../src/server/ewityClient';
import { EwityWebhookService } from '../src/server/ewityWebhook';
import { mapEwityBillToOrder } from '../src/services/ewityMapper';
import { MOCK_EWITY_BILLS } from '../src/server/ewityMockFixtures';
import { EwityBillSummary } from '../src/types/ewity';

console.log('====================================================');
console.log(' RUNNING EWITY LIVE DATA & TRUTHFUL MODE REGRESSION SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  process.stdout.write(`• ${name}... `);
  try {
    const result = fn();
    if (result && typeof (result as any).then === 'function') {
      await result;
    }
    passedTests++;
    console.log('✓ PASSED');
  } catch (err: any) {
    console.log('✗ FAILED');
    console.error('  Error:', err.message);
  }
}

// Helper to mock fetch temporarily
const originalFetch = globalThis.fetch;
function withMockedFetch(mockFn: typeof fetch, testBlock: () => Promise<void>) {
  return async () => {
    globalThis.fetch = mockFn;
    try {
      await testBlock();
    } finally {
      globalThis.fetch = originalFetch;
    }
  };
}

async function runAllTests() {
  // Test 1: No API key -> connection fails (NOT CONFIGURED)
  await runTest('1. No API key: connection fails with NOT CONFIGURED', async () => {
    const client = new EwityApiClient({
      baseUrl: 'https://api.ewitypos.com/apps-v1',
      apiKey: '',
      storeId: 'store_101',
    });

    assert.strictEqual(client.hasCredentials(), false);
    const result = await client.testAppsApiConnection();
    assert.strictEqual(result.outcome, 'NOT CONFIGURED');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.toLowerCase().includes('missing api key'));
  });

  // Test 2: Correct API key but missing store ID -> connection fails (NOT CONFIGURED)
  await runTest('2. Correct API key but missing store ID: connection fails with NOT CONFIGURED', async () => {
    const client = new EwityApiClient({
      baseUrl: 'https://api.ewitypos.com/apps-v1',
      apiKey: 'app_key_secret_123',
      storeId: '',
    });

    assert.strictEqual(client.hasCredentials(), false);
    const result = await client.testAppsApiConnection();
    assert.strictEqual(result.outcome, 'NOT CONFIGURED');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.toLowerCase().includes('missing store id'));
  });

  // Test 3: Wrong API key -> connection fails (AUTHENTICATION FAILED)
  await runTest(
    '3. Wrong API key: connection fails with AUTHENTICATION FAILED',
    withMockedFetch(
      async () =>
        new Response(JSON.stringify({ message: 'Invalid or expired token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      async () => {
        const client = new EwityApiClient({
          baseUrl: 'https://api.ewitypos.com/apps-v1',
          apiKey: 'wrong_secret_key',
          storeId: 'store_101',
        });

        const result = await client.testAppsApiConnection();
        assert.strictEqual(result.outcome, 'AUTHENTICATION FAILED');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.httpStatus, 401);
        assert.strictEqual(client.hasAuthorizedAppAccess(), false);
      }
    )
  );

  // Test 4: Correct API key but unapproved merchant installation -> AWAITING MERCHANT APPROVAL
  await runTest(
    '4. Unapproved merchant installation: connection reports AWAITING MERCHANT APPROVAL',
    withMockedFetch(
      async () =>
        new Response(
          JSON.stringify({
            message: 'Store 101 has not authorized app access. Please install the app and approve its permissions.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
      async () => {
        const client = new EwityApiClient({
          baseUrl: 'https://api.ewitypos.com/apps-v1',
          apiKey: 'valid_app_key',
          storeId: 'store_101',
        });

        const result = await client.testAppsApiConnection();
        assert.strictEqual(result.outcome, 'AWAITING MERCHANT APPROVAL');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.httpStatus, 401);
        assert.strictEqual(client.hasAuthorizedAppAccess(), false);
        assert.ok(result.message.toLowerCase().includes('merchant authorization pending'));
      }
    )
  );

  // Test 5: Insufficient permissions -> PERMISSION ERROR
  await runTest(
    '5. Insufficient permissions: reports PERMISSION ERROR',
    withMockedFetch(
      async () =>
        new Response(
          JSON.stringify({ message: 'Forbidden: Insufficient scope or permissions for locations/user' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        ),
      async () => {
        const client = new EwityApiClient({
          baseUrl: 'https://api.ewitypos.com/apps-v1',
          apiKey: 'valid_app_key',
          storeId: 'store_101',
        });

        const result = await client.testAppsApiConnection();
        assert.strictEqual(result.outcome, 'PERMISSION ERROR');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.httpStatus, 403);
      }
    )
  );

  // Test 6: Ewity returns 500 or a network timeout -> CONNECTION ERROR
  await runTest(
    '6. Ewity 500 server error or network timeout: reports CONNECTION ERROR',
    withMockedFetch(
      async () =>
        new Response(JSON.stringify({ message: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      async () => {
        const client = new EwityApiClient({
          baseUrl: 'https://api.ewitypos.com/apps-v1',
          apiKey: 'valid_app_key',
          storeId: 'store_101',
        });

        const result = await client.testAppsApiConnection();
        assert.strictEqual(result.outcome, 'CONNECTION ERROR');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.httpStatus, 500);
      }
    )
  );

  // Test 7: Valid credentials and successful authenticated Apps API response -> LIVE CONNECTED
  await runTest(
    '7. Valid credentials and successful authenticated response: reports LIVE CONNECTED',
    withMockedFetch(
      async (url, init) => {
        // Verify outbound request headers
        const headers = (init?.headers as Record<string, string>) || {};
        assert.strictEqual(headers['Authorization'], 'Bearer valid_app_key');
        assert.strictEqual(headers['X-Ewity-Store'], 'store_101');
        assert.strictEqual(url, 'https://api.ewitypos.com/apps-v1/locations/user');

        return new Response(
          JSON.stringify([
            { id: 1, name: 'Main Kitchen Station', address: '123 Harbor Rd' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
      async () => {
        const client = new EwityApiClient({
          baseUrl: 'https://api.ewitypos.com/apps-v1',
          apiKey: 'valid_app_key',
          storeId: 'store_101',
        });

        const result = await client.testAppsApiConnection();
        assert.strictEqual(result.outcome, 'LIVE CONNECTED');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.httpStatus, 200);
        assert.strictEqual(result.locationsCount, 1);
        assert.strictEqual(client.hasAuthorizedAppAccess(), true);
      }
    )
  );

  // Test 8: Previously connected status followed by failed revalidation -> drops connection
  await runTest(
    '8. Previously connected status followed by failed revalidation drops green connection',
    async () => {
      let isMockFailing = false;
      const testClient = new EwityApiClient({
        baseUrl: 'https://api.ewitypos.com/apps-v1',
        apiKey: 'key_123',
        storeId: 'store_101',
      });

      const mockedFetch = async () => {
        if (!isMockFailing) {
          return new Response(JSON.stringify([{ id: 1, name: 'Kitchen' }]), { status: 200 });
        } else {
          return new Response(JSON.stringify({ message: 'Token revoked' }), { status: 401 });
        }
      };

      await withMockedFetch(mockedFetch, async () => {
        // Step 1: initial connection succeeds
        const firstCheck = await testClient.testAppsApiConnection();
        assert.strictEqual(firstCheck.outcome, 'LIVE CONNECTED');
        assert.strictEqual(testClient.hasAuthorizedAppAccess(), true);

        // Step 2: subsequent check fails (e.g. key revoked)
        isMockFailing = true;
        const secondCheck = await testClient.testAppsApiConnection();
        assert.strictEqual(secondCheck.outcome, 'AUTHENTICATION FAILED');
        assert.strictEqual(secondCheck.success, false);
        // Authorization flag MUST be revoked
        assert.strictEqual(testClient.hasAuthorizedAppAccess(), false);
      })();
    }
  );

  // Test 9: Platform API key (plt_) used on Apps API -> Warning and Apps API failure
  await runTest(
    '9. Platform API key plt_ detected with explicit warning and disconnected Apps API status',
    withMockedFetch(
      async () =>
        new Response(JSON.stringify({ message: 'Unauthorized for Apps API' }), { status: 401 }),
      async () => {
        const client = new EwityApiClient({
          baseUrl: 'https://api.ewitypos.com/apps-v1',
          apiKey: 'plt_live_platform_token_999',
          storeId: 'store_101',
        });

        assert.strictEqual(client.isPlatformKey(), true);
        const result = await client.testAppsApiConnection();
        assert.strictEqual(result.outcome, 'AUTHENTICATION FAILED');
        assert.strictEqual(result.isPlatformKeyWarning, true);
        assert.ok(result.message.includes('plt_'));
      }
    )
  );

  // Test 10: Secrets never appear in client responses or logs
  await runTest('10. Secrets never appear in client responses or logs', async () => {
    const rawSecret = 'ewity_super_secret_production_key_xyz987';
    const client = new EwityApiClient({
      baseUrl: 'https://api.ewitypos.com/apps-v1',
      apiKey: rawSecret,
      storeId: 'store_prod_44',
    });

    const masked = client.getMaskedCredentials();
    assert.strictEqual((masked as any).apiKey, undefined);
    assert.strictEqual(masked.apiKeyMasked.includes(rawSecret), false);
    assert.ok(masked.apiKeyMasked.startsWith('ewit...'));

    // Check that request logs do not log secrets
    await withMockedFetch(
      async () =>
        new Response(JSON.stringify([{ id: 1, name: 'Main' }]), { status: 200 }),
      async () => {
        await client.testAppsApiConnection();
        const logs = client.getLogs();
        const serialized = JSON.stringify(logs);
        assert.strictEqual(serialized.includes(rawSecret), false);
      }
    )();
  });

  // Test 11: Demo data is isolated and never leaks into live mode
  await runTest('11. Demo data is isolated and never leaks into live mode', () => {
    // In live mode, simulated fixtures are strictly filtered out
    const mixedData = [
      mapEwityBillToOrder(MOCK_EWITY_BILLS[0], undefined, undefined, 'simulated_fixture'),
    ];
    const liveFiltered = mixedData.filter((o) => o.dataSource !== 'simulated_fixture');
    assert.strictEqual(liveFiltered.length, 0);

    // Live mode order mapping preserves authentic provenance
    const liveOrder = mapEwityBillToOrder(MOCK_EWITY_BILLS[0], undefined, undefined, 'ewity_api');
    assert.strictEqual(liveOrder.dataSource, 'ewity_api');
    assert.ok(liveOrder.dataTimestamp! > 0);
  });

  // Test 12: Webhook signature verification and deduplication
  await runTest('12. Webhook signature verification, replay protection, and deduplication', () => {
    const testSecret = 'whsec_test_secret_for_dedup_verification';
    const webhookService = new EwityWebhookService(testSecret);

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: 'evt_delivery_abc_123',
      event: 'bill.created',
      created_at: new Date().toISOString(),
      data: { id: 8900, number: 'BILL-8900' },
    });

    const signature = crypto
      .createHmac('sha256', testSecret)
      .update(`${nowSec}.${payload}`)
      .digest('hex');

    const verifyResult = webhookService.verifySignature(`t=${nowSec},v1=${signature}`, payload);
    assert.strictEqual(verifyResult.isValid, true);

    // 1st delivery: processed
    const firstDelivery = webhookService.processEnvelope('delivery_001', JSON.parse(payload));
    assert.strictEqual(firstDelivery.success, true);
    assert.strictEqual(firstDelivery.wasDuplicate, false);

    // 2nd delivery (same delivery ID): deduplicated
    const secondDelivery = webhookService.processEnvelope('delivery_001', JSON.parse(payload));
    assert.strictEqual(secondDelivery.success, true);
    assert.strictEqual(secondDelivery.wasDuplicate, true);

    // Out-of-order delivery with older timestamp:
    const oldEnvelope = {
      id: 'evt_delivery_older',
      event: 'bill.created',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      data: { id: 8900, number: 'BILL-8900' },
    };
    const outOfOrderDelivery = webhookService.processEnvelope('delivery_002', oldEnvelope as any);
    assert.strictEqual(outOfOrderDelivery.wasOutOfOrder, true);
    assert.strictEqual(outOfOrderDelivery.action, 'stale_skipped');
  });

  console.log('\n====================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} tests passed`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests();
