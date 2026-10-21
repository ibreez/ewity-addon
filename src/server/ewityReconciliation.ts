/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EwityApiClient } from './ewityClient';
import { EwityBillSummary } from '../types/ewity';

export interface ReconciliationStats {
  lastRunAt: number | null;
  isRunning: boolean;
  totalSyncedCount: number;
  recentRecoveredCount: number;
  lastError: string | null;
  runCount: number;
}

export class EwityReconciliationWorker {
  private client: EwityApiClient;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private locationId: string = 'all';
  private onBillsReconciled?: (bills: EwityBillSummary[]) => void;
  private lastStartTime: number = 0;
  private stats: ReconciliationStats = {
    lastRunAt: null,
    isRunning: false,
    totalSyncedCount: 0,
    recentRecoveredCount: 0,
    lastError: null,
    runCount: 0,
  };

  constructor(
    client: EwityApiClient,
    intervalMs: number = 60000,
    onBillsReconciled?: (bills: EwityBillSummary[]) => void
  ) {
    this.client = client;
    this.intervalMs = intervalMs;
    this.onBillsReconciled = onBillsReconciled;
  }

  public setLocationId(locationId: string) {
    this.locationId = locationId;
  }

  public start() {
    if (this.timer) return;
    console.log(`[EWITY-RECONCILER] Starting periodic reconciliation worker (interval: ${this.intervalMs / 1000}s)`);
    // Run initial reconciliation shortly after startup
    setTimeout(() => this.reconcile(), 3000);
    this.timer = setInterval(() => this.reconcile(), this.intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[EWITY-RECONCILER] Stopped periodic reconciliation worker`);
    }
  }

  public async reconcile(): Promise<{ success: boolean; billsCount: number; error?: string }> {
    if (!this.client.hasCredentials()) {
      return { success: false, billsCount: 0, error: 'No Ewity credentials configured' };
    }

    if (!this.client.hasAuthorizedAppAccess()) {
      return { success: true, billsCount: 0 };
    }

    if (this.stats.isRunning) {
      if (this.lastStartTime && Date.now() - this.lastStartTime < 60000) {
        return { success: false, billsCount: 0, error: 'Reconciliation already in progress' };
      }
      console.warn('[EWITY-RECONCILER] Previous run stalled for >60s. Resetting lock.');
    }

    this.stats.isRunning = true;
    this.lastStartTime = Date.now();
    const startTime = this.lastStartTime;

    try {
      // Pull recent bills (e.g. limit 30, newest first)
      const response = await this.client.listBills(this.locationId, {
        limit: 30,
        order_by: 'created_at:desc',
      });

      if (response.appAccessPending) {
        return { success: true, billsCount: 0 };
      }

      const bills = response.data || [];
      this.stats.lastRunAt = Date.now();
      this.stats.runCount += 1;
      this.stats.totalSyncedCount += bills.length;
      this.stats.lastError = null;

      if (this.onBillsReconciled && bills.length > 0) {
        this.onBillsReconciled(bills);
      }

      console.log(`[EWITY-RECONCILER] Successfully reconciled ${bills.length} bills in ${Date.now() - startTime}ms`);
      return { success: true, billsCount: bills.length };
    } catch (err: any) {
      const errMsg = err.message || 'Unknown reconciliation error';
      this.stats.lastError = errMsg;
      console.warn(`[EWITY-RECONCILER] Reconciliation run failed: ${errMsg}`);
      return { success: false, billsCount: 0, error: errMsg };
    } finally {
      this.stats.isRunning = false;
    }
  }

  public getStats(): ReconciliationStats {
    return { ...this.stats };
  }
}
