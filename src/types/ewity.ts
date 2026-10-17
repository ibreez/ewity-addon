/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EwityCompany {
  id: number;
  name: string;
  domain: string;
}

export interface EwityLocation {
  id: number;
  name: string;
  display_name: string | null;
  type: 'restaurant' | 'retail' | string;
  tax_number?: string | null;
  street_address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  qr_menu_url?: string | null;
}

export interface EwityUser {
  id: number;
  name: string;
  email: string;
  company: EwityCompany;
  locations: EwityLocation[];
  authorities: string[];
}

export interface EwityBillSummary {
  id: number;
  parent_id: number | null;
  number: string;
  location: EwityLocation;
  customer: {
    id: number;
    name: string;
    mobile?: string;
  } | null;
  register_name?: string;
  restaurant_table: string | null;
  total_sales_price: number;
  total_cost_price?: number;
  total_tax: number;
  total_outstanding: number;
  total: number;
  currency: string | null;
  status: 'settled' | 'refunded' | 'partially-refunded' | 'voided' | string;
  payment_status: 'paid' | 'payment-pending' | 'partially-paid' | string;
  delivery_status: 'pending' | 'out-for-delivery' | 'delivered' | null;
  ui_status?: {
    text: string;
    color: string;
    hex: string;
  };
  ui_payment_status?: {
    text: string;
    color: string;
    hex: string;
  };
  ui_delivery_status?: {
    text: string;
    color: string;
  } | null;
  type: 'sale' | 'refund' | 'void' | 'layaway' | 'foc';
  sub_type?: string | null;
  is_invalid?: boolean;
  invalid_reason?: string | null;
  date: string;
  created: {
    at: string; // "YYYY-MM-DD HH:mm:ss"
    by: string;
  };
  kot_number?: string;
}

export interface EwityBillLineItem {
  id: number;
  name: string;
  variant_name?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  note?: string;
  category_name?: string;
}

export interface EwityBillPayment {
  id: number;
  payment_type: string;
  amount: number;
  settled_at: number;
}

export interface EwityBillDetail extends EwityBillSummary {
  bill_lines: EwityBillLineItem[];
  payments: EwityBillPayment[];
  employee?: {
    id: number;
    name: string;
  } | null;
  note?: string | null;
}

export interface EwityWebhookEnvelope<T = any> {
  id: string; // evt_...
  event: string;
  created_at: string;
  company: EwityCompany;
  install: {
    store_id: string;
    external_account_id: string | null;
  };
  data: T;
}

export type EwityConnectionStatus = 
  | 'Demo Mode'
  | 'Connecting'
  | 'Connected'
  | 'Connection Error';

export interface EwityConnectionInfo {
  mode: 'demo' | 'live';
  status: EwityConnectionStatus;
  isConnected: boolean;
  storeId: string | null;
  hasApiKey: boolean;
  hasSigningSecret: boolean;
  company?: EwityCompany;
  authorities: string[];
  hasBillHistoryPermission: boolean;
  availableLocations: EwityLocation[];
  activeLocationId?: string;
  lastSyncedAt?: number;
  lastError?: string;
  reconciliationActive: boolean;
  lastReconciliationAt?: number;
}

export interface EwityPagination {
  pageSize: number;
  current: number;
  total?: number;
  hasMorePages: boolean;
}

export interface EwityBillListResponse {
  data: EwityBillSummary[];
  pagination: EwityPagination;
  search?: Record<string, any>;
}

export interface MockTestResult {
  id: string;
  name: string;
  description: string;
  category: 'authentication' | 'bills' | 'pagination' | 'rate_limit' | 'webhooks' | 'network';
  passed: boolean;
  statusCode?: number;
  durationMs: number;
  details: string;
  requestPayload?: any;
  responsePayload?: any;
  error?: string;
}
