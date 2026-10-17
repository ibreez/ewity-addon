/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../services/alertManager';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isUrgent = toast.severity === 'urgent';
        const isWarning = toast.severity === 'warning';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-xl flex items-start justify-between gap-3 animate-in slide-in-from-bottom-3 duration-200 ${
              isUrgent
                ? 'bg-red-900 text-white border-red-700'
                : isWarning
                ? 'bg-amber-900 text-white border-amber-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {isUrgent || isWarning ? (
                  <AlertTriangle className="w-4 h-4 text-amber-300" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-300" />
                )}
              </div>
              <div>
                <h5 className="font-bold text-xs leading-none">{toast.title}</h5>
                <p className="text-[11px] mt-1 text-slate-200 leading-snug">
                  {toast.message}
                </p>
              </div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white shrink-0 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
