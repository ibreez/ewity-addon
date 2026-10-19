/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';

// ============================================================================
// EWITY APP UI PROTOCOL (v1) - CANONICAL TYPES & CLOSED SCHEMAS
// ============================================================================

export type Tone = 'default' | 'info' | 'success' | 'warning' | 'danger';
export type BannerTone = 'info' | 'success' | 'warning' | 'danger';
export type ToastTone = 'info' | 'success' | 'warning' | 'danger';
export type Scalar = string | number | boolean | null;

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

// ----------------------------------------------------------------------------
// ACTIONS (Closed Schemas)
// ----------------------------------------------------------------------------

export interface AppAction {
  type: 'app_action';
  action_id: string; // <=100 chars
  label?: string; // <=40 chars (required on buttons, optional on Table row_action)
  payload?: Record<string, Scalar>; // flat map of scalars
  confirm?: string; // <=200 chars
  tone?: Tone;
}

export interface OpenUrlAction {
  type: 'open_url';
  url: string; // https, <=1024 chars
  label: string; // <=40 chars
}

export interface ModalAction {
  type: 'modal';
  component: FormComponent | DetailCardComponent | CustomHTMLViewComponent;
  title?: string; // <=120 chars
  label: string; // <=40 chars
}

export interface RefreshAction {
  type: 'refresh';
  label: string; // <=40 chars
}

export type Action = AppAction | OpenUrlAction | ModalAction | RefreshAction;

// ----------------------------------------------------------------------------
// COMPONENTS (Closed Schemas)
// ----------------------------------------------------------------------------

export interface HeaderViewStat {
  label: string; // <=40 chars
  value: Scalar;
  tone?: Tone;
}

export interface HeaderViewComponent {
  type: 'HeaderView';
  id?: string;
  title: string; // <=120 chars
  subtitle?: string; // <=300 chars
  image_url?: string; // https, <=1024 chars
  stats?: HeaderViewStat[]; // <=6
  actions?: Action[]; // <=3
}

export interface DetailCardItem {
  label: string; // <=60 chars
  value: Scalar;
  tone?: Tone;
}

export interface DetailCardComponent {
  type: 'DetailCard';
  id?: string;
  title?: string; // <=120 chars
  columns?: 1 | 2 | 3;
  items: DetailCardItem[]; // 1-30
}

export interface TableColumn {
  key: string; // <=60 chars
  label: string; // <=60 chars
  align?: 'left' | 'center' | 'right';
  tone_key?: string; // <=60 chars
}

export interface TableComponent {
  type: 'Table';
  id?: string;
  title?: string; // <=120 chars
  columns: TableColumn[]; // 1-8
  rows: Array<Record<string, Scalar>>; // 0-100
  empty_text?: string; // <=200 chars
  row_action?: AppAction; // app_action only
}

export interface FormFieldOption {
  value: Scalar;
  label: string; // <=80 chars
}

export interface FormField {
  key: string; // snake_case, <=60 chars, unique per form
  label: string; // <=80 chars
  type: 'text' | 'number' | 'mobile' | 'select' | 'textarea' | 'date';
  required?: boolean;
  placeholder?: string; // <=120 chars
  help?: string; // <=200 chars
  default?: Scalar;
  options?: FormFieldOption[]; // required for select (1-50), rejected on other types
}

export interface FormComponent {
  type: 'Form';
  id?: string;
  title?: string; // <=120 chars
  action_id: string; // <=100 chars
  submit_label?: string; // <=40 chars
  fields: FormField[]; // 1-20
}

export interface BannerComponent {
  type: 'Banner';
  id?: string;
  tone: BannerTone; // info | success | warning | danger (required, no default)
  title: string; // <=120 chars
  message?: string; // <=500 chars
}

export interface CustomHTMLViewComponent {
  type: 'CustomHTMLView';
  id?: string;
  html: string; // <=100 KB
  height?: number; // 100-4000 px, default 400
}

export interface IframeViewComponent {
  type: 'IframeView';
  id?: string;
  url: string; // https, <=1024 chars
  height?: number; // 200-4000 px, default 900
}

export type Component =
  | HeaderViewComponent
  | DetailCardComponent
  | TableComponent
  | FormComponent
  | BannerComponent
  | CustomHTMLViewComponent
  | IframeViewComponent;

// ----------------------------------------------------------------------------
// TABS & DOCUMENTS (Closed Schemas)
// ----------------------------------------------------------------------------

export interface TabDefinition {
  key: string; // snake_case, <=40 chars, unique
  label: string; // <=30 chars
}

export interface EwityAppUiPageDocument {
  version: 1;
  title?: string; // <=120 chars
  layout?: 'default' | 'fullscreen'; // fullscreen only with exactly 1 IframeView
  components?: Component[]; // 1-30 (exactly one of components/tabs)
  tabs?: TabDefinition[]; // 1-8 (exactly one of components/tabs)
}

export interface EwityAppUiTabDocument {
  version: 1;
  components: Component[]; // 1-30 (no title, no tabs)
}

export type EwityAppUiDocument = EwityAppUiPageDocument | EwityAppUiTabDocument;

// ----------------------------------------------------------------------------
// ACTION PAYLOAD & RESPONSE (Closed Schemas)
// ----------------------------------------------------------------------------

export interface EwityAppUiActionPost {
  type: 'action';
  action_id: string;
  page: string;
  tab: string | null;
  values?: Record<string, any>;
  payload?: Record<string, any>;
  context?: Record<string, any>;
}

export interface ActionToast {
  tone: ToastTone; // info | success | warning | danger (required)
  message: string; // <=300 chars
}

export interface EwityAppUiActionResponse {
  ui?: EwityAppUiTabDocument | EwityAppUiPageDocument; // components-only document
  toast?: ActionToast;
  refresh?: boolean;
  close_modal?: boolean;
}

export interface EwityUiValidationError {
  path: string;
  message: string;
  expected: string;
  got: string;
  hint?: string;
}

// ============================================================================
// SERVICE IMPLEMENTATION & SCHEMA VALIDATOR
// ============================================================================

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

  public safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  public base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  public base64UrlEncode(input: string | Buffer): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATION & REQUEST TRUST VERIFICATION
  // --------------------------------------------------------------------------

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

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > payload.exp + 10) {
      return {
        isValid: false,
        reason: `X-Ewity-Context JWT has expired (exp: ${payload.exp}, current: ${nowSec}).`,
      };
    }

    return {
      isValid: true,
      context: payload,
    };
  }

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

    const sigResult = this.verifySignature(signatureHeader, rawBody);
    if (!sigResult.isValid) {
      return {
        isValid: false,
        statusCode: 401,
        error: 'invalid_signature',
        reason: sigResult.reason || 'Cryptographic signature verification failed.',
      };
    }

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
    let storeId: string | undefined;
    if (typeof context.install === 'object' && context.install !== null) {
      storeId = context.install.store_id || context.install.external_account_id;
    } else if (typeof context.install === 'string') {
      storeId = context.install;
    }

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

  // --------------------------------------------------------------------------
  // CLOSED-SCHEMA VALIDATION ENGINE
  // Catches all schema errors, unknown keys, length violations, and type mismatches.
  // --------------------------------------------------------------------------

  public validateDocument(doc: any): { isValid: boolean; errors: EwityUiValidationError[] } {
    const errors: EwityUiValidationError[] = [];

    if (!doc || typeof doc !== 'object') {
      errors.push({
        path: '$',
        message: 'UI document must be a JSON object.',
        expected: 'JSON object',
        got: typeof doc,
      });
      return { isValid: false, errors };
    }

    if (doc.version !== 1) {
      errors.push({
        path: '$.version',
        message: 'Protocol version must be integer 1.',
        expected: '1',
        got: String(doc.version),
      });
    }

    const allowedDocKeys = new Set(['version', 'title', 'layout', 'components', 'tabs']);
    for (const key of Object.keys(doc)) {
      if (!allowedDocKeys.has(key)) {
        errors.push({
          path: `$.${key}`,
          message: `Unknown document key "${key}". Closed schema violation.`,
          expected: 'one of: version, title, layout, components, tabs',
          got: `"${key}"`,
        });
      }
    }

    if (doc.title !== undefined) {
      if (typeof doc.title !== 'string' || doc.title.length > 120) {
        errors.push({
          path: '$.title',
          message: 'Title must be a string <= 120 characters.',
          expected: 'string <= 120',
          got: typeof doc.title === 'string' ? `${doc.title.length} chars` : typeof doc.title,
        });
      }
    }

    const hasComponents = Array.isArray(doc.components);
    const hasTabs = Array.isArray(doc.tabs);

    if (hasComponents && hasTabs) {
      errors.push({
        path: '$',
        message: 'Document must declare exactly one of "components" or "tabs", not both.',
        expected: 'exactly one of components or tabs',
        got: 'both declared',
      });
    } else if (!hasComponents && !hasTabs) {
      errors.push({
        path: '$',
        message: 'Document must declare either "components" or "tabs".',
        expected: 'components or tabs array',
        got: 'none declared',
      });
    }

    if (doc.layout !== undefined) {
      if (doc.layout !== 'default' && doc.layout !== 'fullscreen') {
        errors.push({
          path: '$.layout',
          message: `Invalid layout "${doc.layout}". Expected "default" or "fullscreen".`,
          expected: 'default | fullscreen',
          got: String(doc.layout),
        });
      } else if (doc.layout === 'fullscreen') {
        if (!hasComponents || doc.components.length !== 1 || doc.components[0]?.type !== 'IframeView') {
          errors.push({
            path: '$.layout',
            message: 'layout: "fullscreen" is only valid when components is exactly one IframeView.',
            expected: 'components: [ { type: "IframeView" } ]',
            got: hasTabs ? 'tabs declared' : `${doc.components?.length || 0} component(s)`,
          });
        }
      }
    }

    if (hasTabs) {
      if (doc.tabs.length < 1 || doc.tabs.length > 8) {
        errors.push({
          path: '$.tabs',
          message: `Tabs count must be between 1 and 8. Received ${doc.tabs.length}.`,
          expected: '1-8 tabs',
          got: String(doc.tabs.length),
        });
      }
      const seenKeys = new Set<string>();
      const allowedTabKeys = new Set(['key', 'label']);
      doc.tabs.forEach((tab: any, idx: number) => {
        const path = `$.tabs[${idx}]`;
        if (typeof tab !== 'object' || tab === null) {
          errors.push({ path, message: 'Tab definition must be an object', expected: 'object', got: typeof tab });
          return;
        }
        for (const k of Object.keys(tab)) {
          if (!allowedTabKeys.has(k)) {
            errors.push({
              path: `${path}.${k}`,
              message: `Unknown key "${k}" on tab definition. Tabs only accept "key" and "label".`,
              expected: 'key | label',
              got: `"${k}"`,
              hint: k === 'id' ? 'Tabs do not take an id; their key serves that role.' : undefined,
            });
          }
        }
        if (!tab.key || typeof tab.key !== 'string' || !/^[a-z0-9_]+$/.test(tab.key) || tab.key.length > 40) {
          errors.push({
            path: `${path}.key`,
            message: 'Tab key must be unique snake_case string <= 40 chars (a-z, 0-9, _).',
            expected: 'snake_case string <= 40',
            got: String(tab.key),
          });
        } else if (seenKeys.has(tab.key)) {
          errors.push({
            path: `${path}.key`,
            message: `Duplicate tab key "${tab.key}". Keys must be unique per document.`,
            expected: 'unique key',
            got: `duplicate "${tab.key}"`,
          });
        } else {
          seenKeys.add(tab.key);
        }
        if (!tab.label || typeof tab.label !== 'string' || tab.label.length > 30) {
          errors.push({
            path: `${path}.label`,
            message: 'Tab label is required and must be <= 30 characters.',
            expected: 'string <= 30',
            got: typeof tab.label === 'string' ? `${tab.label.length} chars` : typeof tab.label,
          });
        }
      });
    }

    if (hasComponents) {
      if (doc.components.length < 1 || doc.components.length > 30) {
        errors.push({
          path: '$.components',
          message: `Components count must be between 1 and 30. Received ${doc.components.length}.`,
          expected: '1-30 components',
          got: String(doc.components.length),
        });
      }
      doc.components.forEach((comp: any, idx: number) => {
        this.validateComponent(comp, `$.components[${idx}]`, errors);
      });
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateComponent(comp: any, path: string, errors: EwityUiValidationError[]) {
    if (!comp || typeof comp !== 'object') {
      errors.push({ path, message: 'Component must be an object.', expected: 'object', got: typeof comp });
      return;
    }

    const validTypes = ['HeaderView', 'DetailCard', 'Table', 'Form', 'Banner', 'CustomHTMLView', 'IframeView'];
    if (!comp.type || !validTypes.includes(comp.type)) {
      errors.push({
        path: `${path}.type`,
        message: `Unknown component type "${comp?.type}".`,
        expected: `one of: ${validTypes.join(', ')}`,
        got: String(comp?.type),
      });
      return;
    }

    if (comp.id !== undefined && (typeof comp.id !== 'string' || comp.id.length > 100)) {
      errors.push({
        path: `${path}.id`,
        message: 'Component id must be string <= 100.',
        expected: 'string <= 100',
        got: typeof comp.id,
      });
    }

    switch (comp.type) {
      case 'HeaderView': {
        const allowed = new Set(['type', 'id', 'title', 'subtitle', 'image_url', 'stats', 'actions']);
        for (const k of Object.keys(comp)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on HeaderView.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        if (!comp.title || typeof comp.title !== 'string' || comp.title.length > 120) {
          errors.push({ path: `${path}.title`, message: 'HeaderView title required <= 120 chars.', expected: 'string <= 120', got: String(comp.title) });
        }
        if (comp.subtitle !== undefined && (typeof comp.subtitle !== 'string' || comp.subtitle.length > 300)) {
          errors.push({ path: `${path}.subtitle`, message: 'HeaderView subtitle must be <= 300 chars.', expected: 'string <= 300', got: String(comp.subtitle) });
        }
        if (comp.image_url !== undefined) {
          this.validateUrl(comp.image_url, `${path}.image_url`, errors);
        }
        if (comp.stats !== undefined) {
          if (!Array.isArray(comp.stats) || comp.stats.length > 6) {
            errors.push({ path: `${path}.stats`, message: 'stats must be array of <= 6 items.', expected: '<= 6 stats', got: String(comp.stats?.length) });
          } else {
            comp.stats.forEach((st: any, sIdx: number) => {
              const sp = `${path}.stats[${sIdx}]`;
              if (!st.label || typeof st.label !== 'string' || st.label.length > 40) {
                errors.push({ path: `${sp}.label`, message: 'Stat label required <= 40 chars.', expected: 'string <= 40', got: String(st.label) });
              }
              if (st.value === undefined) {
                errors.push({ path: `${sp}.value`, message: 'Stat value is required.', expected: 'scalar', got: 'undefined' });
              }
              if (st.tone !== undefined) {
                this.validateTone(st.tone, `${sp}.tone`, errors, true);
              }
            });
          }
        }
        if (comp.actions !== undefined) {
          if (!Array.isArray(comp.actions) || comp.actions.length > 3) {
            errors.push({ path: `${path}.actions`, message: 'actions must be array of <= 3 items.', expected: '<= 3 actions', got: String(comp.actions?.length) });
          } else {
            comp.actions.forEach((act: any, aIdx: number) => {
              this.validateAction(act, `${path}.actions[${aIdx}]`, errors, false);
            });
          }
        }
        break;
      }

      case 'DetailCard': {
        const allowed = new Set(['type', 'id', 'title', 'columns', 'items']);
        for (const k of Object.keys(comp)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on DetailCard.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        if (comp.title !== undefined && (typeof comp.title !== 'string' || comp.title.length > 120)) {
          errors.push({ path: `${path}.title`, message: 'DetailCard title <= 120 chars.', expected: 'string <= 120', got: String(comp.title) });
        }
        if (comp.columns !== undefined && ![1, 2, 3].includes(comp.columns)) {
          errors.push({ path: `${path}.columns`, message: 'DetailCard columns must be 1, 2, or 3.', expected: '1 | 2 | 3', got: String(comp.columns) });
        }
        if (!Array.isArray(comp.items) || comp.items.length < 1 || comp.items.length > 30) {
          errors.push({ path: `${path}.items`, message: 'DetailCard items required: 1-30.', expected: '1-30 items', got: String(comp.items?.length) });
        } else {
          comp.items.forEach((it: any, iIdx: number) => {
            const ip = `${path}.items[${iIdx}]`;
            if (!it.label || typeof it.label !== 'string' || it.label.length > 60) {
              errors.push({ path: `${ip}.label`, message: 'Item label required <= 60 chars.', expected: 'string <= 60', got: String(it.label) });
            }
            if (it.value === undefined) {
              errors.push({ path: `${ip}.value`, message: 'Item value is required scalar.', expected: 'scalar', got: 'undefined' });
            }
            if (it.tone !== undefined) {
              this.validateTone(it.tone, `${ip}.tone`, errors, true);
            }
          });
        }
        break;
      }

      case 'Table': {
        const allowed = new Set(['type', 'id', 'title', 'columns', 'rows', 'empty_text', 'row_action']);
        for (const k of Object.keys(comp)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on Table.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        if (comp.title !== undefined && (typeof comp.title !== 'string' || comp.title.length > 120)) {
          errors.push({ path: `${path}.title`, message: 'Table title <= 120 chars.', expected: 'string <= 120', got: String(comp.title) });
        }
        if (!Array.isArray(comp.columns) || comp.columns.length < 1 || comp.columns.length > 8) {
          errors.push({ path: `${path}.columns`, message: 'Table columns required: 1-8.', expected: '1-8 columns', got: String(comp.columns?.length) });
        } else {
          comp.columns.forEach((c: any, cIdx: number) => {
            const cp = `${path}.columns[${cIdx}]`;
            if (!c.key || typeof c.key !== 'string' || c.key.length > 60) {
              errors.push({ path: `${cp}.key`, message: 'Column key required <= 60.', expected: 'string <= 60', got: String(c.key) });
            }
            if (!c.label || typeof c.label !== 'string' || c.label.length > 60) {
              errors.push({ path: `${cp}.label`, message: 'Column label required <= 60.', expected: 'string <= 60', got: String(c.label) });
            }
            if (c.align !== undefined && !['left', 'center', 'right'].includes(c.align)) {
              errors.push({ path: `${cp}.align`, message: 'Column align must be left|center|right.', expected: 'left | center | right', got: String(c.align) });
            }
            if (c.tone_key !== undefined && (typeof c.tone_key !== 'string' || c.tone_key.length > 60)) {
              errors.push({ path: `${cp}.tone_key`, message: 'tone_key must be string <= 60.', expected: 'string <= 60', got: String(c.tone_key) });
            }
          });
        }
        if (!Array.isArray(comp.rows) || comp.rows.length > 100) {
          errors.push({ path: `${path}.rows`, message: 'Table rows must be array of 0-100 rows.', expected: '0-100 rows', got: String(comp.rows?.length) });
        }
        if (comp.empty_text !== undefined && (typeof comp.empty_text !== 'string' || comp.empty_text.length > 200)) {
          errors.push({ path: `${path}.empty_text`, message: 'Table empty_text <= 200 chars.', expected: 'string <= 200', got: String(comp.empty_text) });
        }
        if (comp.row_action !== undefined) {
          if (comp.row_action.type !== 'app_action') {
            errors.push({ path: `${path}.row_action`, message: 'Table row_action only accepts app_action.', expected: 'type: app_action', got: String(comp.row_action?.type) });
          } else {
            this.validateAction(comp.row_action, `${path}.row_action`, errors, true);
          }
        }
        break;
      }

      case 'Form': {
        const allowed = new Set(['type', 'id', 'title', 'action_id', 'submit_label', 'fields']);
        for (const k of Object.keys(comp)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on Form.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        if (!comp.action_id || typeof comp.action_id !== 'string' || comp.action_id.length > 100) {
          errors.push({ path: `${path}.action_id`, message: 'Form action_id required <= 100.', expected: 'string <= 100', got: String(comp.action_id) });
        }
        if (comp.submit_label !== undefined && (typeof comp.submit_label !== 'string' || comp.submit_label.length > 40)) {
          errors.push({ path: `${path}.submit_label`, message: 'Form submit_label <= 40 chars.', expected: 'string <= 40', got: String(comp.submit_label) });
        }
        if (!Array.isArray(comp.fields) || comp.fields.length < 1 || comp.fields.length > 20) {
          errors.push({ path: `${path}.fields`, message: 'Form fields required: 1-20.', expected: '1-20 fields', got: String(comp.fields?.length) });
        } else {
          const fieldKeys = new Set<string>();
          const allowedFieldKeys = new Set(['key', 'label', 'type', 'required', 'placeholder', 'help', 'default', 'options']);
          comp.fields.forEach((f: any, fIdx: number) => {
            const fp = `${path}.fields[${fIdx}]`;
            for (const fk of Object.keys(f)) {
              if (!allowedFieldKeys.has(fk)) {
                errors.push({ path: `${fp}.${fk}`, message: `Unknown key "${fk}" on field.`, expected: Array.from(allowedFieldKeys).join(', '), got: fk });
              }
            }
            if (!f.key || typeof f.key !== 'string' || !/^[a-z0-9_]+$/.test(f.key) || f.key.length > 60) {
              errors.push({ path: `${fp}.key`, message: 'Field key must be snake_case <= 60 chars.', expected: 'snake_case <= 60', got: String(f.key) });
            } else if (fieldKeys.has(f.key)) {
              errors.push({ path: `${fp}.key`, message: `Duplicate field key "${f.key}".`, expected: 'unique key', got: `duplicate "${f.key}"` });
            } else {
              fieldKeys.add(f.key);
            }
            if (!f.label || typeof f.label !== 'string' || f.label.length > 80) {
              errors.push({ path: `${fp}.label`, message: 'Field label required <= 80.', expected: 'string <= 80', got: String(f.label) });
            }
            const validTypes = ['text', 'number', 'mobile', 'select', 'textarea', 'date'];
            if (!validTypes.includes(f.type)) {
              errors.push({ path: `${fp}.type`, message: 'Invalid field type.', expected: validTypes.join(', '), got: String(f.type) });
            }
            if (f.type === 'select') {
              if (!Array.isArray(f.options) || f.options.length < 1 || f.options.length > 50) {
                errors.push({ path: `${fp}.options`, message: 'select field requires options array of 1-50 items.', expected: '1-50 options', got: String(f.options?.length) });
              } else {
                f.options.forEach((opt: any, oIdx: number) => {
                  const op = `${fp}.options[${oIdx}]`;
                  if (opt.value === undefined) errors.push({ path: `${op}.value`, message: 'Option value is required.', expected: 'scalar', got: 'undefined' });
                  if (!opt.label || typeof opt.label !== 'string' || opt.label.length > 80) {
                    errors.push({ path: `${op}.label`, message: 'Option label required <= 80.', expected: 'string <= 80', got: String(opt.label) });
                  }
                });
              }
            } else if (f.options !== undefined) {
              errors.push({ path: `${fp}.options`, message: `options is rejected on type "${f.type}". Only allowed on select.`, expected: 'undefined', got: 'array' });
            }
          });
        }
        break;
      }

      case 'Banner': {
        const allowed = new Set(['type', 'id', 'tone', 'title', 'message']);
        for (const k of Object.keys(comp)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on Banner.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        const bannerTones = ['info', 'success', 'warning', 'danger'];
        if (!comp.tone || !bannerTones.includes(comp.tone)) {
          errors.push({ path: `${path}.tone`, message: 'Banner tone is required and must be info|success|warning|danger (no default).', expected: 'info | success | warning | danger', got: String(comp.tone) });
        }
        if (!comp.title || typeof comp.title !== 'string' || comp.title.length > 120) {
          errors.push({ path: `${path}.title`, message: 'Banner title required <= 120.', expected: 'string <= 120', got: String(comp.title) });
        }
        if (comp.message !== undefined && (typeof comp.message !== 'string' || comp.message.length > 500)) {
          errors.push({ path: `${path}.message`, message: 'Banner message <= 500 chars.', expected: 'string <= 500', got: String(comp.message) });
        }
        break;
      }

      case 'CustomHTMLView': {
        const allowed = new Set(['type', 'id', 'html', 'height']);
        for (const k of Object.keys(comp)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on CustomHTMLView.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        if (!comp.html || typeof comp.html !== 'string' || Buffer.byteLength(comp.html, 'utf8') > 100 * 1024) {
          errors.push({ path: `${path}.html`, message: 'CustomHTMLView html required <= 100 KB.', expected: 'string <= 100 KB', got: typeof comp.html });
        }
        if (comp.height !== undefined && (typeof comp.height !== 'number' || comp.height < 100 || comp.height > 4000)) {
          errors.push({ path: `${path}.height`, message: 'CustomHTMLView height must be 100-4000.', expected: '100-4000', got: String(comp.height) });
        }
        break;
      }

      case 'IframeView': {
        const allowed = new Set(['type', 'id', 'url', 'height']);
        for (const k of Object.keys(comp)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on IframeView.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        this.validateUrl(comp.url, `${path}.url`, errors);
        if (comp.height !== undefined && (typeof comp.height !== 'number' || comp.height < 200 || comp.height > 4000)) {
          errors.push({ path: `${path}.height`, message: 'IframeView height must be 200-4000.', expected: '200-4000', got: String(comp.height) });
        }
        break;
      }
    }
  }

  private validateAction(action: any, path: string, errors: EwityUiValidationError[], isRowAction: boolean) {
    if (!action || typeof action !== 'object') {
      errors.push({ path, message: 'Action must be an object.', expected: 'object', got: typeof action });
      return;
    }

    const validTypes = ['app_action', 'open_url', 'modal', 'refresh'];
    if (!validTypes.includes(action.type)) {
      errors.push({ path: `${path}.type`, message: 'Invalid action type.', expected: validTypes.join(', '), got: String(action.type) });
      return;
    }

    if (!isRowAction && (!action.label || typeof action.label !== 'string' || action.label.length > 40)) {
      errors.push({ path: `${path}.label`, message: 'Action label is required and must be <= 40 chars.', expected: 'string <= 40', got: String(action.label) });
    }

    switch (action.type) {
      case 'app_action': {
        const allowed = new Set(['type', 'action_id', 'label', 'payload', 'confirm', 'tone']);
        for (const k of Object.keys(action)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on app_action.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        if (!action.action_id || typeof action.action_id !== 'string' || action.action_id.length > 100) {
          errors.push({ path: `${path}.action_id`, message: 'app_action action_id required <= 100.', expected: 'string <= 100', got: String(action.action_id) });
        }
        if (action.confirm !== undefined && (typeof action.confirm !== 'string' || action.confirm.length > 200)) {
          errors.push({ path: `${path}.confirm`, message: 'confirm dialog message <= 200.', expected: 'string <= 200', got: String(action.confirm) });
        }
        if (action.tone !== undefined) {
          this.validateTone(action.tone, `${path}.tone`, errors, true);
        }
        break;
      }

      case 'open_url': {
        const allowed = new Set(['type', 'url', 'label']);
        for (const k of Object.keys(action)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on open_url.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        this.validateUrl(action.url, `${path}.url`, errors);
        break;
      }

      case 'modal': {
        const allowed = new Set(['type', 'component', 'title', 'label']);
        for (const k of Object.keys(action)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on modal action.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        const validModalComps = ['Form', 'DetailCard', 'CustomHTMLView'];
        if (!action.component || !validModalComps.includes(action.component.type)) {
          errors.push({ path: `${path}.component`, message: 'Modal component must be Form, DetailCard, or CustomHTMLView.', expected: 'Form | DetailCard | CustomHTMLView', got: String(action.component?.type) });
        } else {
          this.validateComponent(action.component, `${path}.component`, errors);
        }
        if (action.title !== undefined && (typeof action.title !== 'string' || action.title.length > 120)) {
          errors.push({ path: `${path}.title`, message: 'Modal title <= 120 chars.', expected: 'string <= 120', got: String(action.title) });
        }
        break;
      }

      case 'refresh': {
        const allowed = new Set(['type', 'label']);
        for (const k of Object.keys(action)) {
          if (!allowed.has(k)) {
            errors.push({ path: `${path}.${k}`, message: `Unknown key "${k}" on refresh action.`, expected: Array.from(allowed).join(', '), got: k });
          }
        }
        break;
      }
    }
  }

  private validateTone(tone: any, path: string, errors: EwityUiValidationError[], allowDefault: boolean) {
    const valid = allowDefault
      ? ['default', 'info', 'success', 'warning', 'danger']
      : ['info', 'success', 'warning', 'danger'];
    if (!valid.includes(tone)) {
      errors.push({
        path,
        message: `Invalid tone "${tone}".`,
        expected: valid.join(' | '),
        got: String(tone),
      });
    }
  }

  private validateUrl(url: any, path: string, errors: EwityUiValidationError[]) {
    if (!url || typeof url !== 'string' || url.length > 1024) {
      errors.push({
        path,
        message: 'URL must be a string <= 1024 chars.',
        expected: 'https URL <= 1024',
        got: typeof url === 'string' ? `${url.length} chars` : typeof url,
      });
      return;
    }
    try {
      const parsed = new URL(url);
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !isLocal) {
        errors.push({
          path,
          message: 'URL protocol must be https (http allowed only for localhost).',
          expected: 'https://',
          got: parsed.protocol,
        });
      }
    } catch {
      errors.push({
        path,
        message: 'Invalid URL format.',
        expected: 'valid https URL',
        got: url,
      });
    }
  }

  // --------------------------------------------------------------------------
  // CANONICAL EWITY APP UI (v1) DOCUMENT GENERATORS FOR KITCHEN WATCHDOG
  // --------------------------------------------------------------------------

  /**
   * Generates the root page document for page=home.
   * Declares async tabs for native POS rendering.
   */
  public buildHomeDocument(): EwityAppUiPageDocument {
    return {
      version: 1,
      title: 'Kitchen Watchdog',
      tabs: [
        { key: 'overview', label: 'Overview' },
        { key: 'alerts', label: 'Incidents' },
        { key: 'orders', label: 'Active Orders' },
        { key: 'settings', label: 'SLA Settings' },
        { key: 'dashboard', label: 'Web UI' },
      ],
    };
  }

  /**
   * Generates tab-content documents (?tab=<key>).
   * Exact shape: { version: 1, components: [...] } (no title, no tabs).
   */
  public buildTabContent(
    tabKey: string,
    state: {
      orders?: any[];
      alerts?: any[];
      settings?: any;
      connectionStatus?: string;
      storeId?: string;
      merchantName?: string;
    } = {}
  ): EwityAppUiTabDocument {
    const orders = state.orders || [];
    const alerts = state.alerts || [];
    const settings = state.settings || {
      kotTimeoutSeconds: 60,
      orderWarningMinutes: 10,
      soundEnabled: true,
      monitoringEnabled: true,
    };
    const storeId = state.storeId || 'Current Store';
    const connectionStatus = state.connectionStatus || 'LIVE CONNECTED';

    switch (tabKey) {
      case 'overview': {
        const activeOrdersCount = orders.filter((o) => o.status !== 'Completed' && o.status !== 'Cancelled').length;
        const awaitingKotCount = orders.filter((o) => o.kotStatus === 'KOT Not Confirmed' && o.status !== 'Completed').length;
        const overdueCount = orders.filter((o) => o.severity === 'urgent' && o.status !== 'Completed').length;

        const components: Component[] = [
          {
            type: 'HeaderView',
            title: 'Ewity Kitchen Watchdog',
            subtitle: `Real-time restaurant kitchen timing, KOT print confirmation & SLA monitor for store #${storeId}.`,
            stats: [
              { label: 'Active Orders', value: activeOrdersCount, tone: activeOrdersCount > 0 ? 'info' : 'default' },
              { label: 'Awaiting KOT', value: awaitingKotCount, tone: awaitingKotCount > 0 ? 'warning' : 'success' },
              { label: 'Overdue SLA', value: overdueCount, tone: overdueCount > 0 ? 'danger' : 'success' },
              { label: 'Gateway', value: connectionStatus, tone: connectionStatus === 'LIVE CONNECTED' ? 'success' : 'warning' },
            ],
            actions: [
              { type: 'refresh', label: 'Refresh' },
              {
                type: 'modal',
                label: '+ Simulate',
                title: 'Inject Simulated Order',
                component: {
                  type: 'Form',
                  action_id: 'simulate_order_submit',
                  submit_label: 'Inject Order',
                  fields: [
                    {
                      key: 'preset',
                      label: 'Simulation Preset',
                      type: 'select',
                      required: true,
                      options: [
                        { value: 'normal_dine_in', label: 'Normal Dine-In (Table 4)' },
                        { value: 'delayed_kot', label: 'KOT Confirmation Delay (Urgent)' },
                        { value: 'overdue_prep', label: 'Overdue Preparation Time' },
                        { value: 'online_delivery', label: 'Online Order Delivery' },
                      ],
                    },
                    {
                      key: 'table_number',
                      label: 'Table / Counter',
                      type: 'text',
                      default: 'T-04',
                      placeholder: 'e.g. Table 4',
                    },
                  ],
                },
              },
            ],
          },
        ];

        if (overdueCount > 0) {
          components.push({
            type: 'Banner',
            tone: 'danger',
            title: `${overdueCount} Order(s) Exceeded Kitchen SLA`,
            message: 'Urgent kitchen delay detected. Please expedite active preparation tickets on station printers.',
          });
        } else if (awaitingKotCount > 0) {
          components.push({
            type: 'Banner',
            tone: 'warning',
            title: `${awaitingKotCount} KOT Ticket(s) Awaiting Confirmation`,
            message: 'Kitchen printer ticket confirmation is pending. Check printer paper and physical station output.',
          });
        }

        const tableRows = orders.slice(0, 15).map((o) => {
          let tone: Tone = 'default';
          if (o.severity === 'urgent') tone = 'danger';
          else if (o.severity === 'warning') tone = 'warning';
          else if (o.status === 'Completed') tone = 'success';

          return {
            order_number: o.orderNumber || String(o.id),
            source: o.source || 'POS',
            type: o.type || 'Dine-in',
            kot_status: o.kotStatus || 'Confirmed',
            order_status: o.status || 'Active',
            status_tone: tone,
            order_id: String(o.id),
          };
        });

        components.push({
          type: 'Table',
          title: 'Live Kitchen Queue',
          columns: [
            { key: 'order_number', label: 'Order #' },
            { key: 'source', label: 'Source' },
            { key: 'type', label: 'Type' },
            { key: 'kot_status', label: 'KOT Status' },
            { key: 'order_status', label: 'Status', tone_key: 'status_tone' },
          ],
          rows: tableRows,
          empty_text: 'No active kitchen orders in queue.',
          row_action: {
            type: 'app_action',
            action_id: 'view_order_details',
            label: 'View',
          },
        });

        return { version: 1, components };
      }

      case 'alerts': {
        const activeAlerts = alerts.slice(0, 20).map((a) => {
          let tone: Tone = 'default';
          if (a.severity === 'urgent') tone = 'danger';
          else if (a.severity === 'warning') tone = 'warning';
          else tone = 'info';

          return {
            alert_id: String(a.id),
            order_id: String(a.orderId),
            rule: a.type.replace(/_/g, ' '),
            severity: a.severity.toUpperCase(),
            severity_tone: tone,
            status: a.acknowledgedAt ? 'Acknowledged' : 'Active',
          };
        });

        const components: Component[] = [
          {
            type: 'HeaderView',
            title: 'Watchdog Incidents & Alerts',
            subtitle: 'Real-time alert log triggered by KOT confirmation timeouts, order delays, and connection drops.',
            stats: [
              { label: 'Active Alerts', value: alerts.length, tone: alerts.length > 0 ? 'warning' : 'success' },
              { label: 'Acknowledged', value: alerts.filter((a) => a.acknowledgedAt).length, tone: 'default' },
            ],
            actions: [{ type: 'refresh', label: 'Refresh' }],
          },
          {
            type: 'Table',
            title: 'Recent Incidents',
            columns: [
              { key: 'order_id', label: 'Order ID' },
              { key: 'rule', label: 'Triggered Rule' },
              { key: 'severity', label: 'Severity', tone_key: 'severity_tone' },
              { key: 'status', label: 'Status' },
            ],
            rows: activeAlerts,
            empty_text: 'No active incidents. Kitchen operations are running smoothly.',
            row_action: {
              type: 'app_action',
              action_id: 'acknowledge_alert',
              label: 'Acknowledge',
              confirm: 'Acknowledge this kitchen watchdog incident?',
            },
          },
        ];

        return { version: 1, components };
      }

      case 'orders': {
        const rows = orders.slice(0, 50).map((o) => ({
          order_id: String(o.id),
          order_number: o.orderNumber || String(o.id),
          table: o.tableNumber || '—',
          source: o.source || 'POS',
          kot_number: o.kotNumber || '—',
          kot_status: o.kotStatus || 'Confirmed',
          status: o.status || 'Received',
        }));

        return {
          version: 1,
          components: [
            {
              type: 'HeaderView',
              title: 'Kitchen Tickets & KOT Orders',
              subtitle: 'Detailed receipt, KOT printer sequence numbers, and table assignments.',
              actions: [{ type: 'refresh', label: 'Refresh' }],
            },
            {
              type: 'Table',
              columns: [
                { key: 'order_number', label: 'Order #' },
                { key: 'table', label: 'Table' },
                { key: 'source', label: 'Source' },
                { key: 'kot_number', label: 'KOT #' },
                { key: 'kot_status', label: 'KOT Status' },
                { key: 'status', label: 'Status' },
              ],
              rows,
              empty_text: 'No orders logged today.',
              row_action: {
                type: 'app_action',
                action_id: 'view_order_details',
              },
            },
          ],
        };
      }

      case 'settings': {
        return {
          version: 1,
          components: [
            {
              type: 'HeaderView',
              title: 'Watchdog SLA Thresholds',
              subtitle: 'Operational parameters and notification rules for store monitoring.',
              actions: [
                {
                  type: 'modal',
                  label: 'Edit SLAs',
                  title: 'Configure SLA Thresholds',
                  component: {
                    type: 'Form',
                    action_id: 'save_sla_settings',
                    submit_label: 'Save Configuration',
                    fields: [
                      {
                        key: 'kot_timeout_sec',
                        label: 'KOT Confirmation Timeout (Seconds)',
                        type: 'number',
                        default: settings.kotTimeoutSeconds || 60,
                        help: 'Time after which an unconfirmed KOT ticket triggers a warning.',
                      },
                      {
                        key: 'prep_warning_min',
                        label: 'Order Prep Warning (Minutes)',
                        type: 'number',
                        default: settings.orderWarningMinutes || 10,
                        help: 'Time before active preparation is flagged as overdue.',
                      },
                      {
                        key: 'alert_audio',
                        label: 'Audible Alerts',
                        type: 'select',
                        default: settings.soundEnabled ? 'enabled' : 'disabled',
                        options: [
                          { value: 'enabled', label: 'Enabled (Chime on urgent incidents)' },
                          { value: 'disabled', label: 'Muted (Visual banners only)' },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
            {
              type: 'DetailCard',
              title: 'Active SLAs & Tolerances',
              columns: 2,
              items: [
                { label: 'KOT Confirmation SLA', value: `${settings.kotTimeoutSeconds || 60} seconds`, tone: 'warning' },
                { label: 'Kitchen Prep SLA', value: `${settings.orderWarningMinutes || 10} minutes`, tone: 'info' },
                { label: 'Monitoring Engine', value: settings.monitoringEnabled ? 'Enabled' : 'Disabled', tone: 'success' },
                { label: 'Sound Alerts', value: settings.soundEnabled ? 'Active' : 'Muted' },
                { label: 'Target Store ID', value: storeId },
                { label: 'Platform Interface', value: 'Ewity Apps v1 Native Spec' },
              ],
            },
          ],
        };
      }

      case 'dashboard':
      default: {
        return {
          version: 1,
          components: [
            {
              type: 'IframeView',
              url: `${this.defaultAppUrl}?embedded=1&store_id=${encodeURIComponent(storeId)}`,
              height: 900,
            },
          ],
        };
      }
    }
  }

  /**
   * Action Handler for POST requests from native Ewity App UI components.
   * Handles button clicks, row selections, and modal form submits.
   */
  public handleAction(
    actionPost: EwityAppUiActionPost,
    state: {
      orders?: any[];
      alerts?: any[];
      onSaveSettings?: (newSettings: any) => void;
      onSimulateOrder?: (preset: string, table?: string) => void;
    } = {}
  ): EwityAppUiActionResponse {
    const actionId = actionPost.action_id;
    const payload = actionPost.payload || {};
    const values = actionPost.values || {};

    switch (actionId) {
      case 'view_order_details': {
        const orderId = payload.order_id || payload.id;
        const order = (state.orders || []).find((o) => String(o.id) === String(orderId)) || {
          id: orderId,
          orderNumber: payload.order_number || orderId,
          source: payload.source || 'POS',
          type: payload.type || 'Dine-in',
          status: payload.order_status || 'Active',
          kotNumber: payload.kot_number || 'KOT-101',
          kotStatus: payload.kot_status || 'Confirmed',
          elapsedMinutes: 12,
        };

        const detailsDoc: EwityAppUiTabDocument = {
          version: 1,
          components: [
            {
              type: 'HeaderView',
              title: `Order #${order.orderNumber || order.id}`,
              subtitle: `Source: ${order.source} • Table: ${order.tableNumber || 'Main Dining'}`,
              actions: [
                {
                  type: 'app_action',
                  action_id: 'back_to_dashboard',
                  label: 'Back',
                },
              ],
            },
            {
              type: 'DetailCard',
              title: 'Order Status & Station Details',
              columns: 2,
              items: [
                { label: 'Order Number', value: order.orderNumber || order.id },
                { label: 'Status', value: order.status || 'Active', tone: order.status === 'Completed' ? 'success' : 'info' },
                { label: 'KOT Sequence #', value: order.kotNumber || '—' },
                { label: 'KOT Print Status', value: order.kotStatus || 'Pending', tone: order.kotStatus === 'Confirmed' ? 'success' : 'warning' },
                { label: 'Created At', value: order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : 'Just now' },
                { label: 'Elapsed Prep Time', value: `${order.elapsedMinutes || 5} min` },
              ],
            },
          ],
        };

        return {
          ui: detailsDoc,
        };
      }

      case 'acknowledge_alert': {
        return {
          toast: {
            tone: 'success',
            message: 'Incident acknowledged by kitchen supervisor.',
          },
          refresh: true,
        };
      }

      case 'save_sla_settings': {
        if (state.onSaveSettings) {
          state.onSaveSettings({
            kotTimeoutSeconds: Number(values.kot_timeout_sec) || 60,
            orderWarningMinutes: Number(values.prep_warning_min) || 10,
            soundEnabled: values.alert_audio === 'enabled',
          });
        }
        return {
          toast: {
            tone: 'success',
            message: 'SLA threshold configuration saved successfully.',
          },
          close_modal: true,
          refresh: true,
        };
      }

      case 'simulate_order_submit': {
        if (state.onSimulateOrder) {
          state.onSimulateOrder(values.preset || 'normal_dine_in', values.table_number || 'T-04');
        }
        return {
          toast: {
            tone: 'success',
            message: `Simulated order (${values.preset || 'normal'}) created.`,
          },
          close_modal: true,
          refresh: true,
        };
      }

      case 'back_to_dashboard':
      default: {
        return {
          refresh: true,
        };
      }
    }
  }

  /**
   * Generates a compliant IframeView specification document.
   * Preserved for backward compatibility.
   */
  public buildAppUiDocument(
    targetUrl: string = this.defaultAppUrl,
    height: number = 900,
    merchantStoreId?: string
  ): EwityAppUiDocument {
    const clampedHeight = Math.max(200, Math.min(4000, Math.round(height)));
    let finalUrl = targetUrl || this.defaultAppUrl;

    try {
      const parsed = new URL(finalUrl);
      parsed.searchParams.set('embedded', '1');
      if (merchantStoreId) {
        parsed.searchParams.set('store_id', merchantStoreId);
      }
      finalUrl = parsed.toString();
    } catch {
      finalUrl = `${this.defaultAppUrl}${this.defaultAppUrl.includes('?') ? '&' : '?'}embedded=1`;
    }

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
  // TEST & SIGNING HELPERS
  // --------------------------------------------------------------------------

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
      exp: nowSec + 60,
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
