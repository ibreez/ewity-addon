/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  Eye,
  Check,
  RotateCcw,
  Info,
  ShieldAlert,
  WifiOff,
  User,
} from 'lucide-react';
import { Alert, AlertState, StaffMember, Order } from '../types';
import { formatClockTime, formatRelativeTime } from '../utils/time';

interface AlertPanelProps {
  alerts: Alert[];
  orders: Order[];
  currentStaff: StaffMember;
  onAcknowledge: (alertId: string) => void;
  onSnooze: (alertId: string, minutes: number) => void;
  onResolve: (alertId: string, note?: string) => void;
  onSelectOrder: (order: Order) => void;
  currentTime: number;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({
  alerts,
  orders,
  currentStaff,
  onAcknowledge,
  onSnooze,
  onResolve,
  onSelectOrder,
  currentTime,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'acknowledged' | 'snoozed' | 'resolved'>('all');
  const [resolutionNoteInput, setResolutionNoteInput] = useState<{ [alertId: string]: string }>({});
  const [showNoteInputId, setShowNoteInputId] = useState<string | null>(null);

  const filteredAlerts = alerts.filter((a) => {
    if (filterTab === 'all') return true;
    return a.status === filterTab;
  });

  const getAssociatedOrder = (orderId: string): Order | undefined => {
    return orders.find((o) => o.id === orderId);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-800" />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Watchdog Alert Feed
            </h2>
            <span className="text-xs text-slate-500">
              ({filteredAlerts.length} item{filteredAlerts.length === 1 ? '' : 's'})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Real-time reminders for KOT receipt timeouts and preparation bottlenecks
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-lg text-xs">
          {(['all', 'active', 'acknowledged', 'snoozed', 'resolved'] as const).map((tab) => {
            const count = alerts.filter((a) => (tab === 'all' ? true : a.status === tab)).length;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                className={`px-2.5 py-1 rounded-md font-medium capitalize transition-colors flex items-center gap-1.5 ${
                  filterTab === tab
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{tab}</span>
                <span className="text-[10px] font-mono tabular-nums opacity-75">
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Alert Feed List */}
      <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-800">No alerts in this view</p>
            <p className="text-xs text-slate-400 mt-1">
              All orders are within nominal SLA thresholds or active alerts have been resolved.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const order = getAssociatedOrder(alert.orderId);
            const isUrgent = alert.severity === 'urgent';
            const isResolved = alert.status === 'resolved';

            return (
              <div
                key={alert.id}
                className={`p-4 transition-colors ${
                  isResolved
                    ? 'bg-slate-50/40 opacity-70'
                    : isUrgent
                    ? 'bg-red-50/25'
                    : 'bg-amber-50/15'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Alert Icon & Content */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        isResolved
                          ? 'bg-slate-100 text-slate-500'
                          : isUrgent
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {alert.type === 'connection_lost' ? (
                        <WifiOff className="w-4 h-4" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 font-mono">
                          {alert.orderNumber}
                        </span>
                        {alert.tableNumber && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">
                            {alert.tableNumber}
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wider ${
                            isUrgent ? 'text-red-700' : 'text-amber-800'
                          }`}
                        >
                          {alert.title}
                        </span>

                        {/* Distinction tag: Confirmed Failure vs Unconfirmed Condition */}
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                            alert.isConfirmedFailure
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-amber-50 text-amber-900 border-amber-200'
                          }`}
                        >
                          {alert.isConfirmedFailure ? 'Confirmed Failure' : 'Unconfirmed Condition'}
                        </span>

                        {/* Alert state badge */}
                        <span
                          className={`text-[10px] font-medium capitalize px-1.5 py-0.2 rounded ${
                            alert.status === 'active'
                              ? 'bg-red-600 text-white font-bold'
                              : alert.status === 'acknowledged'
                              ? 'bg-blue-100 text-blue-800'
                              : alert.status === 'snoozed'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {alert.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                        {alert.message}
                      </p>

                      <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-3 flex-wrap">
                        <span>{alert.conditionDescription}</span>
                        <span>·</span>
                        <span>Created {formatClockTime(alert.createdAt)}</span>
                        <span>({formatRelativeTime(alert.createdAt, currentTime)})</span>
                      </div>

                      {/* Staff attribution history */}
                      {(alert.acknowledgedBy || alert.snoozedBy || alert.resolvedBy) && (
                        <div className="mt-2 text-[11px] bg-white border border-slate-200 rounded-md p-2 space-y-1 text-slate-600">
                          {alert.acknowledgedBy && (
                            <div className="flex items-center gap-1.5">
                              <User className="w-3 h-3 text-blue-600 shrink-0" />
                              <span>
                                Acknowledged by <strong className="text-slate-800">{alert.acknowledgedBy}</strong>{' '}
                                {alert.acknowledgedAt && `at ${formatClockTime(alert.acknowledgedAt)}`}
                              </span>
                            </div>
                          )}
                          {alert.snoozedBy && alert.snoozedUntil && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-purple-600 shrink-0" />
                              <span>
                                Snoozed by <strong className="text-slate-800">{alert.snoozedBy}</strong> until{' '}
                                {formatClockTime(alert.snoozedUntil)}
                              </span>
                            </div>
                          )}
                          {alert.resolvedBy && (
                            <div className="flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>
                                Resolved by <strong className="text-slate-800">{alert.resolvedBy}</strong>{' '}
                                {alert.resolvedAt && `at ${formatClockTime(alert.resolvedAt)}`}:{' '}
                                <em>{alert.resolutionNote || 'Verified in kitchen'}</em>
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Optional note input when resolving */}
                      {showNoteInputId === alert.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Optional resolution note (e.g. Printer reloaded, Dish remade)..."
                            value={resolutionNoteInput[alert.id] || ''}
                            onChange={(e) =>
                              setResolutionNoteInput({
                                ...resolutionNoteInput,
                                [alert.id]: e.target.value,
                              })
                            }
                            className="text-xs flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              onResolve(alert.id, resolutionNoteInput[alert.id]);
                              setShowNoteInputId(null);
                            }}
                            className="px-2.5 py-1 bg-emerald-700 text-white rounded text-xs font-medium hover:bg-emerald-800"
                          >
                            Confirm Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowNoteInputId(null)}
                            className="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {order && (
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded border border-slate-200 transition-colors"
                        title="View Order Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {!isResolved && (
                      <>
                        {alert.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => onAcknowledge(alert.id)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-xs font-medium transition-colors"
                            title={`Acknowledge as ${currentStaff.name}`}
                          >
                            Acknowledge
                          </button>
                        )}

                        {/* Snooze options */}
                        <button
                          type="button"
                          onClick={() => onSnooze(alert.id, 2)}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-medium transition-colors"
                          title="Snooze for 2 minutes"
                        >
                          +2m Snooze
                        </button>

                        {/* Resolve trigger */}
                        <button
                          type="button"
                          onClick={() => {
                            if (showNoteInputId === alert.id) {
                              setShowNoteInputId(null);
                            } else {
                              setShowNoteInputId(alert.id);
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition-colors"
                          title={`Resolve as ${currentStaff.name}`}
                        >
                          Resolve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
