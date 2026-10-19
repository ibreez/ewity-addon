/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Order,
  Alert,
  MonitoringSettings,
  ConnectionStatus,
  OrderFilterState,
  WatchdogMetrics,
  OrderStatus,
  RestaurantLocation,
} from './types';
import {
  RESTAURANT_LOCATIONS,
  STAFF_MEMBERS,
  loadSavedOrders,
  loadSavedLiveOrders,
  loadDemoOrders,
  saveOrders,
  saveLiveOrders,
  saveDemoOrders,
  loadSavedSettings,
  saveSettings,
  getInitialMockOrders,
  generateSimulatedOrder,
  OrderSimulationPreset,
} from './services/mockOrderService';
import { evaluateMonitoringRules } from './services/monitoringRules';
import { AlertManager, ToastMessage } from './services/alertManager';
import { Header } from './components/Header';
import { Sidebar, DashboardView } from './components/Sidebar';
import { SummaryCards } from './components/SummaryCards';
import { OrderTable } from './components/OrderTable';
import { AlertPanel } from './components/AlertPanel';
import { OrderDetailsModal } from './components/OrderDetailsModal';
import { SettingsModal } from './components/SettingsModal';
import { SimulateOrderModal } from './components/SimulateOrderModal';
import { ThresholdRulesView } from './components/ThresholdRulesView';
import { EwityIntegrationView } from './components/EwityIntegrationView';
import { ConnectionStatusPanel } from './components/ConnectionStatusPanel';
import { DemoDataBanner } from './components/DemoDataBanner';
import { ToastContainer } from './components/ToastContainer';
import { playAlertSound } from './utils/audio';
import { EwityConnectionInfo } from './types/ewity';

export default function App() {
  // 1. Core State - strictly starts with saved genuine live orders
  const [orders, setOrders] = useState<Order[]>(() => loadSavedLiveOrders());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState<MonitoringSettings>(() => loadSavedSettings());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('NOT CONNECTED');
  const [currentLocationId, setCurrentLocationId] = useState<string>('loc-main');
  const [currentStaffId, setCurrentStaffId] = useState<string>('staff-1');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [currentView, setCurrentView] = useState<DashboardView>('active_orders');

  // Detect if running inside Ewity POS App UI iframe or at /ewity/app
  const [isEmbeddedInEwityPos] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (
        params.get('embedded') === '1' ||
        window.location.pathname.startsWith('/ewity/app') ||
        window.self !== window.top
      );
    } catch {
      return false;
    }
  });

  const [initialStoreIdFromUrl] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('store_id');
    } catch {
      return null;
    }
  });

  // Ewity Apps API Integration State
  const [ewityInfo, setEwityInfo] = useState<EwityConnectionInfo>({
    mode: 'live',
    status: 'NOT CONNECTED',
    isConnected: false,
    storeId: initialStoreIdFromUrl,
    hasApiKey: false,
    hasSigningSecret: false,
    authorities: [],
    hasBillHistoryPermission: false,
    availableLocations: [],
    reconciliationActive: false,
  });

  // Modals & Inspectors
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Filtering state
  const [filterState, setFilterState] = useState<OrderFilterState>({
    searchQuery: '',
    source: 'ALL',
    orderStatus: 'ActiveOnly',
    kotStatus: 'ALL',
    severity: 'ALL',
  });

  const [activeSummaryFilter, setActiveSummaryFilter] = useState<string>('active');

  // Active staff member
  const currentStaff = useMemo(() => {
    return (
      STAFF_MEMBERS.find((s) => s.id === currentStaffId) || STAFF_MEMBERS[0]
    );
  }, [currentStaffId]);

  // Combined locations: merchant locations when available, plus default locations
  const availableLocations = useMemo<RestaurantLocation[]>(() => {
    if (ewityInfo.availableLocations && ewityInfo.availableLocations.length > 0) {
      return ewityInfo.availableLocations.map((loc) => ({
        id: String(loc.id),
        name: loc.name,
        code: `EW-${loc.id}`,
        address: loc.street_address || loc.city || 'Ewity Merchant Outlet',
        activeStations: ['Kitchen Hot Line #1', 'Pantry & Salad #2', 'Bar Counter'],
      }));
    }
    return RESTAURANT_LOCATIONS;
  }, [ewityInfo.availableLocations]);

  // Current location
  const currentLocation = useMemo(() => {
    return (
      availableLocations.find((l) => l.id === currentLocationId) ||
      availableLocations[0] ||
      RESTAURANT_LOCATIONS[0]
    );
  }, [availableLocations, currentLocationId]);

  // Toast dispatcher
  const addToast = useCallback((toast: ToastMessage) => {
    setToasts((prev) => [toast, ...prev.slice(0, 4)]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch Ewity connection status from backend adapter
  const fetchEwityStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ewity/status');
      if (res.ok) {
        const data = await res.json();
        setEwityInfo(data);
        if (data.status) {
          setConnectionStatus(data.status);
        }
        if (data.availableLocations && data.availableLocations.length > 0) {
          setCurrentLocationId((prev) => {
            if (prev === 'loc-main' || !data.availableLocations.some((l: any) => String(l.id) === prev)) {
              return String(data.availableLocations[0].id);
            }
            return prev;
          });
        }
      }
    } catch {
      // Backend starting up or running client-only
    }
  }, []);

  useEffect(() => {
    fetchEwityStatus();
    const interval = setInterval(fetchEwityStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchEwityStatus]);

  // Sync real bills when Ewity is LIVE CONNECTED or LIVE DATA STALE
  const syncEwityBills = useCallback(async () => {
    if (ewityInfo.status !== 'LIVE CONNECTED' && ewityInfo.status !== 'LIVE DATA STALE') return;
    try {
      const res = await fetch(`/api/ewity/bills?location_id=${currentLocationId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.mappedOrders)) {
          // STRICT RULE: If in Live Mode, visible orders must only be genuine live orders!
          setOrders(data.mappedOrders);
          saveLiveOrders(data.mappedOrders);
        }
      }
    } catch {
      // Graceful fallback
    }
  }, [ewityInfo.status, currentLocationId]);

  useEffect(() => {
    if (ewityInfo.status === 'LIVE CONNECTED' || ewityInfo.status === 'LIVE DATA STALE') {
      syncEwityBills();
      const billTimer = setInterval(syncEwityBills, 15000);
      return () => clearInterval(billTimer);
    }
  }, [ewityInfo.status, syncEwityBills]);

  // 2. Real-Time Watchdog Evaluation Loop (Ticks every 1s)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      // Evaluate monitoring rules against latest orders
      setOrders((prevOrders) => {
        const { alerts: updatedAlerts, updatedOrders } = evaluateMonitoringRules(
          prevOrders,
          alerts,
          settings,
          connectionStatus,
          now
        );

        // Keep alerts in sync
        setAlerts(updatedAlerts);

        // Handle alerts notifications (audio & toasts)
        AlertManager.handleNewAlerts(updatedAlerts, settings, addToast);

        return updatedOrders;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [alerts, settings, connectionStatus, addToast]);

  // Auto-simulate order timer if enabled in settings
  useEffect(() => {
    if (!settings.autoSimulateOrders) return;
    const intervalMs = (settings.simulationIntervalSec || 45) * 1000;
    const simTimer = setInterval(() => {
      const newOrder = generateSimulatedOrder(
        'normal_dinein',
        currentLocationId,
        currentStaff.name
      );
      setOrders((prev) => {
        const updated = [newOrder, ...prev];
        saveOrders(updated);
        return updated;
      });
      addToast({
        id: `toast-auto-sim-${Date.now()}`,
        title: 'New Simulated Order Arrived',
        message: `${newOrder.orderNumber} placed for Table ${newOrder.tableNumber}`,
        severity: 'info',
        timestamp: Date.now(),
      });
    }, intervalMs);

    return () => clearInterval(simTimer);
  }, [settings.autoSimulateOrders, settings.simulationIntervalSec, currentLocationId, currentStaff, addToast]);

  // Keep selected order fresh in modal when tick updates
  useEffect(() => {
    if (selectedOrder) {
      const fresh = orders.find((o) => o.id === selectedOrder.id);
      if (fresh) {
        setSelectedOrder(fresh);
      }
    }
  }, [orders, selectedOrder]);

  // 3. Computed Metrics
  const metrics: WatchdogMetrics = useMemo(() => {
    const activeOrders = orders.filter(
      (o) => o.orderStatus !== 'Completed' && o.orderStatus !== 'Voided'
    );
    const attentionRequired = activeOrders.filter(
      (o) => o.alertSeverity === 'warning' || o.alertSeverity === 'urgent'
    );
    const kotAwaiting = activeOrders.filter(
      (o) => o.kotStatus === 'Awaiting Confirmation' || o.kotStatus === 'KOT Not Confirmed'
    );
    const orderDelayMs = settings.orderCompletionWarningMin * 60 * 1000;
    const overdue = activeOrders.filter(
      (o) => currentTime - o.createdAt >= orderDelayMs
    );
    const resolvedAlerts = alerts.filter((a) => a.status === 'resolved');

    return {
      activeOrdersCount: activeOrders.length,
      attentionRequiredCount: attentionRequired.length,
      kotAwaitingCount: kotAwaiting.length,
      overdueOrdersCount: overdue.length,
      resolvedAlertsCount: resolvedAlerts.length,
      totalOrdersToday: orders.length,
    };
  }, [orders, alerts, settings.orderCompletionWarningMin, currentTime]);

  const unreadAlertCount = useMemo(() => {
    return alerts.filter((a) => a.status === 'active').length;
  }, [alerts]);

  // 4. Action Handlers
  const handleQuickConfirmKOT = useCallback(
    (orderId: string) => {
      const now = Date.now();
      playAlertSound('ready');

      setOrders((prev) => {
        const updated = prev.map((ord) => {
          if (ord.id === orderId) {
            return {
              ...ord,
              kotStatus: 'Confirmed' as const,
              kotConfirmedAt: now,
              alertSeverity: (ord.alertSeverity === 'urgent' ? 'warning' : 'nominal') as any,
            };
          }
          return ord;
        });
        saveOrders(updated);
        return updated;
      });

      // Auto-resolve any pending KOT timeout alerts for this order
      setAlerts((prevAlerts) =>
        prevAlerts.map((alt) => {
          if (alt.orderId === orderId && alt.type === 'kot_timeout' && alt.status !== 'resolved') {
            return {
              ...alt,
              status: 'resolved',
              resolvedBy: currentStaff.name,
              resolvedAt: now,
              resolutionNote: 'KOT receipt confirmed by operator',
            };
          }
          return alt;
        })
      );

      const targetOrder = orders.find((o) => o.id === orderId);
      addToast({
        id: `toast-confirm-${Date.now()}`,
        title: 'KOT Receipt Confirmed',
        message: `${targetOrder?.orderNumber || 'Order'} ticket verified at kitchen station.`,
        severity: 'info',
        timestamp: now,
      });
    },
    [orders, currentStaff, addToast]
  );

  const handleAdvanceOrderStatus = useCallback(
    (orderId: string, nextStatus: OrderStatus) => {
      const now = Date.now();
      setOrders((prev) => {
        const updated = prev.map((ord) => {
          if (ord.id === orderId) {
            return {
              ...ord,
              orderStatus: nextStatus,
              statusUpdatedAt: now,
            };
          }
          return ord;
        });
        saveOrders(updated);
        return updated;
      });

      if (nextStatus === 'Completed') {
        // Resolve any open alerts for this order
        setAlerts((prevAlerts) =>
          prevAlerts.map((alt) => {
            if (alt.orderId === orderId && alt.status !== 'resolved') {
              return {
                ...alt,
                status: 'resolved',
                resolvedBy: currentStaff.name,
                resolvedAt: now,
                resolutionNote: 'Order marked completed',
              };
            }
            return alt;
          })
        );
      }

      addToast({
        id: `toast-status-${Date.now()}`,
        title: `Order Advanced to ${nextStatus}`,
        message: `Order status updated by ${currentStaff.name}.`,
        severity: 'info',
        timestamp: now,
      });
    },
    [currentStaff, addToast]
  );

  const handleAcknowledgeAlert = useCallback(
    (alertId: string) => {
      setAlerts((prev) =>
        AlertManager.acknowledgeAlert(prev, alertId, currentStaff.name, Date.now())
      );
      addToast({
        id: `toast-ack-${Date.now()}`,
        title: 'Alert Acknowledged',
        message: `Acknowledged by ${currentStaff.name} (${currentStaff.role})`,
        severity: 'info',
        timestamp: Date.now(),
      });
    },
    [currentStaff, addToast]
  );

  const handleSnoozeAlert = useCallback(
    (alertId: string, minutes: number = 2) => {
      setAlerts((prev) =>
        AlertManager.snoozeAlert(prev, alertId, currentStaff.name, minutes, Date.now())
      );
      addToast({
        id: `toast-snooze-${Date.now()}`,
        title: `Alert Snoozed (+${minutes}m)`,
        message: `Will re-alert in ${minutes} minutes if unaddressed.`,
        severity: 'info',
        timestamp: Date.now(),
      });
    },
    [currentStaff, addToast]
  );

  const handleResolveAlert = useCallback(
    (alertId: string, note?: string) => {
      setAlerts((prev) =>
        AlertManager.resolveAlert(prev, alertId, currentStaff.name, note, Date.now())
      );
      addToast({
        id: `toast-resolve-${Date.now()}`,
        title: 'Alert Resolved',
        message: `Marked resolved by ${currentStaff.name}.`,
        severity: 'info',
        timestamp: Date.now(),
      });
    },
    [currentStaff, addToast]
  );

  const handleSimulateOrder = useCallback(
    (preset: OrderSimulationPreset) => {
      const newOrder = generateSimulatedOrder(
        preset,
        currentLocationId,
        currentStaff.name
      );
      setOrders((prev) => {
        const updated = [newOrder, ...prev];
        saveOrders(updated);
        return updated;
      });

      addToast({
        id: `toast-sim-${Date.now()}`,
        title: 'Simulated Order Injected',
        message: `Order ${newOrder.orderNumber} created (${newOrder.orderType} · ${preset.replace(/_/g, ' ')})`,
        severity: preset === 'kot_timeout_test' || preset === 'overdue_kitchen_test' ? 'warning' : 'info',
        timestamp: Date.now(),
      });
    },
    [currentLocationId, currentStaff, addToast]
  );

  const handleResetData = useCallback(() => {
    if (ewityInfo.mode === 'demo') {
      const initial = getInitialMockOrders();
      setOrders(initial);
      saveDemoOrders(initial);
      setAlerts([]);
      AlertManager.resetNotificationCache();
      addToast({
        id: `toast-reset-${Date.now()}`,
        title: 'Demo Data Reset',
        message: 'Restored initial sample restaurant orders and cleared alert history.',
        severity: 'info',
        timestamp: Date.now(),
      });
    } else {
      setAlerts([]);
      AlertManager.resetNotificationCache();
      const liveOrders = loadSavedLiveOrders();
      setOrders(liveOrders);
      addToast({
        id: `toast-reset-${Date.now()}`,
        title: 'Alert History Reset',
        message: 'Cleared active alert notifications. Preserved authentic live orders.',
        severity: 'info',
        timestamp: Date.now(),
      });
    }
  }, [ewityInfo.mode, addToast]);

  const handleSaveSettings = useCallback(
    (updatedSettings: MonitoringSettings) => {
      setSettings(updatedSettings);
      saveSettings(updatedSettings);
      addToast({
        id: `toast-settings-${Date.now()}`,
        title: 'Watchdog Settings Updated',
        message: `KOT timeout: ${updatedSettings.kotConfirmationTimeoutSec}s · Kitchen SLA: ${updatedSettings.orderCompletionWarningMin}m`,
        severity: 'info',
        timestamp: Date.now(),
      });
    },
    [addToast]
  );

  const handleToggleMonitoring = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, monitoringEnabled: !prev.monitoringEnabled };
      saveSettings(next);
      addToast({
        id: `toast-mon-${Date.now()}`,
        title: next.monitoringEnabled ? 'Monitoring Active' : 'Monitoring Paused',
        message: next.monitoringEnabled
          ? 'Watchdog actively evaluating KOT timeouts and order SLAs'
          : 'Watchdog evaluation paused',
        severity: next.monitoringEnabled ? 'info' : 'warning',
        timestamp: Date.now(),
      });
      return next;
    });
  }, [addToast]);

  const handleToggleConnection = useCallback(() => {
    setConnectionStatus((prev) => {
      const next: ConnectionStatus =
        prev === 'CONNECTION ERROR' ? 'LIVE CONNECTED' : 'CONNECTION ERROR';
      addToast({
        id: `toast-conn-${Date.now()}`,
        title: next === 'LIVE CONNECTED' ? 'POS Gateway Reconnected' : 'POS Gateway Interrupted',
        message:
          next === 'LIVE CONNECTED'
            ? 'Heartbeat restored with terminal database'
            : 'Simulated network drop triggered (Urgent Alert)',
        severity: next === 'LIVE CONNECTED' ? 'info' : 'urgent',
        timestamp: Date.now(),
      });
      return next;
    });
  }, [addToast]);

  const handleEnableDemoMode = async () => {
    try {
      await fetch('/api/ewity/demo/enable', { method: 'POST' });
      await fetchEwityStatus();
      setConnectionStatus('DEMO MODE');
      const demoOrders = loadDemoOrders();
      setOrders(demoOrders);
      addToast({
        id: `toast-demo-enable-${Date.now()}`,
        title: 'Demo Mode Activated',
        message: 'Loaded simulated restaurant fixtures. Real orders unaffected.',
        severity: 'info',
        timestamp: Date.now(),
      });
    } catch {
      // ignore
    }
  };

  const handleDisableDemoMode = async () => {
    try {
      await fetch('/api/ewity/demo/disable', { method: 'POST' });
      await fetchEwityStatus();
      // STRICT REQUIREMENT: Switching to Live Mode must clear demo records from visible dashboard
      const liveOrders = loadSavedLiveOrders();
      setOrders(liveOrders);
      if (ewityInfo.status === 'LIVE CONNECTED' || ewityInfo.status === 'LIVE DATA STALE') {
        syncEwityBills();
      }
      addToast({
        id: `toast-demo-disable-${Date.now()}`,
        title: 'Live Mode Active',
        message: 'Demo fixtures cleared. Displaying authentic live restaurant data.',
        severity: 'info',
        timestamp: Date.now(),
      });
    } catch {
      // ignore
    }
  };

  // Phase 2 Ewity Connect / Disconnect / Reconcile Handlers
  const handleConnectEwity = async (credentials: { apiKey?: string; storeId?: string; webhookSecret?: string }) => {
    const res = await fetch('/api/ewity/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Connection failed');
    }
    await fetchEwityStatus();
    addToast({
      id: `toast-ewity-conn-${Date.now()}`,
      title: 'Ewity Gateway Connected',
      message: `Authenticated with ${data.company?.name || 'Ewity Store'}. Role permissions verified.`,
      severity: 'info',
      timestamp: Date.now(),
    });
  };

  const handleDisconnectEwity = async () => {
    await fetch('/api/ewity/disconnect', { method: 'POST' });
    await fetchEwityStatus();
    setOrders(loadSavedLiveOrders());
    addToast({
      id: `toast-ewity-disconn-${Date.now()}`,
      title: 'Ewity Gateway Disconnected',
      message: 'Status set to NOT CONNECTED. Live polling stopped.',
      severity: 'info',
      timestamp: Date.now(),
    });
  };

  const handleReconcileEwity = async () => {
    const res = await fetch('/api/ewity/reconcile', { method: 'POST' });
    const data = await res.json();
    await syncEwityBills();
    addToast({
      id: `toast-ewity-recon-${Date.now()}`,
      title: data.success ? 'Reconciliation Complete' : 'Reconciliation Notice',
      message: data.success
        ? `Reconciled ${data.billsCount} bill records from Ewity Apps API.`
        : (data.error || 'Completed reconciliation pass.'),
      severity: data.success ? 'info' : 'warning',
      timestamp: Date.now(),
    });
  };

  // Quick summary card filter click
  const handleSummaryFilterClick = useCallback((filterType: string) => {
    setActiveSummaryFilter(filterType);
    if (filterType === 'active') {
      setCurrentView('active_orders');
      setFilterState((prev) => ({ ...prev, orderStatus: 'ActiveOnly', severity: 'ALL' }));
    } else if (filterType === 'attention') {
      setCurrentView('active_orders');
      setFilterState((prev) => ({ ...prev, orderStatus: 'ActiveOnly', severity: 'warning' }));
    } else if (filterType === 'kot_awaiting') {
      setCurrentView('active_orders');
      setFilterState((prev) => ({ ...prev, orderStatus: 'ActiveOnly', kotStatus: 'KOT Not Confirmed' }));
    } else if (filterType === 'overdue') {
      setCurrentView('active_orders');
      setFilterState((prev) => ({ ...prev, orderStatus: 'ActiveOnly', severity: 'urgent' }));
    } else if (filterType === 'resolved') {
      setCurrentView('alerts_feed');
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 0. Ewity POS Embedded Bar */}
      {isEmbeddedInEwityPos && (
        <div className="bg-slate-900 text-slate-200 text-xs px-4 py-1.5 flex items-center justify-between border-b border-slate-800 font-medium z-30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">Ewity POS App UI</span>
            <span className="text-slate-400 text-[11px]">/ewity/app</span>
            {ewityInfo.storeId && (
              <span className="bg-purple-950 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded text-[11px] font-mono">
                Store #{ewityInfo.storeId}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Embedded IframeView</span>
        </div>
      )}

      {/* 1. Dashboard Header */}
      <Header
        locations={availableLocations}
        currentLocationId={currentLocationId}
        onSelectLocation={setCurrentLocationId}
        staffMembers={STAFF_MEMBERS}
        currentStaffId={currentStaffId}
        onSelectStaff={setCurrentStaffId}
        monitoringEnabled={settings.monitoringEnabled}
        onToggleMonitoring={handleToggleMonitoring}
        connectionStatus={connectionStatus}
        onToggleConnection={handleToggleConnection}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSimulateOrder={() => setIsSimulateModalOpen(true)}
        onResetData={handleResetData}
        unreadAlertCount={unreadAlertCount}
        onOpenAlerts={() => setCurrentView('alerts_feed')}
        ewityStatus={ewityInfo.status}
        onOpenEwityIntegration={() => setCurrentView('ewity_integration')}
      />

      {/* 2. Workspace Body: Charcoal Sidebar + Light Neutral Content */}
      <div className="flex-1 flex flex-col md:flex-row min-w-0">
        <Sidebar
          currentView={currentView}
          onSelectView={setCurrentView}
          activeAlertCount={unreadAlertCount}
          activeOrdersCount={metrics.activeOrdersCount}
          totalOrdersCount={metrics.totalOrdersToday}
          stationName={currentLocation.name}
          ewityConnectionStatus={ewityInfo.status}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-5 lg:p-7 overflow-y-auto max-w-7xl">
          {/* Breadcrumb & Section Kicker */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span>{currentLocation.name}</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold capitalize">
                  {currentView.replace(/_/g, ' ')}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
                {currentView === 'active_orders' && 'Real-Time Kitchen Orders & KOT Monitor'}
                {currentView === 'alerts_feed' && 'Watchdog Alert & Incident Center'}
                {currentView === 'threshold_rules' && 'Operational Watchdog Rules & SLAs'}
                {currentView === 'archive' && 'Order History & Archived Receipts'}
                {currentView === 'ewity_integration' && 'Ewity POS Apps API Integration (Phase 2)'}
              </h2>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSimulateModalOpen(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>+ Simulate Order</span>
              </button>
            </div>
          </div>

          {/* Prominent DEMO DATA banner on every relevant screen when Demo Mode is active */}
          {ewityInfo.mode === 'demo' && (
            <DemoDataBanner
              onSwitchToLive={handleDisableDemoMode}
              onResetDemoData={handleResetData}
            />
          )}

          {/* Truthful Connection Status & Diagnostics Panel */}
          <ConnectionStatusPanel
            info={ewityInfo}
            onOpenIntegration={() => setCurrentView('ewity_integration')}
            onEnableDemoMode={handleEnableDemoMode}
            onDisableDemoMode={handleDisableDemoMode}
            onRefresh={fetchEwityStatus}
          />

          {/* Summary KPI Cards Strip */}
          <SummaryCards
            metrics={metrics}
            onFilterClick={handleSummaryFilterClick}
            activeFilter={activeSummaryFilter}
          />

          {/* Primary View Router */}
          {currentView === 'active_orders' && (
            <div className="space-y-6">
              <OrderTable
                orders={orders}
                filterState={filterState}
                onFilterChange={setFilterState}
                onSelectOrder={setSelectedOrder}
                onQuickConfirmKOT={handleQuickConfirmKOT}
                onAdvanceOrderStatus={handleAdvanceOrderStatus}
                currentTime={currentTime}
              />
            </div>
          )}

          {currentView === 'alerts_feed' && (
            <div className="space-y-6">
              <AlertPanel
                alerts={alerts}
                orders={orders}
                currentStaff={currentStaff}
                onAcknowledge={handleAcknowledgeAlert}
                onSnooze={handleSnoozeAlert}
                onResolve={handleResolveAlert}
                onSelectOrder={setSelectedOrder}
                currentTime={currentTime}
              />
            </div>
          )}

          {currentView === 'threshold_rules' && (
            <ThresholdRulesView
              settings={settings}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onTriggerSimulation={() => setIsSimulateModalOpen(true)}
            />
          )}

          {currentView === 'archive' && (
            <div className="space-y-6">
              <OrderTable
                orders={orders}
                filterState={{
                  ...filterState,
                  orderStatus: 'ALL',
                }}
                onFilterChange={setFilterState}
                onSelectOrder={setSelectedOrder}
                onQuickConfirmKOT={handleQuickConfirmKOT}
                onAdvanceOrderStatus={handleAdvanceOrderStatus}
                currentTime={currentTime}
              />
            </div>
          )}

          {currentView === 'ewity_integration' && (
            <EwityIntegrationView
              connectionInfo={ewityInfo}
              onRefreshStatus={fetchEwityStatus}
              onConnect={handleConnectEwity}
              onDisconnect={handleDisconnectEwity}
              onReconcile={handleReconcileEwity}
            />
          )}
        </main>
      </div>

      {/* 3. Interactive Modals */}
      <OrderDetailsModal
        order={selectedOrder}
        alerts={alerts}
        currentStaff={currentStaff}
        onClose={() => setSelectedOrder(null)}
        onConfirmKOT={handleQuickConfirmKOT}
        onAdvanceStatus={handleAdvanceOrderStatus}
        onResolveAlert={handleResolveAlert}
        currentTime={currentTime}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />

      <SimulateOrderModal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        onSimulateOrder={handleSimulateOrder}
      />

      {/* 4. Live Toast Alerts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
