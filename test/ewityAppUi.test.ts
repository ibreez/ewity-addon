/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import crypto from 'crypto';
import { EwityAppUiService } from '../src/server/ewityAppUi';
import { EwityWebhookService } from '../src/server/ewityWebhook';

const TEST_SECRET = 'whsec_test_secret_for_ewity_app_ui_verification';
const DEPLOYED_BASE_URL = 'https://ais-pre-4vmloib4ucrege7oirz6nu-417987842324.asia-southeast1.run.app';

console.log('====================================================');
console.log(' RUNNING EWITY APP UI & INTEGRATION TEST SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  process.stdout.write(`• ${name}... `);
  try {
    fn();
    passedTests++;
    console.log('✓ PASSED');
  } catch (err: any) {
    console.log('✗ FAILED');
    console.error('  Error:', err.message);
  }
}

const service = new EwityAppUiService(TEST_SECRET, DEPLOYED_BASE_URL);

// Test 1: Valid X-Ewity-Signature and valid X-Ewity-Context JWT
runTest('1. Valid App UI request authentication and IframeView document generation', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const signatureHeader = service.generateSignatureHeader(TEST_SECRET, nowSec, '');
  const contextHeader = service.generateContextToken(TEST_SECRET, {
    install: { store_id: 'pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo' },
    company: { id: 10134, name: 'Test Sandbox Restaurant' },
    user: { id: 201, name: 'General Manager' },
  });

  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': signatureHeader,
      'x-ewity-context': contextHeader,
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, true);
  assert.strictEqual(auth.statusCode, 200);
  assert.strictEqual(auth.merchantIdentity?.storeId, 'pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo');
  assert.strictEqual(auth.merchantIdentity?.companyName, 'Test Sandbox Restaurant');

  const doc = service.buildAppUiDocument(
    DEPLOYED_BASE_URL,
    900,
    auth.merchantIdentity?.storeId
  );

  assert.strictEqual(doc.version, 1);
  assert.strictEqual(Array.isArray(doc.components), true);
  assert.strictEqual(doc.components.length, 1);
  assert.strictEqual(doc.components[0].type, 'IframeView');
  assert.strictEqual(doc.components[0].height, 900);
  assert.ok(doc.components[0].url.startsWith(DEPLOYED_BASE_URL));
  assert.ok(doc.components[0].url.includes('embedded=1'));
  assert.ok(doc.components[0].url.includes('store_id=pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo'));
  assert.ok(doc.components[0].url.length <= 1024);
});

// Test 2: Missing X-Ewity-Signature header
runTest('2. Reject request with missing X-Ewity-Signature header', () => {
  const contextHeader = service.generateContextToken(TEST_SECRET);
  const auth = service.authenticateRequest(
    {
      'x-ewity-context': contextHeader,
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 401);
  assert.strictEqual(auth.error, 'invalid_signature');
  assert.ok(auth.reason?.includes('Missing X-Ewity-Signature'));
});

// Test 3: Invalid/tampered X-Ewity-Signature
runTest('3. Reject request with tampered/invalid signature hash', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const badSignature = `t=${nowSec},v1=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;
  const contextHeader = service.generateContextToken(TEST_SECRET);

  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': badSignature,
      'x-ewity-context': contextHeader,
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 401);
  assert.strictEqual(auth.error, 'invalid_signature');
});

// Test 4: Expired timestamp (> 300s)
runTest('4. Reject request with expired timestamp in X-Ewity-Signature', () => {
  const expiredSec = Math.floor(Date.now() / 1000) - 400; // 400s old
  const expiredSignature = service.generateSignatureHeader(TEST_SECRET, expiredSec, '');
  const contextHeader = service.generateContextToken(TEST_SECRET);

  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': expiredSignature,
      'x-ewity-context': contextHeader,
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 401);
  assert.ok(auth.reason?.includes('out of tolerance'));
});

// Test 5: Missing X-Ewity-Context JWT
runTest('5. Reject request with missing X-Ewity-Context header', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const signatureHeader = service.generateSignatureHeader(TEST_SECRET, nowSec, '');

  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': signatureHeader,
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 401);
  assert.strictEqual(auth.error, 'invalid_context');
  assert.ok(auth.reason?.includes('Missing X-Ewity-Context'));
});

// Test 6: Malformed X-Ewity-Context JWT (not 3 parts)
runTest('6. Reject malformed X-Ewity-Context JWT', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const signatureHeader = service.generateSignatureHeader(TEST_SECRET, nowSec, '');

  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': signatureHeader,
      'x-ewity-context': 'not.a.valid.jwt.four.parts',
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 401);
  assert.strictEqual(auth.error, 'invalid_context');
});

// Test 7: JWT signed with wrong secret
runTest('7. Reject X-Ewity-Context JWT signed with wrong secret', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const signatureHeader = service.generateSignatureHeader(TEST_SECRET, nowSec, '');
  const wrongSecretToken = service.generateContextToken('wrong_secret_key_12345');

  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': signatureHeader,
      'x-ewity-context': wrongSecretToken,
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 401);
  assert.strictEqual(auth.error, 'invalid_context');
  assert.ok(auth.reason?.includes('mismatch'));
});

// Test 8: Expired JWT context token
runTest('8. Reject expired X-Ewity-Context JWT token', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const signatureHeader = service.generateSignatureHeader(TEST_SECRET, nowSec, '');
  const expiredToken = service.generateContextToken(TEST_SECRET, {
    exp: nowSec - 100, // expired 100s ago
  });

  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': signatureHeader,
      'x-ewity-context': expiredToken,
    },
    '',
    {}
  );

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 401);
  assert.strictEqual(auth.error, 'invalid_context');
  assert.ok(auth.reason?.includes('expired'));
});

// Test 9: Unsigned store_id query param is not trusted as identity
runTest('9. Unsigned store_id query parameter is not trusted as merchant identity', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const signatureHeader = service.generateSignatureHeader(TEST_SECRET, nowSec, '');
  // Legitimate token issued for merchant store "REAL_MERCHANT_100"
  const token = service.generateContextToken(TEST_SECRET, {
    install: { store_id: 'REAL_MERCHANT_100' },
  });

  // Attacker tries to inject fraudulent query param ?store_id=FRAUDULENT_MERCHANT_999
  const auth = service.authenticateRequest(
    {
      'x-ewity-signature': signatureHeader,
      'x-ewity-context': token,
    },
    '',
    { store_id: 'FRAUDULENT_MERCHANT_999' }
  );

  assert.strictEqual(auth.isValid, true);
  // Must strictly take identity from verified JWT, ignoring attacker's query param
  assert.strictEqual(auth.merchantIdentity?.storeId, 'REAL_MERCHANT_100');
  assert.notStrictEqual(auth.merchantIdentity?.storeId, 'FRAUDULENT_MERCHANT_999');
});

// Test 10: Missing server-side secret safe rejection
runTest('10. Safe 500 error when signing secret is missing on server', () => {
  const unconfiguredService = new EwityAppUiService('', DEPLOYED_BASE_URL);
  const auth = unconfiguredService.authenticateRequest({}, '');

  assert.strictEqual(auth.isValid, false);
  assert.strictEqual(auth.statusCode, 500);
  assert.strictEqual(auth.error, 'configuration_error');
});

// Test 11: Iframe height clamping to protocol specifications [200, 4000]
runTest('11. Iframe height correctly clamped within [200, 4000] range', () => {
  const docLow = service.buildAppUiDocument(DEPLOYED_BASE_URL, 50);
  assert.strictEqual(docLow.components[0].height, 200);

  const docHigh = service.buildAppUiDocument(DEPLOYED_BASE_URL, 8000);
  assert.strictEqual(docHigh.components[0].height, 4000);

  const docNormal = service.buildAppUiDocument(DEPLOYED_BASE_URL, 900);
  assert.strictEqual(docNormal.components[0].height, 900);
});

// Test 12: Existing Webhook signature verification integrity remains separate and intact
runTest('12. Existing webhook service verification remains intact and separate', () => {
  const webhookService = new EwityWebhookService(TEST_SECRET);
  const nowSec = Math.floor(Date.now() / 1000);
  const samplePayload = JSON.stringify({
    id: 'evt_test_123',
    event: 'bill.created',
    created_at: new Date().toISOString(),
  });

  const validSig = webhookService.verifySignature(
    `t=${nowSec},v1=${crypto.createHmac('sha256', TEST_SECRET).update(`${nowSec}.${samplePayload}`).digest('hex')}`,
    samplePayload
  );
  assert.strictEqual(validSig.isValid, true);

  const badSig = webhookService.verifySignature(
    `t=${nowSec},v1=invalid_hex_string`,
    samplePayload
  );
  assert.strictEqual(badSig.isValid, false);
});

console.log('\n====================================================');
console.log(` RESULTS: ${passedTests}/${totalTests} tests passed`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
