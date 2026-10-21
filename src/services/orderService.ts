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

export const RESTAURANT_LOCATIONS: RestaurantLocation[] = [
  {
    id: 'loc-main',
    name: 'Harbor Wharf Bistro (Store #101)',
    code: 'HWB-01',
    address: 'Pier 24, Embarcadero Suite 100',
    activeStations: ['Kitchen Hot Line #1', 'Pantry & Salad #2', 'Beverage Bar #1'],
  },
  {
    id: 'loc-downtown',
    name: 'Ewity Downtown Flagship (Store #102)',
    code: 'EDF-02',
    address: '450 Market Street, Level 1',
    activeStations: ['Expo Hot Line #1', 'Pizza Oven Station', 'Bar Express'],
  },
  {
    id: 'loc-uptown',
    name: 'The Garden Terrace (Store #103)',
    code: 'TGT-03',
    address: '88 Botanic Lane',
    activeStations: ['Main Kitchen Station', 'Cocktail Lounge Bar'],
  },
];

export const STAFF_MEMBERS: StaffMember[] = [
  { id: 'staff-1', name: 'Sarah Miller', role: 'Duty Manager', initials: 'SM' },
  { id: 'staff-2', name: 'David Kim', role: 'Head Chef', initials: 'DK' },
  { id: 'staff-3', name: 'Elena Ramos', role: 'Lead Cashier', initials: 'ER' },
  { id: 'staff-4', name: 'Marcus Vance', role: 'Floor Supervisor', initials: 'MV' },
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
