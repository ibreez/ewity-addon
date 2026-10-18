/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  BellRing,
  Sliders,
  History,
  Printer,
  Layers,
  HelpCircle,
  Laptop,
} from 'lucide-react';

export type DashboardView = 'active_orders' | 'alerts_feed' | 'threshold_rules' | 'archive' | 'ewity_integration';

interface SidebarProps {
  currentView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  activeAlertCount: number;
  activeOrdersCount: number;
  totalOrdersCount: number;
  stationName: string;
  ewityConnectionStatus?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  activeAlertCount,
  activeOrdersCount,
  totalOrdersCount,
  stationName,
  ewityConnectionStatus = 'NOT CONNECTED',
}) => {
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col justify-between shrink-0 min-h-[calc(100vh-61px)]">
      {/* Top Nav Section */}
      <div className="p-4 space-y-6">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block px-3 mb-2">
            Operations
          </span>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectView('active_orders')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'active_orders'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>Active Orders</span>
              </div>
              <span
                className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                  currentView === 'active_orders'
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {activeOrdersCount}
              </span>
            </button>

            <button
              onClick={() => onSelectView('alerts_feed')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'alerts_feed'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BellRing className="w-4 h-4" />
                <span>Alert Center</span>
              </div>
              {activeAlertCount > 0 ? (
                <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">
                  {activeAlertCount}
                </span>
              ) : (
                <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  0
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectView('threshold_rules')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'threshold_rules'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Watchdog Rules</span>
            </button>

            <button
              onClick={() => onSelectView('archive')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'archive'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4" />
                <span>Completed / History</span>
              </div>
              <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                {totalOrdersCount}
              </span>
            </button>

            {/* Phase 2 Ewity Apps API Integration Tab */}
            <button
              onClick={() => onSelectView('ewity_integration')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'ewity_integration'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4" />
                <span>Ewity Apps API</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                  ewityConnectionStatus === 'Connected'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-amber-400'
                }`}
              >
                {ewityConnectionStatus === 'Connected' ? 'LIVE' : 'PHASE 2'}
              </span>
            </button>
          </nav>
        </div>

        {/* Printer Stations Status */}
        <div className="pt-2 border-t border-slate-800">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block px-3 mb-2.5">
            KOT Output Stations
          </span>
          <div className="space-y-2 px-3 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <div className="flex items-center gap-2">
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate max-w-[130px]">Hot Line #1</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono">Ready</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <div className="flex items-center gap-2">
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate max-w-[130px]">Pantry/Cold #2</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono">Ready</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <div className="flex items-center gap-2">
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate max-w-[130px]">Beverage Bar #1</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono">Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom section: Architecture readiness badge */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-200 font-semibold mb-1">
            <Laptop className="w-3.5 h-3.5 text-amber-400" />
            <span>Phase 2 Live API Adapter</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Ewity Apps API, HMAC-SHA256 webhooks, and reconciliation integrated.
          </p>
          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Gateway State</span>
            <span
              className={`font-mono font-medium ${
                ewityConnectionStatus === 'LIVE CONNECTED'
                  ? 'text-emerald-400'
                  : ewityConnectionStatus === 'DEMO MODE'
                  ? 'text-amber-400'
                  : ewityConnectionStatus === 'LIVE DATA STALE'
                  ? 'text-amber-300'
                  : ewityConnectionStatus === 'PERMISSION ERROR' || ewityConnectionStatus === 'CONNECTION ERROR'
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              {ewityConnectionStatus}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
