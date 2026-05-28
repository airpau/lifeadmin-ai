'use client';

/**
 * WhatsApp alerts card — the focused, grouped toggle list users asked
 * for. Lives alongside the full event/channel matrix in the profile
 * notifications tab. Backed by /api/whatsapp/alert-prefs which writes
 * to the same `notification_preferences` table.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, MessageCircle, PoundSterling, Repeat,
  Gavel, Settings, CheckCircle2, AlertCircle, Save,
} from 'lucide-react';

type AlertKey =
  | 'whatsapp_price_increase'
  | 'whatsapp_renewal_reminder'
  | 'whatsapp_unusual_charge'
  | 'whatsapp_trial_ending'
  | 'whatsapp_budget_alert'
  | 'whatsapp_savings_milestone'
  | 'whatsapp_better_deal'
  | 'whatsapp_weekly_recovery'
  | 'whatsapp_letter_ready'
  | 'whatsapp_money_recovered'
  | 'whatsapp_reconnect_required'
  | 'whatsapp_morning_summary'
  | 'whatsapp_dispute_reply'
  | 'whatsapp_dispute_agent_action'
  | 'whatsapp_payment_received'
  | 'whatsapp_payment_outgoing'
  | 'whatsapp_dd_warning';

type Prefs = Record<AlertKey, boolean>;

interface ToggleDef {
  key: AlertKey;
  label: string;
  description: string;
}

interface Group {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  toggles: ToggleDef[];
}

const GROUPS: Group[] = [
  {
    title: 'Money & Spending',
    icon: PoundSterling,
    toggles: [
      { key: 'whatsapp_price_increase',  label: 'Price increase alerts',          description: "When a tracked bill or subscription's price goes up." },
      { key: 'whatsapp_unusual_charge',  label: 'Unusual charge detected',         description: "A bank charge significantly higher than the merchant's usual amount." },
      { key: 'whatsapp_budget_alert',    label: 'Budget alerts',                   description: 'When you cross 80% or 100% of a category budget.' },
      { key: 'whatsapp_better_deal',     label: 'Better deal found',               description: 'A cheaper provider for one of your tracked bills.' },
      { key: 'whatsapp_payment_received', label: 'Payment received',               description: 'A credit lands in one of your connected accounts.' },
      { key: 'whatsapp_payment_outgoing', label: 'Large outgoing payment',         description: 'A debit clears that is over your "notify me" threshold.' },
      { key: 'whatsapp_dd_warning',      label: 'Upcoming direct debit',           description: 'Heads-up for a direct debit due in the next 24-72h.' },
    ],
  },
  {
    title: 'Subscriptions & Contracts',
    icon: Repeat,
    toggles: [
      { key: 'whatsapp_renewal_reminder', label: 'Renewal reminders',              description: 'A tracked contract or subscription is about to renew.' },
      { key: 'whatsapp_trial_ending',     label: 'Trial ending soon',              description: 'A free trial is about to convert to a paid subscription.' },
    ],
  },
  {
    title: 'Disputes & Recovery',
    icon: Gavel,
    toggles: [
      { key: 'whatsapp_dispute_reply',         label: 'Dispute reply received',     description: "A provider has replied to one of your active complaints." },
      { key: 'whatsapp_letter_ready',          label: 'Complaint letter ready',     description: 'Your AI-generated complaint letter is ready to send.' },
      { key: 'whatsapp_money_recovered',       label: 'Money recovered',            description: 'A refund or settlement has landed from a tracked dispute.' },
      { key: 'whatsapp_weekly_recovery',       label: 'Weekly recovery total',      description: 'Monday morning summary of last week\'s recovered total.' },
      { key: 'whatsapp_dispute_agent_action',  label: 'Dispute agent action',       description: 'The autonomous Dispute Agent has a recommended next step.' },
      { key: 'whatsapp_savings_milestone',     label: 'Savings goal milestone',     description: 'You hit 25 / 50 / 75 / 100% of a savings goal.' },
    ],
  },
  {
    title: 'System',
    icon: Settings,
    toggles: [
      { key: 'whatsapp_morning_summary',     label: 'Morning brief',               description: 'Daily 7:30am summary of what matters today.' },
      { key: 'whatsapp_reconnect_required',  label: 'Bank reconnection required',  description: 'A bank or email connection has expired.' },
    ],
  },
];

export function WhatsAppAlertsCard() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/whatsapp/alert-prefs', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { prefs: Prefs };
        if (!cancelled) setPrefs(json.prefs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const flip = async (key: AlertKey) => {
    if (!prefs) return;
    const next = !prefs[key];
    const optimistic = { ...prefs, [key]: next };
    setPrefs(optimistic);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/whatsapp/alert-prefs', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs: { [key]: next } }),
      });
      if (!res.ok) {
        // Roll back
        setPrefs(prefs);
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { prefs: Prefs };
      setPrefs(body.prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading WhatsApp preferences…
        </div>
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-900/20 p-6 text-rose-200">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-4 w-4" /> Could not load preferences
        </div>
        {error && <div className="mt-2 text-sm">{error}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/60 overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-emerald-500/10 px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-500/20 p-2">
            <MessageCircle className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">WhatsApp alerts</h3>
            <p className="mt-1 text-sm text-slate-300">
              Pick which Pocket Agent buzzes you'll get on WhatsApp. Every toggle is on by
              default — flip off any you don't want.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
          {saving && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving</>)}
          {!saving && saved && (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="border-b border-rose-500/30 bg-rose-900/20 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="divide-y divide-white/5">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <section key={g.title} className="px-6 py-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-300">
                <Icon className="h-4 w-4" /> {g.title}
              </div>
              <ul className="space-y-3">
                {g.toggles.map((t) => {
                  const on = prefs[t.key];
                  return (
                    <li key={t.key} className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{t.label}</p>
                        <p className="text-xs text-slate-400">{t.description}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`Toggle ${t.label}`}
                        onClick={() => flip(t.key)}
                        disabled={saving}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          on ? 'bg-emerald-500' : 'bg-slate-700'
                        } ${saving ? 'opacity-60' : ''}`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                            on ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-slate-950/40 px-6 py-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Save className="h-3 w-3" /> Changes save automatically.
        </span>
        <span>WhatsApp Pocket Agent is a Pro feature.</span>
      </footer>
    </div>
  );
}
