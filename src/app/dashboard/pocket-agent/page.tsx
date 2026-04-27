'use client';

/**
 * /dashboard/pocket-agent
 *
 * Single page for setting up the Pocket Agent on either Telegram or
 * WhatsApp. The two channels are mutually exclusive — connecting one
 * disconnects the other automatically (enforced by the
 * `tg_enforce_pocket_agent_mutex` Postgres trigger).
 *
 * UI: tab switcher at top picks which channel to set up. WhatsApp is
 * Pro-only and shows an upgrade card for Free / Essential users.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  Unlink,
  Loader2,
  BellRing,
  TrendingDown,
  Shield,
  Bot,
  ExternalLink,
  Send,
  Lock,
} from 'lucide-react';

interface TelegramStatus {
  linked: boolean;
  session: {
    telegram_username: string | null;
    linked_at: string;
    last_message_at: string | null;
  } | null;
  pendingCode: { code: string; expires_at: string } | null;
}

interface WhatsAppStatus {
  canUse: boolean;
  linked: boolean;
  session: {
    whatsapp_phone: string;
    linked_at: string | null;
    last_message_at: string | null;
  } | null;
  pendingCode: { code: string; expires_at: string } | null;
  senderPhone: string;
}

type Channel = 'telegram' | 'whatsapp';

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [seconds, setSeconds] = useState<number>(0);
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSeconds(diff);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const expired = seconds === 0;
  return (
    <span className={expired ? 'text-red-400' : seconds < 60 ? 'text-orange-600' : 'text-slate-600'}>
      {expired ? 'Expired' : `Expires in ${mins}:${String(secs).padStart(2, '0')}`}
    </span>
  );
}

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default function PocketAgentPage() {
  // Default the active tab to whichever channel is already linked, else
  // Telegram (most users start free).
  const [tab, setTab] = useState<Channel>('telegram');

  const [tg, setTg] = useState<TelegramStatus | null>(null);
  const [wa, setWa] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [tgRes, waRes] = await Promise.all([
        fetch('/api/telegram/link-code', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/whatsapp/link-code', { credentials: 'include', cache: 'no-store' }),
      ]);
      const tgData: TelegramStatus = tgRes.ok
        ? await tgRes.json()
        : { linked: false, session: null, pendingCode: null };
      const waData: WhatsAppStatus = waRes.ok
        ? await waRes.json()
        : { canUse: false, linked: false, session: null, pendingCode: null, senderPhone: '+447883318406' };
      setTg(tgData);
      setWa(waData);
      // Pick the linked tab on first load — most useful to the user.
      if (waData.linked) setTab('whatsapp');
      else if (tgData.linked) setTab('telegram');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Poll while a pending code is outstanding so the UI flips to
  // Connected within ~4s of the user redeeming it.
  useEffect(() => {
    const hasPending =
      (tg?.pendingCode && !tg?.linked) || (wa?.pendingCode && !wa?.linked);
    if (!hasPending) return;
    const id = setInterval(() => void loadAll(), 4000);
    return () => clearInterval(id);
  }, [tg?.pendingCode, tg?.linked, wa?.pendingCode, wa?.linked, loadAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title flex items-center gap-3">
          <Bot className="h-7 w-7 text-orange-500" />
          Pocket Agent
        </h1>
        <p className="text-slate-600 mt-1">
          Your AI financial agent, right in your pocket. Pick one channel — connecting one disconnects the other automatically.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Channel tab switcher */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('telegram')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'telegram' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Telegram
            {tg?.linked && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('whatsapp')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'whatsapp' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Send className="h-4 w-4" />
            WhatsApp
            {!wa?.canUse && <Lock className="h-3 w-3 text-slate-400" />}
            {wa?.linked && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            {!wa?.linked && wa?.canUse && (
              <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-700 px-1 py-0.5 rounded">Pro</span>
            )}
          </span>
        </button>
      </div>

      {/* Telegram panel */}
      {tab === 'telegram' && (
        <TelegramPanel status={tg} onChange={loadAll} setError={setError} />
      )}

      {/* WhatsApp panel */}
      {tab === 'whatsapp' && (
        <WhatsAppPanel status={wa} onChange={loadAll} setError={setError} />
      )}

      {/* Capability grid (channel-agnostic) */}
      <div className="bg-white/50 border border-slate-200/50 rounded-2xl p-6">
        <h3 className="text-slate-900 font-semibold mb-4">What Pocket Agent does</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col items-start gap-2">
            <div className="bg-red-500/10 p-2 rounded-lg">
              <BellRing className="h-5 w-5 text-red-400" />
            </div>
            <span className="text-sm font-medium text-slate-900">Proactive alerts</span>
            <span className="text-xs text-slate-600">
              Bill increases, expiring contracts, budget overruns — sent to you before you notice.
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-green-500/10 p-2 rounded-lg">
              <TrendingDown className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-sm font-medium text-slate-900">Real-time queries</span>
            <span className="text-xs text-slate-600">
              &ldquo;How much on food this month?&rdquo; — answers from your live bank data.
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-orange-500/10 p-2 rounded-lg">
              <Shield className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-sm font-medium text-slate-900">Complaint letters</span>
            <span className="text-xs text-slate-600">
              Draft and approve letters citing UK consumer law from the chat.
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 bg-white/30 border border-slate-200/30 rounded-xl">
        <Shield className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Pocket Agent can only access your Paybacker account — it cannot make payments or access your bank credentials. You can disconnect at any time. Reply <code className="bg-slate-100 px-1 py-0.5 rounded">STOP</code> on either channel to opt out.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------- *
 * Telegram panel                                      *
 * -------------------------------------------------- */
function TelegramPanel({
  status, onChange, setError,
}: {
  status: TelegramStatus | null;
  onChange: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setGenerating(true); setError(null);
    try {
      const r = await fetch('/api/telegram/link-code', { method: 'POST' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || 'Failed to generate code');
      }
      await onChange();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(`/link ${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const unlink = async () => {
    if (!confirm('Disconnect Telegram Pocket Agent?')) return;
    setUnlinking(true); setError(null);
    try {
      await fetch('/api/telegram/link-code', { method: 'DELETE' });
      await onChange();
    } catch {
      setError('Failed to disconnect');
    } finally {
      setUnlinking(false);
    }
  };

  if (status?.linked && status.session) {
    return (
      <div className="bg-white border border-emerald-300 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-full">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Telegram is connected</p>
              {status.session.telegram_username && (
                <p className="text-slate-600 text-sm">@{status.session.telegram_username}</p>
              )}
            </div>
          </div>
          <button
            onClick={unlink}
            disabled={unlinking}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:text-red-600 border border-red-200 hover:border-red-400 rounded-xl transition-colors disabled:opacity-50"
          >
            {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            Disconnect
          </button>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200/50 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Connected since</span>
            <p className="text-slate-700">{formatDate(status.session.linked_at)}</p>
          </div>
          {status.session.last_message_at && (
            <div>
              <span className="text-slate-500">Last message</span>
              <p className="text-slate-700">{formatDate(status.session.last_message_at)}</p>
            </div>
          )}
        </div>
        <div className="mt-4 p-4 bg-slate-100/50 rounded-xl">
          <p className="text-sm text-slate-600">
            Open{' '}
            <a
              href="https://t.me/Paybackercoukbot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:text-amber-300 underline inline-flex items-center gap-1"
            >
              @Paybackercoukbot <ExternalLink className="h-3 w-3" />
            </a>{' '}
            on Telegram to start chatting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-6">
      <div>
        <h3 className="text-slate-900 font-semibold mb-1">Set up Telegram</h3>
        <p className="text-slate-600 text-sm">Free on every Paybacker plan. Three steps.</p>
      </div>
      <ol className="space-y-4">
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-600 text-xs font-bold flex items-center justify-center">1</span>
          <p className="text-sm text-slate-900">
            Open Telegram and search for{' '}
            <a href="https://t.me/Paybackercoukbot" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-amber-300 underline">@Paybackercoukbot</a>.
          </p>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-600 text-xs font-bold flex items-center justify-center">2</span>
          <p className="text-sm text-slate-900">Tap <strong>&ldquo;Start&rdquo;</strong> to begin.</p>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-600 text-xs font-bold flex items-center justify-center">3</span>
          <p className="text-sm text-slate-900">
            Enter: <code className="text-orange-600 bg-slate-100 px-1.5 py-0.5 rounded">/link YOUR_CODE</code>
          </p>
        </li>
      </ol>

      {status?.pendingCode ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-100 border border-orange-200 rounded-xl">
            <div>
              <p className="text-xs text-slate-500 mb-1">Your link code</p>
              <p className="text-3xl font-mono font-bold text-orange-600 tracking-[0.3em]">{status.pendingCode.code}</p>
              <p className="text-xs mt-1"><CountdownTimer expiresAt={status.pendingCode.expires_at} /></p>
            </div>
            <button
              onClick={() => copy(status.pendingCode!.code)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded-xl text-sm transition-colors"
            >
              {copied ? <><CheckCircle2 className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy command</>}
            </button>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-700 transition-colors"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generate new code
          </button>
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Generate Link Code
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------- *
 * WhatsApp panel                                      *
 * -------------------------------------------------- */
function WhatsAppPanel({
  status, onChange, setError,
}: {
  status: WhatsAppStatus | null;
  onChange: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pro-tier lock — first thing we render if the user can't use it.
  if (status && !status.canUse) {
    return (
      <div className="bg-white border border-amber-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-amber-100"><Lock className="h-5 w-5 text-amber-700" /></div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Upgrade to Pro to unlock WhatsApp</h3>
            <p className="text-sm text-slate-500">Telegram remains free on every plan.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          The WhatsApp Pocket Agent is part of Paybacker Pro because every WhatsApp template message has a per-send cost on Meta&apos;s side. Pro covers it. Same agent intelligence as Telegram, just on the messaging app you probably use most.
        </p>
        <div className="flex gap-3 flex-wrap">
          {/*
            Use Next.js <Link> rather than raw <a href>. <a> triggers a
            full-page reload which drops the SPA-side auth state mid-flight
            on /pricing, briefly looking like a logout to the user. <Link>
            does client-side navigation, the cookie-based session stays
            intact, and Stripe checkout works straight through.
          */}
          <Link
            href="/pricing?from=whatsapp"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold"
          >
            Upgrade to Pro
          </Link>
          <Link
            href="/dashboard/settings/telegram"
            className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold"
          >
            Use Telegram instead
          </Link>
        </div>
      </div>
    );
  }

  const generate = async () => {
    setGenerating(true); setError(null);
    try {
      const r = await fetch('/api/whatsapp/link-code', { method: 'POST', credentials: 'include' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || 'Failed to generate code');
      }
      await onChange();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(`LINK ${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const unlink = async () => {
    if (!confirm('Disconnect WhatsApp Pocket Agent?')) return;
    setUnlinking(true); setError(null);
    try {
      await fetch('/api/whatsapp/link-code', { method: 'DELETE', credentials: 'include' });
      await onChange();
    } catch {
      setError('Failed to disconnect');
    } finally {
      setUnlinking(false);
    }
  };

  if (status?.linked && status.session) {
    return (
      <div className="bg-white border border-emerald-300 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-full">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">WhatsApp is connected</p>
              <p className="text-slate-600 text-sm">{status.session.whatsapp_phone}</p>
            </div>
          </div>
          <button
            onClick={unlink}
            disabled={unlinking}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:text-red-600 border border-red-200 hover:border-red-400 rounded-xl transition-colors disabled:opacity-50"
          >
            {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            Disconnect
          </button>
        </div>
        {status.session.linked_at && (
          <div className="mt-4 pt-4 border-t border-slate-200/50 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Connected since</span>
              <p className="text-slate-700">{formatDate(status.session.linked_at)}</p>
            </div>
            {status.session.last_message_at && (
              <div>
                <span className="text-slate-500">Last message</span>
                <p className="text-slate-700">{formatDate(status.session.last_message_at)}</p>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 p-4 bg-slate-100/50 rounded-xl">
          <p className="text-sm text-slate-600">
            Open{' '}
            <a
              href={`https://wa.me/${status.senderPhone.replace(/^\+/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline inline-flex items-center gap-1"
            >
              {status.senderPhone} on WhatsApp <ExternalLink className="h-3 w-3" />
            </a>{' '}
            to start chatting.
          </p>
        </div>
      </div>
    );
  }

  // Pro user, not yet linked → show setup steps + code generation.
  const senderPhone = status?.senderPhone ?? '+447883318406';
  const senderForUrl = senderPhone.replace(/^\+/, '');

  return (
    <div className="card space-y-6">
      <div>
        <h3 className="text-slate-900 font-semibold mb-1">Set up WhatsApp</h3>
        <p className="text-slate-600 text-sm">
          Included with Paybacker Pro. We learn your phone number from the message you send us — no form-filling, no typos.
        </p>
      </div>

      <ol className="space-y-4">
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 text-xs font-bold flex items-center justify-center">1</span>
          <p className="text-sm text-slate-900">Tap <em>Generate link code</em> below to get your 6-character code.</p>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 text-xs font-bold flex items-center justify-center">2</span>
          <p className="text-sm text-slate-900">
            Tap <em>Open WhatsApp</em>, or message <strong>{senderPhone}</strong> from your phone.
          </p>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 text-xs font-bold flex items-center justify-center">3</span>
          <p className="text-sm text-slate-900">
            Send: <code className="text-emerald-600 bg-slate-100 px-1.5 py-0.5 rounded">LINK YOUR_CODE</code> (we&apos;ll prefill it for you).
          </p>
        </li>
      </ol>

      {status?.pendingCode ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-100 border border-emerald-200 rounded-xl flex-wrap gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Your link code</p>
              <p className="text-3xl font-mono font-bold text-emerald-600 tracking-[0.3em]">
                LINK {status.pendingCode.code}
              </p>
              <p className="text-xs mt-1"><CountdownTimer expiresAt={status.pendingCode.expires_at} /></p>
            </div>
            <button
              onClick={() => copyCode(status.pendingCode!.code)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 rounded-xl text-sm transition-colors"
            >
              {copied ? <><CheckCircle2 className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`https://wa.me/${senderForUrl}?text=${encodeURIComponent(`LINK ${status.pendingCode.code}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm"
            >
              <Send className="h-4 w-4" /> Open WhatsApp
            </a>
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-700 transition-colors"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Generate new code
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Once we receive your code, this page flips to <em>Connected</em> within a few seconds.
          </p>
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Generate link code
        </button>
      )}
    </div>
  );
}
