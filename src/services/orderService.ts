/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Order,
  RestaurantLocation,
  StaffMember,
  MonitoringSettings,
} from '../types';

// Production location list starts empty and is populated strictly from verified Ewity API
export const RESTAURANT_LOCATIONS: RestaurantLocation[] = [];

// Operational station roles for alert audit trail (customizable by station operators)
export const DEFAULT_STAFF_ROLES: StaffMember[] = [
  { id: 'role-expo', name: 'Kitchen Operator', role: 'Floor Supervisor', initials: 'KO' },
  { id: 'role-chef', name: 'Head Chef', role: 'Head Chef', initials: 'HC' },
  { id: 'role-manager', name: 'Duty Manager', role: 'Duty Manager', initials: 'DM' },
  { id: 'role-cashier', name: 'Front Cashier', role: 'Lead Cashier', initials: 'FC' },
];


export const DEFAULT_MONITORING_SETTINGS: MonitoringSettings = {
  kotConfirmationTimeoutSec: 60,
  orderCompletionWarningMin: 10,
  statusStalledWarningMin: 5,
  alertRepeatIntervalMin: 2,
  soundEnabled: true,
  desktopNotificationsEnabled: false,
  monitoringEnabled: true,
};

const STORAGE_LIVE_ORDERS_KEY = 'ewity_watchdog_live_orders_v1';
const STORAGE_SETTINGS_KEY = 'ewity_watchdog_settings_v1';

/**
 * Loads saved live orders from localStorage.
 * STRICT RULE: Never returns mock orders if no live orders exist!
 * Returns empty array so the live dashboard displays authentic state.
 */
export function loadSavedLiveOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_LIVE_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((o) => o && o.dataSource !== ('simulated_fixture' as any));
    }
  } catch {
    // ignore parse error
  }
  return [];
}

export function saveLiveOrders(orders: Order[]): void {
  try {
    const genuine = orders.filter((o) => o.dataSource !== ('simulated_fixture' as any));
    localStorage.setItem(STORAGE_LIVE_ORDERS_KEY, JSON.stringify(genuine));
  } catch {
    // localStorage full or restricted
  }
}

export function loadSavedOrders(): Order[] {
  return loadSavedLiveOrders();
}

export function saveOrders(orders: Order[]): void {
  saveLiveOrders(orders);
}

export function loadSavedSettings(): MonitoringSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_MONITORING_SETTINGS;
    return { ...DEFAULT_MONITORING_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MONITORING_SETTINGS;
  }
}

export function saveSettings(settings: MonitoringSettings): void {
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or restricted
  }
}
