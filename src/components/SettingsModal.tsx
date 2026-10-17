/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Sliders,
  Volume2,
  Bell,
  Clock,
  Shield,
  RotateCcw,
  Check,
  Play,
  VolumeX,
} from 'lucide-react';
import { MonitoringSettings } from '../types';
import { playAlertSound } from '../utils/audio';
import { DEFAULT_MONITORING_SETTINGS } from '../services/mockOrderService';

interface SettingsModalProps {
  isOpen: boolean;
  settings: MonitoringSettings;
  onSave: (updated: MonitoringSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onSave,
  onClose,
}) => {
  const [formData, setFormData] = useState<MonitoringSettings>({ ...settings });
  const [testSoundState, setTestSoundState] = useState<string | null>(null);
  const [notifPermissionState, setNotifPermissionState] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  if (!isOpen) return null;

  const handleTestSound = (type: 'urgent' | 'warning') => {
    playAlertSound(type);
    setTestSoundState(`Played ${type} tone`);
    setTimeout(() => setTestSoundState(null), 2000);
  };

  const handleRequestNotifPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotifPermissionState(perm);
        if (perm === 'granted') {
          new Notification('Ewity Kitchen Watchdog', {
            body: 'Desktop notifications are successfully enabled for POS alerts.',
          });
          setFormData((prev) => ({ ...prev, desktopNotificationsEnabled: true }));
        }
      } catch {
        // Blocked in iframe
      }
    }
  };

  const handleResetDefaults = () => {
    setFormData({ ...DEFAULT_MONITORING_SETTINGS });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-900 text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Watchdog Configuration & Thresholds
              </h3>
              <p className="text-xs text-slate-500">
                Set operational SLA limits and alerting rules
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

        {/* Form Body */}
        <form onSubmit={handleFormSubmit}>
          <div className="p-6 space-y-5 text-xs max-h-[70vh] overflow-y-auto">
            {/* Global Monitoring Active Toggle */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900 block text-xs">
                  Active Real-Time Monitoring
                </span>
                <span className="text-slate-500 text-[11px]">
                  Enables Watchdog background evaluation of orders and KOT tickets
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.monitoringEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, monitoringEnabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
              </label>
            </div>

            {/* Threshold 1: KOT Confirmation Timeout */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-slate-800">
                  KOT Confirmation Timeout (Seconds)
                </label>
                <span className="font-mono font-bold text-amber-700 tabular-nums">
                  {formData.kotConfirmationTimeoutSec} seconds
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                If kitchen printer feedback isn't received within this duration, an unconfirmed receipt alert is triggered.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="15"
                  max="300"
                  step="5"
                  value={formData.kotConfirmationTimeoutSec}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      kotConfirmationTimeoutSec: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-600"
                />
                <input
                  type="number"
                  min="15"
                  max="300"
                  value={formData.kotConfirmationTimeoutSec}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      kotConfirmationTimeoutSec: Math.max(15, Number(e.target.value)),
                    })
                  }
                  className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-mono font-bold text-xs"
                />
              </div>
            </div>

            {/* Threshold 2: Order Completion Warning */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-slate-800">
                  Order Preparation Warning Threshold (Minutes)
                </label>
                <span className="font-mono font-bold text-amber-700 tabular-nums">
                  {formData.orderCompletionWarningMin} minutes
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Active orders remaining in preparation beyond this SLA are flagged as overdue.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="3"
                  max="45"
                  step="1"
                  value={formData.orderCompletionWarningMin}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      orderCompletionWarningMin: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-600"
                />
                <input
                  type="number"
                  min="3"
                  max="45"
                  value={formData.orderCompletionWarningMin}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      orderCompletionWarningMin: Math.max(3, Number(e.target.value)),
                    })
                  }
                  className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-mono font-bold text-xs"
                />
              </div>
            </div>

            {/* Threshold 3: Stalled Status Warning */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-slate-800">
                  Order Status Stalled in 'New' (Minutes)
                </label>
                <span className="font-mono font-bold text-amber-700 tabular-nums">
                  {formData.statusStalledWarningMin} minutes
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Flags incoming orders that haven't been accepted into kitchen line queue.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="1"
                  value={formData.statusStalledWarningMin}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      statusStalledWarningMin: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-600"
                />
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={formData.statusStalledWarningMin}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      statusStalledWarningMin: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-mono font-bold text-xs"
                />
              </div>
            </div>

            {/* Threshold 4: Alert Repeat Interval */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-slate-800">
                  Alert Snooze / Repeat Interval (Minutes)
                </label>
                <span className="font-mono font-bold text-slate-700 tabular-nums">
                  {formData.alertRepeatIntervalMin} minutes
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={formData.alertRepeatIntervalMin}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    alertRepeatIntervalMin: Number(e.target.value),
                  })
                }
                className="w-full accent-slate-800"
              />
            </div>

            {/* Sound & Notifications Section */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Auditory & Desktop Alerts
              </span>

              {/* Sound toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-slate-700" />
                  <div>
                    <span className="font-semibold text-slate-800 block">
                      Sound Chimes Enabled
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      Plays high-contrast chimes on new urgent and warning alerts
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestSound('urgent')}
                    className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-700"
                  >
                    Test Urgent
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestSound('warning')}
                    className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-700"
                  >
                    Test Warning
                  </button>

                  <label className="relative inline-flex items-center cursor-pointer ml-1">
                    <input
                      type="checkbox"
                      checked={formData.soundEnabled}
                      onChange={(e) =>
                        setFormData({ ...formData, soundEnabled: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
              </div>

              {testSoundState && (
                <div className="text-[11px] text-emerald-700 font-medium pl-1">
                  ✓ {testSoundState}
                </div>
              )}

              {/* Desktop notifications toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-slate-700" />
                  <div>
                    <span className="font-semibold text-slate-800 block">
                      Desktop System Notifications
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      Native OS notifications (ready for Windows Electron shell)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {notifPermissionState !== 'granted' && (
                    <button
                      type="button"
                      onClick={handleRequestNotifPermission}
                      className="px-2 py-1 text-[11px] font-medium bg-amber-100 border border-amber-300 text-amber-900 rounded hover:bg-amber-200"
                    >
                      Authorize
                    </button>
                  )}

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.desktopNotificationsEnabled}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          desktopNotificationsEnabled: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg transition-colors shadow-xs"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
