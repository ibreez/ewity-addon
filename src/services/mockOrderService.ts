/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Order,
  RestaurantLocation,
  StaffMember,
  MonitoringSettings,
  OrderItem
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
  autoSimulateOrders: false,
  simulationIntervalSec: 45,
};

const STORAGE_LIVE_ORDERS_KEY = 'ewity_watchdog_live_orders_v1';
const STORAGE_DEMO_ORDERS_KEY = 'ewity_watchdog_demo_orders_v1';
const STORAGE_SETTINGS_KEY = 'ewity_watchdog_settings_v1';

export function getInitialMockOrders(baseTime: number = Date.now()): Order[] {
  return [
    {
      id: 'ord-4101',
      orderNumber: 'EW-4101',
      source: 'POS',
      orderType: 'Dine-in',
      tableNumber: 'T-04',
      createdAt: baseTime - (1 * 60 + 25) * 1000, // 85s ago -> >60s KOT timeout threshold!
      kotNumber: 'KOT-8910',
      kotStatus: 'KOT Not Confirmed',
      kotStation: 'Kitchen Hot Line #1',
      orderStatus: 'In Kitchen',
      statusUpdatedAt: baseTime - (1 * 60 + 20) * 1000,
      items: [
        { id: 'i-1', name: 'Prime Angus Ribeye 300g (Medium-Rare)', quantity: 1, price: 42.00, notes: 'Bearnaise on side', category: 'Mains' },
        { id: 'i-2', name: 'Parmesan Truffle Shoestring Fries', quantity: 1, price: 12.00, category: 'Starters' },
        { id: 'i-3', name: 'San Pellegrino Sparkling 750ml', quantity: 1, price: 7.50, category: 'Beverages' },
      ],
      totalAmount: 61.50,
      guestCount: 2,
      serverName: 'Elena Ramos',
      locationId: 'loc-main',
      alertSeverity: 'warning',
      activeAlertIds: [],
      dataSource: 'simulated_fixture',
      dataTimestamp: baseTime,
    },
    {
      id: 'ord-4098',
      orderNumber: 'EW-4098',
      source: 'POS',
      orderType: 'Dine-in',
      tableNumber: 'T-12',
      createdAt: baseTime - (14 * 60 + 10) * 1000, // 14m 10s ago -> >10m completion threshold!
      kotNumber: 'KOT-8907',
      kotStatus: 'Confirmed',
      kotConfirmedAt: baseTime - (14 * 60) * 1000,
      kotStation: 'Kitchen Hot Line #1',
      orderStatus: 'In Kitchen',
      statusUpdatedAt: baseTime - (14 * 60) * 1000,
      items: [
        { id: 'i-4', name: 'Pan-Seared Scottish Salmon', quantity: 1, price: 34.00, notes: 'Extra lemon', category: 'Mains' },
        { id: 'i-5', name: 'Wild Morel Mushroom Risotto', quantity: 1, price: 28.00, category: 'Mains' },
        { id: 'i-6', name: 'Oregon Pinot Noir (Glass)', quantity: 2, price: 32.00, category: 'Beverages' },
      ],
      totalAmount: 94.00,
      guestCount: 2,
      serverName: 'Marcus Vance',
      locationId: 'loc-main',
      alertSeverity: 'urgent',
      activeAlertIds: [],
      dataSource: 'simulated_fixture',
      dataTimestamp: baseTime,
    },
    {
      id: 'ord-4095',
      orderNumber: 'EW-4095',
      source: 'Online',
      orderType: 'Delivery',
      tableNumber: undefined,
      createdAt: baseTime - (6 * 60 + 40) * 1000, // 6m 40s ago -> >5m stalled in 'New' without kitchen movement!
      kotNumber: 'KOT-8903',
      kotStatus: 'Confirmed',
      kotConfirmedAt: baseTime - (6 * 60 + 15) * 1000,
      kotStation: 'Expo Hot Line #1',
      orderStatus: 'New',
      statusUpdatedAt: baseTime - (6 * 60 + 40) * 1000,
      items: [
        { id: 'i-7', name: 'Double Smash Cheddar Burger', quantity: 2, price: 36.00, notes: 'No raw onions', category: 'Mains' },
        { id: 'i-8', name: 'Garlic Aioli Crinkle Cut Fries', quantity: 2, price: 16.00, category: 'Starters' },
        { id: 'i-9', name: 'House Salted Caramel Shake', quantity: 2, price: 17.00, category: 'Beverages' },
      ],
      totalAmount: 69.00,
      guestCount: 1,
      serverName: 'Online POS Gateway',
      locationId: 'loc-main',
      alertSeverity: 'warning',
      activeAlertIds: [],
      dataSource: 'simulated_fixture',
      dataTimestamp: baseTime,
    },
    {
      id: 'ord-4105',
      orderNumber: 'EW-4105',
      source: 'POS',
      orderType: 'Takeaway',
      tableNumber: undefined,
      createdAt: baseTime - 32 * 1000, // 32s ago -> Awaiting confirmation, still within 60s limit
      kotNumber: 'KOT-8914',
      kotStatus: 'Awaiting Confirmation',
      kotStation: 'Pantry & Salad #2',
      orderStatus: 'New',
      statusUpdatedAt: baseTime - 32 * 1000,
      items: [
        { id: 'i-10', name: 'Grilled Herb Chicken Caesar Salad', quantity: 1, price: 19.50, notes: 'Dressing separate', category: 'Starters' },
        { id: 'i-11', name: 'Ceremonial Grade Iced Matcha Latte', quantity: 1, price: 6.50, notes: 'Oat milk', category: 'Beverages' },
      ],
      totalAmount: 26.00,
      guestCount: 1,
      serverName: 'Sarah Miller',
      locationId: 'loc-main',
      alertSeverity: 'nominal',
      activeAlertIds: [],
      dataSource: 'simulated_fixture',
      dataTimestamp: baseTime,
    },
    {
      id: 'ord-4092',
      orderNumber: 'EW-4092',
      source: 'POS',
      orderType: 'Dine-in',
      tableNumber: 'T-08',
      createdAt: baseTime - (22 * 60) * 1000,
      kotNumber: 'KOT-8900',
      kotStatus: 'Confirmed',
      kotConfirmedAt: baseTime - (21 * 60 + 50) * 1000,
      kotStation: 'Kitchen Hot Line #1',
      orderStatus: 'Ready',
      statusUpdatedAt: baseTime - (2 * 60) * 1000,
      items: [
        { id: 'i-12', name: 'Wood-Fired Margherita Pizza DOC', quantity: 1, price: 22.00, category: 'Mains' },
        { id: 'i-13', name: 'Classic Aperol Spritz', quantity: 1, price: 14.00, category: 'Beverages' },
      ],
      totalAmount: 36.00,
      guestCount: 1,
      serverName: 'Elena Ramos',
      locationId: 'loc-main',
      alertSeverity: 'nominal',
      activeAlertIds: [],
      dataSource: 'simulated_fixture',
      dataTimestamp: baseTime,
    },
    {
      id: 'ord-4087',
      orderNumber: 'EW-4087',
      source: 'POS',
      orderType: 'Dine-in',
      tableNumber: 'T-02',
      createdAt: baseTime - (36 * 60) * 1000,
      kotNumber: 'KOT-8895',
      kotStatus: 'Confirmed',
      kotConfirmedAt: baseTime - (35 * 60 + 50) * 1000,
      kotStation: 'Kitchen Hot Line #1',
      orderStatus: 'Completed',
      statusUpdatedAt: baseTime - (5 * 60) * 1000,
      items: [
        { id: 'i-14', name: 'Steak Frites 250g', quantity: 1, price: 38.00, category: 'Mains' },
        { id: 'i-15', name: 'Creme Brulee Madagascar Vanilla', quantity: 1, price: 11.00, category: 'Desserts' },
      ],
      totalAmount: 49.00,
      guestCount: 1,
      serverName: 'David Kim',
      locationId: 'loc-main',
      alertSeverity: 'nominal',
      activeAlertIds: [],
      dataSource: 'simulated_fixture',
      dataTimestamp: baseTime,
    },
  ];
}

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
      // Exclude any accidental simulated orders from live storage
      return parsed.filter((o) => o && o.dataSource !== 'simulated_fixture');
    }
  } catch {
    // ignore parse error
  }
  return [];
}

export function saveLiveOrders(orders: Order[]): void {
  try {
    // Only persist genuine live/webhook/persisted orders
    const genuine = orders.filter((o) => o.dataSource !== 'simulated_fixture');
    localStorage.setItem(STORAGE_LIVE_ORDERS_KEY, JSON.stringify(genuine));
  } catch {
    // localStorage full or restricted
  }
}

/**
 * Loads orders for explicitly activated Demo Mode only.
 */
export function loadDemoOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_DEMO_ORDERS_KEY);
    if (!raw) return getInitialMockOrders();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore parse error
  }
  return getInitialMockOrders();
}

export function saveDemoOrders(orders: Order[]): void {
  try {
    localStorage.setItem(STORAGE_DEMO_ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // localStorage full or restricted
  }
}

// Default export wrapper for backward compatibility - returns genuine live orders ONLY
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

// Order scenario generator
let nextOrderSequence = 4108;
let nextKOTSequence = 8918;

const SAMPLE_MENU_ITEMS: OrderItem[] = [
  { id: 'm-1', name: 'Truffle Wagyu Burger & Rosemary Fries', quantity: 1, price: 29.50, category: 'Mains' },
  { id: 'm-2', name: 'Crispy Calamari with Lemon Aioli', quantity: 1, price: 16.00, category: 'Starters' },
  { id: 'm-3', name: 'Handmade Pappardelle Wild Boar Ragù', quantity: 1, price: 27.00, category: 'Mains' },
  { id: 'm-4', name: 'Wood-Fired Diavola Pizza', quantity: 1, price: 23.50, category: 'Mains' },
  { id: 'm-5', name: 'Heirloom Tomato & Burrata Salad', quantity: 1, price: 18.00, category: 'Starters' },
  { id: 'm-6', name: 'Espresso Tiramisu Classico', quantity: 1, price: 12.00, category: 'Desserts' },
  { id: 'm-7', name: 'Cold Brew Citrus Nitro Float', quantity: 1, price: 7.00, category: 'Beverages' },
  { id: 'm-8', name: 'House Berry Kombucha', quantity: 1, price: 6.50, category: 'Beverages' },
];

export type OrderSimulationPreset = 
  | 'normal_dinein'
  | 'kot_timeout_test'
  | 'overdue_kitchen_test'
  | 'online_delivery'
  | 'rush_takeaway';

export function generateSimulatedOrder(
  preset: OrderSimulationPreset = 'normal_dinein',
  locationId: string = 'loc-main',
  serverName: string = 'Sarah Miller'
): Order {
  nextOrderSequence += 1;
  nextKOTSequence += 1;
  const now = Date.now();
  const orderNum = `EW-${nextOrderSequence}`;
  const kotNum = `KOT-${nextKOTSequence}`;

  let source: 'POS' | 'Online' = 'POS';
  let orderType: 'Dine-in' | 'Takeaway' | 'Delivery' = 'Dine-in';
  let tableNumber: string | undefined = `T-${Math.floor(Math.random() * 18) + 1}`.padStart(4, '0').replace('T-00', 'T-0');
  let kotStatus: 'Awaiting Confirmation' | 'Confirmed' | 'KOT Not Confirmed' = 'Awaiting Confirmation';
  let orderStatus: 'New' | 'In Kitchen' | 'Ready' | 'Completed' | 'Voided' = 'New';
  let createdAt = now;
  let kotConfirmedAt: number | undefined = undefined;

  const selectedItems = [
    SAMPLE_MENU_ITEMS[Math.floor(Math.random() * 4)],
    SAMPLE_MENU_ITEMS[4 + Math.floor(Math.random() * 4)],
  ];
  const totalAmount = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (preset === 'normal_dinein') {
    source = 'POS';
    orderType = 'Dine-in';
    orderStatus = 'New';
    kotStatus = 'Awaiting Confirmation';
    createdAt = now;
  } else if (preset === 'kot_timeout_test') {
    // Generate order already past timeout (e.g. 75s ago)
    source = 'POS';
    orderType = 'Dine-in';
    tableNumber = 'T-09';
    createdAt = now - 75 * 1000;
    orderStatus = 'New';
    kotStatus = 'KOT Not Confirmed';
  } else if (preset === 'overdue_kitchen_test') {
    // Generate order 16 minutes in kitchen
    source = 'POS';
    orderType = 'Dine-in';
    tableNumber = 'T-15';
    createdAt = now - 16 * 60 * 1000;
    kotStatus = 'Confirmed';
    kotConfirmedAt = now - 15 * 60 * 1000;
    orderStatus = 'In Kitchen';
  } else if (preset === 'online_delivery') {
    source = 'Online';
    orderType = 'Delivery';
    tableNumber = undefined;
    serverName = 'Online Aggregator Gateway';
    orderStatus = 'New';
    kotStatus = 'Awaiting Confirmation';
    createdAt = now;
  } else if (preset === 'rush_takeaway') {
    source = 'POS';
    orderType = 'Takeaway';
    tableNumber = undefined;
    orderStatus = 'In Kitchen';
    kotStatus = 'Confirmed';
    kotConfirmedAt = now - 10 * 1000;
    createdAt = now - 45 * 1000;
  }

  return {
    id: `ord-${nextOrderSequence}`,
    orderNumber: orderNum,
    source,
    orderType,
    tableNumber,
    createdAt,
    kotNumber: kotNum,
    kotStatus,
    kotConfirmedAt,
    kotStation: 'Kitchen Hot Line #1',
    orderStatus,
    statusUpdatedAt: createdAt,
    items: selectedItems,
    totalAmount,
    guestCount: orderType === 'Dine-in' ? 2 : 1,
    serverName,
    locationId,
    alertSeverity: 'nominal',
    activeAlertIds: [],
    dataSource: 'simulated_fixture',
    dataTimestamp: now,
  };
}
