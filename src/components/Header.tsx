/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Bell,
  Settings,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  Store,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { RestaurantLocation, StaffMember, ConnectionStatus } from '../types';
import { EwityConnectionStatus } from '../types/ewity';

interface HeaderProps {
  locations: RestaurantLocation[];
  currentLocationId: string;
  onSelectLocation: (locId: string) => void;
  staffMembers: StaffMember[];
  currentStaffId: string;
  onSelectStaff: (staffId: string) => void;
  monitoringEnabled: boolean;
  onToggleMonitoring: () => void;
  connectionStatus: ConnectionStatus;
  onToggleConnection: () => void;
  onOpenSettings: () => void;
  onOpenSimulateOrder: () => void;
  onResetData: () => void;
  unreadAlertCount: number;
  onOpenAlerts: () => void;
  ewityStatus?: EwityConnectionStatus;
  onOpenEwityIntegration?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  locations,
  currentLocationId,
  onSelectLocation,
  staffMembers,
  currentStaffId,
  onSelectStaff,
  monitoringEnabled,
  onToggleMonitoring,
  connectionStatus,
  onToggleConnection,
  onOpenSettings,
  onOpenSimulateOrder,
  onResetData,
  unreadAlertCount,
  onOpenAlerts,
  ewityStatus = 'Demo Mode',
  onOpenEwityIntegration,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
      {/* Left zone: Brand title + Connection Mode Indicator */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-amber-400 font-bold text-lg shadow-xs">
            EW
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">
                Ewity Kitchen Watchdog
              </h1>
              {/* Separate Connection Status Indicator */}
              <button
                type="button"
                onClick={onOpenEwityIntegration}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold border cursor-pointer transition-colors ${
                  ewityStatus === 'LIVE CONNECTED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : ewityStatus === 'DEMO MODE'
                    ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                    : ewityStatus === 'Connecting'
                    ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                    : ewityStatus === 'LIVE DATA STALE'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                    : ewityStatus === 'PERMISSION ERROR' || ewityStatus === 'CONNECTION ERROR'
                    ? 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
                title="Click to view Ewity Apps API Integration & Credentials"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    ewityStatus === 'LIVE CONNECTED'
                      ? 'bg-emerald-600'
                      : ewityStatus === 'DEMO MODE'
                      ? 'bg-amber-500'
                      : ewityStatus === 'Connecting'
                      ? 'bg-blue-600'
                      : ewityStatus === 'LIVE DATA STALE'
                      ? 'bg-amber-600'
                      : ewityStatus === 'PERMISSION ERROR' || ewityStatus === 'CONNECTION ERROR'
                      ? 'bg-red-600'
                      : 'bg-slate-400'
                  }`}
                />
                <span>{ewityStatus}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Restaurant POS & KOT Confirmation Watchdog
            </p>
          </div>
        </div>

        {/* Location selector */}
        <div className="hidden lg:flex items-center gap-1.5 pl-4 border-l border-slate-200 text-xs">
          <Store className="w-4 h-4 text-slate-400" />
          <select
            value={currentLocationId}
            onChange={(e) => onSelectLocation(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs rounded-md px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right zone: Staff Switcher + Connection status + Monitoring status + Actions */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Active staff switcher */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs">
          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500 hidden sm:inline">Staff:</span>
          <select
            value={currentStaffId}
            onChange={(e) => onSelectStaff(e.target.value)}
            className="bg-transparent font-medium text-slate-800 text-xs focus:outline-none cursor-pointer"
            title="Active staff member for alert acknowledgements"
          >
            {staffMembers.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name} ({staff.role})
              </option>
            ))}
          </select>
        </div>

        {/* Connection status indicator with toggle */}
        <button
          onClick={onToggleConnection}
          title="Click to toggle POS connection state"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            connectionStatus === 'LIVE CONNECTED'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              : connectionStatus === 'DEMO MODE'
              ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
              : 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100'
          }`}
        >
          {connectionStatus === 'LIVE CONNECTED' ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span>Live POS OK</span>
            </>
          ) : connectionStatus === 'DEMO MODE' ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-amber-600" />
              <span>Demo Mode</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-red-600" />
              <span>{connectionStatus}</span>
            </>
          )}
        </button>

        {/* Monitoring status toggle */}
        <button
          onClick={onToggleMonitoring}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
            monitoringEnabled
              ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
              : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {monitoringEnabled ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Watchdog Active</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Watchdog Paused</span>
            </>
          )}
        </button>

        {/* Unread Alert Bell */}
        <button
          onClick={onOpenAlerts}
          className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
          title="View active alerts"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-red-600 text-white rounded-full text-[10px] font-bold tabular-nums">
              {unreadAlertCount}
            </span>
          )}
        </button>

        {/* Quick Simulator CTA */}
        <button
          onClick={onOpenSimulateOrder}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-md transition-colors shadow-2xs"
          title="Simulate incoming order scenario"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>+ Simulate Order</span>
        </button>

        {/* Reset Demo Data */}
        <button
          onClick={onResetData}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
          title="Reset demo data to initial state"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
          title="Configure monitoring thresholds"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
