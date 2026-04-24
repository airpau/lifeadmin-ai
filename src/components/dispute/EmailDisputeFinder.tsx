'use client';

/**
 * Two-step modal: pick an email from the user's connected inbox(es)
 * → add user context + desired outcome → fire `/api/disputes/from-email`
 * which extracts facts via AI, creates the dispute, links the thread
 * for Watchdog monitoring, and drafts the complaint letter.
 *
 * Used as the "From an email" entry point on the New Dispute flow.
 */

import { useEffect, useState } from 'react';
import {
  X, Loader2, Mail, ArrowLeft, ArrowRight, Search, Sparkles, Inbox, AlertCircle, Check,
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
  const [selected, setSelected] = useState<BrowsedThread | null>(null);
  const [userContext, setUserContext] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [creating, setCreating] = useState(false);
  const [hasNoEmail, setHasNoEmail] = useState(false);

  const fetchThreads = async (q?: string) => {
    setLoading(true);
    setError(null);
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
              {step === 'context' && 'Add a bit of context'}
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
                      placeholder="Search subject or sender (e.g. Broxbourne, parking, energy)"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg px-3 py-2">Search</button>
                </form>

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
                  <p className="text-sm text-slate-500 italic text-center py-8">No threads found in the last 90 days. Try a different search term.</p>
                )}

                <ul className="space-y-2">
                  {threads.map((t) => {
                    const date = new Date(t.latestDate);
                    return (
                      <li key={`${t.connectionId}:${t.threadId}`}>
                        <button
                          onClick={() => { setSelected(t); setStep('context'); }}
                          className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-semibold text-slate-900 line-clamp-1 flex-1">{t.subject}</p>
                            <span className="text-xs text-slate-500 flex-shrink-0">
                              {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mb-1">
                            {t.senderName} <span className="text-slate-400">·</span> <span className="text-slate-500">{t.senderAddress}</span>
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-2">{t.snippet}</p>
                          {t.messageCount > 1 && (
                            <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {t.messageCount} messages
                            </span>
                          )}
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
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Selected email</p>
              <p className="text-sm font-semibold text-slate-900 mb-1">{selected.subject}</p>
              <p className="text-xs text-slate-600">{selected.senderName} · {selected.senderAddress}</p>
              <button onClick={() => { setSelected(null); setStep('pick'); }} className="text-xs text-emerald-700 hover:underline mt-2 inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Pick a different email
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">What\'s your side of the story?</label>
              <p className="text-xs text-slate-500 mb-2">Tell us what actually happened — anything the company doesn\'t know yet, or where they\'ve got the facts wrong.</p>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                rows={5}
                placeholder="e.g. The parking ticket was issued at 14:03 but I have proof I left at 13:55 — I was there for 8 minutes only and the signage was obscured by a delivery van."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">What outcome do you want?</label>
              <p className="text-xs text-slate-500 mb-2">Be specific — refund of £X, cancel without penalty, write off the debt, etc.</p>
              <textarea
                value={desiredOutcome}
                onChange={(e) => setDesiredOutcome(e.target.value)}
                rows={3}
                placeholder="e.g. Cancel the parking charge in full and confirm in writing it won\'t escalate to debt recovery."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-900">
                We\'ll read the email, combine it with your context, and write a complaint letter that cites the exact UK consumer law that protects you. We\'ll also start watching the email thread — when the company replies you\'ll get a notification.
              </p>
            </div>

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
            <p className="text-xs text-slate-500 max-w-xs">Reading the thread, extracting the key facts, and drafting a legally-grounded reply. About 20 seconds.</p>
          </div>
        )}
      </div>
    </div>
  );
}
