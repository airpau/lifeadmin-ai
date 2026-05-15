'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Send,
  MessageSquare,
} from 'lucide-react';
import AdminPage from '@/components/admin/AdminPage';

interface SidRow {
  template_name: string;
  sid: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'paused' | 'unknown';
  category: string;
  language: string;
  submitted_at: string;
  approved_at: string | null;
  last_status_check_at: string | null;
  last_error: string | null;
}

interface RegistryEntry {
  name: string;
  fallback_sid: string;
  category: string;
  is_pending_resubmission: boolean;
}

interface SessionRow {
  user_id: string;
  whatsapp_phone: string;
  display_name: string | null;
  email: string | null;
  opted_in_at: string | null;
  last_message_at: string | null;
  is_active: boolean;
}

interface DispatchOutcomeRow {
  id: string;
  created_at: string;
  category: 'whatsapp_dispatch_ok' | 'whatsapp_dispatch_failed';
  title: string | null;
  user_id: string | null;
  alert_type: string | null;
  template_name: string | null;
  error: string | null;
  provider_message_id: string | null;
}

interface TemplateSendRow {
  id: string;
  created_at: string;
  whatsapp_phone: string | null;
  template_name: string | null;
  provider_message_id: string | null;
  user_id: string | null;
}

interface TestBriefResponse {
  ok: boolean;
  status: 'sent' | 'skipped' | 'error';
  reason?: string;
  channel?: 'in_window' | 'template';
  providerMessageId?: string;
}

function StatusPill({ status }: { status: SidRow['approval_status'] }) {
  const map: Record<SidRow['approval_status'], { cls: string; label: string; Icon: typeof CheckCircle }> = {
    approved: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Approved', Icon: CheckCircle },
    rejected: { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Rejected', Icon: AlertTriangle },
    paused: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Paused', Icon: AlertTriangle },
    pending: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Pending', Icon: Clock },
    unknown: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', label: 'Unknown', Icon: Clock },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${m.cls}`}>
      <m.Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

function fmtDateTime(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-GB');
  } catch {
    return s;
  }
}

function timeSince(s: string | null): { label: string; tone: 'green' | 'amber' | 'red' | 'slate' } {
  if (!s) return { label: 'never', tone: 'slate' };
  const ms = Date.now() - new Date(s).getTime();
  if (Number.isNaN(ms)) return { label: 'invalid', tone: 'slate' };
  const hrs = ms / (1000 * 60 * 60);
  if (hrs < 1) {
    const mins = Math.max(1, Math.round(ms / (1000 * 60)));
    return { label: `${mins}m ago`, tone: 'green' };
  }
  if (hrs < 24) {
    return { label: `${Math.round(hrs)}h ago`, tone: 'green' };
  }
  if (hrs < 48) {
    return { label: `${Math.round(hrs)}h ago`, tone: 'amber' };
  }
  const days = Math.round(hrs / 24);
  return { label: `${days}d ago`, tone: 'red' };
}

function ToneBadge({ label, tone }: { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }) {
  const cls = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  }[tone];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function WhatsAppTemplatesAdminPage() {
  const [rows, setRows] = useState<SidRow[]>([]);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'resubmit' | 'refresh' | 'testbrief' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // New state for the dispatch-visibility panels.
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [dispatchOutcomes, setDispatchOutcomes] = useState<DispatchOutcomeRow[]>([]);
  const [templateSends, setTemplateSends] = useState<TemplateSendRow[]>([]);
  const [stateLoading, setStateLoading] = useState(true);

  // Test-send brief state.
  const [testResult, setTestResult] = useState<TestBriefResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testDetailsOpen, setTestDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/whatsapp/templates', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
        setRegistry(data.registry ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadState = useCallback(async () => {
    setStateLoading(true);
    try {
      const res = await fetch('/api/admin/whatsapp/state', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
        setDispatchOutcomes(data.dispatchOutcomes ?? []);
        setTemplateSends(data.templateSends ?? []);
      }
    } finally {
      setStateLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadState();
  }, [load, loadState]);

  const onResubmit = async () => {
    if (busy) return;
    if (!confirm('Resubmit all PENDING_RESUBMISSION + previously-rejected templates to Meta via Twilio? This creates new Content SIDs.')) return;
    setBusy('resubmit');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/whatsapp/resubmit-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Failed: ${data.error ?? res.status}`);
      } else {
        const rejectedNote = data.resubmittedRejected
          ? ` (incl. ${data.resubmittedRejected} previously-rejected)`
          : '';
        setMessage(`Submitted ${data.submitted?.length ?? 0}, failed ${data.failed?.length ?? 0}${rejectedNote}.`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const onRefresh = async () => {
    if (busy) return;
    setBusy('refresh');
    setMessage(null);
    try {
      const res = await fetch('/api/cron/whatsapp-template-status', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Failed: ${data.error ?? res.status}`);
      } else {
        setMessage(`Checked ${data.checked ?? 0}, status changes: ${data.updated?.length ?? 0}.`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const onSendTestBrief = async () => {
    if (busy) return;
    setBusy('testbrief');
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch('/api/admin/whatsapp/send-test-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as TestBriefResponse & { error?: string };
      if (!res.ok) {
        setTestError(data.error ?? data.reason ?? `HTTP ${res.status}`);
        setTestResult(data as TestBriefResponse);
      } else {
        setTestResult(data);
      }
      // Refresh dispatch panel so the founder sees the new outcome row.
      await loadState();
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const byName = new Map(rows.map((r) => [r.template_name, r]));

  return (
    <AdminPage
      title="WhatsApp templates"
      description="Server-side resubmit + daily Meta status poll. The dispatch path skips templates whose status is not approved."
      actions={
        <>
          <button
            onClick={onResubmit}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            {busy === 'resubmit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Resubmit pending
          </button>
          <button
            onClick={onRefresh}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200"
          >
            {busy === 'refresh' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh status
          </button>
        </>
      }
    >
      {message && (
        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">{message}</div>
      )}

      {/* ────── Section A: Session health ────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Session health</h2>
          <span className="text-xs text-slate-500">
            Active WhatsApp Pocket Agent sessions. Green = inside the 24h customer-service window.
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Phone</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Display name</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Opted in</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Last inbound</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Window</th>
              </tr>
            </thead>
            <tbody>
              {stateLoading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
              )}
              {!stateLoading && sessions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No active WhatsApp sessions.</td></tr>
              )}
              {!stateLoading && sessions.map((s) => {
                const ts = timeSince(s.last_message_at);
                return (
                  <tr key={s.user_id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{s.whatsapp_phone}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {s.display_name ?? <span className="text-slate-400">—</span>}
                      {s.email && <div className="text-xs text-slate-500">{s.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtDateTime(s.opted_in_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtDateTime(s.last_message_at)}</td>
                    <td className="px-4 py-3"><ToneBadge label={ts.label} tone={ts.tone} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ────── Section B: Test-send button ────── */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">Send test brief to me now</h2>
            <p className="text-xs text-slate-500 mt-1">
              Fires the per-user morning-brief dispatch for your account. Smoke-tests the full WhatsApp send path
              without waiting for the 7:30am cron.
            </p>
          </div>
          <button
            onClick={onSendTestBrief}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            {busy === 'testbrief' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send test brief to me now
          </button>
        </div>
        {(testResult || testError) && (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {testResult?.status === 'sent' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium">
                  <CheckCircle className="w-3 h-3" /> sent
                </span>
              )}
              {testResult?.status === 'skipped' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 text-xs font-medium">
                  <Clock className="w-3 h-3" /> skipped
                </span>
              )}
              {(testResult?.status === 'error' || testError) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 text-xs font-medium">
                  <AlertTriangle className="w-3 h-3" /> error
                </span>
              )}
              {testResult?.channel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200 text-xs font-medium">
                  <MessageSquare className="w-3 h-3" /> {testResult.channel === 'in_window' ? 'in-window text' : 'template'}
                </span>
              )}
              {testResult?.reason && (
                <span className="text-xs text-slate-600">{testResult.reason}</span>
              )}
              {testError && !testResult?.reason && (
                <span className="text-xs text-rose-700">{testError}</span>
              )}
            </div>
            <details
              open={testDetailsOpen}
              onToggle={(e) => setTestDetailsOpen((e.target as HTMLDetailsElement).open)}
              className="text-xs"
            >
              <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
                Full response JSON
              </summary>
              <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto font-mono text-xs">
                {JSON.stringify(testResult ?? { error: testError }, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* ────── Section C: Recent dispatch outcomes ────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Recent dispatch outcomes (last 50)</h2>
          <span className="text-xs text-slate-500">
            From <code className="font-mono text-[11px]">business_log</code> categories whatsapp_dispatch_ok / _failed.
            Empty = dispatcher not being called.
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Time</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Status</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Template</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Alert type</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Error</th>
              </tr>
            </thead>
            <tbody>
              {stateLoading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
              )}
              {!stateLoading && dispatchOutcomes.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No dispatch outcomes logged. The dispatcher may not be firing — check Vercel cron logs.
                </td></tr>
              )}
              {!stateLoading && dispatchOutcomes.map((o) => {
                const okCls = o.category === 'whatsapp_dispatch_ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200';
                const okLabel = o.category === 'whatsapp_dispatch_ok' ? 'ok' : 'failed';
                return (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${okCls}`}>{okLabel}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{o.template_name ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{o.alert_type ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-rose-700 max-w-[420px] truncate" title={o.error ?? ''}>
                      {o.error ? o.error.slice(0, 200) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ────── Section D: Recent template sends ────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Recent template sends (last 50)</h2>
          <span className="text-xs text-slate-500">
            <code className="font-mono text-[11px]">whatsapp_message_log</code> outbound + message_type=template.
            Confirms what landed.
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Time</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Phone</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Template</th>
                <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Provider message ID</th>
              </tr>
            </thead>
            <tbody>
              {stateLoading && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
              )}
              {!stateLoading && templateSends.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No template sends logged.</td></tr>
              )}
              {!stateLoading && templateSends.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{t.whatsapp_phone ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{t.template_name ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{t.provider_message_id ?? <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ────── Existing Resubmit panel (unchanged layout) ────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Template</th>
              <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Live SID</th>
              <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Status</th>
              <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Last check</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {!loading && registry.map((r) => {
              const live = byName.get(r.name);
              const sidDisplay = live?.sid ?? (r.is_pending_resubmission ? '— (pending resubmission)' : r.fallback_sid);
              const status: SidRow['approval_status'] = live?.approval_status
                ?? (r.is_pending_resubmission ? 'pending' : 'approved');
              return (
                <tr key={r.name} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-slate-800">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{sidDisplay}</td>
                  <td className="px-4 py-3"><StatusPill status={status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {live?.last_status_check_at ? new Date(live.last_status_check_at).toLocaleString('en-GB') : '—'}
                    {live?.last_error && (
                      <div className="text-rose-600 mt-1">{live.last_error}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
