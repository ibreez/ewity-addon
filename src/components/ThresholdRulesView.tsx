/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Sliders,
  Printer,
  Clock,
  AlertOctagon,
  Wifi,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { MonitoringSettings } from '../types';

interface ThresholdRulesViewProps {
  settings: MonitoringSettings;
  onOpenSettings: () => void;
}

export const ThresholdRulesView: React.FC<ThresholdRulesViewProps> = ({
  settings,
  onOpenSettings,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">
              Kitchen Watchdog Monitoring Engine Rules
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            The Watchdog continuously monitors order state events and KOT printer confirmation heartbeats.
            When an order exceeds configured SLA thresholds, visual reminders and alerts are triggered for kitchen staff.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configure Thresholds</span>
          </button>
        </div>
      </div>

      {/* 4 Active Monitoring Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rule 1 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-slate-900">
                  Rule 1: KOT Confirmation Timeout
                </h3>
                <span className="text-[11px] text-slate-500">
                  Target: Kitchen Order Ticket Hardware ACK
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-amber-700 px-2 py-0.5 bg-amber-50 rounded border border-amber-200">
              {settings.kotConfirmationTimeoutSec}s SLA
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            When an order is created, a print command is sent to the station printer. If no receipt confirmation signal is returned within <strong>{settings.kotConfirmationTimeoutSec} seconds</strong>, the ticket is flagged as <em>"KOT not confirmed"</em>.
          </p>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Condition Class: Unconfirmed Receipt Event</span>
            <span className="text-amber-700 font-semibold">Warning / Urgent</span>
          </div>
        </div>

        {/* Rule 2 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-50 text-red-700">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-slate-900">
                  Rule 2: Order Preparation Delay Warning
                </h3>
                <span className="text-[11px] text-slate-500">
                  Target: Kitchen Line Assembly SLA
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-red-700 px-2 py-0.5 bg-red-50 rounded border border-red-200">
              {settings.orderCompletionWarningMin}m SLA
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Monitors total elapsed time from ticket creation to completion. If an order remains in preparation longer than <strong>{settings.orderCompletionWarningMin} minutes</strong>, it is flagged as overdue for expediter review.
          </p>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Condition Class: Preparation Bottleneck</span>
            <span className="text-red-700 font-semibold">Urgent Escalation</span>
          </div>
        </div>

        {/* Rule 3 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                <AlertOctagon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-slate-900">
                  Rule 3: Order Status Stalled in 'New'
                </h3>
                <span className="text-[11px] text-slate-500">
                  Target: Queue Acceptance Latency
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-blue-700 px-2 py-0.5 bg-blue-50 rounded border border-blue-200">
              {settings.statusStalledWarningMin}m SLA
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Checks if incoming POS or Online orders remain in 'New' status without being acknowledged and advanced into 'In Kitchen' prep within <strong>{settings.statusStalledWarningMin} minutes</strong>.
          </p>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Condition Class: Unaccepted Queue Order</span>
            <span className="text-blue-700 font-semibold">Warning</span>
          </div>
        </div>

        {/* Rule 4 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-slate-900">
                  Rule 4: POS Gateway Connection Health
                </h3>
                <span className="text-[11px] text-slate-500">
                  Target: Ewity POS API Heartbeat
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded border border-emerald-200">
              Live Heartbeat
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Monitors real-time connectivity between local watchdog and POS terminal database. If heartbeat is lost, watchdog raises an immediate high-priority alert and engages offline queue buffering.
          </p>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Condition Class: Confirmed Connection Fault</span>
            <span className="text-red-700 font-semibold">Urgent Immediate</span>
          </div>
        </div>
      </div>
    </div>
  );
};
