'use client';
// src/app/dashboard/settings/mcp/page.tsx
// Paybacker MCP — personal access token management for Pro users.
//
// Users mint a token here and paste it into their AI app, which connects to
// the HOSTED MCP server at /api/mcp/v1. The assistant can then read (never
// write) their financial data.
//
// NOTE: this page used to instruct users to run `npx @paybacker/mcp setup`.
// That package was never published to npm, so the command 404s for every
// user who follows it. The connection instructions below are the real ones.
//
// The plaintext token is shown ONCE at mint-time. After that the UI only
// ever sees the 8-char prefix, the label, and usage stats.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { isAtLeastPro } from '@/lib/tier-rank';
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

/** The hosted MCP server users point their AI app at. */
const MCP_SERVER_URL = 'https://paybacker.co.uk/api/mcp/v1';

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
  /** Which set of connection instructions is showing. */
  const [setupTab, setSetupTab] = useState<'Claude' | 'ChatGPT' | 'Claude Code'>('Claude');

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
        // isAtLeastPro, not === 'pro' — the Paybacker Assistant (MCP) is a Pro
        // entitlement, so Household qualify too.
        const pro =
          isAtLeastPro(tier) &&
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
          <h2 className="text-xl font-bold text-slate-900 mb-2">Pro feature</h2>
          <p className="text-slate-600 mb-6">
            The Paybacker Assistant lets a desktop AI app read your transactions, subscriptions,
            budgets and net worth. It&rsquo;s available on the Pro plan.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors"
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

      {/* How to connect */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-slate-900 font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            How to connect
          </h3>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          Paybacker runs a hosted server, so there is nothing to install. It works with
          Claude, ChatGPT and Claude Code.
        </p>

        {/* Server address */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
            Server address
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
              {MCP_SERVER_URL}
            </code>
            <button
              onClick={() => handleCopy(MCP_SERVER_URL)}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm transition-colors"
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          </div>
        </div>

        {/* Surface picker */}
        <div
          role="tablist"
          aria-label="Where to connect"
          className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 mb-4"
        >
          {(['Claude', 'ChatGPT', 'Claude Code'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={setupTab === t}
              onClick={() => setSetupTab(t)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                setupTab === t
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {setupTab === 'Claude' ? (
          <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
            <li>Generate a token below and copy it. You only see it once.</li>
            <li>
              Go to <span className="font-medium">Settings → Connectors → Add custom
              connector</span>, name it Paybacker, and paste the server address above.
            </li>
            <li>
              Set <span className="font-medium">Authentication</span> to{' '}
              <span className="font-medium">None</span>. Paybacker uses an API key
              rather than OAuth, so the automatic OAuth checks will fail. That is
              expected, not a fault.
            </li>
            <li>
              Under <span className="font-medium">Additional request headers</span>, add:
              <div className="mt-2 overflow-x-auto">
                <table className="text-xs w-full">
                  <tbody>
                    <tr>
                      <td className="pr-3 py-1 text-slate-500 align-top whitespace-nowrap">Name</td>
                      <td className="py-1 font-mono text-slate-900">Authorization</td>
                    </tr>
                    <tr>
                      <td className="pr-3 py-1 text-slate-500 align-top whitespace-nowrap">Value</td>
                      <td className="py-1 font-mono text-slate-900 break-all">
                        Bearer pbk_your_token_here
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <span className="text-xs text-slate-500 block mt-1">
                The word <span className="font-mono">Bearer</span>, then a space, then
                your token.
              </span>
            </li>
            <li>
              Click Add, then ask Claude{' '}
              <span className="italic">&ldquo;what are my Paybacker account balances?&rdquo;</span>
            </li>
          </ol>
        ) : setupTab === 'ChatGPT' ? (
          <>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold mb-1">ChatGPT works differently</p>
              <p>
                Its developer mode supports OAuth or no authentication, and does not
                allow custom request headers. So the token goes in the URL rather than
                a header. Needs a paid plan and is web only, not mobile.
              </p>
            </div>
            <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
              <li>Generate a token below and copy it.</li>
              <li>
                In ChatGPT, go to{' '}
                <span className="font-medium">Settings → Apps → Advanced Settings</span>{' '}
                and switch on <span className="font-medium">Developer mode</span>.
              </li>
              <li>
                Go to <span className="font-medium">Settings → Apps → Create</span> and
                use this as the server URL, with your token on the end:
                <pre className="mt-2 bg-slate-900 text-emerald-300 rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`${MCP_SERVER_URL}?token=pbk_your_token_here`}
                </pre>
              </li>
              <li>
                Set authentication to <span className="font-medium">None</span>. Your
                token is already in the URL.
              </li>
              <li>
                Click <span className="font-medium">Scan Tools</span>, wait for it to
                finish, then <span className="font-medium">Create</span>. You should see
                seven Paybacker tools.
              </li>
            </ol>
            <p className="mt-4 text-xs text-slate-500">
              A token in a URL is more likely to end up in a log or a screenshot than one
              in a header, so treat it as slightly more exposed. It is read-only and you
              can revoke it below at any moment. If you use both, keep a separate token
              for ChatGPT so revoking one does not break the other.
            </p>
          </>
        ) : (
          <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
            <li>Generate a token below and copy it.</li>
            <li>
              Run this, pasting your token in place of{' '}
              <span className="font-mono">pbk_your_token_here</span>:
              <pre className="mt-2 bg-slate-900 text-emerald-300 rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`claude mcp add --transport http paybacker \\
  ${MCP_SERVER_URL} \\
  --header "Authorization: Bearer pbk_your_token_here"`}
              </pre>
            </li>
            <li>
              Check it with <span className="font-mono">/mcp</span> inside Claude Code.
              You should see seven Paybacker tools.
            </li>
          </ol>
        )}

        {/* Troubleshooting */}
        <details className="mt-5 group">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900 list-none flex items-center gap-1.5">
            <span className="text-slate-400 group-open:rotate-90 transition-transform">›</span>
            It is not working
          </summary>
          <div className="mt-3 space-y-3 text-sm text-slate-600 pl-4 border-l-2 border-slate-100">
            <p>
              <span className="font-medium text-slate-800">
                The OAuth checks fail when adding the connector.
              </span>{' '}
              Expected. Paybacker authenticates with your token, not OAuth, so there is
              no sign-in server to find. Continue and set Authentication to None.
            </p>
            <p>
              <span className="font-medium text-slate-800">
                It says a connector with this URL already exists.
              </span>{' '}
              Connectors are shared across Claude on web, desktop and mobile, so adding
              it once covers all of them. Use the existing one rather than adding it
              again.
            </p>
            <p>
              <span className="font-medium text-slate-800">
                It is added but Claude does not use it.
              </span>{' '}
              Being in the connector list is not the same as being switched on for a
              chat. Enable it from the <span className="font-mono">+</span> menu in the
              message box, then Connectors. Restarting the desktop app also refreshes a
              stale list.
            </p>
            <p>
              <span className="font-medium text-slate-800">Every tool returns an error.</span>{' '}
              That is the token, not the setup. Check it has not been revoked or expired
              below, and that your plan is still Pro. Revoke and generate a new one if
              in doubt.
            </p>
          </div>
        </details>
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm transition-colors"
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
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
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
        <details className="bg-white border border-slate-200 rounded-2xl">
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
