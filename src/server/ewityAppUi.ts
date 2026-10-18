/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';

/**
 * Verified claims carried in the X-Ewity-Context JWT
 * as documented in Ewity App UI Protocol.
 */
export interface EwityAppUiContext {
  iss?: string;
  aud?: string;
  exp: number;
  iat?: number;
  jti?: string;
  install?: {
    store_id?: string;
    external_account_id?: string;
  } | string;
  company?: {
    id: number | string;
    name: string;
    domain?: string;
  };
  user?: {
    id: number | string;
    name: string;
    email?: string;
  };
  [key: string]: any;
}

export interface AppUiVerificationResult {
  isValid: boolean;
  statusCode: number;
  error?: string;
  reason?: string;
  context?: EwityAppUiContext;
  merchantIdentity?: {
    storeId?: string;
    companyId?: string | number;
    companyName?: string;
    userId?: string | number;
    userName?: string;
  };
}

export interface IframeViewComponent {
  type: 'IframeView';
  url: string;
  height: number;
}

export interface EwityAppUiDocument {
  version: 1;
  components: [IframeViewComponent];
}

/**
 * Service dedicated to Ewity App UI integration, request authentication,
 * JWT context validation, and IframeView document generation.
 */
export class EwityAppUiService {
  private signingSecret: string;
  private defaultAppUrl: string;

  constructor(
    signingSecret: string = '',
    defaultAppUrl: string = 'https://ais-pre-4vmloib4ucrege7oirz6nu-417987842324.asia-southeast1.run.app'
  ) {
    this.signingSecret = signingSecret;
    this.defaultAppUrl = defaultAppUrl;
  }

  public setSigningSecret(secret: string) {
    this.signingSecret = secret;
  }

  public hasSigningSecret(): boolean {
    return Boolean(this.signingSecret && this.signingSecret.trim() !== '');
  }

  public getSigningSecret(): string {
    return this.signingSecret;
  }

  public setAppUrl(url: string) {
    this.defaultAppUrl = url;
  }

  public getAppUrl(): string {
    return this.defaultAppUrl;
  }

  /**
   * Timing-safe string comparison to protect against side-channel timing attacks.
   */
  public safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Base64URL decode helper for JWT components.
   */
  public base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Base64URL encode helper for JWT components.
   */
  public base64UrlEncode(input: string | Buffer): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Verifies the X-Ewity-Signature header for an App UI request.
   * Format: t=<unix_timestamp>,v1=<hex_signature>
   * String to sign: `${t}.${rawBody}` (for GET requests with empty body, `${t}.`)
   */
  public verifySignature(
    signatureHeader: string | undefined,
    rawBody: string | Buffer = '',
    secret: string = this.signingSecret
  ): { isValid: boolean; reason?: string; timestamp?: number } {
    if (!secret || secret.trim() === '') {
      return {
        isValid: false,
        reason: 'Signing secret is not configured on the server.',
      };
    }

    if (!signatureHeader || signatureHeader.trim() === '') {
      return {
        isValid: false,
        reason: 'Missing X-Ewity-Signature header.',
      };
    }

    const parts = signatureHeader.split(',');
    let tStr: string | undefined;
    let v1Hex: string | undefined;

    for (const part of parts) {
      const [key, val] = part.trim().split('=');
      if (key === 't') tStr = val;
      if (key === 'v1') v1Hex = val;
    }

    if (!tStr || !v1Hex) {
      return {
        isValid: false,
        reason: 'Invalid X-Ewity-Signature header format. Expected "t=<timestamp>,v1=<signature>".',
      };
    }

    const t = parseInt(tStr, 10);
    if (isNaN(t) || t <= 0) {
      return {
        isValid: false,
        reason: 'Malformed timestamp in X-Ewity-Signature header.',
      };
    }

    // 300-second (5 minute) replay window
    const nowSec = Math.floor(Date.now() / 1000);
    const drift = Math.abs(nowSec - t);
    if (drift > 300) {
      return {
        isValid: false,
        reason: `Signature timestamp out of tolerance (drift: ${drift}s, max allowed: 300s).`,
      };
    }

    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const stringToSign = `${t}.${bodyStr}`;

    const expectedHex = crypto
      .createHmac('sha256', secret)
      .update(stringToSign)
      .digest('hex');

    const isValid = this.safeCompare(expectedHex, v1Hex);

    return {
      isValid,
      reason: isValid ? undefined : 'HMAC-SHA256 signature verification failed (v1 mismatch).',
      timestamp: t,
    };
  }

  /**
   * Validates the X-Ewity-Context JWT using the documented HS256 algorithm.
   * Rejects expired tokens, signature mismatches, or malformed structures.
   */
  public verifyContextToken(
    contextHeader: string | undefined,
    secret: string = this.signingSecret
  ): { isValid: boolean; reason?: string; context?: EwityAppUiContext } {
    if (!secret || secret.trim() === '') {
      return {
        isValid: false,
        reason: 'Signing secret is not configured on the server.',
      };
    }

    if (!contextHeader || contextHeader.trim() === '') {
      return {
        isValid: false,
        reason: 'Missing X-Ewity-Context header.',
      };
    }

    const jwtParts = contextHeader.trim().split('.');
    if (jwtParts.length !== 3) {
      return {
        isValid: false,
        reason: 'Malformed X-Ewity-Context JWT. Expected 3 base64url segments.',
      };
    }

    const [headerB64, payloadB64, signatureB64] = jwtParts;

    // 1. Decode and verify header
    let headerObj: any;
    try {
      headerObj = JSON.parse(this.base64UrlDecode(headerB64));
    } catch {
      return {
        isValid: false,
        reason: 'Unable to parse JWT header in X-Ewity-Context.',
      };
    }

    if (!headerObj || headerObj.alg !== 'HS256') {
      return {
        isValid: false,
        reason: `Unsupported JWT algorithm "${headerObj?.alg}". Ewity App UI requires HS256.`,
      };
    }

    // 2. Verify HS256 cryptographic signature
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSigBuf = crypto
      .createHmac('sha256', secret)
      .update(signingInput)
      .digest();
    const expectedSigB64 = this.base64UrlEncode(expectedSigBuf);

    if (!this.safeCompare(expectedSigB64, signatureB64)) {
      return {
        isValid: false,
        reason: 'Cryptographic signature mismatch on X-Ewity-Context JWT.',
      };
    }

    // 3. Decode and validate claims in payload
    let payload: EwityAppUiContext;
    try {
      payload = JSON.parse(this.base64UrlDecode(payloadB64));
    } catch {
      return {
        isValid: false,
        reason: 'Unable to parse JWT payload in X-Ewity-Context.',
      };
    }

    if (typeof payload !== 'object' || payload === null) {
      return {
        isValid: false,
        reason: 'Invalid JWT payload structure in X-Ewity-Context.',
      };
    }

    if (typeof payload.exp !== 'number') {
      return {
        isValid: false,
        reason: 'Missing or invalid "exp" expiration claim in X-Ewity-Context JWT.',
      };
    }

    // 10-second clock skew tolerance
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > payload.exp + 10) {
      return {
        isValid: false,
        reason: `X-Ewity-Context JWT has expired (exp: ${payload.exp}, current: ${nowSec}).`,
      };
    }

    if (typeof payload.nbf === 'number' && nowSec < payload.nbf - 10) {
      return {
        isValid: false,
        reason: `X-Ewity-Context JWT is not yet valid (nbf: ${payload.nbf}, current: ${nowSec}).`,
      };
    }

    return {
      isValid: true,
      context: payload,
    };
  }

  /**
   * Authenticates an App UI request by verifying both X-Ewity-Signature and X-Ewity-Context.
   *
   * SECURITY ENFORCEMENT:
   * Do NOT trust an unsigned `store_id` query parameter as proof of merchant identity.
   * Merchant identity is strictly extracted from verified JWT claims.
   */
  public authenticateRequest(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer = '',
    queryParams: Record<string, any> = {}
  ): AppUiVerificationResult {
    if (!this.hasSigningSecret()) {
      return {
        isValid: false,
        statusCode: 500,
        error: 'configuration_error',
        reason: 'Ewity signing secret is not configured on the server.',
      };
    }

    const signatureHeader = (headers['x-ewity-signature'] || headers['X-Ewity-Signature']) as string | undefined;
    const contextHeader = (headers['x-ewity-context'] || headers['X-Ewity-Context']) as string | undefined;

    // 1. Verify Request Signature
    const sigResult = this.verifySignature(signatureHeader, rawBody);
    if (!sigResult.isValid) {
      return {
        isValid: false,
        statusCode: 401,
        error: 'invalid_signature',
        reason: sigResult.reason || 'Cryptographic signature verification failed.',
      };
    }

    // 2. Validate Context JWT
    const contextResult = this.verifyContextToken(contextHeader);
    if (!contextResult.isValid || !contextResult.context) {
      return {
        isValid: false,
        statusCode: 401,
        error: 'invalid_context',
        reason: contextResult.reason || 'Context token verification failed.',
      };
    }

    const context = contextResult.context;

    // Extract trusted merchant identity strictly from verified JWT
    let storeId: string | undefined;
    if (typeof context.install === 'object' && context.install !== null) {
      storeId = context.install.store_id || context.install.external_account_id;
    } else if (typeof context.install === 'string') {
      storeId = context.install;
    }

    // Explicitly reject trusting unsigned query parameters as proof of identity
    if (queryParams.store_id && storeId && queryParams.store_id !== storeId) {
      console.warn('[EWITY-APP-UI] Unsigned query store_id differs from verified JWT claim. Using JWT claim.');
    }

    const merchantIdentity = {
      storeId,
      companyId: context.company?.id,
      companyName: context.company?.name,
      userId: context.user?.id,
      userName: context.user?.name,
    };

    return {
      isValid: true,
      statusCode: 200,
      context,
      merchantIdentity,
    };
  }

  /**
   * Generates the compliant Ewity App UI JSON document containing
   * an IframeView component embedding the Kitchen Watchdog interface.
   *
   * Spec:
   * - version: 1
   * - components: [ { type: 'IframeView', url, height } ]
   * - url: HTTPS, length <= 1024
   * - height: integer between 200 and 4000 (default: 900)
   */
  public buildAppUiDocument(
    targetUrl: string = this.defaultAppUrl,
    height: number = 900,
    merchantStoreId?: string
  ): EwityAppUiDocument {
    // Ensure height is clamped to Ewity specification [200, 4000]
    const clampedHeight = Math.max(200, Math.min(4000, Math.round(height)));

    let finalUrl = targetUrl || this.defaultAppUrl;

    // Append embedded flag and optional verified store_id for seamless view
    try {
      const parsed = new URL(finalUrl);
      parsed.searchParams.set('embedded', '1');
      if (merchantStoreId) {
        parsed.searchParams.set('store_id', merchantStoreId);
      }
      finalUrl = parsed.toString();
    } catch {
      // If URL parsing fails, ensure default URL is used
      finalUrl = `${this.defaultAppUrl}${this.defaultAppUrl.includes('?') ? '&' : '?'}embedded=1`;
    }

    // URL limit in Ewity spec: 1024 characters
    if (finalUrl.length > 1024) {
      finalUrl = finalUrl.slice(0, 1024);
    }

    return {
      version: 1,
      components: [
        {
          type: 'IframeView',
          url: finalUrl,
          height: clampedHeight,
        },
      ],
    };
  }

  // --------------------------------------------------------------------------
  // TEST & SIGNING HELPERS (Used for automated tests & diagnostic requests)
  // --------------------------------------------------------------------------

  /**
   * Generates a signed X-Ewity-Signature header value for a given timestamp and body.
   */
  public generateSignatureHeader(
    secret: string = this.signingSecret,
    timestampSec: number = Math.floor(Date.now() / 1000),
    rawBody: string | Buffer = ''
  ): string {
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const stringToSign = `${timestampSec}.${bodyStr}`;
    const hex = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');
    return `t=${timestampSec},v1=${hex}`;
  }

  /**
   * Generates a valid signed HS256 JWT for the X-Ewity-Context header.
   */
  public generateContextToken(
    secret: string = this.signingSecret,
    claims: Partial<EwityAppUiContext> = {}
  ): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    const payload: EwityAppUiContext = {
      iss: 'ewity',
      aud: 'app_kitchen_watchdog',
      exp: nowSec + 60, // 60 seconds lifetime
      iat: nowSec,
      jti: `ewity_ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      install: {
        store_id: 'pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo',
      },
      company: {
        id: 10134,
        name: 'Test Sandbox',
        domain: 'test-sandbox-online-3',
      },
      user: {
        id: 201,
        name: 'Kitchen Watchdog Supervisor',
      },
      ...claims,
    };

    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;
    const sigBuf = crypto.createHmac('sha256', secret).update(signingInput).digest();
    const sigB64 = this.base64UrlEncode(sigBuf);

    return `${headerB64}.${payloadB64}.${sigB64}`;
  }
}
