'use client';

/**
 * WatchdogCard
 *
 * Sits on the dispute detail page between the progress tracker and the
 * provider info. Lets the user:
 *   1. Link an email thread to the dispute so supplier replies auto-import.
 *   2. Manually trigger a sync ("Check for replies now").
 *   3. Unlink or relink if we picked the wrong thread.
 *
 * Calls the API routes we built in src/app/api/disputes/[id]/:
 *   - GET  suggest-threads       -> top 3 candidates
 *   - POST link-email-thread     -> write the link, seed history
 *   - POST sync-replies-now      -> pull any new messages
 *   - DELETE link-email-thread   -> soft-unlink (sync_enabled=false)
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Link2, RefreshCw, CheckCircle2, AlertCircle, X, Search, Sparkles } from 'lucide-react';

interface LinkedThread {
  id: string;
  email_connection_id: string | null;
  provider: 'gmail' | 'outlook' | 'imap';
  thread_id: string;
  subject: string | null;
  sender_domain: string | null;
  sender_address: string | null;
  last_synced_at: string | null;
  last_message_date: string | null;
  sync_enabled: boolean;
}

interface Candidate {
  connectionId: string;
  provider: 'gmail' | 'outlook' | 'imap';
  threadId: string;
  subject: string;
  senderAddress: string;
  senderDomain: string;
  latestDate: string;
  messageCount: number;
  snippet: string;
  confidence: number;
  reason: string;
}

interface EmailConnectionSummary {
  id: string;
  email_address: string;
  provider_type: string;
  status: string;
}

interface Props {
  disputeId: string;
  providerName: string;
  /** Called when a link/sync/unlink mutation happens so the parent can refetch. */
  onChanged?: () => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso);
  const diff = Date.now() - t.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function WatchdogCard({ disputeId, providerName, onChanged }: Props) {
  const [linked, setLinked] = useState<LinkedThread | null>(null);
  const [loadingLinked, setLoadingLinked] = useState(true);

  const [emailConnections, setEmailConnections] = useState<EmailConnectionSummary[] | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [needsEmailConnection, setNeedsEmailConnection] = useState(false);
  const [searchErrors, setSearchErrors] = useState<Array<{ connectionId: string; message: string }>>([]);

  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadLinked = useCallback(async () => {
    setLoadingLinked(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/link-email-thread`, { cache: 'no-store' });
      if (res.status === 404) {
        setLinked(null);
      } else if (res.ok) {
        const data = await res.json();
        setLinked(data.link ?? null);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingLinked(false);
    }
  }, [disputeId]);

  const loadEmailConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/email/connections', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setEmailConnections(data.connections ?? []);
      } else {
        setEmailConnections([]);
      }
    } catch {
      setEmailConnections([]);
    }
  }, []);

  useEffect(() => {
    loadLinked();
    loadEmailConnections();
  }, [loadLinked, loadEmailConnections]);

  const hasActiveEmail =
    emailConnections === null
      ? null
      : emailConnections.some((c) => c.status === 'active');
  const hasStaleEmail =
    emailConnections !== null &&
    emailConnections.some((c) => c.status === 'needs_reauth' || c.status === 'expired');

  // When a thread is linked, find the specific connection backing it so we can
  // surface a reconnect CTA if that connection's tokens have died. Falls back
  // to any same-provider connection when the link is older than the
  // email_connection_id column (best-effort for older rows).
  const linkedConnection =
    linked && emailConnections
      ? emailConnections.find((c) => c.id === linked.email_connection_id) ??
        emailConnections.find((c) => c.provider_type === linked.provider)
      : null;
  const linkedConnectionStale =
    !!linkedConnection && linkedConnection.status !== 'active';

  const openPicker = async () => {
    setPickerOpen(true);
    setCandidates(null);
    setCandidatesError(null);
    setNeedsEmailConnection(false);
    setSearchErrors([]);
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/suggest-threads`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'no_email_connection') {
          setNeedsEmailConnection(true);
          setCandidatesError(data.message ?? 'Connect an email account first.');
        } else {
          setCandidatesError(data.error ?? 'Failed to find thread candidates');
        }
        setCandidates([]);
        return;
      }
      if (data.error === 'no_email_connection') {
        setNeedsEmailConnection(true);
        setCandidatesError(data.message ?? 'Connect an email account first.');
        setCandidates([]);
        return;
      }
      setCandidates(data.candidates ?? []);
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setSearchErrors(data.errors);
      }
    } catch (e) {
      setCandidatesError(e instanceof Error ? e.message : 'Something went wrong');
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const pickCandidate = async (c: Candidate) => {
    setLinking(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/link-email-thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: c.connectionId,
          provider: c.provider,
          threadId: c.threadId,
          subject: c.subject,
          senderAddress: c.senderAddress,
          senderDomain: c.senderDomain,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          setMessage({
            kind: 'err',
            text: data.message ?? 'You have reached your plan limit for linked threads.',
          });
        } else {
          setMessage({ kind: 'err', text: data.error ?? 'Failed to link thread' });
        }
        return;
      }
      setPickerOpen(false);
      setMessage({
        kind: 'ok',
        text: `Linked. Imported ${data.imported ?? 0} past message${
          (data.imported ?? 0) === 1 ? '' : 's'
        }.`,
      });
      await loadLinked();
      onChanged?.();
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setLinking(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/sync-replies-now`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error ?? 'Sync failed' });
        return;
      }
      const n = data.imported ?? 0;
      setMessage({
        kind: 'ok',
        text: n === 0 ? 'No new replies yet.' : `Imported ${n} new repl${n === 1 ? 'y' : 'ies'}.`,
      });
      await loadLinked();
      onChanged?.();
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setSyncing(false);
    }
  };

  const unlink = async () => {
    if (!confirm('Stop watching this email thread? Imported replies will stay in the timeline.')) return;
    try {
      await fetch(`/api/disputes/${disputeId}/link-email-thread`, { method: 'DELETE' });
      setLinked(null);
      setMessage({ kind: 'ok', text: 'Unlinked. No new replies will be auto-imported.' });
      onChanged?.();
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Something went wrong' });
    }
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-mint-400/10 text-mint-400 flex items-center justify-center">
              <Mail className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              Watchdog <span className="text-slate-500">— email reply sync</span>
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-9">
            We'll watch your inbox for replies from {providerName} and drop them into the timeline automatically.
          </p>
        </div>
      </div>

      {loadingLinked ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking link status…
        </div>
      ) : linked ? (
        <>
          {linkedConnectionStale && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300">
                  {linked.provider === 'gmail'
                    ? 'Gmail'
                    : linked.provider === 'outlook'
                    ? 'Outlook'
                    : 'Email'}{' '}
                  needs reconnecting
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  We can't fetch new replies until the connection is restored. Replies sent since then will import automatically once you reconnect.
                </p>
                <a
                  href="/dashboard/profile"
                  className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold rounded-md text-xs transition-colors"
                >
                  <Link2 className="h-3.5 w-3.5" /> Reconnect in Profile
                </a>
              </div>
            </div>
          )}
          <div className="bg-white rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs uppercase tracking-wide text-mint-400 font-semibold">
                Linked thread
              </span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                {linked.provider}
              </span>
            </div>
            <p className="text-sm text-slate-900 truncate" title={linked.subject ?? ''}>
              {linked.subject || '(no subject)'}
            </p>
            {linked.sender_address && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">from {linked.sender_address}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
              <span>Last checked {fmtDate(linked.last_synced_at)}</span>
              {linked.last_message_date && (
                <span>· Last reply {fmtDate(linked.last_message_date)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg text-sm transition-all disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Check for replies now
            </button>
            <button
              type="button"
              onClick={openPicker}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-100 text-slate-700 rounded-lg text-sm transition-all"
            >
              <Link2 className="h-4 w-4" /> Relink different thread
            </button>
            <button
              type="button"
              onClick={unlink}
              className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-red-400 rounded-lg text-sm transition-colors"
            >
              Stop watching
            </button>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-mint-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">
                Link an email thread so we can auto-import {providerName}'s replies.
              </p>
            </div>
            <button
              type="button"
              onClick={openPicker}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg text-sm transition-all flex-shrink-0"
            >
              <Search className="h-4 w-4" /> Find thread
            </button>
          </div>
          {hasActiveEmail === false && (
            <p className="text-[11px] text-slate-500 mt-3 ml-6">
              No email connected yet?{' '}
              <a href="/dashboard/profile" className="text-mint-400 hover:text-mint-300 underline underline-offset-2">
                Add Gmail or Outlook in Profile
              </a>{' '}
              first.
            </p>
          )}
          {hasActiveEmail === true && hasStaleEmail && (
            <p className="text-[11px] text-amber-400 mt-3 ml-6">
              One of your email accounts needs re-authorising in{' '}
              <a href="/dashboard/profile" className="underline underline-offset-2">
                Profile
              </a>
              .
            </p>
          )}
          {hasActiveEmail === true && emailConnections && emailConnections.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-3 ml-6">
              Searching {emailConnections.filter((c) => c.status === 'active').length} connected email account
              {emailConnections.filter((c) => c.status === 'active').length === 1 ? '' : 's'}.
            </p>
          )}
        </div>
      )}

      {message && (
        <div
          className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
            message.kind === 'ok'
              ? 'bg-mint-400/10 text-mint-400 border border-mint-400/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {message.kind === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h4 className="text-base font-semibold text-slate-900">Pick the thread to watch</h4>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-slate-500 hover:text-slate-900 p-1"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {loadingCandidates ? (
                <div className="flex items-center gap-2 text-slate-500 py-10 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" /> Searching your inbox…
                </div>
              ) : candidatesError ? (
                needsEmailConnection ? (
                  <div className="bg-mint-400/10 border border-mint-400/20 rounded-lg p-4 text-sm">
                    <div className="flex items-start gap-2 mb-3">
                      <Mail className="h-4 w-4 text-mint-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-slate-900 mb-1">Connect an email first</p>
                        <p className="text-slate-500">
                          Watchdog needs to read your inbox to find replies from {providerName}. Connect Gmail or Outlook in your Profile — takes about 30 seconds.
                        </p>
                      </div>
                    </div>
                    <a
                      href="/dashboard/profile"
                      className="inline-flex items-center gap-2 px-3 py-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg text-sm transition-all"
                    >
                      <Link2 className="h-4 w-4" /> Go to Profile
                    </a>
                  </div>
                ) : (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-4 text-sm">
                    <p className="font-semibold mb-1">Can't search your inbox</p>
                    <p>{candidatesError}</p>
                  </div>
                )
              ) : !candidates || candidates.length === 0 ? (
                <div className="text-center py-10">
                  <Mail className="h-10 w-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-700 font-semibold mb-1">No matching threads found</p>
                  <p className="text-slate-500 text-sm">
                    We searched the last 365 days for mail mentioning {providerName}. If the thread
                    is older, forward the most recent message to yourself first, then try again.
                  </p>
                  {searchErrors.length > 0 && (
                    <div className="mt-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg p-3 text-left text-xs">
                      <p className="font-semibold mb-1">
                        {searchErrors.length === 1
                          ? 'One of your email accounts couldn\u2019t be searched:'
                          : `${searchErrors.length} of your email accounts couldn\u2019t be searched:`}
                      </p>
                      <ul className="list-disc ml-4 space-y-0.5">
                        {searchErrors.map((e, i) => (
                          <li key={i} className="break-all">{e.message}</li>
                        ))}
                      </ul>
                      <p className="mt-2">
                        Try{' '}
                        <a href="/dashboard/profile" className="underline">
                          re-connecting in Profile
                        </a>
                        .
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  {candidates.map((c) => (
                    <li key={`${c.provider}:${c.threadId}`}>
                      <button
                        type="button"
                        disabled={linking}
                        onClick={() => pickCandidate(c)}
                        className="w-full text-left bg-white hover:bg-slate-100 border border-slate-200 hover:border-mint-400/40 rounded-xl p-3 transition-all disabled:opacity-50 disabled:cursor-wait"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-slate-900 truncate" title={c.subject}>
                            {c.subject || '(no subject)'}
                          </p>
                          <span className="text-[10px] uppercase tracking-wide text-mint-400 font-semibold flex-shrink-0">
                            {Math.round(c.confidence * 100)}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">from {c.senderAddress}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.snippet}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-[10px] text-slate-500">
                            {c.messageCount} message{c.messageCount === 1 ? '' : 's'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            · {new Date(c.latestDate).toLocaleDateString('en-GB')}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate">· {c.reason}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {linking && (
              <div className="px-5 py-3 border-t border-slate-200 bg-white">
                <div className="flex items-center gap-2 text-mint-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing history… this can take a few seconds.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
