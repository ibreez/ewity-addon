/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  Clock,
  Printer,
  CheckCircle2,
  AlertTriangle,
  User,
  Store,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCheck,
} from 'lucide-react';
import { Order, Alert, OrderStatus, StaffMember } from '../types';
import { formatElapsedTime, formatClockTime, formatRelativeTime } from '../utils/time';

interface OrderDetailsModalProps {
  order: Order | null;
  alerts: Alert[];
  currentStaff: StaffMember;
  onClose: () => void;
  onConfirmKOT: (orderId: string) => void;
  onAdvanceStatus: (orderId: string, nextStatus: OrderStatus) => void;
  onResolveAlert: (alertId: string) => void;
  currentTime: number;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  order,
  alerts,
  currentStaff,
  onClose,
  onConfirmKOT,
  onAdvanceStatus,
  onResolveAlert,
  currentTime,
}) => {
  if (!order) return null;

  const elapsedMs = currentTime - order.createdAt;
  const orderAlerts = alerts.filter((a) => a.orderId === order.id);

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

  const nextStatus = getNextStatus(order.orderStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-mono font-bold text-sm">
              POS
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                  {order.orderNumber}
                </h3>
                {order.tableNumber && (
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-800 text-xs font-semibold rounded font-mono">
                    Table {order.tableNumber}
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                  {order.source} · {order.orderType}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Internal Order ID: <span className="font-mono">{order.id}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Top Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-medium">
                Order Placed
              </span>
              <span className="font-mono font-semibold text-slate-900">
                {formatClockTime(order.createdAt)}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-medium">
                Elapsed Time
              </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {formatElapsedTime(elapsedMs)}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-medium">
                Order Status
              </span>
              <span
                className={`font-semibold ${
                  order.orderStatus === 'Ready'
                    ? 'text-emerald-700'
                    : order.orderStatus === 'In Kitchen'
                    ? 'text-blue-700'
                    : 'text-slate-900'
                }`}
              >
                {order.orderStatus}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-medium">
                Watchdog State
              </span>
              <span
                className={`font-semibold capitalize ${
                  order.alertSeverity === 'urgent'
                    ? 'text-red-700'
                    : order.alertSeverity === 'warning'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {order.alertSeverity}
              </span>
            </div>
          </div>

          {/* KOT Printer Station Inspection Card */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-slate-600" />
                <h4 className="font-semibold text-slate-900">
                  Kitchen Order Ticket (KOT) Verification
                </h4>
              </div>
              <span className="font-mono text-xs text-slate-600">
                {order.kotNumber}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 text-[11px] block">Target Station</span>
                <span className="font-medium text-slate-800">{order.kotStation}</span>
              </div>

              <div>
                <span className="text-slate-500 text-[11px] block">Receipt Status</span>
                {order.kotStatus === 'Confirmed' ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5" />
                    Confirmed ({order.kotConfirmedAt ? formatClockTime(order.kotConfirmedAt) : 'Ack'})
                  </span>
                ) : order.kotStatus === 'KOT Not Confirmed' ? (
                  <span className="text-amber-800 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    KOT not confirmed
                  </span>
                ) : (
                  <span className="text-slate-600 font-medium">
                    Awaiting confirmation...
                  </span>
                )}
              </div>

              <div>
                <span className="text-slate-500 text-[11px] block">Staff / Server</span>
                <span className="font-medium text-slate-800">{order.serverName}</span>
              </div>
            </div>

            {order.kotStatus !== 'Confirmed' && (
              <div className="mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between">
                <p className="text-[11px] text-amber-900 leading-normal">
                  Ticket unconfirmed by kitchen printer hardware. Check paper feed or confirm manually.
                </p>
                <button
                  type="button"
                  onClick={() => onConfirmKOT(order.id)}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded transition-colors whitespace-nowrap shrink-0"
                >
                  Confirm KOT Now
                </button>
              </div>
            )}
          </div>

          {/* Ordered Items List */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">
                Ordered Items ({order.items.length})
              </h4>
              <span className="font-mono font-bold text-slate-900">
                Total: ${order.totalAmount.toFixed(2)}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <div key={item.id} className="py-2 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {item.quantity}x
                      </span>
                      <span className="font-medium text-slate-900">{item.name}</span>
                    </div>
                    {item.notes && (
                      <span className="text-[11px] text-amber-800 italic block pl-6">
                        Note: {item.notes}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-slate-700 tabular-nums">
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Alert History Log for this order */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <h4 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              <span>Watchdog Alert & Audit Log</span>
            </h4>

            {orderAlerts.length === 0 ? (
              <p className="text-slate-400 italic">No alerts logged for this order.</p>
            ) : (
              <div className="space-y-2">
                {orderAlerts.map((alt) => (
                  <div
                    key={alt.id}
                    className={`p-3 rounded-lg border text-xs ${
                      alt.status === 'resolved'
                        ? 'bg-slate-50 border-slate-200 text-slate-600'
                        : alt.severity === 'urgent'
                        ? 'bg-red-50/60 border-red-200 text-red-950'
                        : 'bg-amber-50/60 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{alt.title}</span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-white/80 border">
                          {alt.status}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
                        {formatClockTime(alt.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px]">{alt.message}</p>

                    {(alt.acknowledgedBy || alt.resolvedBy) && (
                      <div className="mt-2 text-[11px] pt-1.5 border-t border-slate-200/60 text-slate-600 space-y-0.5">
                        {alt.acknowledgedBy && (
                          <p>
                            • Acknowledged by <strong>{alt.acknowledgedBy}</strong> at{' '}
                            {alt.acknowledgedAt && formatClockTime(alt.acknowledgedAt)}
                          </p>
                        )}
                        {alt.resolvedBy && (
                          <p>
                            • Resolved by <strong>{alt.resolvedBy}</strong> at{' '}
                            {alt.resolvedAt && formatClockTime(alt.resolvedAt)} (
                            {alt.resolutionNote})
                          </p>
                        )}
                      </div>
                    )}

                    {alt.status !== 'resolved' && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => onResolveAlert(alt.id)}
                          className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[11px] font-medium hover:bg-emerald-700"
                        >
                          Resolve Alert
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Current Operator: <span className="font-semibold text-slate-700">{currentStaff.name}</span>
          </div>

          <div className="flex items-center gap-2">
            {nextStatus && (
              <button
                type="button"
                onClick={() => {
                  onAdvanceStatus(order.id, nextStatus);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <span>Advance to {nextStatus}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
