/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  UtensilsCrossed,
  AlertTriangle,
  ClockAlert,
  PrinterCheck,
  CheckCircle,
} from 'lucide-react';
import { WatchdogMetrics } from '../types';

interface SummaryCardsProps {
  metrics: WatchdogMetrics;
  onFilterClick?: (filterType: string) => void;
  activeFilter?: string;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  metrics,
  onFilterClick,
  activeFilter,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
      {/* 1. Active Orders */}
      <button
        type="button"
        onClick={() => onFilterClick && onFilterClick('active')}
        className={`bg-white border rounded-xl p-4 text-left transition-all cursor-pointer ${
          activeFilter === 'active'
            ? 'border-slate-900 ring-2 ring-slate-900/10 shadow-xs'
            : 'border-slate-200 hover:border-slate-300 shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Active Orders
          </span>
          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {metrics.activeOrdersCount}
          </span>
          <span className="text-xs text-slate-500">In Prep Queue</span>
        </div>
      </button>

      {/* 2. Orders Requiring Attention */}
      <button
        type="button"
        onClick={() => onFilterClick && onFilterClick('attention')}
        className={`bg-white border rounded-xl p-4 text-left transition-all cursor-pointer ${
          activeFilter === 'attention'
            ? 'border-red-600 ring-2 ring-red-600/10 shadow-xs'
            : metrics.attentionRequiredCount > 0
            ? 'border-red-200 hover:border-red-300 shadow-xs'
            : 'border-slate-200 hover:border-slate-300 shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Requires Attention
          </span>
          <div
            className={`p-1.5 rounded-lg ${
              metrics.attentionRequiredCount > 0
                ? 'bg-red-50 text-red-600'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span
            className={`text-2xl font-bold font-mono tabular-nums ${
              metrics.attentionRequiredCount > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {metrics.attentionRequiredCount}
          </span>
          <span className="text-xs text-slate-500">Alerts active</span>
        </div>
      </button>

      {/* 3. KOTs Awaiting Confirmation */}
      <button
        type="button"
        onClick={() => onFilterClick && onFilterClick('kot_awaiting')}
        className={`bg-white border rounded-xl p-4 text-left transition-all cursor-pointer ${
          activeFilter === 'kot_awaiting'
            ? 'border-amber-600 ring-2 ring-amber-600/10 shadow-xs'
            : metrics.kotAwaitingCount > 0
            ? 'border-amber-200 hover:border-amber-300 shadow-xs'
            : 'border-slate-200 hover:border-slate-300 shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            KOTs Awaiting Conf.
          </span>
          <div
            className={`p-1.5 rounded-lg ${
              metrics.kotAwaitingCount > 0
                ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <PrinterCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span
            className={`text-2xl font-bold font-mono tabular-nums ${
              metrics.kotAwaitingCount > 0 ? 'text-amber-600' : 'text-slate-900'
            }`}
          >
            {metrics.kotAwaitingCount}
          </span>
          <span className="text-xs text-slate-500">Unconfirmed</span>
        </div>
      </button>

      {/* 4. Overdue Orders */}
      <button
        type="button"
        onClick={() => onFilterClick && onFilterClick('overdue')}
        className={`bg-white border rounded-xl p-4 text-left transition-all cursor-pointer ${
          activeFilter === 'overdue'
            ? 'border-amber-600 ring-2 ring-amber-600/10 shadow-xs'
            : metrics.overdueOrdersCount > 0
            ? 'border-amber-200 hover:border-amber-300 shadow-xs'
            : 'border-slate-200 hover:border-slate-300 shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Overdue Orders
          </span>
          <div
            className={`p-1.5 rounded-lg ${
              metrics.overdueOrdersCount > 0
                ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <ClockAlert className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span
            className={`text-2xl font-bold font-mono tabular-nums ${
              metrics.overdueOrdersCount > 0 ? 'text-amber-600' : 'text-slate-900'
            }`}
          >
            {metrics.overdueOrdersCount}
          </span>
          <span className="text-xs text-slate-500">Past SLA</span>
        </div>
      </button>

      {/* 5. Resolved Alerts */}
      <button
        type="button"
        onClick={() => onFilterClick && onFilterClick('resolved')}
        className={`bg-white border rounded-xl p-4 text-left transition-all cursor-pointer ${
          activeFilter === 'resolved'
            ? 'border-emerald-600 ring-2 ring-emerald-600/10 shadow-xs'
            : 'border-slate-200 hover:border-slate-300 shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Resolved Alerts
          </span>
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
            {metrics.resolvedAlertsCount}
          </span>
          <span className="text-xs text-slate-500">Resolved Today</span>
        </div>
      </button>
    </div>
  );
};
