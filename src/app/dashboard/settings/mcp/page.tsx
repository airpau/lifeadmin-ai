'use client';
// src/app/dashboard/settings/mcp/page.tsx
// Paybacker MCP — personal access token management for Pro users.
// Users mint a token here, paste it into their desktop AI app via the
// @paybacker/mcp npm package, and the assistant can then read (never write)
// their financial data.
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
  const [newName, setNewName] = useState('Paybacker Assistant');
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
        body: JSON.stringify({ name: newName.trim() || 'Paybacker Assistant' }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to create token');
      }
      setJustMinted(body.token as string);
      setNewName('Paybacker Assistant');
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
    if (!confirm(`Revoke "${name}"? Any AI assistant session using this token will stop working immediately.`)) return;
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
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (isPro === false) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-8 text-center">
          <div className="bg-orange-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-orange-600" />
          </div>
          <h2 style={{fontSize:18,fontWeight:700,letterSpacing:"-.01em",margin:"0 0 10px"}}>Pro feature</h2>
          <p className="text-slate-600 mb-6">
            The Paybacker Assistant lets a desktop AI app read your transactions, subscriptions,
            budgets and net worth. It&rsquo;s available on the Pro plan.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold rounded-xl transition-colors"
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
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Terminal className="h-7 w-7 text-emerald-600" />
          Paybacker Assistant (MCP)
        </h1>
        <p className="text-slate-600 mt-1 text-sm max-w-2xl">
          Connect a desktop AI assistant to your Paybacker account so you can ask about
          your transactions, subscriptions, budgets and disputes in natural language.
        </p>
      </div>

      {/* What it does */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <h3 className="text-slate-900 font-semibold mb-4">What your assistant can do</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col items-start gap-2">
            <div className="bg-emerald-50 p-2 rounded-lg">
              <Eye className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-slate-900">Read your data</span>
            <span className="text-xs text-slate-600">
              Transactions, subscriptions, budget, net worth and open disputes
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-orange-50 p-2 rounded-lg">
              <Zap className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-sm font-medium text-slate-900">Ask in English</span>
            <span className="text-xs text-slate-600">
              &ldquo;What did I spend on food last month?&rdquo; &mdash; your assistant queries Paybacker directly
            </span>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="bg-emerald-50 p-2 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-slate-900">Read-only by design</span>
            <span className="text-xs text-slate-600">
              No writes, no transfers. Revoke any token instantly.
            </span>
          </div>
        </div>
      </div>

      {/* Quick install snippet */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-900 font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            How to connect
          </h3>
          <Link
            href="/docs/paybacker-assistant"
            className="text-xs text-emerald-600 hover:text-emerald-700"
          >
            Full walkthrough →
          </Link>
        </div>
        <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
          <li>Generate a token below and copy it (you only see it once).</li>
          <li>
            In a terminal, run:
            <pre className="mt-2 bg-white text-emerald-300 rounded-lg p-3 text-xs overflow-x-auto font-mono">
              npx @paybacker/mcp setup
            </pre>
          </li>
          <li>Paste your token when asked. Restart your AI desktop app.</li>
          <li>Ask it something like &ldquo;summarise my spending last month&rdquo;.</li>
        </ol>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Just-minted token banner */}
      {justMinted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">
                Token created — copy it now, you won&rsquo;t see it again
              </p>
              <p className="text-xs text-emerald-700/80 mt-1">
                Store this somewhere safe. If you lose it, revoke it and generate a new one.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 font-mono text-sm text-slate-900 bg-white border border-emerald-200 rounded-lg px-3 py-2 break-all">
                  {justMinted}
                </code>
                <button
                  onClick={() => handleCopy(justMinted)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-medium rounded-lg text-sm transition-colors"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setJustMinted(null)}
              className="text-emerald-700/60 hover:text-emerald-800 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create a new token */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <h3 className="text-slate-900 font-semibold mb-4">Create a new token</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Label, e.g. Paybacker Assistant on Macbook"
            maxLength={80}
            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
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
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-slate-900 font-semibold">Active tokens</h3>
          <p className="text-xs text-slate-500 mt-1">
            {active.length === 0
              ? 'No active tokens yet. Generate one above.'
              : `${active.length} active token${active.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        {active.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {active.map((t) => (
              <li key={t.id} className="p-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 truncate">{t.name}</span>
                    <code className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
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
        <details className="card">
          <summary className="p-4 text-sm text-slate-600 cursor-pointer hover:text-slate-800">
            Revoked tokens ({revoked.length})
          </summary>
          <ul className="divide-y divide-slate-200">
            {revoked.map((t) => (
              <li key={t.id} className="p-4 text-xs text-slate-500 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-slate-700 font-medium">{t.name}</span>{' '}
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
