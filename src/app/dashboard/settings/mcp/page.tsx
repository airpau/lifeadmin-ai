'use client';
// src/app/dashboard/settings/mcp/page.tsx
// Paybacker MCP — personal access token management for Pro users.
// Users mint a token here, paste it into Claude Desktop via the @paybacker/mcp
// npm package, and Claude can then read (never write) their financial data.
//
// The plaintext token is shown ONCE at mint-time. After that the UI only
// ever sees the 8-char prefix, the label, and usage stats.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Terminal,
  Copy,
  Check,
  Trash2,
  Plus,
  Loader2,
  Sparkles,
  ShieldCheck,
  Eye,
  Zap,
  AlertCircle,
  KeyRound,
} from 'lucide-react';

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  scope: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  use_count: number;
}

export default function McpSettingsPage() {
  const supabase = createClient();

  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // mint flow
  const [newName, setNewName] = useState('Claude Desktop');
  const [creating, setCreating] = useState(false);
  const [justMinted, setJustMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // revoke flow
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/tokens');
      if (res.status === 401) {
        setError('Please sign in.');
        return;
      }
      if (!res.ok) throw new Error('Failed to load tokens');
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_tier, subscription_status, stripe_subscription_id')
          .eq('id', user.id)
          .single();
        const tier = profile?.subscription_tier;
        const status = profile?.subscription_status;
        const hasStripe = !!profile?.stripe_subscription_id;
        const pro =
          tier === 'pro' &&
          (hasStripe
            ? ['active', 'trialing'].includes(status ?? '')
            : status === 'trialing' || status === 'active');
        setIsPro(pro);
        if (pro) await loadTokens();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [supabase, loadTokens]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setJustMinted(null);
    try {
      const res = await fetch('/api/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || 'Claude Desktop' }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to create token');
      }
      setJustMinted(body.token as string);
      setNewName('Claude Desktop');
      await loadTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke "${name}"? Any Claude Desktop session using this token will stop working immediately.`)) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/mcp/tokens/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to revoke');
      }
      await loadTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
      </div>
    );
  }

  if (isPro === false) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-8 text-center">
          <div className="bg-amber-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Pro Feature</h2>
          <p className="text-slate-400 mb-6">
            The Paybacker MCP lets Claude Desktop read your transactions, subscriptions,
            budgets and net worth. It&rsquo;s available on the Pro plan.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  const active = tokens.filter((t) => !t.revoked_at);
  const revoked = tokens.filter((t) => t.revoked_at);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Terminal className="h-7 w-7 text-mint-400" />
          Claude Desktop (MCP)
        </h1>
        <p className="text-slate-400 mt-1 text-sm max-w-2xl">
          Connect Claude Desktop to your Paybacker account so you can ask Claude about
          your transactions, subscriptions, budgets and disputes in natural language.
        </p>
      </div>

      {/* What it does */}
      <div className="bg-navy-900/50 border border-navy-700/50 rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-4">What Claude can do</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col items-start gap-2">
            <div className="bg-mint-500/10 p-2 rounded-lg">
              <Eye className="h-5 w-5 text-mint-400" />
            </div>
            <span className="text-sm font-medium text-white">Read your data</span>
            <span className="text-xs text-slate-400">
              Transactions, subscriptions, budget, net worth and open disputes
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-amber-500/10 p-2 rounded-lg">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <span className="text-sm font-medium text-white">Ask in English</span>
            <span className="text-xs text-slate-400">
              &ldquo;What did I spend on food last month?&rdquo; &mdash; Claude queries Paybacker directly
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-green-500/10 p-2 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-sm font-medium text-white">Read-only by design</span>
            <span className="text-xs text-slate-400">
              No writes, no transfers. Revoke any token instantly.
            </span>
          </div>
        </div>
      </div>

      {/* Quick install snippet */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-400" />
            How to connect
          </h3>
          <Link
            href="/docs/claude-desktop"
            className="text-xs text-mint-400 hover:text-mint-300"
          >
            Full walkthrough →
          </Link>
        </div>
        <ol className="space-y-3 text-sm text-slate-300 list-decimal list-inside">
          <li>Generate a token below and copy it (you only see it once).</li>
          <li>
            In a terminal, run:
            <pre className="mt-2 bg-navy-950 border border-navy-700/50 rounded-lg p-3 text-xs text-mint-300 overflow-x-auto">
              npx @paybacker/mcp setup
            </pre>
          </li>
          <li>Paste your token when asked. Restart Claude Desktop.</li>
          <li>Ask Claude something like &ldquo;summarise my spending last month&rdquo;.</li>
        </ol>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Just-minted token banner */}
      {justMinted && (
        <div className="bg-mint-500/10 border border-mint-500/30 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-mint-300">
                Token created — copy it now, you won&rsquo;t see it again
              </p>
              <p className="text-xs text-mint-200/80 mt-1">
                Store this somewhere safe. If you lose it, revoke it and generate a new one.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 font-mono text-sm text-white bg-navy-950 border border-navy-700/50 rounded-lg px-3 py-2 break-all">
                  {justMinted}
                </code>
                <button
                  onClick={() => handleCopy(justMinted)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-mint-500 hover:bg-mint-400 text-black font-medium rounded-lg text-sm transition-colors"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setJustMinted(null)}
              className="text-mint-300/60 hover:text-mint-200 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create a new token */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-4">Create a new token</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Label, e.g. Claude Desktop on Macbook"
            maxLength={80}
            className="flex-1 bg-navy-950 border border-navy-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-mint-500/60"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-mint-500 hover:bg-mint-400 text-black font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate token
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Read-only. Expires in 180 days. You can have up to 10 active tokens.
        </p>
      </div>

      {/* Active tokens */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl">
        <div className="p-5 border-b border-navy-700/50">
          <h3 className="text-white font-semibold">Active tokens</h3>
          <p className="text-xs text-slate-500 mt-1">
            {active.length === 0
              ? 'No active tokens yet. Generate one above.'
              : `${active.length} active token${active.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        {active.length > 0 && (
          <ul className="divide-y divide-navy-700/40">
            {active.map((t) => (
              <li key={t.id} className="p-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{t.name}</span>
                    <code className="font-mono text-xs text-slate-400 bg-navy-950 px-2 py-0.5 rounded">
                      {t.token_prefix}…
                    </code>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Created {formatDate(t.created_at)}</span>
                    <span>Expires {formatDate(t.expires_at)}</span>
                    <span>
                      {t.use_count === 0
                        ? 'Never used'
                        : `${t.use_count} call${t.use_count === 1 ? '' : 's'}`}
                      {t.last_used_at ? ` · last ${formatDate(t.last_used_at)}` : ''}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(t.id, t.name)}
                  disabled={revokingId === t.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {revokingId === t.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Revoked history */}
      {revoked.length > 0 && (
        <details className="bg-navy-900/50 border border-navy-700/40 rounded-2xl">
          <summary className="p-4 text-sm text-slate-400 cursor-pointer hover:text-slate-300">
            Revoked tokens ({revoked.length})
          </summary>
          <ul className="divide-y divide-navy-700/40">
            {revoked.map((t) => (
              <li key={t.id} className="p-4 text-xs text-slate-500 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-slate-400 font-medium">{t.name}</span>{' '}
                  <code className="font-mono">{t.token_prefix}…</code>
                </div>
                <span>Revoked {t.revoked_at ? formatDate(t.revoked_at) : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
