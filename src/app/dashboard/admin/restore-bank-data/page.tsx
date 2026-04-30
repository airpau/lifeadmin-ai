'use client';

/**
 * /dashboard/admin/restore-bank-data
 *
 * Support-agent screen for restoring a user's soft-deleted bank
 * transactions on their behalf. Mirror of the user-facing "Restore
 * data" button in Money Hub but routed through /api/admin/bank/restore
 * which gates on the admin email allowlist.
 *
 * Workflow:
 *   1. Paste the user's email — fetches their bank_connections (including
 *      revoked ones) so the agent can identify the right connection.
 *   2. Click Restore on the target row — calls the admin API which runs
 *      the same RPC as user self-serve, with an extra audit row tagging
 *      the admin who triggered it.
 *   3. Result toast tells the agent how many transactions came back.
 *
 * Soft-deleted rows older than 30 days are already gone (purged by the
 * daily 04:00 UTC cron) — those will return "0 restored". The audit
 * trail at bank_disconnect_audit shows the original deletion timestamp
 * so the agent can confirm whether recovery is still possible BEFORE
 * making the user any promises.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, RotateCcw, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface UserConnection {
  id: string;
  bank_name: string | null;
  provider: string | null;
  status: string;
  account_display_names: string[] | null;
  connected_at: string | null;
  updated_at: string | null;
  soft_deleted_count: number;
}

export default function AdminRestoreBankDataPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<Array<{
    mode: string; created_at: string; transactions_affected: number; bank_name: string | null;
  }>>([]);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  const lookup = async () => {
    setLoading(true);
    setError(null);
    setConnections([]);
    setUserId(null);
    setAuditLog([]);
    try {
      const supabase = createClient();
      // Find the user. Profiles table has email — service-role key gates
      // RLS but the admin email allowlist is enforced server-side too.
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('email', email.trim())
        .maybeSingle();
      if (profErr) throw new Error(profErr.message);
      if (!profile) {
        setError(`No user found with email ${email.trim()}`);
        return;
      }
      setUserId(profile.id);

      // Pull the user's bank connections AND a soft-deleted-count for each
      // so the agent can see at a glance what's recoverable. The count
      // query reads bank_transactions with deleted_at not null.
      const [connRes, txRes, auditRes] = await Promise.all([
        supabase
          .from('bank_connections')
          .select('id, bank_name, provider, status, account_display_names, connected_at, updated_at')
          .eq('user_id', profile.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('bank_transactions')
          .select('connection_id, deleted_at')
          .eq('user_id', profile.id)
          .not('deleted_at', 'is', null),
        supabase
          .from('bank_disconnect_audit')
          .select('mode, created_at, transactions_affected, bank_name')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const counts = new Map<string, number>();
      for (const tx of txRes.data || []) {
        if (!tx.connection_id) continue;
        counts.set(tx.connection_id, (counts.get(tx.connection_id) || 0) + 1);
      }
      const enriched: UserConnection[] = (connRes.data || []).map((c) => ({
        ...c,
        soft_deleted_count: counts.get(c.id) || 0,
      }));
      setConnections(enriched);
      setAuditLog(auditRes.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const restore = async (connectionId: string, bankName: string | null) => {
    if (!confirm(`Restore soft-deleted transactions for ${bankName || 'this bank'}?\n\nThis affects only rows deleted within the last 30 days. Older rows have been permanently purged.`)) return;
    setRestoringId(connectionId);
    try {
      const res = await fetch('/api/admin/bank/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserEmail: email.trim(), connectionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data?.error || 'Restore failed', kind: 'err' });
        return;
      }
      setToast({
        msg: `Restored ${data.transactionsRestored ?? 0} transactions on ${data.bankName || 'bank'}`,
        kind: 'ok',
      });
      // Re-run lookup to refresh counts + audit log so the agent sees the result
      await lookup();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Network error', kind: 'err' });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link href="/dashboard/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </Link>
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">Restore bank data</h1>
      <p className="text-sm text-slate-500 mb-6">
        Recover transactions a user soft-deleted via the disconnect modal&rsquo;s &quot;Stop syncing and delete the transactions&quot; option, within the 30-day recovery window. Older rows have been purged by the daily cron and cannot be recovered.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800 flex gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Audit:</strong> every restore writes to <code>bank_disconnect_audit</code> with your admin email and the user&rsquo;s id. This is checked during incident reviews — only restore when the user has explicitly asked.
        </div>
      </div>

      <div className="card mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">User email</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && email.trim() && void lookup()}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-emerald-500"
            placeholder="user@example.com"
            disabled={loading}
          />
          <button
            onClick={lookup}
            disabled={loading || !email.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Search className="h-3.5 w-3.5" />
            {loading ? 'Looking up…' : 'Lookup'}
          </button>
        </div>
        {error && <p className="text-xs text-rose-700 mt-2">{error}</p>}
      </div>

      {userId && (
        <>
          <div className="card mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Bank connections ({connections.length})</h2>
            {connections.length === 0 ? (
              <p className="text-xs text-slate-500">User has no bank connections.</p>
            ) : (
              <div className="space-y-2">
                {connections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-slate-50/40 rounded-lg p-3 gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {c.bank_name || 'Bank'} <span className="font-normal text-xs text-slate-500">· {c.provider}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Status: <span className={c.status === 'active' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>{c.status}</span>
                        {' · '}
                        {c.soft_deleted_count > 0
                          ? <span className="text-emerald-700 font-semibold">{c.soft_deleted_count} soft-deleted (recoverable)</span>
                          : <span className="text-slate-400">no soft-deleted rows</span>}
                      </p>
                      {c.account_display_names && c.account_display_names.length > 0 && (
                        <p className="text-[11px] text-slate-400">{c.account_display_names.join(' · ')}</p>
                      )}
                    </div>
                    <button
                      onClick={() => restore(c.id, c.bank_name)}
                      disabled={restoringId === c.id || c.soft_deleted_count === 0}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {restoringId === c.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {auditLog.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Disconnect / restore history</h2>
              <div className="space-y-1 text-xs">
                {auditLog.map((row, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-1 last:border-0">
                    <span className="text-slate-700">
                      <span className={`font-semibold ${row.mode === 'restore' ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {row.mode}
                      </span>
                      {' '}— {row.bank_name || '(unknown bank)'} · {row.transactions_affected} txns
                    </span>
                    <span className="text-slate-400">{new Date(row.created_at).toLocaleString('en-GB')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-semibold z-50 ${toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}
          onClick={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
