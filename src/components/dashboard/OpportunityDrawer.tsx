'use client';

/**
 * OpportunityDrawer
 *
 * Bottom-sheet drawer opened when the user taps an email-scan opportunity
 * on the Overview page. Shows the opportunity details, a Claude-generated
 * "how to cancel" panel, and three actions: Track (add as subscription),
 * Dispute (open a new dispute auto-filled from the opportunity) and
 * Delete (soft-dismiss from the scan list).
 *
 * Callers pass in the selected opportunity; the drawer mutates on its own
 * and calls onActionComplete with the outcome so the parent can update
 * its local state optimistically.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, CreditCard, FileText, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  provider: string;
  amount: number;
  type: string;
  category: string;
  paymentFrequency: string | null;
  contractEndDate?: string | null;
  confidence?: number;
}

export type OpportunityAction = 'tracked' | 'disputed' | 'deleted';

interface Props {
  item: Opportunity | null;
  onClose: () => void;
  onActionComplete: (id: string, action: OpportunityAction) => void;
}

function billingCycleFromFrequency(freq: string | null): 'monthly' | 'quarterly' | 'yearly' {
  const f = (freq || '').toLowerCase();
  if (f.includes('year') || f.includes('annual')) return 'yearly';
  if (f.includes('quarter')) return 'quarterly';
  return 'monthly';
}

function inferIssueType(item: Opportunity): string {
  const t = (item.type || '').toLowerCase();
  const d = `${item.description || ''} ${item.title || ''}`.toLowerCase();
  if (t.includes('price') || d.includes('price increase') || d.includes('hike')) return 'price_increase';
  if (t.includes('overcharge') || d.includes('overcharg')) return 'overcharge';
  if (t.includes('flight') || d.includes('flight') || d.includes('eu261')) return 'flight_compensation';
  if (t.includes('energy') || t.includes('utility') || d.includes('energy bill') || d.includes('gas') || d.includes('electric')) return 'energy_dispute';
  if (t.includes('broadband') || d.includes('broadband') || d.includes('internet')) return 'broadband_dispute';
  if (t.includes('debt') || d.includes('debt')) return 'debt_dispute';
  if (t.includes('refund') || d.includes('refund')) return 'refund_request';
  return 'complaint';
}

export default function OpportunityDrawer({ item, onClose, onActionComplete }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [advice, setAdvice] = useState<string[] | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | OpportunityAction>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Load cancellation advice as soon as the drawer opens.
  useEffect(() => {
    if (!item) {
      setAdvice(null);
      setAdviceError(null);
      setMessage(null);
      return;
    }
    const controller = new AbortController();
    setAdvice(null);
    setAdviceError(null);
    setAdviceLoading(true);
    fetch('/api/opportunities/cancellation-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: item.provider, description: item.description }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAdviceError(data.error ?? 'Could not load advice');
          return;
        }
        setAdvice(data.advice ?? []);
      })
      .catch((e) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        setAdviceError(e instanceof Error ? e.message : 'Network error');
      })
      .finally(() => {
        setAdviceLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [item]);

  if (!item) return null;

  const showError = (text: string) => setMessage({ kind: 'err', text });

  const handleTrack = async () => {
    if (!item) return;
    setBusy('tracked');
    setMessage(null);
    try {
      const subRes = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: item.provider,
          amount: item.amount || 0,
          billing_cycle: billingCycleFromFrequency(item.paymentFrequency),
          category: item.category || null,
          contract_end_date: item.contractEndDate || null,
          notes: item.description || null,
          source: 'email_scan',
        }),
      });
      if (!subRes.ok) {
        const data = await subRes.json().catch(() => ({}));
        showError(data.error ?? 'Failed to add subscription');
        return;
      }
      // Mark the opportunity actioned so it doesn't show up again on Overview.
      // The subscription row created above is the audit trail for what happened.
      await supabase
        .from('email_scan_findings')
        .update({ status: 'actioned' })
        .eq('id', item.id);
      onActionComplete(item.id, 'tracked');
      onClose();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const handleDispute = async () => {
    if (!item) return;
    setBusy('disputed');
    setMessage(null);
    try {
      const issueType = inferIssueType(item);
      const disputeRes = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: item.provider,
          issue_type: issueType,
          issue_summary: item.description || item.title || 'Dispute raised from email scan',
          disputed_amount: item.amount || null,
        }),
      });
      const dispute = await disputeRes.json().catch(() => null);
      if (!disputeRes.ok || !dispute?.id) {
        showError(dispute?.error ?? 'Failed to create dispute');
        return;
      }
      await supabase
        .from('email_scan_findings')
        .update({ status: 'actioned' })
        .eq('id', item.id);
      onActionComplete(item.id, 'disputed');
      router.push(`/dashboard/disputes/${dispute.id}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setBusy('deleted');
    setMessage(null);
    try {
      await supabase
        .from('email_scan_findings')
        .update({ status: 'dismissed' })
        .eq('id', item.id);
      onActionComplete(item.id, 'deleted');
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              {(item.type || 'opportunity').replace(/_/g, ' ')}
            </p>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5 break-words">
              {item.title}
            </h3>
            {item.provider && (
              <p className="text-xs text-slate-500 mt-1">
                {item.provider}
                {item.amount ? ` · £${Number(item.amount).toFixed(2)}` : ''}
                {item.paymentFrequency ? ` · ${item.paymentFrequency}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 p-1 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {item.description && (
            <p className="text-sm text-slate-700 leading-relaxed">{item.description}</p>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-mint-500" />
              <p className="text-sm font-semibold text-slate-900">How to cancel</p>
            </div>
            {adviceLoading && (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Looking up the fastest route…
              </p>
            )}
            {adviceError && (
              <p className="text-sm text-amber-700">
                Couldn&apos;t load advice ({adviceError}). You can still raise a dispute below — the AI letter will include cancellation guidance.
              </p>
            )}
            {advice && advice.length > 0 && (
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-700">
                {advice.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
          </div>

          {message && (
            <div
              className={`text-sm rounded-lg p-3 ${
                message.kind === 'ok'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 py-4 border-t border-slate-100 bg-white">
          <button
            onClick={handleTrack}
            disabled={busy !== null}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-mint-500 hover:bg-mint-600 text-white font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'tracked' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Track
          </button>
          <button
            onClick={handleDispute}
            disabled={busy !== null}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'disputed' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Dispute
          </button>
          <button
            onClick={handleDelete}
            disabled={busy !== null}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'deleted' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
