/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  Clock,
  Printer,
  ShoppingBag,
  Zap,
  Sparkles,
} from 'lucide-react';
import { OrderSimulationPreset } from '../services/mockOrderService';

interface SimulateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulateOrder: (preset: OrderSimulationPreset) => void;
}

export const SimulateOrderModal: React.FC<SimulateOrderModalProps> = ({
  isOpen,
  onClose,
  onSimulateOrder,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<OrderSimulationPreset>('kot_timeout_test');

  if (!isOpen) return null;

  const presets: {
    id: OrderSimulationPreset;
    title: string;
    badge: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }[] = [
    {
      id: 'kot_timeout_test',
      title: 'KOT Confirmation Timeout Scenario',
      badge: 'Unconfirmed Receipt',
      description: 'Generates an active order placed 75s ago whose KOT has not been acknowledged by the kitchen printer. Triggers a "KOT not confirmed" warning.',
      icon: <Printer className="w-4 h-4" />,
      color: 'border-amber-300 bg-amber-50/50 hover:bg-amber-50 text-amber-900',
    },
    {
      id: 'overdue_kitchen_test',
      title: 'Kitchen Overdue Prep Delay Scenario',
      badge: 'Past SLA (>15m)',
      description: 'Generates an active order created 16 minutes ago that has exceeded the kitchen SLA completion threshold. Triggers an urgent preparation delay alert.',
      icon: <Clock className="w-4 h-4" />,
      color: 'border-red-300 bg-red-50/50 hover:bg-red-50 text-red-900',
    },
    {
      id: 'normal_dinein',
      title: 'Standard Nominal Dine-In Order',
      badge: 'Table Service',
      description: 'Places a fresh dine-in order right now. Watch it count elapsed time from 00:00 and observe KOT countdown.',
      icon: <Sparkles className="w-4 h-4" />,
      color: 'border-slate-200 hover:border-slate-300 bg-white text-slate-800',
    },
    {
      id: 'online_delivery',
      title: 'Online Delivery Order (Aggregator)',
      badge: 'Online Channel',
      description: 'Places an incoming online order with delivery packaging requirements and auto-generated items.',
      icon: <ShoppingBag className="w-4 h-4" />,
      color: 'border-slate-200 hover:border-slate-300 bg-white text-slate-800',
    },
    {
      id: 'rush_takeaway',
      title: 'Rush Takeaway Counter Order',
      badge: 'Takeaway Express',
      description: 'Creates a quick counter takeaway with confirmed KOT directly in the kitchen prep queue.',
      icon: <Zap className="w-4 h-4" />,
      color: 'border-slate-200 hover:border-slate-300 bg-white text-slate-800',
    },
  ];

  const handleSimulate = () => {
    onSimulateOrder(selectedPreset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-600 text-white">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Simulate Incoming Order
              </h3>
              <p className="text-xs text-slate-500">
                Inject test order scenarios to verify Watchdog alerting rules
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

        {/* Preset Selector */}
        <div className="p-6 space-y-3 max-h-[65vh] overflow-y-auto">
          {presets.map((preset) => (
            <div
              key={preset.id}
              onClick={() => setSelectedPreset(preset.id)}
              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                preset.color
              } ${
                selectedPreset === preset.id
                  ? 'ring-2 ring-slate-900 shadow-xs'
                  : 'shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-900">
                  {preset.icon}
                  <span>{preset.title}</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-700">
                  {preset.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
                {preset.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSimulate}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg transition-colors shadow-xs"
          >
            Inject Simulated Order
          </button>
        </div>
      </div>
    </div>
  );
};
