'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Loader2, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

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

export default function WhatsAppTemplatesAdminPage() {
  const [rows, setRows] = useState<SidRow[]>([]);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'resubmit' | 'refresh' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => { load(); }, [load]);

  const onResubmit = async () => {
    if (busy) return;
    if (!confirm('Resubmit all PENDING_RESUBMISSION templates to Meta via Twilio? This creates new Content SIDs.')) return;
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
        setMessage(`Submitted ${data.submitted?.length ?? 0}, failed ${data.failed?.length ?? 0}.`);
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

  const byName = new Map(rows.map((r) => [r.template_name, r]));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to admin
        </Link>
        <h1 className="text-2xl font-semibold mb-2">WhatsApp templates</h1>
        <p className="text-sm text-slate-400 mb-6">
          Server-side resubmit + daily Meta status poll. The dispatch path skips templates whose status is not <code>approved</code>.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={onResubmit}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-md text-sm"
          >
            {busy === 'resubmit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Resubmit pending
          </button>
          <button
            onClick={onRefresh}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-4 py-2 rounded-md text-sm border border-slate-700"
          >
            {busy === 'refresh' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh status
          </button>
        </div>

        {message && (
          <div className="mb-4 p-3 rounded-md border border-slate-700 bg-slate-900 text-sm">{message}</div>
        )}

        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">Template</th>
                <th className="text-left px-3 py-2">Live SID</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Last check</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
              )}
              {!loading && registry.map((r) => {
                const live = byName.get(r.name);
                const sidDisplay = live?.sid ?? (r.is_pending_resubmission ? '— (pending resubmission)' : r.fallback_sid);
                const status: SidRow['approval_status'] = live?.approval_status
                  ?? (r.is_pending_resubmission ? 'pending' : 'approved');
                return (
                  <tr key={r.name} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{sidDisplay}</td>
                    <td className="px-3 py-2"><StatusPill status={status} /></td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {live?.last_status_check_at ? new Date(live.last_status_check_at).toLocaleString('en-GB') : '—'}
                      {live?.last_error && (
                        <div className="text-rose-300 mt-1">{live.last_error}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
