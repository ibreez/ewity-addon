/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FlaskConical, AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';

interface DemoDataBannerProps {
  onSwitchToLive: () => void;
  onResetDemoData?: () => void;
}

export const DemoDataBanner: React.FC<DemoDataBannerProps> = ({
  onSwitchToLive,
  onResetDemoData,
}) => {
  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-3 rounded-xl shadow-xs mb-5 border-2 border-amber-600 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-slate-950 text-amber-400 shrink-0">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-slate-950 text-amber-300 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
              DEMO DATA ACTIVE
            </span>
            <span className="font-bold text-xs uppercase tracking-wide text-slate-950">
              Simulated Restaurant Test Fixtures
            </span>
          </div>
          <p className="text-xs text-slate-900 font-medium mt-0.5 leading-snug">
            All orders, bills, and alerts displayed on this screen are test fixtures. No real restaurant POS orders are affected.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
        {onResetDemoData && (
          <button
            type="button"
            onClick={onResetDemoData}
            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-lg text-xs font-bold border border-amber-600 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Reset simulated orders to default test state"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>
        )}
        <button
          type="button"
          onClick={onSwitchToLive}
          className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <span>Switch to Live Mode</span>
          <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
        </button>
      </div>
    </div>
  );
};
