'use client';

/**
 * Two-step modal: pick an email from the user's connected inbox(es)
 * → confirm what we read + add user context + desired outcome →
 * fire `/api/disputes/from-email` which creates the dispute, links
 * the thread for Watchdog monitoring, and drafts the complaint
 * letter.
 *
 * Step 2 pre-runs an AI extraction (`/api/disputes/from-email/preview`)
 * the moment a thread is selected so the user sees what we read
 * and can correct the company name + issue type if needed before
 * spending time on context.
 */

import { useEffect, useState } from 'react';
import {
  X, Loader2, Mail, ArrowLeft, ArrowRight, Search, Sparkles, Inbox, AlertCircle, Pencil, Check,
} from 'lucide-react';

interface BrowsedThread {
  connectionId: string;
  emailAddress: string;
  provider: 'gmail' | 'outlook';
  threadId: string;
  subject: string;
  senderName: string;
  senderAddress: string;
  senderDomain: string;
  latestDate: string;
  messageCount: number;
  snippet: string;
}

interface PreviewFacts {
  provider_name: string;
  account_number: string | null;
  disputed_amount: number | null;
  issue_type: string;
  issue_type_label: string;
  issue_summary: string;
  thread_summary: string;
  suggested_user_context: string;
  suggested_outcome: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  message_count: number;
}

const ISSUE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'complaint', label: 'General complaint' },
  { value: 'energy_dispute', label: 'Energy bill dispute' },
  { value: 'broadband_complaint', label: 'Broadband / mobile complaint' },
  { value: 'flight_compensation', label: 'Flight delay / cancellation' },
  { value: 'parking_appeal', label: 'Parking ticket appeal' },
  { value: 'debt_dispute', label: 'Debt dispute' },
  { value: 'refund_request', label: 'Refund request' },
  { value: 'hmrc_tax_rebate', label: 'HMRC tax issue' },
  { value: 'council_tax_band', label: 'Council tax / business rates' },
  { value: 'dvla_vehicle', label: 'DVLA / vehicle' },
  { value: 'nhs_complaint', label: 'NHS complaint' },
];

interface Props {
  onClose: () => void;
  onCreated: (disputeId: string) => void;
}

export default function EmailDisputeFinder({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<'pick' | 'context' | 'creating'>('pick');
  const [threads, setThreads] = useState<BrowsedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<BrowsedThread | null>(null);

  // Preview state — populated by /api/disputes/from-email/preview
  // when the user picks a thread.
  const [preview, setPreview] = useState<PreviewFacts | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // User-overridable fields (default to preview values, user can edit)
  const [providerName, setProviderName] = useState('');
  const [issueType, setIssueType] = useState('complaint');
  const [userContext, setUserContext] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [editingProvider, setEditingProvider] = useState(false);

  const [creating, setCreating] = useState(false);
  const [hasNoEmail, setHasNoEmail] = useState(false);

  const fetchThreads = async (q?: string) => {
    setLoading(true);
    setError(null);
    setSearched(!!q);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const res = await fetch(`/api/email/browse-disputable?${params.toString()}`, { credentials: 'include' });
      const d = await res.json();
      if (d.reason === 'no_email_connection') {
        setHasNoEmail(true);
        setThreads([]);
      } else {
        setThreads(d.threads ?? []);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchThreads(); }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchThreads(search.trim());
  };

  const pickThread = async (t: BrowsedThread) => {
    setSelected(t);
    setStep('context');
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    // Sensible defaults BEFORE the AI replies — the form is usable
    // immediately even if extraction is slow or fails.
    setProviderName(t.senderName || '');
    setIssueType('complaint');
    setUserContext('');
    setDesiredOutcome('');
    setEditingProvider(false);
    try {
      const res = await fetch('/api/disputes/from-email/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: t.connectionId, threadId: t.threadId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Preview failed (${res.status})`);
      setPreview(d as PreviewFacts);
      setProviderName(d.provider_name || t.senderName || '');
      setIssueType(d.issue_type || 'complaint');
      // Pre-fill suggested context only if the user hasn\'t typed anything.
      if (d.suggested_user_context) setUserContext(d.suggested_user_context);
      if (d.suggested_outcome) setDesiredOutcome(d.suggested_outcome);
    } catch (e: any) {
      setPreviewError(e?.message || 'Couldn\'t read the email');
    } finally {
      setPreviewLoading(false);
    }
  };

  const create = async () => {
    if (!selected) return;
    if (!userContext.trim() || !desiredOutcome.trim()) return;
    setCreating(true);
    setStep('creating');
    setError(null);
    try {
      const res = await fetch('/api/disputes/from-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: selected.connectionId,
          threadId: selected.threadId,
          userContext: userContext.trim(),
          desiredOutcome: desiredOutcome.trim(),
          providerOverride: providerName.trim() || undefined,
          issueTypeOverride: issueType,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      onCreated(d.dispute.id);
    } catch (e: any) {
      setError(e?.message || 'Failed to create dispute');
      setStep('context');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-900">
              {step === 'pick' && 'Pick an email to dispute'}
              {step === 'context' && 'Confirm and add your side'}
              {step === 'creating' && 'Creating your dispute…'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'pick' && (
          <div className="flex-1 overflow-y-auto p-4">
            {hasNoEmail ? (
              <div className="text-center py-12">
                <Mail className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-700 font-medium mb-1">No connected inbox</p>
                <p className="text-xs text-slate-500 mb-4">Connect Gmail or Outlook to find emails to dispute.</p>
                <a href="/dashboard/profile?section=accounts" className="inline-block bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg px-4 py-2">
                  Connect inbox
                </a>
              </div>
            ) : (
              <>
                <form onSubmit={onSearchSubmit} className="flex items-center gap-2 mb-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search subject, sender or body (e.g. ACI, parking, council)"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg px-3 py-2">Search</button>
                </form>
                <p className="text-[11px] text-slate-500 mb-3">
                  Showing recent threads from the last 180 days. Try a sender keyword if you don\'t see it — search runs across subject, sender, and email body.
                </p>

                {loading && (
                  <div className="py-12 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
                  </div>
                )}

                {!loading && error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {!loading && !error && threads.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-slate-500 italic mb-2">
                      {searched ? `Nothing matched "${search}" in the last 180 days.` : 'No threads found in the last 180 days.'}
                    </p>
                    {searched && (
                      <button
                        onClick={() => { setSearch(''); void fetchThreads(); }}
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        Show recent threads instead
                      </button>
                    )}
                  </div>
                )}

                <ul className="space-y-2">
                  {threads.map((t) => {
                    const date = new Date(t.latestDate);
                    return (
                      <li key={`${t.connectionId}:${t.threadId}`}>
                        <button
                          onClick={() => pickThread(t)}
                          className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-semibold text-slate-900 line-clamp-1 flex-1">{t.subject || '(no subject)'}</p>
                            <span className="text-xs text-slate-500 flex-shrink-0 whitespace-nowrap">
                              {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mb-1 truncate">
                            <span className="font-medium">{t.senderName}</span>
                            <span className="text-slate-400"> · </span>
                            <span className="text-slate-500">{t.senderAddress}</span>
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-2">{t.snippet}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {t.messageCount > 1 && (
                              <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                {t.messageCount} msgs
                              </span>
                            )}
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {t.provider}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {step === 'context' && selected && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Selected thread summary card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Selected email</p>
              <p className="text-sm font-semibold text-slate-900 mb-1 line-clamp-2">{selected.subject || '(no subject)'}</p>
              <p className="text-xs text-slate-600">{selected.senderName} · {selected.senderAddress}</p>
              <button onClick={() => { setSelected(null); setStep('pick'); }} className="text-xs text-emerald-700 hover:underline mt-2 inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Pick a different email
              </button>
            </div>

            {/* AI preview card */}
            {previewLoading && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-emerald-600 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-emerald-900">Reading the email…</p>
                  <p className="text-xs text-emerald-700">Pulling out the company name, amount and what they\'re asking.</p>
                </div>
              </div>
            )}

            {previewError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Couldn\'t auto-read this email</p>
                  <p className="text-xs">{previewError} — fill in the fields below manually.</p>
                </div>
              </div>
            )}

            {preview && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-700" />
                  <p className="text-sm font-semibold text-emerald-900">We read your email — here\'s what we got</p>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">{preview.thread_summary}</p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-emerald-700 mb-0.5">Company</p>
                    {editingProvider ? (
                      <input
                        autoFocus
                        value={providerName}
                        onChange={(e) => setProviderName(e.target.value)}
                        onBlur={() => setEditingProvider(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingProvider(false); }}
                        className="w-full text-sm font-semibold text-slate-900 bg-white border border-emerald-300 rounded px-2 py-0.5"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingProvider(true)}
                        className="text-sm font-semibold text-slate-900 hover:text-emerald-700 inline-flex items-center gap-1 group"
                      >
                        {providerName || 'Unknown'}
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                      </button>
                    )}
                  </div>
                  {preview.disputed_amount !== null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-700 mb-0.5">Amount</p>
                      <p className="text-sm font-semibold text-slate-900">£{preview.disputed_amount.toFixed(2)}</p>
                    </div>
                  )}
                  {preview.account_number && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-700 mb-0.5">Reference</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">{preview.account_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-emerald-700 mb-0.5">Type</p>
                    <select
                      value={issueType}
                      onChange={(e) => setIssueType(e.target.value)}
                      className="text-sm font-semibold text-slate-900 bg-white border border-emerald-300 rounded px-1.5 py-0.5 w-full"
                    >
                      {ISSUE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Your side of the story</label>
              <p className="text-xs text-slate-500 mb-2">
                {preview?.suggested_user_context
                  ? 'We\'ve made a guess — edit to add anything we missed (dates, evidence, what they got wrong).'
                  : 'Tell us what actually happened — anything the company doesn\'t know yet, or where they\'ve got the facts wrong.'}
              </p>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                rows={5}
                placeholder="e.g. The parking ticket was issued at 14:03 but I have proof I left at 13:55."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">What outcome do you want?</label>
              <p className="text-xs text-slate-500 mb-2">
                {preview?.suggested_outcome ? 'We\'ve guessed below — adjust if needed.' : 'Be specific — refund of £X, cancel without penalty, write off the debt.'}
              </p>
              <textarea
                value={desiredOutcome}
                onChange={(e) => setDesiredOutcome(e.target.value)}
                rows={3}
                placeholder="e.g. Cancel the charge and confirm in writing it won\'t escalate to debt recovery."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <button onClick={() => { setStep('pick'); }} className="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">
                Back
              </button>
              <button
                onClick={create}
                disabled={!userContext.trim() || !desiredOutcome.trim() || creating}
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2"
              >
                Generate response <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'creating' && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
            <p className="text-sm font-semibold text-slate-900 mb-1">Writing your dispute</p>
            <p className="text-xs text-slate-500 max-w-xs">Combining the email, your context and UK consumer law into a legally-grounded reply. About 20 seconds.</p>
          </div>
        )}
      </div>
    </div>
  );
}
