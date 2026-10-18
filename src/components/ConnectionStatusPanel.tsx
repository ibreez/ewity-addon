/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Radio,
  Building,
  KeyRound,
  RotateCw,
  FlaskConical,
  ExternalLink,
} from 'lucide-react';
import { EwityConnectionInfo, EwityConnectionStatus } from '../types/ewity';
import { formatClockTime } from '../utils/time';

interface ConnectionStatusPanelProps {
  info: EwityConnectionInfo;
  onOpenIntegration: () => void;
  onEnableDemoMode: () => void;
  onDisableDemoMode: () => void;
  onRefresh?: () => void;
}

export const ConnectionStatusPanel: React.FC<ConnectionStatusPanelProps> = ({
  info,
  onOpenIntegration,
  onEnableDemoMode,
  onDisableDemoMode,
  onRefresh,
}) => {
  const status: EwityConnectionStatus = info.status || 'NOT CONNECTED';

  const getStatusBadge = () => {
    switch (status) {
      case 'LIVE CONNECTED':
        return {
          label: 'LIVE CONNECTED',
          icon: CheckCircle2,
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800',
          dot: 'bg-emerald-500 animate-pulse',
          description: 'Authenticated with live Ewity POS. Real sales and KOT events flowing.',
        };
      case 'DEMO MODE':
        return {
          label: 'DEMO MODE (SANDBOX)',
          icon: FlaskConical,
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-900',
          dot: 'bg-amber-500',
          description: 'Displaying simulated test fixtures. No live restaurant orders affected.',
        };
      case 'NOT CONFIGURED':
        return {
          label: 'NOT CONFIGURED',
          icon: XCircle,
          bg: 'bg-slate-500/10 border-slate-300 text-slate-700',
          dot: 'bg-slate-400',
          description: 'API key or store ID is missing. Configure EWITY_APP_API_KEY and EWITY_STORE_ID.',
        };
      case 'AUTHENTICATION FAILED':
        return {
          label: 'AUTHENTICATION FAILED',
          icon: XCircle,
          bg: 'bg-red-500/10 border-red-500/30 text-red-800',
          dot: 'bg-red-600',
          description: 'Ewity Apps API rejected credentials. Invalid or expired API key.',
        };
      case 'AWAITING MERCHANT APPROVAL':
        return {
          label: 'AWAITING MERCHANT APPROVAL',
          icon: AlertTriangle,
          bg: 'bg-blue-500/10 border-blue-500/30 text-blue-900',
          dot: 'bg-blue-600 animate-pulse',
          description: 'Store app installation pending. The restaurant business must install and approve the app in Ewity App Store.',
        };
      case 'NOT CONNECTED':
        return {
          label: 'NOT CONNECTED',
          icon: XCircle,
          bg: 'bg-slate-500/10 border-slate-300 text-slate-700',
          dot: 'bg-slate-400',
          description: 'Credentials not configured or connection disconnected.',
        };
      case 'CONNECTION ERROR':
        return {
          label: 'CONNECTION ERROR',
          icon: AlertTriangle,
          bg: 'bg-red-500/10 border-red-500/30 text-red-800',
          dot: 'bg-red-500',
          description: 'Ewity API request or handshake failed. Please check network and credentials.',
        };
      case 'LIVE DATA STALE':
        return {
          label: 'LIVE DATA STALE',
          icon: Clock,
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-800',
          dot: 'bg-amber-500 animate-ping',
          description: 'Live polling interval exceeded threshold (>60s since last successful sync).',
        };
      case 'PERMISSION ERROR':
        return {
          label: 'PERMISSION ERROR',
          icon: KeyRound,
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-800',
          dot: 'bg-rose-600',
          description: 'API key lacks required permissions (p/r-bill-history or store administration).',
        };
      case 'Connecting':
      default:
        return {
          label: 'CONNECTING...',
          icon: Radio,
          bg: 'bg-blue-500/10 border-blue-500/30 text-blue-800',
          dot: 'bg-blue-500 animate-pulse',
          description: 'Verifying Ewity POS connection and authorization...',
        };
    }
  };

  const badge = getStatusBadge();
  const Icon = badge.icon;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs mb-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Status indicator and explanation */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-slate-900 text-amber-400 shrink-0 mt-0.5">
            <Radio className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                Connection Status:
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold border ${badge.bg}`}
              >
                <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                <span>{badge.label}</span>
              </span>

              {info.company?.name && (
                <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <strong className="text-slate-800">{info.company.name}</strong>
                  {info.storeId && (
                    <span className="text-[11px] font-mono text-slate-400">
                      (Store #{info.storeId})
                    </span>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {badge.description}
            </p>
            {(info.latestSafeErrorMessage || info.lastErrorMessage || info.lastError) && (
              <p className="text-xs text-red-600 font-medium mt-1 bg-red-50 px-2 py-0.5 rounded border border-red-200 inline-block">
                Reason: {info.latestSafeErrorMessage || info.lastErrorMessage || info.lastError}
              </p>
            )}
            {info.isPlatformKeyWarning && (
              <p className="text-xs text-amber-800 font-medium mt-1 bg-amber-50 px-2 py-1 rounded border border-amber-300 inline-block">
                ⚠️ Token Notice: Key begins with &quot;plt_&quot; (Platform API). The restaurant POS integration requires an Apps API key.
              </p>
            )}
          </div>
        </div>

        {/* Diagnostic Metadata Strip */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <div className="flex flex-col">
            <span className="text-slate-400 font-medium uppercase text-[10px]">Last API Request</span>
            <span className="font-mono text-slate-700 font-semibold">
              {info.lastSuccessfulApiRequestAt ? formatClockTime(info.lastSuccessfulApiRequestAt) : 'Never'}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-slate-400 font-medium uppercase text-[10px]">Last Reconciliation</span>
            <span className="font-mono text-slate-700 font-semibold">
              {info.lastSuccessfulReconciliationAt ? formatClockTime(info.lastSuccessfulReconciliationAt) : 'Never'}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-slate-400 font-medium uppercase text-[10px]">Last Webhook</span>
            <span className="font-mono text-slate-700 font-semibold">
              {info.lastWebhookReceivedAt ? formatClockTime(info.lastWebhookReceivedAt) : 'None'}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-slate-400 font-medium uppercase text-[10px]">Config Source</span>
            <span className="font-semibold text-slate-800">
              {info.configSource === 'custom_runtime' ? 'Runtime (In-Memory)' : 'Environment (Cloud Run)'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium"
              title="Refresh connection status"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          {info.mode === 'demo' ? (
            <button
              type="button"
              onClick={onDisableDemoMode}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              Switch to Live Mode
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnableDemoMode}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Enable Demo Mode</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenIntegration}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 transition-colors flex items-center gap-1"
          >
            <span>Credentials</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
