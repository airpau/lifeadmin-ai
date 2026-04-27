'use client';

/**
 * /dashboard/settings/notifications
 *
 * Matrix settings page — rows = notification events, columns = channels
 * (email / telegram / whatsapp / push). Plus a quiet-hours picker that
 * applies to every channel, plus a Pocket Agent channel picker that
 * enforces the telegram⊕whatsapp mutex.
 *
 * - WhatsApp is Pro-only. Free / Essential see it greyed out with an
 *   upgrade hint. The API also enforces this — toggling WhatsApp on a
 *   non-Pro account is silently coerced to false server-side.
 * - Push is enabled in the UI so users can pre-configure before the
 *   mobile app ships; the dispatcher treats push as a no-op today.
 * - The Pocket Agent channel picker (telegram | whatsapp | none) is
 *   the master switch — picking WhatsApp deactivates the Telegram
 *   session and vice versa, so we only ever pay for one channel.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Mail, MessageCircle, Smartphone, Moon, Save,
  Bell, Calendar, BarChart3, Megaphone, ShieldCheck, CheckCircle2,
  Send, Lock, Sparkles,
} from 'lucide-react';

type Channel = 'email' | 'telegram' | 'whatsapp' | 'push';
type PocketAgentChannel = 'telegram' | 'whatsapp' | 'none';

interface EventRow {
  event: string;
  label: string;
  description: string;
  group: 'alerts' | 'reminders' | 'summaries' | 'marketing' | 'service';
  allowedChannels: Channel[];
  proOnly: boolean;
  critical: boolean;
  channels: { email: boolean; telegram: boolean; whatsapp: boolean; push: boolean };
}

interface Payload {
  tier: 'free' | 'essential' | 'pro';
  pocketAgentChannel: PocketAgentChannel;
  whatsappPhone: string | null;
  events: EventRow[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
}

const GROUP_LABELS: Record<EventRow['group'], { label: string; icon: any; blurb: string }> = {
  alerts:     { label: 'Real-time alerts',           icon: Bell,         blurb: 'Fires the moment something changes.' },
  reminders:  { label: 'Reminders',                  icon: Calendar,     blurb: 'Upcoming renewals, contract endings, dispute escalations.' },
  summaries:  { label: 'Daily & weekly summaries',   icon: BarChart3,    blurb: 'Scheduled recaps of where your money went.' },
  marketing:  { label: 'Offers & recommendations',   icon: Megaphone,    blurb: 'Switching deals and category-specific offers.' },
  service:    { label: 'Account & service',          icon: ShieldCheck,  blurb: 'Support replies, onboarding and service notices.' },
};

const GROUP_ORDER: EventRow['group'][] = ['alerts', 'reminders', 'summaries', 'marketing', 'service'];

export default function NotificationsSettingsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchingChannel, setSwitchingChannel] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notification-preferences', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggle = (event: string, channel: Channel) => {
    if (!data) return;
    setData({
      ...data,
      events: data.events.map((e) =>
        e.event === event ? { ...e, channels: { ...e.channels, [channel]: !e.channels[channel] } } : e,
      ),
    });
  };

  const setQuietHour = (key: 'quiet_hours_start' | 'quiet_hours_end', value: string) => {
    if (!data) return;
    setData({ ...data, [key]: value || null });
  };

  const switchPocketAgent = async (target: PocketAgentChannel) => {
    if (!data || data.pocketAgentChannel === target) return;
    setSwitchingChannel(true);
    setError(null);
    try {
      const res = await fetch('/api/pocket-agent/channel', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Switch failed (${res.status})`);
      // After switching, refetch so the new state (and any next-step
      // hint) lands in the UI.
      await load();
    } catch (e: any) {
      setError(e?.message || 'Switch failed');
    } finally {
      setSwitchingChannel(false);
    }
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: data.events.map((e) => ({
            event: e.event,
            email: e.channels.email,
            telegram: e.channels.telegram,
            whatsapp: e.channels.whatsapp,
            push: e.channels.push,
          })),
          quiet_hours_start: data.quiet_hours_start,
          quiet_hours_end: data.quiet_hours_end,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <p className="text-red-600 text-sm">{error || 'Something went wrong.'}</p>
      </div>
    );
  }

  const isPro = data.tier === 'pro';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link href="/dashboard/profile" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">Notification preferences</h1>
      <p className="text-sm text-slate-500 mb-6">
        Pick where each kind of alert lands. Turn off the channels you don&apos;t want — leave Paybacker to reach you how you prefer.
      </p>

      {/* Pocket Agent channel picker — telegram XOR whatsapp */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-slate-100">
            <Sparkles className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pocket Agent channel</h2>
            <p className="text-xs text-slate-500">
              Pick one — your Pocket Agent talks to you on either Telegram or WhatsApp, never both. Switching disconnects the other automatically.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { key: 'telegram',  label: 'Telegram',  blurb: 'Free on every plan.', icon: MessageCircle, locked: false },
            { key: 'whatsapp',  label: 'WhatsApp',  blurb: isPro ? 'Pro only — included in your plan.' : 'Pro only — upgrade to enable.', icon: Send,           locked: !isPro },
            { key: 'none',      label: 'None',      blurb: 'Email + push only.',  icon: Bell,           locked: false },
          ] as const).map((opt) => {
            const Icon = opt.icon;
            const active = data.pocketAgentChannel === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => !opt.locked && switchPocketAgent(opt.key as PocketAgentChannel)}
                disabled={opt.locked || switchingChannel}
                className={[
                  'text-left p-4 rounded-xl border-2 transition',
                  active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300',
                  opt.locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className="h-5 w-5 text-slate-700" />
                  {opt.locked && <Lock className="h-4 w-4 text-slate-400" />}
                  {active && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                </div>
                <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-1">{opt.blurb}</div>
              </button>
            );
          })}
        </div>
        {!isPro && (
          <p className="text-xs text-slate-500 mt-3">
            <Link href="/pricing?from=whatsapp" className="text-emerald-600 hover:underline">Upgrade to Pro</Link> to use the WhatsApp Pocket Agent.
          </p>
        )}
        {data.pocketAgentChannel === 'whatsapp' && data.whatsappPhone && (
          <p className="text-xs text-slate-500 mt-3">
            Connected to WhatsApp number <strong>{data.whatsappPhone}</strong>.
          </p>
        )}
        {data.pocketAgentChannel === 'whatsapp' && !data.whatsappPhone && (
          <p className="text-xs text-amber-600 mt-3">
            WhatsApp selected — finish connecting your number from the <Link href="/dashboard/profile?connect=whatsapp" className="underline">profile page</Link>.
          </p>
        )}
      </section>

      {/* Quiet hours */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-slate-100">
            <Moon className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Quiet hours</h2>
            <p className="text-xs text-slate-500">We hold push, Telegram and WhatsApp during these hours. Emails still land in your inbox.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <label className="text-sm">
            <span className="block text-slate-500 text-xs mb-1">Start</span>
            <input
              type="time"
              value={data.quiet_hours_start ?? ''}
              onChange={(e) => setQuietHour('quiet_hours_start', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500 text-xs mb-1">End</span>
            <input
              type="time"
              value={data.quiet_hours_end ?? ''}
              onChange={(e) => setQuietHour('quiet_hours_end', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Timezone: {data.timezone} · Leave blank for 24/7 delivery.
        </p>
      </section>

      {/* Event matrix grouped */}
      {GROUP_ORDER.map((groupKey) => {
        const rows = data.events.filter((e) => e.group === groupKey);
        if (rows.length === 0) return null;
        const groupMeta = GROUP_LABELS[groupKey];
        const Icon = groupMeta.icon;
        return (
          <section key={groupKey} className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-slate-100">
                <Icon className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">{groupMeta.label}</h2>
                <p className="text-xs text-slate-500">{groupMeta.blurb}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 font-medium">Event</th>
                    <th className="py-2 px-2 text-center font-medium w-20">
                      <div className="flex flex-col items-center gap-0.5"><Mail className="h-4 w-4" /> Email</div>
                    </th>
                    <th className="py-2 px-2 text-center font-medium w-24">
                      <div className="flex flex-col items-center gap-0.5"><MessageCircle className="h-4 w-4" /> Telegram</div>
                    </th>
                    <th className="py-2 px-2 text-center font-medium w-24">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Send className="h-4 w-4" /> WhatsApp
                        </span>
                        {!isPro && <Lock className="h-3 w-3 text-slate-400" />}
                      </div>
                    </th>
                    <th className="py-2 px-2 text-center font-medium w-20">
                      <div className="flex flex-col items-center gap-0.5"><Smartphone className="h-4 w-4" /> Push</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.event} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="text-sm text-slate-900 font-medium flex items-center gap-2">
                          {r.label}
                          {r.proOnly && (
                            <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Pro</span>
                          )}
                          {r.critical && (
                            <span className="text-[10px] uppercase tracking-wider bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded" title="Bypasses quiet hours">Urgent</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{r.description}</div>
                      </td>
                      {(['email', 'telegram', 'whatsapp', 'push'] as Channel[]).map((ch) => {
                        const allowed = r.allowedChannels.includes(ch);
                        const lockedByTier = ch === 'whatsapp' && !isPro;
                        const disabled = !allowed || lockedByTier;
                        return (
                          <td key={ch} className="py-3 px-2 text-center">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={!disabled && r.channels[ch]}
                              onChange={() => toggle(r.event, ch)}
                              className="h-4 w-4 accent-emerald-500 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              aria-label={`${r.label} via ${ch}${lockedByTier ? ' (Pro only)' : ''}`}
                              title={lockedByTier ? 'WhatsApp is part of Paybacker Pro' : undefined}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
          {!saved && !error && (
            <span className="text-xs text-slate-500">Push is set up now — notifications begin when our mobile app lands.</span>
          )}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save preferences
        </button>
      </div>
    </div>
  );
}
