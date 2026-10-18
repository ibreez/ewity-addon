/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { EwityWebhookEnvelope } from '../types/ewity';

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
  timestamp?: number;
  expectedSignature?: string;
}

export interface ProcessedWebhookRecord {
  deliveryId: string;
  event: string;
  receivedAt: number;
  processedAt: number;
  entityId?: string;
  entityStatus?: string;
  wasDuplicate: boolean;
  wasOutOfOrder: boolean;
  status: 'processed' | 'duplicate_ignored' | 'stale_skipped';
}

export class EwityWebhookService {
  private signingSecret: string;
  private processedDeliveries = new Map<string, ProcessedWebhookRecord>();
  private entityTimestamps = new Map<string, number>();
  private recentEvents: (EwityWebhookEnvelope & { deliveryId: string; verified: boolean; status: string })[] = [];
  private lastWebhookReceivedAt: number | null = null;
  private lastWebhookEvent: string | null = null;

  constructor(signingSecret: string = '') {
    this.signingSecret = signingSecret;
  }

  public setSigningSecret(secret: string) {
    this.signingSecret = secret;
  }

  public hasSecret(): boolean {
    return Boolean(this.signingSecret && this.signingSecret.trim() !== '');
  }

  /**
   * Cryptographically verifies the incoming webhook request using HMAC-SHA256
   * and timing-safe comparison as specified in official Ewity documentation.
   */
  public verifySignature(
    signatureHeader: string | undefined,
    rawBody: string | Buffer
  ): WebhookVerificationResult {
    if (!this.hasSecret()) {
      return {
        isValid: false,
        reason: 'Webhook signing secret (EWITY_WEBHOOK_SECRET) not configured.',
      };
    }

    if (!signatureHeader) {
      return {
        isValid: false,
        reason: 'Missing X-Ewity-Signature header.',
      };
    }

    // Format: "t=<unix_timestamp>,v1=<hex_signature>"
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
        reason: 'Invalid X-Ewity-Signature format. Expected "t=...,v1=..."',
      };
    }

    const t = parseInt(tStr, 10);
    if (isNaN(t)) {
      return {
        isValid: false,
        reason: 'Invalid timestamp in signature header.',
      };
    }

    // Check replay window (300 seconds / 5 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - t) > 300) {
      return {
        isValid: false,
        reason: `Webhook timestamp expired or out of tolerance (drift: ${Math.abs(nowSec - t)}s, max: 300s).`,
      };
    }

    // Compute HMAC-SHA256(secret, `${t}.${rawBody}`)
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const payloadToSign = `${t}.${bodyStr}`;

    const computedHex = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payloadToSign)
      .digest('hex');

    // Constant-time compare
    const computedBuf = Buffer.from(computedHex, 'utf8');
    const receivedBuf = Buffer.from(v1Hex, 'utf8');

    if (computedBuf.length !== receivedBuf.length) {
      return {
        isValid: false,
        reason: 'Signature mismatch.',
      };
    }

    const isValid = crypto.timingSafeEqual(computedBuf, receivedBuf);

    return {
      isValid,
      reason: isValid ? undefined : 'Signature verification failed (HMAC-SHA256 mismatch).',
      timestamp: t,
      expectedSignature: computedHex,
    };
  }

  /**
   * Processes verified webhook envelope idempotently with delivery deduplication
   * and out-of-order sequencing checks.
   */
  public processEnvelope(
    deliveryId: string,
    envelope: EwityWebhookEnvelope
  ): {
    success: boolean;
    wasDuplicate: boolean;
    wasOutOfOrder: boolean;
    action: 'processed' | 'duplicate_ignored' | 'stale_skipped';
    message: string;
  } {
    const now = Date.now();
    const effectiveDeliveryId = deliveryId || envelope.id || `unknown_${now}`;

    // 1. Delivery Deduplication Check
    if (this.processedDeliveries.has(effectiveDeliveryId)) {
      console.log(`[EWITY-WEBHOOK] Deduplicated delivery: ${effectiveDeliveryId}`);
      return {
        success: true,
        wasDuplicate: true,
        wasOutOfOrder: false,
        action: 'duplicate_ignored',
        message: `Delivery ${effectiveDeliveryId} already processed (idempotent 200 OK).`,
      };
    }

    // 2. Out-of-Order Check based on event created_at
    const eventTime = new Date(envelope.created_at).getTime() || now;
    const entityKey = envelope.data?.id ? `${envelope.event}_${envelope.data.id}` : undefined;

    let wasOutOfOrder = false;
    if (entityKey) {
      const lastKnownTime = this.entityTimestamps.get(entityKey) || 0;
      if (eventTime < lastKnownTime) {
        wasOutOfOrder = true;
        console.warn(`[EWITY-WEBHOOK] Out-of-order event skipped for ${entityKey}: event time ${eventTime} < known time ${lastKnownTime}`);

        const record: ProcessedWebhookRecord = {
          deliveryId: effectiveDeliveryId,
          event: envelope.event,
          receivedAt: now,
          processedAt: now,
          entityId: String(envelope.data?.id),
          entityStatus: envelope.data?.status,
          wasDuplicate: false,
          wasOutOfOrder: true,
          status: 'stale_skipped',
        };
        this.processedDeliveries.set(effectiveDeliveryId, record);

        return {
          success: true,
          wasDuplicate: false,
          wasOutOfOrder: true,
          action: 'stale_skipped',
          message: `Stale event received out-of-order. Newer state preserved.`,
        };
      }
      this.entityTimestamps.set(entityKey, eventTime);
    }

    // 3. Mark processed
    const record: ProcessedWebhookRecord = {
      deliveryId: effectiveDeliveryId,
      event: envelope.event,
      receivedAt: now,
      processedAt: now,
      entityId: envelope.data?.id ? String(envelope.data.id) : undefined,
      entityStatus: envelope.data?.status,
      wasDuplicate: false,
      wasOutOfOrder: false,
      status: 'processed',
    };
    this.processedDeliveries.set(effectiveDeliveryId, record);

    // Keep memory bounded
    if (this.processedDeliveries.size > 2000) {
      const oldestKey = this.processedDeliveries.keys().next().value;
      if (oldestKey) this.processedDeliveries.delete(oldestKey);
    }

    // Store recent events for inspector UI
    this.recentEvents.unshift({
      ...envelope,
      deliveryId: effectiveDeliveryId,
      verified: true,
      status: 'processed',
    });
    if (this.recentEvents.length > 50) {
      this.recentEvents.pop();
    }

    this.lastWebhookReceivedAt = now;
    this.lastWebhookEvent = envelope.event;

    console.log(`[EWITY-WEBHOOK] Processed event ${envelope.event} (delivery: ${effectiveDeliveryId}) for install ${envelope.install?.store_id}`);

    return {
      success: true,
      wasDuplicate: false,
      wasOutOfOrder: false,
      action: 'processed',
      message: `Event ${envelope.event} processed successfully.`,
    };
  }

  public getLastReceivedAt(): number | null {
    return this.lastWebhookReceivedAt;
  }

  public getLastEventName(): string | null {
    return this.lastWebhookEvent;
  }

  public getRecentEvents() {
    return [...this.recentEvents];
  }

  public getProcessedCount(): number {
    return this.processedDeliveries.size;
  }
}
