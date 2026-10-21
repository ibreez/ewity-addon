/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, OrderSource, OrderType, OrderStatus, KOTStatus, OrderItem, OrderDataSource } from '../types';
import { EwityBillSummary, EwityBillDetail } from '../types/ewity';

/**
 * Explicit mapping layer between official Ewity Apps API responses and the internal Order model.
 *
 * Strict Rules:
 * 1. Do not assume that bill creation means kitchen preparation has started.
 * 2. Do not assume that payment means the order is complete.
 * 3. Do not assume that the existence of a KOT number proves that it printed successfully.
 */
export function mapEwityBillToOrder(
  bill: EwityBillSummary,
  detail?: EwityBillDetail,
  existingOrder?: Order,
  sourceType: OrderDataSource = 'ewity_api'
): Order {
  // 1. Distinguish source: POS vs Online
  // Online orders have sub_type === 'online' or delivery_status !== null or register_name indicating web/gateway
  const isOnline = 
    bill.sub_type === 'online' ||
    bill.delivery_status !== null ||
    (bill.register_name && bill.register_name.toLowerCase().includes('online'));

  const source: OrderSource = isOnline ? 'Online' : 'POS';

  // 2. Order Type: Delivery, Dine-in, or Takeaway
  let orderType: OrderType = 'Takeaway';
  if (bill.delivery_status !== null) {
    orderType = 'Delivery';
  } else if (bill.restaurant_table && bill.restaurant_table.trim() !== '') {
    orderType = 'Dine-in';
  }

  // 3. Parse creation time (Ewity format: "YYYY-MM-DD HH:mm:ss" or ISO)
  let createdAt = Date.now();
  if (bill.created && bill.created.at) {
    const parsed = new Date(bill.created.at.replace(' ', 'T')).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      createdAt = parsed;
    }
  }

  // 4. Order Lifecycle Status Mapping
  // RULE: Bill creation != kitchen prep started. Payment != order completed!
  let orderStatus: OrderStatus = 'New';

  if (bill.type === 'void' || bill.status === 'voided') {
    orderStatus = 'Voided';
  } else if (bill.type === 'refund' || bill.status === 'refunded') {
    // Refunds void or cancel kitchen obligation
    orderStatus = 'Voided';
  } else if (existingOrder && existingOrder.orderStatus !== 'New') {
    // Preserve local kitchen advancement unless bill was voided or refunded
    orderStatus = existingOrder.orderStatus;
  } else if (bill.delivery_status === 'delivered') {
    orderStatus = 'Completed';
  } else if (bill.delivery_status === 'out-for-delivery') {
    orderStatus = 'Ready';
  } else if (bill.type === 'sale') {
    // A fresh sale bill on the register begins in 'New' queue
    orderStatus = existingOrder?.orderStatus || 'New';
  }

  // 5. KOT Number & KOT Print Confirmation Status
  // STRICT RULE: Never infer physical KOT printing from a KOT number alone!
  // Never fabricate fallback KOT numbers like KOT-<bill_number>.
  // Missing print evidence is represented as 'Awaiting Confirmation' or 'KOT Not Confirmed'.
  const kotNumber = bill.kot_number ? bill.kot_number.trim() : '';

  let kotStatus: KOTStatus = 'KOT Not Confirmed';
  let kotConfirmedAt: number | undefined = undefined;

  if (kotNumber) {
    kotStatus = 'Awaiting Confirmation';
  }

  // Only mark 'Confirmed' when supported by reliable source evidence
  // (e.g. verified kitchen operator acknowledgement preserved in existingOrder)
  if (existingOrder && existingOrder.kotStatus === 'Confirmed') {
    kotStatus = 'Confirmed';
    kotConfirmedAt = existingOrder.kotConfirmedAt;
  }

  // 6. Map Line Items
  let items: OrderItem[] = [];
  if (detail && Array.isArray(detail.bill_lines) && detail.bill_lines.length > 0) {
    items = detail.bill_lines.map((line, idx) => ({
      id: `line-${line.id || idx}`,
      name: line.name || line.variant_name || 'Item',
      quantity: line.quantity || 1,
      price: line.unit_price || 0,
      notes: line.note || undefined,
      category: 'Mains',
    }));
  } else if (existingOrder && existingOrder.items.length > 0) {
    items = existingOrder.items;
  } else {
    // Minimal fallback item based on bill summary
    items = [
      {
        id: `bill-item-${bill.id}`,
        name: `Bill ${bill.number} Items (${bill.type})`,
        quantity: 1,
        price: bill.total || bill.total_sales_price || 0,
        category: 'Mains',
      },
    ];
  }

  return {
    id: `ewity-${bill.id}`,
    orderNumber: bill.number || `EW-${bill.id}`,
    source,
    orderType,
    tableNumber: bill.restaurant_table || undefined,
    createdAt,
    kotNumber,
    kotStatus,
    kotConfirmedAt,
    kotStation: bill.location?.name ? `${bill.location.name} Station` : 'Main Kitchen Printer',
    orderStatus,
    statusUpdatedAt: Date.now(),
    items,
    totalAmount: bill.total || 0,
    guestCount: orderType === 'Dine-in' ? 2 : 1,
    serverName: bill.created?.by || bill.register_name || 'POS Staff',
    locationId: String(bill.location?.id || 'all'),
    alertSeverity: existingOrder ? existingOrder.alertSeverity : 'nominal',
    activeAlertIds: existingOrder ? existingOrder.activeAlertIds : [],
    dataSource: sourceType,
    dataTimestamp: Date.now(),
  };
}
