/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Search,
  Filter,
  Eye,
  CheckCheck,
  ArrowRight,
  AlertCircle,
  Clock,
  Printer,
  ChevronDown,
} from 'lucide-react';
import { Order, OrderFilterState, OrderStatus, KOTStatus } from '../types';
import { formatElapsedTime, formatClockTime } from '../utils/time';

interface OrderTableProps {
  orders: Order[];
  filterState: OrderFilterState;
  onFilterChange: (newFilter: OrderFilterState) => void;
  onSelectOrder: (order: Order) => void;
  onQuickConfirmKOT: (orderId: string) => void;
  onAdvanceOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  currentTime: number;
}

export const OrderTable: React.FC<OrderTableProps> = ({
  orders,
  filterState,
  onFilterChange,
  onSelectOrder,
  onQuickConfirmKOT,
  onAdvanceOrderStatus,
  currentTime,
}) => {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Filter application
  const filteredOrders = orders.filter((order) => {
    // Search query
    if (filterState.searchQuery.trim()) {
      const q = filterState.searchQuery.toLowerCase();
      const matchNum = order.orderNumber.toLowerCase().includes(q);
      const matchTable = order.tableNumber?.toLowerCase().includes(q);
      const matchKot = order.kotNumber.toLowerCase().includes(q);
      const matchItem = order.items.some((i) => i.name.toLowerCase().includes(q));
      if (!matchNum && !matchTable && !matchKot && !matchItem) return false;
    }

    // Source filter
    if (filterState.source !== 'ALL' && order.source !== filterState.source) {
      return false;
    }

    // Order status filter
    if (filterState.orderStatus === 'ActiveOnly') {
      if (order.orderStatus === 'Completed' || order.orderStatus === 'Voided') {
        return false;
      }
    } else if (filterState.orderStatus !== 'ALL') {
      if (order.orderStatus !== filterState.orderStatus) return false;
    }

    // KOT status filter
    if (filterState.kotStatus !== 'ALL' && order.kotStatus !== filterState.kotStatus) {
      return false;
    }

    // Severity filter
    if (filterState.severity !== 'ALL' && order.alertSeverity !== filterState.severity) {
      return false;
    }

    return true;
  });

  const getNextStatus = (current: OrderStatus): OrderStatus | null => {
    switch (current) {
      case 'New':
        return 'In Kitchen';
      case 'In Kitchen':
        return 'Ready';
      case 'Ready':
        return 'Completed';
      default:
        return null;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      {/* Table Toolbar: Search and Filter Tabs */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterState.searchQuery}
              onChange={(e) =>
                onFilterChange({ ...filterState, searchQuery: e.target.value })
              }
              placeholder="Search by order #, table, KOT or item..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* Quick source tabs */}
          <div className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs">
            {(['ALL', 'POS', 'Online'] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => onFilterChange({ ...filterState, source: src })}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterState.source === src
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {src === 'ALL' ? 'All Sources' : src}
              </button>
            ))}
          </div>
        </div>

        {/* Severity & Status filters */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Status:</span>
          </div>
          <select
            value={filterState.orderStatus}
            onChange={(e) =>
              onFilterChange({
                ...filterState,
                orderStatus: e.target.value as any,
              })
            }
            className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-slate-700 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
          >
            <option value="ActiveOnly">Active Orders Only</option>
            <option value="ALL">All Order States</option>
            <option value="New">New</option>
            <option value="In Kitchen">In Kitchen</option>
            <option value="Ready">Ready</option>
            <option value="Completed">Completed</option>
            <option value="Voided">Voided</option>
          </select>

          <select
            value={filterState.severity}
            onChange={(e) =>
              onFilterChange({
                ...filterState,
                severity: e.target.value as any,
              })
            }
            className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-slate-700 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="urgent">Urgent Alerts Only</option>
            <option value="warning">Warnings Only</option>
            <option value="nominal">Nominal Only</option>
          </select>

          {(filterState.searchQuery ||
            filterState.source !== 'ALL' ||
            filterState.orderStatus !== 'ActiveOnly' ||
            filterState.severity !== 'ALL') && (
            <button
              onClick={() =>
                onFilterChange({
                  searchQuery: '',
                  source: 'ALL',
                  orderStatus: 'ActiveOnly',
                  kotStatus: 'ALL',
                  severity: 'ALL',
                })
              }
              className="text-xs text-slate-500 hover:text-slate-800 underline px-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main High-Density Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold tracking-wider uppercase text-[11px]">
              <th className="py-2.5 px-3.5">Order #</th>
              <th className="py-2.5 px-3">Source</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Table</th>
              <th className="py-2.5 px-3">Created</th>
              <th className="py-2.5 px-3">Elapsed</th>
              <th className="py-2.5 px-3">KOT #</th>
              <th className="py-2.5 px-3">KOT Status</th>
              <th className="py-2.5 px-3">Order Status</th>
              <th className="py-2.5 px-3">Severity</th>
              <th className="py-2.5 px-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-14 text-center text-slate-500">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">
                    {orders.length === 0
                      ? 'No active kitchen orders'
                      : 'No orders match current filter criteria'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    {orders.length === 0
                      ? 'Real orders will appear automatically when placed in Ewity POS or received via webhook.'
                      : 'Try adjusting your search query, source selection, or status filters.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const elapsedMs = currentTime - order.createdAt;
                const nextStatus = getNextStatus(order.orderStatus);

                // Row background styling for alert emphasis
                let rowBgClass = 'hover:bg-slate-50/80 transition-colors';
                if (order.alertSeverity === 'urgent') {
                  rowBgClass = 'bg-red-50/30 hover:bg-red-50/60 transition-colors';
                } else if (order.alertSeverity === 'warning') {
                  rowBgClass = 'bg-amber-50/30 hover:bg-amber-50/60 transition-colors';
                }

                return (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedRowId(order.id)}
                    className={`${rowBgClass} ${
                      selectedRowId === order.id ? 'ring-1 ring-inset ring-slate-300' : ''
                    }`}
                  >
                    {/* Order Number */}
                    <td className="py-3 px-3.5 font-bold font-mono text-slate-900 tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <span>{order.orderNumber}</span>
                        {order.activeAlertIds.length > 0 && (
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              order.alertSeverity === 'urgent'
                                ? 'bg-red-600'
                                : 'bg-amber-500'
                            }`}
                            title={`${order.activeAlertIds.length} active alert(s)`}
                          />
                        )}
                      </div>
                    </td>

                    {/* Source & Provenance */}
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5 items-start">
                        <span className="font-medium text-slate-800">
                          {order.source}
                        </span>
                        {order.dataSource === 'ewity_api' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Ewity API
                          </span>
                        )}
                        {order.dataSource === 'ewity_webhook' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                            Webhook
                          </span>
                        )}
                        {order.dataSource === 'persisted' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Persisted
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Order Type */}
                    <td className="py-3 px-3 text-slate-600">
                      <span>{order.orderType}</span>
                    </td>

                    {/* Table Number */}
                    <td className="py-3 px-3 font-mono font-medium text-slate-900 tabular-nums">
                      {order.tableNumber ? (
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800">
                          {order.tableNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Order creation time */}
                    <td className="py-3 px-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                      {formatClockTime(order.createdAt)}
                    </td>

                    {/* Elapsed Time (Ticking) */}
                    <td className="py-3 px-3 font-mono font-bold tabular-nums whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          order.alertSeverity === 'urgent'
                            ? 'text-red-700'
                            : order.alertSeverity === 'warning'
                            ? 'text-amber-700'
                            : 'text-slate-800'
                        }`}
                      >
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatElapsedTime(elapsedMs)}
                      </span>
                    </td>

                    {/* KOT Number */}
                    <td className="py-3 px-3 font-mono text-slate-600 tabular-nums">
                      {order.kotNumber}
                    </td>

                    {/* KOT Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {order.kotStatus === 'Confirmed' ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Confirmed</span>
                        </div>
                      ) : order.kotStatus === 'KOT Not Confirmed' ? (
                        <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <span>KOT not confirmed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Printer className="w-3.5 h-3.5 text-slate-400" />
                          <span>Awaiting Conf.</span>
                        </div>
                      )}
                    </td>

                    {/* Order Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          order.orderStatus === 'Ready'
                            ? 'text-emerald-700 font-semibold'
                            : order.orderStatus === 'In Kitchen'
                            ? 'text-blue-700'
                            : order.orderStatus === 'Completed'
                            ? 'text-slate-500'
                            : 'text-slate-800'
                        }`}
                      >
                        {order.orderStatus}
                      </span>
                    </td>

                    {/* Severity */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {order.alertSeverity === 'urgent' ? (
                        <span className="font-bold text-red-700 uppercase tracking-wide text-[11px] flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-600" />
                          Urgent
                        </span>
                      ) : order.alertSeverity === 'warning' ? (
                        <span className="font-semibold text-amber-700 uppercase tracking-wide text-[11px] flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Warning
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium text-[11px]">
                          Nominal
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Quick Confirm KOT button if not confirmed */}
                        {order.kotStatus !== 'Confirmed' &&
                          order.orderStatus !== 'Completed' &&
                          order.orderStatus !== 'Voided' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickConfirmKOT(order.id);
                              }}
                              className="px-2 py-1 text-[11px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded border border-amber-300 transition-colors cursor-pointer"
                              title="Confirm KOT ticket receipt (Manual Operator Override)"
                            >
                              Confirm KOT
                            </button>
                          )}

                        {/* Advance Order status */}
                        {nextStatus && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAdvanceOrderStatus(order.id, nextStatus);
                            }}
                            className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-300 transition-colors flex items-center gap-1"
                            title={`Advance to ${nextStatus}`}
                          >
                            <span>{nextStatus}</span>
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                          </button>
                        )}

                        {/* View Details */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectOrder(order);
                          }}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                          title="Open order details inspector"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer with Summary Count */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <div>
          Showing <span className="font-bold text-slate-700">{filteredOrders.length}</span> of{' '}
          <span className="font-bold text-slate-700">{orders.length}</span> total orders
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            <span>Urgent</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Warning</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Nominal</span>
          </span>
        </div>
      </div>
    </div>
  );
};
