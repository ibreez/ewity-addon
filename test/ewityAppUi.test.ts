/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import crypto from 'crypto';
import { EwityAppUiService, IframeViewComponent } from '../src/server/ewityAppUi';
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
  assert.strictEqual(doc.components!.length, 1);
  const iframeComp = doc.components![0] as IframeViewComponent;
  assert.strictEqual(iframeComp.type, 'IframeView');
  assert.strictEqual(iframeComp.height, 900);
  assert.ok(iframeComp.url.startsWith(DEPLOYED_BASE_URL));
  assert.ok(iframeComp.url.includes('embedded=1'));
  assert.ok(iframeComp.url.includes('store_id=pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo'));
  assert.ok(iframeComp.url.length <= 1024);
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
  assert.strictEqual((docLow.components![0] as IframeViewComponent).height, 200);

  const docHigh = service.buildAppUiDocument(DEPLOYED_BASE_URL, 8000);
  assert.strictEqual((docHigh.components![0] as IframeViewComponent).height, 4000);

  const docNormal = service.buildAppUiDocument(DEPLOYED_BASE_URL, 900);
  assert.strictEqual((docNormal.components![0] as IframeViewComponent).height, 900);
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

// Test 13: Canonical v1 Root Page document generation & closed schema validation
runTest('13. Root page document conforms to canonical v1 spec with closed tab definitions', () => {
  const homeDoc = service.buildHomeDocument();
  assert.strictEqual(homeDoc.version, 1);
  assert.ok(homeDoc.tabs && homeDoc.tabs.length >= 1 && homeDoc.tabs.length <= 8);
  assert.strictEqual((homeDoc as any).components, undefined);

  // Validate using strict schema validator
  const validation = service.validateDocument(homeDoc);
  assert.strictEqual(validation.isValid, true);
  assert.strictEqual(validation.errors.length, 0);

  // Verify tab keys are snake_case and <= 40 chars
  for (const tab of homeDoc.tabs!) {
    assert.ok(/^[a-z0-9_]+$/.test(tab.key));
    assert.ok(tab.key.length <= 40);
    assert.ok(tab.label.length <= 30);
    // Closed schema: tabs must NOT have id or components
    assert.strictEqual((tab as any).id, undefined);
    assert.strictEqual((tab as any).components, undefined);
  }
});

// Test 14: Tab-content documents conform to closed schema (no title, no tabs)
runTest('14. Tab-content documents conform to closed schema (version: 1, components only)', () => {
  const tabs = ['overview', 'alerts', 'orders', 'settings', 'dashboard'];
  for (const t of tabs) {
    const tabDoc = service.buildTabContent(t, {
      storeId: 'store_101',
      connectionStatus: 'LIVE CONNECTED',
      orders: [
        { id: 'ord-1', orderNumber: 'EW-101', source: 'POS', type: 'Dine-in', status: 'In Kitchen', kotStatus: 'Confirmed', severity: 'nominal' }
      ],
      alerts: [
        { id: 'alt-1', orderId: 'ord-1', type: 'order_status_stalled', severity: 'warning', createdAt: Date.now() }
      ],
    });

    assert.strictEqual(tabDoc.version, 1);
    assert.strictEqual(Array.isArray(tabDoc.components), true);
    assert.strictEqual((tabDoc as any).title, undefined);
    assert.strictEqual((tabDoc as any).tabs, undefined);

    const validation = service.validateDocument(tabDoc);
    assert.strictEqual(validation.isValid, true, `Tab "${t}" failed validation: ${JSON.stringify(validation.errors)}`);
  }
});

// Test 15: Closed schema validator catches unknown keys and reports ui_errors
runTest('15. Closed schema validation rejects unknown keys with structured ui_errors', () => {
  const badDoc = {
    version: 1,
    title: 'Test',
    unknown_top_key: 'not allowed',
    components: [
      {
        type: 'HeaderView',
        title: 'Valid Title',
        unknown_component_key: 123,
      },
    ],
  };

  const validation = service.validateDocument(badDoc);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.length >= 2);

  const topError = validation.errors.find((e) => e.path === '$.unknown_top_key');
  assert.ok(topError);
  assert.ok(topError.message.includes('Closed schema violation'));

  const compError = validation.errors.find((e) => e.path === '$.components[0].unknown_component_key');
  assert.ok(compError);
});

// Test 16: Banner requires tone from info | success | warning | danger (no default)
runTest('16. Banner requires tone from info|success|warning|danger (rejects default)', () => {
  const badBannerDoc = {
    version: 1,
    components: [
      {
        type: 'Banner',
        tone: 'default', // default is rejected on Banner
        title: 'Notice',
      },
    ],
  };

  const validation = service.validateDocument(badBannerDoc);
  assert.strictEqual(validation.isValid, false);
  const toneErr = validation.errors.find((e) => e.path === '$.components[0].tone');
  assert.ok(toneErr);
  assert.ok(toneErr.message.includes('info|success|warning|danger'));

  const goodBannerDoc = {
    version: 1,
    components: [
      {
        type: 'Banner',
        tone: 'danger',
        title: 'Kitchen SLA Overdue',
        message: 'Order #102 is overdue.',
      },
    ],
  };
  const goodValidation = service.validateDocument(goodBannerDoc);
  assert.strictEqual(goodValidation.isValid, true);
});

// Test 17: Form select field requires options (1-50), non-select field rejects options
runTest('17. Form select requires options (1-50), non-select rejects options', () => {
  const badSelectForm = {
    version: 1,
    components: [
      {
        type: 'Form',
        action_id: 'submit_test',
        fields: [
          { key: 'category', label: 'Category', type: 'select' }, // missing options
          { key: 'notes', label: 'Notes', type: 'text', options: [{ value: 'a', label: 'A' }] }, // options not allowed
        ],
      },
    ],
  };

  const validation = service.validateDocument(badSelectForm);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.path === '$.components[0].fields[0].options'));
  assert.ok(validation.errors.some((e) => e.path === '$.components[0].fields[1].options'));
});

// Test 18: layout: fullscreen is only valid when components is exactly one IframeView
runTest('18. layout: fullscreen is only valid when components is exactly one IframeView', () => {
  const badFullscreen = {
    version: 1,
    layout: 'fullscreen',
    components: [
      { type: 'HeaderView', title: 'Header' },
    ],
  };

  const validation = service.validateDocument(badFullscreen);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.path === '$.layout'));

  const goodFullscreen = {
    version: 1,
    layout: 'fullscreen',
    components: [
      { type: 'IframeView', url: 'https://ais-pre-4vmloib4ucrege7oirz6nu-417987842324.asia-southeast1.run.app/embed' },
    ],
  };
  const goodValidation = service.validateDocument(goodFullscreen);
  assert.strictEqual(goodValidation.isValid, true);
});

// Test 19: Action POST handling generates compliant action responses
runTest('19. Action POST handler generates valid action response (toast, close_modal, refresh)', () => {
  const res = service.handleAction({
    type: 'action',
    action_id: 'save_sla_settings',
    page: 'home',
    tab: 'settings',
    values: {
      kot_timeout_sec: 45,
      prep_warning_min: 15,
      alert_audio: 'enabled',
    },
  });

  assert.strictEqual(res.close_modal, true);
  assert.strictEqual(res.refresh, true);
  assert.strictEqual(res.toast?.tone, 'success');
  assert.ok(res.toast?.message.includes('SLA'));
});

// Test 20: Action POST drill-down returns valid components-only document with Back action
runTest('20. Action POST drill-down returns valid components-only document with Back action', () => {
  const res = service.handleAction({
    type: 'action',
    action_id: 'view_order_details',
    page: 'home',
    tab: 'overview',
    payload: {
      order_id: 'ord-99',
      order_number: 'EW-99',
      source: 'POS',
      order_status: 'In Kitchen',
    },
  });

  assert.ok(res.ui);
  assert.strictEqual(res.ui.version, 1);
  assert.strictEqual(Array.isArray(res.ui.components), true);
  assert.strictEqual((res.ui as any).tabs, undefined);

  // Validate the replacement UI document
  const validation = service.validateDocument(res.ui);
  assert.strictEqual(validation.isValid, true, `Action UI invalid: ${JSON.stringify(validation.errors)}`);
});

console.log('\n====================================================');
console.log(` RESULTS: ${passedTests}/${totalTests} tests passed`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
