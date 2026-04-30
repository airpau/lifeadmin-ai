'use client';

import { useEffect, useState, useCallback } from 'react';

interface Lead {
  id: string;
  email: string;
  name: string | null;
  source: string;
  intended_tier: 'essential' | 'pro' | null;
  intended_billing_interval: 'monthly' | 'yearly' | null;
  funnel_stage: string;
  captured_at: string;
  last_emailed_at: string | null;
  email_count: number;
  discount_code: string | null;
  discount_coupon_id: string | null;
  discount_code_expires_at: string | null;
  discount_redeemed_at: string | null;
  converted_at: string | null;
  unsubscribed_at: string | null;
  notes: string | null;
}

interface Metrics {
  total_captured: number;
  captured_this_week: number;
  converted: number;
  recovery_rate: number;
  revenue_recovered_pounds: number;
  cost_per_lead_pounds: number;
  stage_counts: Record<string, number>;
}

interface EmailLog {
  id: string;
  template: string;
  subject: string | null;
  resend_message_id: string | null;
  sent_at: string;
}

const STAGES = [
  'new',
  'email_1_sent',
  'email_2_sent',
  'email_3_sent',
  'email_4_sent',
  'converted_paid',
  'converted_free',
  'unsubscribed',
  'expired',
  'manual_handling',
];
const SOURCES = ['signup_form', 'stripe_checkout_abandoned', 'pricing_page_exit', 'onboarding_dropoff'];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function stageColor(stage: string): string {
  switch (stage) {
    case 'converted_paid': return 'bg-emerald-100 text-emerald-700';
    case 'unsubscribed':   return 'bg-slate-200 text-slate-600';
    case 'expired':        return 'bg-slate-100 text-slate-500';
    case 'manual_handling':return 'bg-amber-100 text-amber-700';
    case 'new':            return 'bg-blue-100 text-blue-700';
    default:               return 'bg-indigo-100 text-indigo-700';
  }
}

export default function ConsumerLeadsClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drillIn, setDrillIn] = useState<{ lead: Lead; email_log: EmailLog[] } | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stageFilter !== 'all') params.set('stage', stageFilter);
    if (sourceFilter !== 'all') params.set('source', sourceFilter);
    const res = await fetch(`/api/admin/consumer-leads?${params}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads ?? []);
      setMetrics(data.metrics ?? null);
    }
    setLoading(false);
  }, [stageFilter, sourceFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!selectedId) { setDrillIn(null); return; }
    fetch(`/api/admin/consumer-leads/${selectedId}`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setDrillIn(data); });
  }, [selectedId]);

  const performAction = async (action: string, extra?: Record<string, unknown>) => {
    if (!selectedId) return;
    const res = await fetch(`/api/admin/consumer-leads/${selectedId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    if (res.ok) {
      await fetchAll();
      // refresh drill
      const d = await fetch(`/api/admin/consumer-leads/${selectedId}`, { credentials: 'include' });
      if (d.ok) setDrillIn(await d.json());
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Action failed: ${err.error ?? res.status}`);
    }
  };

  const saveNotes = async (notes: string) => {
    if (!selectedId) return;
    setSavingNotes(true);
    await fetch(`/api/admin/consumer-leads/${selectedId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    setSavingNotes(false);
  };

  return (
    <div>
      {/* Metric tiles */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Tile label="Captured (all-time)" value={metrics.total_captured.toString()} />
          <Tile label="Captured this week"  value={metrics.captured_this_week.toString()} />
          <Tile label="Recovery rate"       value={`${(metrics.recovery_rate * 100).toFixed(1)}%`} />
          <Tile label="Revenue recovered"   value={`£${metrics.revenue_recovered_pounds.toFixed(2)}`} />
        </div>
      )}

      {/* Funnel bar */}
      {metrics && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Funnel</h2>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <div key={s} className={`px-3 py-2 rounded-lg text-xs font-medium ${stageColor(s)}`}>
                <div className="font-semibold">{s.replace(/_/g, ' ')}</div>
                <div className="text-base font-bold">{metrics.stage_counts[s] ?? 0}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Cost per lead: £{metrics.cost_per_lead_pounds.toFixed(4)} (Resend ≈ £0.0004 per send)
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={fetchAll}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-sm rounded-lg"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Tier</th>
              <th className="px-4 py-3 text-left">Stage</th>
              <th className="px-4 py-3 text-left">Captured</th>
              <th className="px-4 py-3 text-left">Last emailed</th>
              <th className="px-4 py-3 text-left"># sent</th>
              <th className="px-4 py-3 text-left">Discount</th>
              <th className="px-4 py-3 text-left">Converted</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No leads yet.</td></tr>
            ) : leads.map((l) => (
              <tr
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-3 text-slate-900 font-medium">{l.email}{l.name ? <span className="text-slate-400 ml-1">({l.name})</span> : null}</td>
                <td className="px-4 py-3 text-slate-600">{l.source}</td>
                <td className="px-4 py-3 text-slate-600">{l.intended_tier ?? '—'} {l.intended_billing_interval ? `(${l.intended_billing_interval})` : ''}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${stageColor(l.funnel_stage)}`}>{l.funnel_stage}</span></td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(l.captured_at)}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(l.last_emailed_at)}</td>
                <td className="px-4 py-3 text-slate-600">{l.email_count}</td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                  {l.discount_code ? (
                    <a
                      href={`https://dashboard.stripe.com/promotion_codes/${l.discount_coupon_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-emerald-600 underline"
                    >
                      {l.discount_code}
                    </a>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">{l.converted_at ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drill-in drawer */}
      {selectedId && drillIn && (
        <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setSelectedId(null)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">{drillIn.lead.email}</h2>
              <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <div><span className="font-semibold">Stage:</span> <span className={`px-2 py-0.5 rounded text-xs ${stageColor(drillIn.lead.funnel_stage)}`}>{drillIn.lead.funnel_stage}</span></div>
              <div><span className="font-semibold">Source:</span> {drillIn.lead.source}</div>
              <div><span className="font-semibold">Intended:</span> {drillIn.lead.intended_tier ?? '—'} {drillIn.lead.intended_billing_interval ? `(${drillIn.lead.intended_billing_interval})` : ''}</div>
              <div><span className="font-semibold">Captured:</span> {fmtDate(drillIn.lead.captured_at)}</div>
              <div><span className="font-semibold">Emails sent:</span> {drillIn.lead.email_count}</div>
              {drillIn.lead.discount_code && (
                <div><span className="font-semibold">Discount:</span> <code className="bg-slate-100 px-1 rounded">{drillIn.lead.discount_code}</code> exp {fmtDate(drillIn.lead.discount_code_expires_at)}</div>
              )}
            </div>

            <h3 className="text-sm font-bold text-slate-700 mt-6 mb-2">Email timeline</h3>
            <ul className="space-y-2 text-xs">
              {drillIn.email_log.length === 0 ? (
                <li className="text-slate-400">No emails sent yet.</li>
              ) : drillIn.email_log.map((e) => (
                <li key={e.id} className="border-l-2 border-emerald-500 pl-3 py-1">
                  <div className="font-semibold text-slate-800">{e.template}</div>
                  <div className="text-slate-600">{e.subject}</div>
                  <div className="text-slate-400">{fmtDate(e.sent_at)}{e.resend_message_id ? ` · ${e.resend_message_id.slice(0, 12)}…` : ''}</div>
                </li>
              ))}
            </ul>

            <h3 className="text-sm font-bold text-slate-700 mt-6 mb-2">Notes</h3>
            <textarea
              defaultValue={drillIn.lead.notes ?? ''}
              onBlur={(e) => saveNotes(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm"
              rows={3}
              placeholder="Founder notes (saves on blur)"
            />
            {savingNotes && <p className="text-xs text-slate-400">Saving…</p>}

            <h3 className="text-sm font-bold text-slate-700 mt-6 mb-2">Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => performAction('mark_converted_paid')} className="px-3 py-2 bg-emerald-500 text-white rounded text-sm">Mark converted (paid)</button>
              <button onClick={() => performAction('mark_unsubscribed')} className="px-3 py-2 bg-slate-200 rounded text-sm">Mark unsubscribed</button>
              <button onClick={() => performAction('manual_handling')} className="px-3 py-2 bg-amber-500 text-white rounded text-sm">Move to manual</button>
              <button onClick={() => performAction('fresh_discount')} className="px-3 py-2 bg-indigo-500 text-white rounded text-sm">Generate fresh code</button>
              <button
                onClick={async () => {
                  const subject = prompt('Subject?');
                  if (!subject) return;
                  const body = prompt('Body (plain text)?');
                  if (!body) return;
                  await performAction('send_manual_email', { subject, body_text: body });
                }}
                className="px-3 py-2 bg-blue-500 text-white rounded text-sm col-span-2"
              >
                Send manual follow-up email
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-slate-500 text-xs">{label}</p>
    </div>
  );
}
