'use client';

/**
 * /dashboard/settings/whatsapp
 *
 * Connect WhatsApp Pocket Agent (Pro only).
 *
 * Mirrors the Telegram link page (/dashboard/settings/telegram) — the
 * user clicks "Generate code", we hit /api/whatsapp/link-code, and they
 * either tap the wa.me deep-link (mobile) or message the code manually
 * to +447883318406. Once the inbound webhook redeems the code, the
 * session is created and this page polls back to "Linked!" state.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, Copy, RefreshCw, Unlink, Lock,
} from 'lucide-react';

interface LinkStatus {
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

interface CodeResponse {
  code: string;
  expiresAt: string;
  senderPhone: string;
  deepLink: string;
  instructions: string[];
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => {
      const d = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSeconds(d);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (seconds === 0) return <span className="text-red-600">Expired</span>;
  return (
    <span className={seconds < 60 ? 'text-orange-600' : 'text-slate-500'}>
      Expires in {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

export default function WhatsAppSettingsPage() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/whatsapp/link-code', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      setStatus(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // While we have a pending code, poll every 4s to detect when the
  // webhook redeems it and the session is created.
  useEffect(() => {
    if (!status?.pendingCode || status.linked) return;
    const id = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(id);
  }, [status?.pendingCode, status?.linked, load]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch('/api/whatsapp/link-code', { method: 'POST', credentials: 'include' });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Failed (${r.status})`);
      // Optimistically set the new pending code in status
      const c = body as CodeResponse;
      setStatus((s) =>
        s ? { ...s, pendingCode: { code: c.code, expires_at: c.expiresAt }, senderPhone: c.senderPhone, linked: false } : s,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Couldn’t generate a code');
    } finally {
      setGenerating(false);
    }
  };

  const unlink = async () => {
    if (!confirm('Disconnect WhatsApp from Paybacker?')) return;
    setUnlinking(true);
    setError(null);
    try {
      const r = await fetch('/api/whatsapp/link-code', { method: 'DELETE', credentials: 'include' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${r.status})`);
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Couldn’t unlink');
    } finally {
      setUnlinking(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <p className="text-red-600 text-sm">{error || 'Could not load WhatsApp status.'}</p>
      </div>
    );
  }

  // Pro-tier lock
  if (!status.canUse) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <Link href="/dashboard/settings/notifications" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-100"><Lock className="h-5 w-5 text-amber-700" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">WhatsApp Pocket Agent</h1>
              <p className="text-sm text-slate-500">Pro plan required.</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            The WhatsApp Pocket Agent is part of Paybacker Pro. Pro members can talk to their financial agent directly on WhatsApp — get morning summaries, dispute alerts, and complaint letters straight to your messaging app. Telegram remains free on every plan.
          </p>
          <div className="flex gap-3">
            <Link href="/pricing?from=whatsapp" className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold">
              Upgrade to Pro
            </Link>
            <Link href="/dashboard/settings/telegram" className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold">
              Use Telegram instead
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const linked = status.linked && status.session;
  const pending = !linked && status.pendingCode;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <Link href="/dashboard/settings/notifications" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-emerald-100"><Send className="h-5 w-5 text-emerald-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WhatsApp Pocket Agent</h1>
          <p className="text-sm text-slate-500">Talk to your financial agent on WhatsApp.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      {linked && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-900">Connected</h2>
          </div>
          <p className="text-sm text-slate-600 mb-2">
            Linked WhatsApp number: <strong>{status.session!.whatsapp_phone}</strong>
          </p>
          {status.session!.linked_at && (
            <p className="text-xs text-slate-500">
              Connected {new Date(status.session!.linked_at).toLocaleDateString('en-GB')}
              {status.session!.last_message_at && (
                <> · Last message {new Date(status.session!.last_message_at).toLocaleString('en-GB')}</>
              )}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <a
              href={`https://wa.me/${status.senderPhone.replace(/^\+/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold"
            >
              <Send className="h-4 w-4" /> Open chat
            </a>
            <button
              onClick={unlink}
              disabled={unlinking}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold disabled:opacity-50"
            >
              {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              Disconnect
            </button>
          </div>
        </div>
      )}

      {!linked && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-slate-900 mb-1">Connect your WhatsApp</h2>
          <p className="text-sm text-slate-500 mb-4">
            We use a one-time code to verify it&apos;s really your number. No phone-number entry — we learn it from the message you send us.
          </p>

          {pending ? (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Your code</p>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-mono font-bold tracking-widest text-slate-900">
                    LINK {status.pendingCode!.code}
                  </div>
                  <button
                    onClick={() => copy(`LINK ${status.pendingCode!.code}`)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 text-slate-700 text-xs hover:bg-slate-100"
                  >
                    {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs mt-2"><CountdownTimer expiresAt={status.pendingCode!.expires_at} /></p>
              </div>

              <div className="space-y-2 mb-4 text-sm text-slate-700">
                <p>1. Open WhatsApp on your phone.</p>
                <p>2. Message <strong>{status.senderPhone}</strong> with the code above.</p>
                <p>3. We&apos;ll confirm here once it lands — usually within 5 seconds.</p>
              </div>

              <div className="flex gap-3 flex-wrap">
                <a
                  href={`https://wa.me/${status.senderPhone.replace(/^\+/, '')}?text=${encodeURIComponent(`LINK ${status.pendingCode!.code}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold"
                >
                  <Send className="h-4 w-4" /> Open WhatsApp
                </a>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold disabled:opacity-50"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  New code
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-base font-semibold disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Generate link code
            </button>
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 leading-relaxed">
        <p className="mb-1">
          <strong>One channel at a time.</strong> Connecting WhatsApp will disconnect Telegram if it&apos;s linked. You can switch back any time from <Link href="/dashboard/settings/telegram" className="underline">Telegram settings</Link>.
        </p>
        <p>
          By connecting you agree to receive Pocket Agent messages on this number — reply <code>STOP</code> at any time to opt out.
        </p>
      </div>
    </div>
  );
}
