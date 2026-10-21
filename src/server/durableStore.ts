/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { Order, Alert, MonitoringSettings } from '../types';
import { EwityBillSummary } from '../types/ewity';

export interface WebhookDeliveryRecord {
  deliveryId: string;
  eventId: string;
  event: string;
  storeId?: string;
  receivedAt: number;
  processedAt?: number;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'duplicate_ignored' | 'stale_skipped';
  error?: string;
  payloadSummary?: {
    entityId?: string | number;
    entityType?: string;
  };
}

export interface TenantData {
  storeId: string;
  updatedAt: number;
  bills: EwityBillSummary[];
  orders: Order[];
  alerts: Alert[];
  settings: MonitoringSettings;
  auditLog: {
    id: string;
    action: string;
    performedBy: string;
    timestamp: number;
    details?: any;
  }[];
}

const DEFAULT_SETTINGS: MonitoringSettings = {
  kotConfirmationTimeoutSec: 60,
  orderCompletionWarningMin: 10,
  statusStalledWarningMin: 5,
  alertRepeatIntervalMin: 2,
  soundEnabled: true,
  desktopNotificationsEnabled: false,
  monitoringEnabled: true,
};

export class DurableStore {
  private baseDir: string;
  private deliveriesDir: string;
  private tenantsDir: string;
  private memoryDeliveries: Map<string, WebhookDeliveryRecord> = new Map();
  private memoryTenants: Map<string, TenantData> = new Map();

  constructor(baseDir: string = path.resolve('.data')) {
    this.baseDir = baseDir;
    this.deliveriesDir = path.join(this.baseDir, 'deliveries');
    this.tenantsDir = path.join(this.baseDir, 'tenants');
    this.ensureDirs();
  }

  private ensureDirs() {
    try {
      if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
      if (!fs.existsSync(this.deliveriesDir)) fs.mkdirSync(this.deliveriesDir, { recursive: true });
      if (!fs.existsSync(this.tenantsDir)) fs.mkdirSync(this.tenantsDir, { recursive: true });
    } catch (err) {
      console.warn('[DURABLE-STORE] Failed to initialize storage directories, falling back to memory:', err);
    }
  }

  private getDeliveryFilePath(deliveryId: string): string {
    const safeId = deliveryId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.deliveriesDir, `${safeId}.json`);
  }

  private getTenantFilePath(storeId: string): string {
    const safeStoreId = (storeId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.tenantsDir, `${safeStoreId}.json`);
  }

  /**
   * Atomic write to file: write to a temporary file first and rename
   */
  private atomicWriteFileSync(filePath: string, data: any) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempFile = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempFile, filePath);
    } catch (err) {
      console.warn(`[DURABLE-STORE] Filesystem write failed, retained in memory for ${filePath}:`, err);
    }
  }

  // --------------------------------------------------------------------------
  // WEBHOOK DELIVERY TRACKING (DURABLE & IDEMPOTENT)
  // --------------------------------------------------------------------------

  public getDelivery(deliveryId: string): WebhookDeliveryRecord | null {
    if (this.memoryDeliveries.has(deliveryId)) {
      return this.memoryDeliveries.get(deliveryId)!;
    }
    try {
      const file = this.getDeliveryFilePath(deliveryId);
      if (fs.existsSync(file)) {
        const record = JSON.parse(fs.readFileSync(file, 'utf-8'));
        this.memoryDeliveries.set(deliveryId, record);
        return record;
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }

  public recordDeliveryReceived(
    deliveryId: string,
    eventId: string,
    event: string,
    storeId?: string,
    entityId?: string | number
  ): WebhookDeliveryRecord {
    const record: WebhookDeliveryRecord = {
      deliveryId,
      eventId,
      event,
      storeId,
      receivedAt: Date.now(),
      status: 'received',
      payloadSummary: entityId ? { entityId } : undefined,
    };
    this.memoryDeliveries.set(deliveryId, record);
    this.atomicWriteFileSync(this.getDeliveryFilePath(deliveryId), record);
    return record;
  }

  public updateDeliveryStatus(
    deliveryId: string,
    status: WebhookDeliveryRecord['status'],
    error?: string
  ): void {
    const existing = this.getDelivery(deliveryId);
    if (existing) {
      existing.status = status;
      if (status === 'processed') {
        existing.processedAt = Date.now();
      }
      if (error) {
        existing.error = error;
      }
      this.memoryDeliveries.set(deliveryId, existing);
      this.atomicWriteFileSync(this.getDeliveryFilePath(deliveryId), existing);
    }
  }

  // --------------------------------------------------------------------------
  // TENANT ISOLATION DATA MANAGEMENT
  // --------------------------------------------------------------------------

  public loadTenantData(storeId: string): TenantData {
    if (this.memoryTenants.has(storeId)) {
      return this.memoryTenants.get(storeId)!;
    }
    try {
      const file = this.getTenantFilePath(storeId);
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (parsed && Array.isArray(parsed.orders)) {
          // Hygiene check: retain only genuine production orders
          const genuineOrders = parsed.orders.filter(
            (o: any) =>
              o &&
              (o.dataSource === 'ewity_api' || o.dataSource === 'ewity_webhook' || o.dataSource === 'persisted') &&
              !String(o.id).startsWith('ord-4') &&
              !String(o.orderNumber).startsWith('EW-4')
          );
          const tenantData: TenantData = {
            storeId,
            updatedAt: parsed.updatedAt || Date.now(),
            bills: Array.isArray(parsed.bills) ? parsed.bills : [],
            orders: genuineOrders,
            alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
            settings: parsed.settings || { ...DEFAULT_SETTINGS },
            auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
          };
          this.memoryTenants.set(storeId, tenantData);
          return tenantData;
        }
      }
    } catch (err) {
      console.warn(`[DURABLE-STORE] Failed to load tenant data for store ${storeId}:`, err);
    }

    const defaultData: TenantData = {
      storeId,
      updatedAt: Date.now(),
      bills: [],
      orders: [],
      alerts: [],
      settings: { ...DEFAULT_SETTINGS },
      auditLog: [],
    };
    this.memoryTenants.set(storeId, defaultData);
    return defaultData;
  }

  public saveTenantData(data: TenantData): void {
    try {
      data.updatedAt = Date.now();
      // Keep only genuine production orders
      data.orders = data.orders.filter(
        (o) => o && (o.dataSource === 'ewity_api' || o.dataSource === 'ewity_webhook' || o.dataSource === 'persisted')
      );
      // Bound audit log
      if (data.auditLog && data.auditLog.length > 200) {
        data.auditLog = data.auditLog.slice(-200);
      }
      this.memoryTenants.set(data.storeId, data);
      this.atomicWriteFileSync(this.getTenantFilePath(data.storeId), data);
    } catch (err) {
      console.error(`[DURABLE-STORE] Failed to save tenant data for store ${data.storeId}:`, err);
    }
  }

  public recordAuditAction(
    storeId: string,
    action: string,
    performedBy: string,
    details?: any
  ): void {
    const tenant = this.loadTenantData(storeId);
    tenant.auditLog.unshift({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      action,
      performedBy,
      timestamp: Date.now(),
      details,
    });
    this.saveTenantData(tenant);
  }
}
