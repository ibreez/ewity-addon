/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, MonitoringSettings } from '../types';
import { playAlertSound } from '../utils/audio';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  severity: 'urgent' | 'warning' | 'info';
  timestamp: number;
}

export class AlertManager {
  private static notifiedAlertIds = new Set<string>();

  public static handleNewAlerts(
    alerts: Alert[],
    settings: MonitoringSettings,
    onToast: (toast: ToastMessage) => void
  ): void {
    if (!settings.monitoringEnabled) return;

    const unacknowledgedActiveAlerts = alerts.filter(
      a => a.status === 'active' && !this.notifiedAlertIds.has(a.id)
    );

    if (unacknowledgedActiveAlerts.length > 0) {
      // Find highest severity
      const hasUrgent = unacknowledgedActiveAlerts.some(a => a.severity === 'urgent');

      if (settings.soundEnabled) {
        playAlertSound(hasUrgent ? 'urgent' : 'warning');
      }

      unacknowledgedActiveAlerts.forEach(alert => {
        this.notifiedAlertIds.add(alert.id);

        // Toast feedback
        onToast({
          id: `toast-${alert.id}-${Date.now()}`,
          title: alert.title,
          message: `${alert.orderNumber}: ${alert.message}`,
          severity: alert.severity,
          timestamp: Date.now(),
        });

        // Native browser desktop notification if enabled
        if (settings.desktopNotificationsEnabled && typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            try {
              new Notification(`Ewity Kitchen Watchdog: ${alert.title}`, {
                body: `${alert.orderNumber} - ${alert.message}`,
                icon: '/favicon.ico',
              });
            } catch {
              // Notification failed or blocked in iframe
            }
          }
        }
      });
    }
  }

  public static acknowledgeAlert(
    alerts: Alert[],
    alertId: string,
    staffName: string,
    now: number = Date.now()
  ): Alert[] {
    playAlertSound('ack');
    return alerts.map(alert => {
      if (alert.id === alertId) {
        return {
          ...alert,
          status: 'acknowledged',
          acknowledgedBy: staffName,
          acknowledgedAt: now,
        };
      }
      return alert;
    });
  }

  public static snoozeAlert(
    alerts: Alert[],
    alertId: string,
    staffName: string,
    durationMinutes: number = 2,
    now: number = Date.now()
  ): Alert[] {
    playAlertSound('ack');
    const snoozedUntil = now + durationMinutes * 60 * 1000;
    return alerts.map(alert => {
      if (alert.id === alertId) {
        return {
          ...alert,
          status: 'snoozed',
          snoozedBy: staffName,
          snoozedUntil,
        };
      }
      return alert;
    });
  }

  public static resolveAlert(
    alerts: Alert[],
    alertId: string,
    staffName: string,
    resolutionNote?: string,
    now: number = Date.now()
  ): Alert[] {
    playAlertSound('ready');
    return alerts.map(alert => {
      if (alert.id === alertId) {
        return {
          ...alert,
          status: 'resolved',
          resolvedBy: staffName,
          resolvedAt: now,
          resolutionNote: resolutionNote || 'Resolved by staff inspection',
        };
      }
      return alert;
    });
  }

  public static resetNotificationCache(): void {
    this.notifiedAlertIds.clear();
  }
}
