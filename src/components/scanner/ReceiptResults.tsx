'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Pencil, Check, Trash2, ExternalLink,
  CreditCard, AlertTriangle, Save, Loader2,
} from 'lucide-react';

interface LineItem {
  description: string;
  amount: number;
}

interface Receipt {
  id: string;
  image_url: string;
  provider_name: string | null;
  amount: number | null;
  receipt_date: string | null;
  receipt_type: string | null;
  extracted_data: Record<string, unknown> & {
    line_items?: LineItem[];
    reference_number?: string | null;
  };
}

interface ReceiptResultsProps {
  receipt: Receipt;
  onAction: (action: 'delete' | 'saved') => void;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  bill: { label: 'Bill', color: 'bg-blue-500/10 text-blue-400' },
  receipt: { label: 'Receipt', color: 'bg-mint-400/10 text-mint-400' },
  invoice: { label: 'Invoice', color: 'bg-purple-500/10 text-purple-400' },
  statement: { label: 'Statement', color: 'bg-orange-500/10 text-orange-400' },
};

export default function ReceiptResults({ receipt, onAction }: ReceiptResultsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [provider, setProvider] = useState(receipt.provider_name || '');
  const [amount, setAmount] = useState(receipt.amount?.toString() || '');
  const [date, setDate] = useState(receipt.receipt_date || '');
  const [receiptType, setReceiptType] = useState(receipt.receipt_type || 'receipt');

  const lineItems = (receipt.extracted_data?.line_items as LineItem[]) || [];
  const referenceNumber = (receipt.extracted_data?.reference_number as string) || null;
  const typeInfo = typeLabels[receiptType] || typeLabels.receipt;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/receipts?id=${receipt.id}`, { method: 'DELETE' });
      if (res.ok) {
        onAction('delete');
      }
    } catch {
      // Silently fail - user can retry
    }
    setDeleting(false);
  };

  const handleComplaint = () => {
    const params = new URLSearchParams();
    if (provider) params.set('company', provider);
    if (amount) params.set('amount', amount);
    params.set('issue', 'overcharge');
    router.push(`/dashboard/complaints?${params.toString()}`);
  };

  const handleAddSubscription = () => {
    const params = new URLSearchParams();
    if (provider) params.set('name', provider);
    if (amount) params.set('amount', amount);
    router.push(`/dashboard/subscriptions?${params.toString()}`);
  };

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Thumbnail */}
        <div className="shrink-0">
          {receipt.image_url ? (
            <a href={receipt.image_url} target="_blank" rel="noopener noreferrer" className="block">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-navy-800 border border-navy-700/50 relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receipt.image_url}
                  alt="Receipt"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ExternalLink className="h-4 w-4 text-white" />
                </div>
              </div>
            </a>
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-navy-800 border border-navy-700/50 flex items-center justify-center">
              <FileText className="h-8 w-8 text-slate-600" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {editing ? (
                <input
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="bg-navy-950 border border-navy-600 rounded-lg px-2 py-1 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mint-400/50 w-48"
                  placeholder="Provider name"
                />
              ) : (
                <h3 className="text-white font-semibold text-sm truncate">
                  {provider || 'Unknown Provider'}
                </h3>
              )}
              <span className={`text-xs px-2 py-0.5 rounded ${typeInfo.color}`}>
                {typeInfo.label}
              </span>
            </div>
            <button
              onClick={() => setEditing(!editing)}
              className="text-slate-500 hover:text-mint-400 transition-all shrink-0"
              title={editing ? 'Done editing' : 'Edit details'}
            >
              {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Amount</p>
              {editing ? (
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-navy-950 border border-navy-600 rounded px-2 py-0.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-mint-400/50"
                />
              ) : (
                <p className="text-white text-sm font-medium">
                  {amount ? `£${parseFloat(amount).toFixed(2)}` : 'N/A'}
                </p>
              )}
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Date</p>
              {editing ? (
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-navy-950 border border-navy-600 rounded px-2 py-0.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-mint-400/50"
                />
              ) : (
                <p className="text-white text-sm">
                  {date ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB') : 'N/A'}
                </p>
              )}
            </div>
            {referenceNumber && (
              <div>
                <p className="text-slate-500 text-xs mb-0.5">Reference</p>
                <p className="text-white text-sm truncate">{referenceNumber}</p>
              </div>
            )}
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="mb-3">
              <p className="text-slate-500 text-xs mb-1.5">Line Items</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {lineItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-navy-950/50 rounded px-2.5 py-1.5 text-xs">
                    <span className="text-slate-300 truncate mr-2">{item.description}</span>
                    <span className="text-white font-medium shrink-0">
                      £{typeof item.amount === 'number' ? item.amount.toFixed(2) : item.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleComplaint}
              className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Write Complaint About This Bill
            </button>
            <button
              onClick={handleAddSubscription}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Add to Subscriptions
            </button>
            <button
              onClick={() => onAction('saved')}
              className="flex items-center gap-1.5 bg-navy-700 hover:bg-navy-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            >
              <Save className="h-3.5 w-3.5" />
              Save Receipt
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs font-medium px-2 py-1.5 rounded-lg transition-all disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
