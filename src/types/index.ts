/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OrderSource = 'POS' | 'Online';
export type OrderType = 'Dine-in' | 'Takeaway' | 'Delivery';

export type KOTStatus = 
  | 'Awaiting Confirmation'
  | 'Confirmed'
  | 'KOT Not Confirmed';

export type OrderStatus = 
  | 'New'
  | 'In Kitchen'
  | 'Ready'
  | 'Completed'
  | 'Voided';

export type AlertSeverity = 'nominal' | 'warning' | 'urgent';

export type AlertType = 
  | 'kot_timeout'
  | 'order_delay'
  | 'status_stalled'
  | 'connection_lost';

export type AlertState = 'active' | 'acknowledged' | 'snoozed' | 'resolved';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  category: 'Mains' | 'Starters' | 'Beverages' | 'Desserts';
}

export type OrderDataSource = 'ewity_api' | 'ewity_webhook' | 'persisted' | 'simulated_fixture';

export interface Order {
  id: string;
  orderNumber: string;
  source: OrderSource;
  orderType: OrderType;
  tableNumber?: string;
  createdAt: number;
  kotNumber: string;
  kotStatus: KOTStatus;
  kotConfirmedAt?: number;
  kotStation: string;
  orderStatus: OrderStatus;
  statusUpdatedAt: number;
  items: OrderItem[];
  totalAmount: number;
  guestCount?: number;
  serverName: string;
  locationId: string;
  alertSeverity: AlertSeverity;
  activeAlertIds: string[];
  dataSource?: OrderDataSource;
  dataTimestamp?: number;
}

export interface Alert {
  id: string;
  orderId: string;
  orderNumber: string;
  tableNumber?: string;
  type: AlertType;
  title: string;
  message: string;
  severity: 'warning' | 'urgent';
  /**
   * Distinguish clearly between confirmed hardware/network failures
   * and unconfirmed conditions (e.g. timeout without print ack)
   */
  isConfirmedFailure: boolean;
  conditionDescription: string;
  createdAt: number;
  status: AlertState;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  snoozedUntil?: number;
  snoozedBy?: string;
  resolvedBy?: string;
  resolvedAt?: number;
  resolutionNote?: string;
}

export interface MonitoringSettings {
  kotConfirmationTimeoutSec: number; // default: 60
  orderCompletionWarningMin: number; // default: 10
  statusStalledWarningMin: number;   // default: 5
  alertRepeatIntervalMin: number;    // default: 2
  soundEnabled: boolean;             // default: true
  desktopNotificationsEnabled: boolean; // default: false
  monitoringEnabled: boolean;        // default: true
  autoSimulateOrders: boolean;       // default: false
  simulationIntervalSec: number;     // default: 45
}

export type ConnectionStatus =
  | 'LIVE CONNECTED'
  | 'DEMO MODE'
  | 'NOT CONFIGURED'
  | 'NOT CONNECTED'
  | 'AUTHENTICATION FAILED'
  | 'AWAITING MERCHANT APPROVAL'
  | 'PERMISSION ERROR'
  | 'CONNECTION ERROR'
  | 'LIVE DATA STALE'
  | 'Connecting';

export interface StaffMember {
  id: string;
  name: string;
  role: 'Duty Manager' | 'Head Chef' | 'Lead Cashier' | 'Floor Supervisor';
  initials: string;
}

export interface RestaurantLocation {
  id: string;
  name: string;
  code: string;
  address: string;
  activeStations: string[];
}

export interface OrderFilterState {
  searchQuery: string;
  source: 'ALL' | OrderSource;
  orderStatus: 'ALL' | OrderStatus | 'ActiveOnly';
  kotStatus: 'ALL' | KOTStatus;
  severity: 'ALL' | AlertSeverity;
}

export interface WatchdogMetrics {
  activeOrdersCount: number;
  attentionRequiredCount: number;
  kotAwaitingCount: number;
  overdueOrdersCount: number;
  resolvedAlertsCount: number;
  totalOrdersToday: number;
}
