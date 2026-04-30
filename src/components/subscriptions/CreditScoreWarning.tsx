'use client';

import { AlertTriangle, X } from 'lucide-react';

interface CreditScoreWarningProps {
  open: boolean;
  onClose: () => void;
  productType: string;
  providerName: string;
  warningContent: string;
  onProceed: () => void;
}

export default function CreditScoreWarning({
  open,
  onClose,
  productType,
  providerName,
  warningContent,
  onProceed,
}: CreditScoreWarningProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border-2 border-amber-500/50 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 transition-all"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          {/* Warning header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-amber-500/10 w-10 h-10 rounded-xl flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Credit Score Warning</h2>
              <p className="text-amber-400 text-sm font-medium">{productType}</p>
            </div>
          </div>

          {/* Provider name */}
          <div className="bg-white rounded-lg px-4 py-3 mb-4 border border-slate-200">
            <p className="text-slate-500 text-xs mb-0.5">Provider</p>
            <p className="text-slate-900 font-semibold">{providerName}</p>
          </div>

          {/* Warning content */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-4">
            <p className="text-slate-700 text-sm leading-relaxed">{warningContent}</p>
          </div>

          {/* FCA disclaimer */}
          <p className="text-slate-500 text-xs mb-6">
            This is general information, not financial advice.
          </p>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-100 text-slate-900 py-3 rounded-lg transition-all font-medium text-sm"
            >
              Keep Subscription
            </button>
            <button
              onClick={onProceed}
              className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 py-3 rounded-lg transition-all font-medium text-sm"
            >
              Cancel Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
