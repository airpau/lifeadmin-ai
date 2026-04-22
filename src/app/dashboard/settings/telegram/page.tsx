'use client';

import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';

interface LinkStatus {
  linked: boolean;
  session: {
    telegram_username: string | null;
    linked_at: string;
    last_message_at: string | null;
  } | null;
  pendingCode: {
    code: string;
    expires_at: string;
  } | null;
}

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
      {expired
        ? 'Expired'
        : `Expires in ${mins}:${String(secs).padStart(2, '0')}`}
    </span>
  );
}

export default function TelegramSettingsPage() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/telegram/link-code');
      if (!res.ok) throw new Error('Failed to load Telegram status');
      const data: LinkStatus = await res.json();
      setStatus(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const generateCode = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/telegram/link-code', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to generate code');
      }
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(`/link ${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const unlinkAccount = async () => {
    if (!confirm('Are you sure you want to unlink your Telegram account?')) return;
    setUnlinking(true);
    try {
      await fetch('/api/telegram/link-code', { method: 'DELETE' });
      await loadStatus();
    } catch {
      setError('Failed to unlink account');
    } finally {
      setUnlinking(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <MessageCircle className="h-7 w-7 text-orange-500" />
          Telegram Bot
        </h1>
        <p className="text-slate-600 mt-1">
          Your personal financial assistant — alerts, spending summaries, and complaint letters
          via Telegram.
        </p>
      </div>

      {/* What it does */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <h3 className="text-slate-900 font-semibold mb-4">What the bot does</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col items-start gap-2">
            <div className="bg-red-500/10 p-2 rounded-lg">
              <BellRing className="h-5 w-5 text-red-400" />
            </div>
            <span className="text-sm font-medium text-slate-900">Proactive alerts</span>
            <span className="text-xs text-slate-600">
              Bill increases, expiring contracts, budget overruns — sent to you before you notice
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-green-500/10 p-2 rounded-lg">
              <TrendingDown className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-sm font-medium text-slate-900">Real-time queries</span>
            <span className="text-xs text-slate-600">
              &ldquo;How much on food this month?&rdquo; &mdash; answers from your live bank data
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-orange-100 p-2 rounded-lg">
              <Shield className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-sm font-medium text-slate-900">Complaint letters</span>
            <span className="text-xs text-slate-600">
              Draft and approve letters citing UK consumer law, all from Telegram
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Connected state */}
      {status?.linked && status.session ? (
        <div className="bg-white border border-green-500/20 rounded-2xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-green-500/10 p-2 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Connected</p>
                {status.session.telegram_username && (
                  <p className="text-slate-600 text-sm">@{status.session.telegram_username}</p>
                )}
              </div>
            </div>
            <button
              onClick={unlinkAccount}
              disabled={unlinking}
              className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-xl transition-colors disabled:opacity-50"
            >
              {unlinking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              Unlink
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Linked</span>
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
                href="https://t.me/PaybackerBot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:text-amber-300 underline"
              >
                @PaybackerBot
              </a>{' '}
              on Telegram to start chatting.
            </p>
          </div>
        </div>
      ) : (
        /* Not connected state */
        <div className="card p-6 space-y-6">
          <div>
            <h3 className="text-slate-900 font-semibold mb-1">Connect your account</h3>
            <p className="text-slate-600 text-sm">
              Generate a one-time code, then send it to the bot on Telegram to link your account.
            </p>
          </div>

          {/* Steps */}
          <ol className="space-y-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">
                1
              </span>
              <div>
                <p className="text-sm text-slate-900">Generate your link code below</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">
                2
              </span>
              <div>
                <p className="text-sm text-slate-900">
                  Open{' '}
                  <a
                    href="https://t.me/PaybackerBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-600 hover:text-amber-300 underline"
                  >
                    @PaybackerBot
                  </a>{' '}
                  on Telegram
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">
                3
              </span>
              <div>
                <p className="text-sm text-slate-900">
                  Send: <code className="text-orange-600 bg-slate-100 px-1.5 py-0.5 rounded">/link YOUR_CODE</code>
                </p>
              </div>
            </li>
          </ol>

          {/* Code display */}
          {status?.pendingCode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-slate-100 border border-orange-200 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Your link code</p>
                  <p className="text-3xl font-mono font-bold text-orange-600 tracking-[0.3em]">
                    {status.pendingCode.code}
                  </p>
                  <p className="text-xs mt-1">
                    <CountdownTimer expiresAt={status.pendingCode.expires_at} />
                  </p>
                </div>
                <button
                  onClick={() => copyCode(status.pendingCode!.code)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-100 text-orange-600 rounded-xl text-sm transition-colors"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copy command
                    </>
                  )}
                </button>
              </div>
              <button
                onClick={generateCode}
                disabled={generating}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-700 transition-colors"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Generate new code
              </button>
            </div>
          ) : (
            <button
              onClick={generateCode}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-semibold rounded-xl transition-colors"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              Generate Link Code
            </button>
          )}
        </div>
      )}

      {/* Security note */}
      <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <Shield className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Link codes expire after 15 minutes and can only be used once. The bot can only access your
          Paybacker account — it cannot make payments or access your actual bank credentials. You can
          unlink at any time.
        </p>
      </div>
    </div>
  );
}
