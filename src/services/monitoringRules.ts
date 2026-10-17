/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, Alert, MonitoringSettings, ConnectionStatus } from '../types';

export interface EvaluationResult {
  alerts: Alert[];
  updatedOrders: Order[];
}

/**
 * Evaluates orders against Watchdog monitoring rules.
 * Strictly adheres to rule: Do not label KOT as "not printed" unless actual print failure
 * evidence exists. Unconfirmed conditions are explicitly labeled "KOT not confirmed".
 */
export function evaluateMonitoringRules(
  orders: Order[],
  existingAlerts: Alert[],
  settings: MonitoringSettings,
  connectionStatus: ConnectionStatus,
  now: number = Date.now()
): EvaluationResult {
  if (!settings.monitoringEnabled) {
    return {
      alerts: existingAlerts,
      updatedOrders: orders.map(o => ({ ...o, alertSeverity: 'nominal' })),
    };
  }

  const generatedAlerts: Alert[] = [];
  const existingAlertsMap = new Map<string, Alert>();
  existingAlerts.forEach(a => existingAlertsMap.set(a.id, a));

  const updatedOrders: Order[] = orders.map(order => {
    // If completed or voided, order has no active alerts
    if (order.orderStatus === 'Completed' || order.orderStatus === 'Voided') {
      return {
        ...order,
        alertSeverity: 'nominal',
        activeAlertIds: [],
      };
    }

    const elapsedMs = now - order.createdAt;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const orderAlerts: Alert[] = [];

    // Rule 1: KOT Confirmation Timeout
    const kotTimeoutMs = settings.kotConfirmationTimeoutSec * 1000;
    if (order.kotStatus !== 'Confirmed' && elapsedMs >= kotTimeoutMs) {
      const alertId = `alt-kot-${order.id}`;
      const existing = existingAlertsMap.get(alertId);

      // Determine severity: urgent if more than 2.5x timeout, otherwise warning
      const isUrgent = elapsedMs >= kotTimeoutMs * 2.5;

      const alert: Alert = {
        id: alertId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableNumber: order.tableNumber,
        type: 'kot_timeout',
        title: 'KOT not confirmed',
        message: `Order ${order.orderNumber} ${order.tableNumber ? `(${order.tableNumber})` : ''} ticket confirmation not received after ${Math.floor(elapsedSec)}s (threshold: ${settings.kotConfirmationTimeoutSec}s).`,
        severity: isUrgent ? 'urgent' : 'warning',
        isConfirmedFailure: false, // Unconfirmed condition, not verified hardware failure
        conditionDescription: 'Unconfirmed KOT receipt event from Kitchen printer station. Awaiting print feedback.',
        createdAt: existing ? existing.createdAt : now,
        status: existing ? existing.status : 'active',
        acknowledgedBy: existing?.acknowledgedBy,
        acknowledgedAt: existing?.acknowledgedAt,
        snoozedUntil: existing?.snoozedUntil,
        snoozedBy: existing?.snoozedBy,
        resolvedBy: existing?.resolvedBy,
        resolvedAt: existing?.resolvedAt,
        resolutionNote: existing?.resolutionNote,
      };

      // Check if snoozed
      if (alert.status === 'snoozed' && alert.snoozedUntil && now > alert.snoozedUntil) {
        alert.status = 'active'; // Wake up snooze
      }

      orderAlerts.push(alert);
      generatedAlerts.push(alert);
    }

    // Rule 2: Order Completion / Kitchen Delay Warning
    const orderDelayMs = settings.orderCompletionWarningMin * 60 * 1000;
    if ((order.orderStatus === 'In Kitchen' || order.orderStatus === 'New') && elapsedMs >= orderDelayMs) {
      const alertId = `alt-delay-${order.id}`;
      const existing = existingAlertsMap.get(alertId);
      const overdueMinutes = Math.floor(elapsedMs / (60 * 1000));
      const isUrgent = overdueMinutes >= settings.orderCompletionWarningMin + 5;

      const alert: Alert = {
        id: alertId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableNumber: order.tableNumber,
        type: 'order_delay',
        title: 'Order preparation delayed',
        message: `Order ${order.orderNumber} elapsed time (${overdueMinutes}m) exceeds kitchen completion threshold (${settings.orderCompletionWarningMin}m).`,
        severity: isUrgent ? 'urgent' : 'warning',
        isConfirmedFailure: false,
        conditionDescription: 'Prep time threshold exceeded. Requires expediter review.',
        createdAt: existing ? existing.createdAt : now,
        status: existing ? existing.status : 'active',
        acknowledgedBy: existing?.acknowledgedBy,
        acknowledgedAt: existing?.acknowledgedAt,
        snoozedUntil: existing?.snoozedUntil,
        snoozedBy: existing?.snoozedBy,
        resolvedBy: existing?.resolvedBy,
        resolvedAt: existing?.resolvedAt,
        resolutionNote: existing?.resolutionNote,
      };

      if (alert.status === 'snoozed' && alert.snoozedUntil && now > alert.snoozedUntil) {
        alert.status = 'active';
      }

      orderAlerts.push(alert);
      generatedAlerts.push(alert);
    }

    // Rule 3: Order Status Not Updating (Stalled in 'New')
    const stalledMs = settings.statusStalledWarningMin * 60 * 1000;
    if (order.orderStatus === 'New' && elapsedMs >= stalledMs) {
      const alertId = `alt-stalled-${order.id}`;
      const existing = existingAlertsMap.get(alertId);
      const stalledMinutes = Math.floor(elapsedMs / (60 * 1000));

      const alert: Alert = {
        id: alertId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableNumber: order.tableNumber,
        type: 'status_stalled',
        title: 'Order status stalled in New',
        message: `Order ${order.orderNumber} has remained in 'New' status for ${stalledMinutes}m without kitchen dispatch.`,
        severity: 'warning',
        isConfirmedFailure: false,
        conditionDescription: 'Pending acceptance from line cook or manager dispatch.',
        createdAt: existing ? existing.createdAt : now,
        status: existing ? existing.status : 'active',
        acknowledgedBy: existing?.acknowledgedBy,
        acknowledgedAt: existing?.acknowledgedAt,
        snoozedUntil: existing?.snoozedUntil,
        snoozedBy: existing?.snoozedBy,
        resolvedBy: existing?.resolvedBy,
        resolvedAt: existing?.resolvedAt,
        resolutionNote: existing?.resolutionNote,
      };

      if (alert.status === 'snoozed' && alert.snoozedUntil && now > alert.snoozedUntil) {
        alert.status = 'active';
      }

      orderAlerts.push(alert);
      generatedAlerts.push(alert);
    }

    // Determine highest order severity
    let maxSeverity: 'nominal' | 'warning' | 'urgent' = 'nominal';
    const activeOrderAlerts = orderAlerts.filter(a => a.status === 'active' || a.status === 'acknowledged');

    if (activeOrderAlerts.some(a => a.severity === 'urgent')) {
      maxSeverity = 'urgent';
    } else if (activeOrderAlerts.some(a => a.severity === 'warning')) {
      maxSeverity = 'warning';
    }

    // Synchronize KOT status if timeout reached and still awaiting
    let currentKotStatus = order.kotStatus;
    if (currentKotStatus === 'Awaiting Confirmation' && elapsedMs >= kotTimeoutMs) {
      currentKotStatus = 'KOT Not Confirmed';
    }

    return {
      ...order,
      kotStatus: currentKotStatus,
      alertSeverity: maxSeverity,
      activeAlertIds: orderAlerts.map(a => a.id),
    };
  });

  // Rule 4: Connection Interruption Alert
  if (connectionStatus === 'demo_interrupted') {
    const connAlertId = 'alt-conn-interrupted';
    const existing = existingAlertsMap.get(connAlertId);
    generatedAlerts.push({
      id: connAlertId,
      orderId: 'system',
      orderNumber: 'SYS-NET',
      type: 'connection_lost',
      title: 'POS Connection Interrupted',
      message: 'Heartbeat with POS terminal gateway lost. Queue synchronization suspended.',
      severity: 'urgent',
      isConfirmedFailure: true, // Confirmed network disconnection event
      conditionDescription: 'Gateway heartbeat unreachable. Offline buffer engaged.',
      createdAt: existing ? existing.createdAt : now,
      status: existing ? existing.status : 'active',
      acknowledgedBy: existing?.acknowledgedBy,
      acknowledgedAt: existing?.acknowledgedAt,
      snoozedUntil: existing?.snoozedUntil,
      snoozedBy: existing?.snoozedBy,
      resolvedBy: existing?.resolvedBy,
      resolvedAt: existing?.resolvedAt,
    });
  }

  // Preserve resolved alerts so history is intact
  const finalAlertsMap = new Map<string, Alert>();
  
  // Add previous alerts that were resolved
  existingAlerts.forEach(a => {
    if (a.status === 'resolved') {
      finalAlertsMap.set(a.id, a);
    }
  });

  // Add all currently active/generated alerts
  generatedAlerts.forEach(a => {
    finalAlertsMap.set(a.id, a);
  });

  return {
    alerts: Array.from(finalAlertsMap.values()).sort((a, b) => b.createdAt - a.createdAt),
    updatedOrders,
  };
}
