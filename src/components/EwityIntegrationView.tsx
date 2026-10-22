/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Link2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCw,
  Search,
  Filter,
  Layers,
  Webhook,
  Database,
  Radio,
  FileText,
  Key,
  Server,
  Terminal,
  Copy,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { EwityConnectionInfo, EwityBillSummary } from '../types/ewity';

interface EwityIntegrationViewProps {
  connectionInfo: EwityConnectionInfo | null;
  onRefreshStatus: () => void;
  onConnect: (credentials: { apiKey?: string; storeId?: string; webhookSecret?: string; adminApiKey?: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onReconcile: () => Promise<void>;
}

export const EwityIntegrationView: React.FC<EwityIntegrationViewProps> = ({
  connectionInfo,
  onRefreshStatus,
  onConnect,
  onDisconnect,
  onReconcile,
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'appui' | 'bills' | 'webhooks'>('status');
  const [copiedAppUrl, setCopiedAppUrl] = useState<boolean>(false);

  // Manual connect form state
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [storeIdInput, setStoreIdInput] = useState<string>(connectionInfo?.storeId || '');
  const [webhookSecretInput, setWebhookSecretInput] = useState<string>('');
  const [adminKeyInput, setAdminKeyInput] = useState<string>(() => {
    try {
      return sessionStorage.getItem('ewity_admin_key') || connectionInfo?.adminApiKey || '';
    } catch {
      return '';
    }
  });
  const [connectLoading, setConnectLoading] = useState<boolean>(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  // Sync storeId and adminKey if received from connection status
  useEffect(() => {
    if (connectionInfo?.storeId && !storeIdInput) {
      setStoreIdInput(connectionInfo.storeId);
    }
  }, [connectionInfo?.storeId]);

  useEffect(() => {
    if (connectionInfo?.adminApiKey && !adminKeyInput) {
      setAdminKeyInput(connectionInfo.adminApiKey);
      try {
        sessionStorage.setItem('ewity_admin_key', connectionInfo.adminApiKey);
      } catch {
        // ignore storage errors
      }
    }
  }, [connectionInfo?.adminApiKey]);

  // KOT filter & bills browser state
  const [kotFilterInput, setKotFilterInput] = useState<string>('');
  const [fetchedBills, setFetchedBills] = useState<EwityBillSummary[]>([]);
  const [billsLoading, setBillsLoading] = useState<boolean>(false);

  // Webhooks inspector state
  const [recentWebhooks, setRecentWebhooks] = useState<any[]>([]);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    const sessionToken = sessionStorage.getItem('ewity_embed_session');
    const adminKey = adminKeyInput || sessionStorage.getItem('ewity_admin_key');
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
      headers['X-Ewity-Session'] = sessionToken;
    } else if (adminKey) {
      headers['Authorization'] = `Bearer ${adminKey}`;
      headers['X-Admin-Key'] = adminKey;
    }
    return headers;
  };

  // Fetch bills with KOT filter
  const handleFetchBills = async () => {
    setBillsLoading(true);
    try {
      const query = new URLSearchParams();
      if (kotFilterInput) query.set('q_kot_number', kotFilterInput);
      const res = await fetch(`/api/ewity/bills?${query.toString()}`, {
        headers: { Accept: 'application/json', ...getAuthHeaders() },
        credentials: 'include',
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : {};
      setFetchedBills(data.data || []);
    } catch (err) {
      console.error('Failed to fetch bills:', err);
    } finally {
      setBillsLoading(false);
    }
  };

  // Fetch recent webhooks
  const handleFetchWebhooks = async () => {
    try {
      const res = await fetch('/api/ewity/webhooks/recent', {
        headers: { Accept: 'application/json', ...getAuthHeaders() },
        credentials: 'include',
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : {};
      setRecentWebhooks(data.events || []);
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    }
  };

  // Handle connect submission
  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectLoading(true);
    setConnectMessage(null);
    try {
      await onConnect({
        apiKey: apiKeyInput.trim() || undefined,
        storeId: storeIdInput.trim() || undefined,
        webhookSecret: webhookSecretInput.trim() || undefined,
        adminApiKey: adminKeyInput.trim() || undefined,
      });
      setConnectMessage('✓ Connection verified successfully.');
    } catch (err: any) {
      setConnectMessage(`Error: ${err.message}`);
    } finally {
      setConnectLoading(false);
    }
  };

  const status = connectionInfo?.status || 'Demo Mode';

  return (
    <div className="space-y-6">
      {/* Top Banner & Status Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-slate-900 text-amber-400">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Ewity POS Apps API Gateway
                  </h2>
                  {/* Status Badge */}
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                      status === 'LIVE CONNECTED'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : status === 'Connecting'
                        ? 'bg-blue-50 text-blue-800 border-blue-300'
                        : status === 'LIVE DATA STALE'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : status === 'CONNECTION ERROR' || status === 'PERMISSION ERROR' || status === 'AUTHENTICATION FAILED'
                        ? 'bg-red-50 text-red-800 border-red-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Official Apps API Gateway: <code className="font-mono text-slate-700">https://api.ewitypos.com/apps-v1</code>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshStatus}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              title="Refresh connection status"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh Status</span>
            </button>

            {status === 'LIVE CONNECTED' || status === 'LIVE DATA STALE' ? (
              <button
                onClick={onDisconnect}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-300 cursor-pointer"
              >
                Disconnect Gateway
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('status')}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
              >
                Configure Credentials
              </button>
            )}
          </div>
        </div>

        {/* Live Warning if not connected */}
        {status !== 'LIVE CONNECTED' && (
          <div className="mt-4 p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Status: {status}
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                As required: <em>&quot;Never show Connected unless a real authenticated API request succeeds.&quot;</em> To connect to a live merchant, provide valid <code className="font-mono">EWITY_APP_API_KEY</code> and <code className="font-mono">EWITY_STORE_ID</code> credentials below. Zero fake data is displayed when disconnected.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 text-xs font-medium">
        <button
          onClick={() => setActiveTab('status')}
          className={`px-4 py-2.5 border-b-2 font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'status'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Authentication & Credentials</span>
        </button>

        <button
          onClick={() => setActiveTab('appui')}
          className={`px-4 py-2.5 border-b-2 font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'appui'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>App UI Protocol (GET /ewity/app)</span>
          <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] rounded font-bold font-mono">
            v1 IframeView
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('bills');
            handleFetchBills();
          }}
          className={`px-4 py-2.5 border-b-2 font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'bills'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Bill Listing & KOT Filter</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('webhooks');
            handleFetchWebhooks();
          }}
          className={`px-4 py-2.5 border-b-2 font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'webhooks'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Webhook className="w-4 h-4" />
          <span>Webhooks & Reconciliation</span>
        </button>
      </div>

      {/* TAB: Ewity App UI Integration */}
      {activeTab === 'appui' && (
        <div className="space-y-4">
          {/* Main App UI Summary Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-mono text-[11px] font-bold">
                    GET /ewity/app
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono text-[11px] font-bold">
                    IframeView Spec v1
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1.5">
                  Ewity POS App UI Protocol Integration
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Allows merchants to launch Ewity Kitchen Watchdog directly inside the Ewity POS application window as an embedded IframeView component.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/ewity/app"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open /ewity/app</span>
                </a>
              </div>
            </div>

            {/* Target Endpoint & Deployed Base URL */}
            <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                  App UI URL to Enter in Ewity Developer Portal
                </span>
                <button
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? `${window.location.origin}/ewity/app` : '/ewity/app';
                    navigator.clipboard.writeText(url);
                    setCopiedAppUrl(true);
                    setTimeout(() => setCopiedAppUrl(false), 2000);
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedAppUrl ? 'Copied!' : 'Copy App UI URL'}</span>
                </button>
              </div>
              <div className="p-2.5 bg-slate-950 rounded-lg font-mono text-xs text-emerald-400 break-all border border-slate-800">
                {typeof window !== 'undefined' ? `${window.location.origin}/ewity/app` : '/ewity/app'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1 text-slate-300">
                <div>
                  <span className="text-slate-400">Embedded App Root:</span>
                  <div className="font-mono text-[11px] text-slate-200 mt-0.5 truncate">
                    {typeof window !== 'undefined' ? window.location.origin : ''}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Target Component:</span>
                  <div className="font-mono text-[11px] text-slate-200 mt-0.5">
                    type: &quot;IframeView&quot; | height: 900px
                  </div>
                </div>
              </div>
            </div>

            {/* Security Architecture & Rules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>X-Ewity-Signature</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  HMAC-SHA256 signature calculated over <code className="font-mono text-[10px] bg-slate-200 px-1 py-0.5 rounded">t=...,v1=...</code>. Enforces a strict 300s replay window.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <Key className="w-4 h-4 text-purple-600" />
                  <span>X-Ewity-Context JWT</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Cryptographically validated HS256 JWT containing trusted claims: <code className="font-mono text-[10px] bg-slate-200 px-1 py-0.5 rounded">store_id</code>, <code className="font-mono text-[10px] bg-slate-200 px-1 py-0.5 rounded">company</code>, and <code className="font-mono text-[10px] bg-slate-200 px-1 py-0.5 rounded">exp</code>.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Identity Proof</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Unsigned <code className="font-mono text-[10px] bg-slate-200 px-1 py-0.5 rounded">?store_id=...</code> query parameters are strictly ignored. Merchant identity is derived solely from verified JWT claims.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Authentication & Credentials */}
      {activeTab === 'status' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Credentials Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-slate-700" />
              <span>Ewity Apps API Credentials</span>
            </h3>
            <p className="text-slate-500 leading-relaxed text-[11px]">
              Ewity Apps use two headers for authentication: <code className="font-mono text-slate-800">Authorization: Bearer &lt;API_KEY&gt;</code> and <code className="font-mono text-slate-800">X-Ewity-Store: &lt;STORE_ID&gt;</code>.
            </p>

            <form onSubmit={handleConnectSubmit} className="space-y-3 pt-2">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Ewity App API Key (EWITY_APP_API_KEY)
                </label>
                <input
                  type="password"
                  placeholder="App API key from Developer Portal Credentials tab..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Merchant Store ID (EWITY_STORE_ID)
                  </label>
                  <span className="text-[10px] text-amber-700 font-medium">Required for Apps API (X-Ewity-Store)</span>
                </div>
                <input
                  type="text"
                  placeholder={connectionInfo?.storeId || "e.g. pl_id_PvkAkVWKPRJssWiPOhh5RIzNfMKjVo (from Developer Portal or webhook)"}
                  value={storeIdInput}
                  onChange={(e) => setStoreIdInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Webhook Signing Secret (EWITY_WEBHOOK_SECRET)
                </label>
                <input
                  type="password"
                  placeholder="whsec_... (Webhooks tab in portal)"
                  value={webhookSecretInput}
                  onChange={(e) => setWebhookSecretInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Administrator API Key (ADMIN_API_KEY)
                  </label>
                  <span className="text-[10px] text-slate-500">
                    {adminKeyInput ? '✓ Auto-configured' : 'Required in production / Optional in dev'}
                  </span>
                </div>
                <input
                  type="password"
                  placeholder="Administrator key for management endpoints..."
                  value={adminKeyInput}
                  onChange={(e) => {
                    setAdminKeyInput(e.target.value);
                    try {
                      sessionStorage.setItem('ewity_admin_key', e.target.value);
                    } catch {
                      // ignore
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {connectMessage && (
                <div className="p-2.5 rounded bg-slate-50 border text-[11px] font-mono text-slate-800">
                  {connectMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={connectLoading}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs"
              >
                {connectLoading ? 'Testing Live Authentication...' : 'Verify Live Ewity Connection'}
              </button>
            </form>
          </div>

          {/* Current Authority & Environment State */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-700" />
              <span>Connection & Authority Diagnostic</span>
            </h3>

            <div className="space-y-2.5">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Gateway Status</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {connectionInfo?.status}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">API Key Configured</span>
                <span className="font-mono">
                  {connectionInfo?.hasApiKey ? '✓ Configured' : '✗ Not set (using mock adapter)'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Store ID</span>
                <span className="font-mono text-slate-800">
                  {connectionInfo?.storeId || 'None'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Webhook Secret</span>
                <span className="font-mono">
                  {connectionInfo?.hasSigningSecret ? '✓ whsec_ configured' : '✗ None'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Required Role ("p/r-bill-history")</span>
                <span className="font-mono">
                  {connectionInfo?.hasBillHistoryPermission
                    ? '✓ Approved'
                    : '✗ Pending Merchant Approval'}
                </span>
              </div>
            </div>

            {connectionInfo?.company && (
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-emerald-900 font-bold block">
                  {connectionInfo.company.name}
                </span>
                <span className="text-emerald-700 text-[11px] font-mono">
                  Domain: {connectionInfo.company.domain}.ewitypos.com
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Bill Listing & KOT Filter */}
      {activeTab === 'bills' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Ewity Bill Listing & Supported KOT Filter (<code className="font-mono text-xs">q_kot_number</code>)
                </h3>
                <p className="text-xs text-slate-500">
                  Endpoint: <code className="font-mono">GET /sales/bills/location/all?q_kot_number=...</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter KOT number..."
                  value={kotFilterInput}
                  onChange={(e) => setKotFilterInput(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                />
                <button
                  onClick={handleFetchBills}
                  className="px-3.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold"
                >
                  {billsLoading ? 'Filtering...' : 'Filter by KOT'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase">
                  <th className="py-2.5 px-3">Bill ID</th>
                  <th className="py-2.5 px-3">Bill #</th>
                  <th className="py-2.5 px-3">KOT #</th>
                  <th className="py-2.5 px-3">Table</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {fetchedBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500">{bill.id}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{bill.number}</td>
                    <td className="py-2.5 px-3 text-amber-700 font-bold">
                      {bill.kot_number || '—'}
                    </td>
                    <td className="py-2.5 px-3">{bill.restaurant_table || '—'}</td>
                    <td className="py-2.5 px-3 capitalize font-sans">{bill.type}</td>
                    <td className="py-2.5 px-3 font-sans font-medium text-emerald-700">
                      {bill.status}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      {bill.payment_status}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-bold text-slate-900">
                      ${bill.total?.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {bill.created?.at || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Webhooks & Reconciliation */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Webhook Verification & Periodic Reconciliation
              </h3>
              <p className="text-slate-500 mt-0.5">
                Registered endpoint: <code className="font-mono text-slate-800">POST /api/ewity/webhooks</code> (signed with <code className="font-mono">X-Ewity-Signature: t=...,v1=...</code>)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onReconcile}
                className="px-3.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Reconcile Now</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-xs space-y-3">
            <h4 className="font-bold text-slate-900">Recent Webhook Deliveries</h4>
            {recentWebhooks.length === 0 ? (
              <p className="text-slate-400 italic">No webhooks delivered yet. Endpoints are ready to receive live events.</p>
            ) : (
              <div className="space-y-2">
                {recentWebhooks.map((wh, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg border font-mono text-[11px] space-y-1">
                    <div className="flex justify-between items-center text-slate-700 font-bold">
                      <span>Event: {wh.event}</span>
                      <span className="text-emerald-700">Signature Verified ✓</span>
                    </div>
                    <div className="text-slate-500">Delivery ID: {wh.deliveryId}</div>
                    <div className="text-slate-500">Created At: {wh.created_at}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
