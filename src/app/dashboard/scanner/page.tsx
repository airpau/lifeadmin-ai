'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ScanSearch, AlertCircle, TrendingUp, Calendar, CreditCard,
  Sparkles, Mail, CheckCircle2, RefreshCw, Loader2, Plus,
} from 'lucide-react';

interface Opportunity {
  id: string;
  type: string;
  category?: string;
  title: string;
  description: string;
  amount: number;
  confidence: number;
  provider: string;
  detected: string;
  status: 'new' | 'reviewing';
  suggestedAction?: 'track' | 'cancel' | 'switch_deal' | 'dispute' | 'claim_refund' | 'monitor';
  contractEndDate?: string | null;
  paymentAmount?: number | null;
  paymentFrequency?: string | null;
  accountNumber?: string | null;
}

interface ConnectedAccount {
  provider: 'gmail' | 'outlook';
  email: string;
}

const typeConfig: Record<string, { icon: typeof AlertCircle; color: string; bg: string; label: string }> = {
  overcharge: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Overcharge' },
  renewal: { icon: Calendar, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Renewal Alert' },
  forgotten_subscription: { icon: CreditCard, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Unused Subscription' },
  price_increase: { icon: TrendingUp, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Price Increase' },
  loan: { icon: CreditCard, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Loan' },
  credit_card: { icon: CreditCard, color: 'text-violet-500', bg: 'bg-violet-500/10', label: 'Credit Card' },
  insurance: { icon: AlertCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Insurance' },
  utility_bill: { icon: TrendingUp, color: 'text-cyan-500', bg: 'bg-cyan-500/10', label: 'Utility Bill' },
  refund_opportunity: { icon: AlertCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Refund' },
  flight_delay: { icon: AlertCircle, color: 'text-sky-500', bg: 'bg-sky-500/10', label: 'Flight Delay' },
};

const actionLabels: Record<string, { text: string; color: string }> = {
  track: { text: 'Track', color: 'bg-blue-600 hover:bg-blue-700' },
  cancel: { text: 'Track & Cancel', color: 'bg-red-600 hover:bg-red-700' },
  switch_deal: { text: 'Track & Find Deal', color: 'bg-amber-500 hover:bg-amber-600 text-slate-950' },
  dispute: { text: 'Track & Dispute', color: 'bg-orange-600 hover:bg-orange-700' },
  claim_refund: { text: 'Track & Claim', color: 'bg-green-600 hover:bg-green-700' },
  monitor: { text: 'Monitor', color: 'bg-slate-700 hover:bg-slate-600' },
};

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const OutlookIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="4" fill="#0078D4"/>
    <path d="M13 6h7v12h-7V6z" fill="#fff" fillOpacity=".3"/>
    <path d="M4 7l9-1v12L4 17V7z" fill="#fff"/>
    <ellipse cx="8.5" cy="12" rx="2.5" ry="3" fill="#0078D4"/>
  </svg>
);

export default function ScannerPage() {
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanDebug, setScanDebug] = useState<{ emailsFound: number; emailsScanned: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'new' | 'reviewing'>('all');
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // opp.id being acted on
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true' || params.get('outlook_connected') === 'true') {
      window.history.replaceState({}, '', '/dashboard/scanner');
    }
    const errParam = params.get('error');
    if (errParam) {
      const messages: Record<string, string> = {
        outlook_not_configured: 'Outlook integration not yet configured — contact support.',
        outlook_connection_failed: 'Failed to connect Outlook. Please try again.',
        access_denied: 'Gmail access was denied. Please try again and allow the requested permissions.',
        connection_failed: 'Connection failed. If this keeps happening, try disconnecting and reconnecting your inbox.',
        missing_params: 'OAuth callback missing required parameters. Please try connecting again.',
        invalid_state: 'Security check failed. Please try connecting again.',
      };
      setError(messages[errParam] || `Connection failed: ${errParam}. Please try again.`);
      window.history.replaceState({}, '', '/dashboard/scanner');
    }
    checkConnections();
  }, []);

  const checkConnections = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: gmail }, { data: outlook }] = await Promise.all([
      supabase.from('gmail_tokens').select('email').eq('user_id', user.id).single(),
      supabase.from('outlook_tokens').select('email').eq('user_id', user.id).single(),
    ]);

    const accounts: ConnectedAccount[] = [];
    if (gmail) accounts.push({ provider: 'gmail', email: gmail.email });
    if (outlook) accounts.push({ provider: 'outlook', email: outlook.email });
    setConnectedAccounts(accounts);
    setLoading(false);
  };

  const handleDisconnect = async (provider: 'gmail' | 'outlook') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const table = provider === 'gmail' ? 'gmail_tokens' : 'outlook_tokens';
    await supabase.from(table).delete().eq('user_id', user.id);
    setConnectedAccounts((prev) => prev.filter((a) => a.provider !== provider));
    setOpportunities([]);
  };

  const handleScan = async () => {
    if (!connectedAccounts.length) return;
    setScanning(true);
    setError(null);
    setOpportunities([]);

    try {
      // Scan all connected providers in parallel
      const scans = connectedAccounts.map((acct) => {
        const endpoint = acct.provider === 'gmail' ? '/api/gmail/scan' : '/api/outlook/scan';
        return fetch(endpoint, { method: 'POST' })
          .then((r) => r.json())
          .then((d) => {
            if (d.error) throw new Error(`${acct.provider}: ${d.error}`);
            return d;
          });
      });

      const results = await Promise.all(scans);
      const all: Opportunity[] = results.flatMap((d) => d.opportunities || []);

      // Aggregate debug info
      const totalFound = results.reduce((s, d) => s + (d.emailsFound || 0), 0);
      const totalScanned = results.reduce((s, d) => s + (d.emailsScanned || 0), 0);
      setScanDebug({ emailsFound: totalFound, emailsScanned: totalScanned });

      // Deduplicate by title+provider in case both inboxes have same email
      const seen = new Set<string>();
      const deduped = all.filter((o) => {
        const key = `${o.provider}-${o.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setOpportunities(deduped);
      setScannedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err.message || 'Scan failed. Try disconnecting and reconnecting your inbox.');
    } finally {
      setScanning(false);
    }
  };

  const filteredOpportunities = opportunities.filter(
    (o) => filter === 'all' || o.status === filter
  );
  const totalSavings = opportunities.reduce((s, o) => s + (o.amount || 0), 0);
  const highConfidence = opportunities.filter((o) => o.confidence >= 80).length;

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <ScanSearch className="h-10 w-10 text-amber-500" />
          Opportunity Scanner
        </h1>
        <p className="text-slate-400">
          AI scans your inbox for overcharges, renewals, and forgotten subscriptions
        </p>
      </div>

      {/* Tier gate - Essential+ only */}
      {!loading && connectedAccounts.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 mb-8 text-center">
          <ScanSearch className="h-12 w-12 text-amber-500/40 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Connect your email to scan for savings</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto mb-4">
            Connect your Gmail or Outlook and our AI will scan up to 2 years of email history to find overcharges, forgotten subscriptions, and savings opportunities.
          </p>
          <p className="text-slate-500 text-sm">
            Available on Essential and Pro plans. You can also connect your bank account from the <a href="/dashboard/subscriptions" className="text-amber-400 hover:text-amber-300 underline">Subscriptions</a> page.
        </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-6 py-4 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Connect accounts section */}
      {!loading && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Connected Inboxes</h2>
            {connectedAccounts.length > 0 && (
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold px-5 py-2 rounded-lg transition-all text-sm"
              >
                {scanning
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Deep scanning your emails...</>
                  : <><RefreshCw className="h-4 w-4" /> Scan Inbox</>}
              </button>
            )}
          </div>

          {/* Connected accounts list */}
          {connectedAccounts.length > 0 && (
            <div className="space-y-3 mb-4">
              {connectedAccounts.map((acct) => (
                <div key={acct.provider} className="flex items-center justify-between bg-slate-950/50 rounded-xl px-4 py-3 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {acct.provider === 'gmail' ? <GoogleIcon /> : <OutlookIcon />}
                    <span className="text-white text-sm font-medium capitalize">{acct.provider}</span>
                    <span className="text-slate-400 text-sm">({acct.email})</span>
                  </div>
                  <button
                    onClick={() => handleDisconnect(acct.provider)}
                    className="text-slate-500 hover:text-red-400 text-xs transition-all"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add inbox buttons */}
          <div className="flex flex-wrap gap-3">
            {!connectedAccounts.find((a) => a.provider === 'gmail') && (
              <button
                onClick={() => { window.location.href = '/api/auth/google'; }}
                className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm"
              >
                <GoogleIcon />
                Connect Gmail
              </button>
            )}
            {!connectedAccounts.find((a) => a.provider === 'outlook') && (
              <button
                onClick={() => { window.location.href = '/api/auth/microsoft'; }}
                className="flex items-center gap-2 bg-[#0078D4] hover:bg-[#006cbd] text-white font-semibold px-5 py-2.5 rounded-lg transition-all text-sm"
              >
                <OutlookIcon />
                Connect Outlook
              </button>
            )}
            {connectedAccounts.length === 0 && (
              <p className="text-slate-500 text-sm self-center ml-1">
                Connect an inbox to scan for savings opportunities
              </p>
            )}
          </div>
        </div>
      )}

      {loading && !scanning && (
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 text-slate-500 mx-auto animate-spin" />
        </div>
      )}

      {/* Scanning progress */}
      {scanning && (
        <div className="bg-slate-900/50 border border-amber-500/30 rounded-2xl p-8 mb-6">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Deep scanning your inbox</h3>
            <p className="text-slate-400 text-sm mb-4">
              Scanning up to 2 years of emails for subscriptions, bills, loans, insurance, renewals, and savings opportunities. This may take up to a minute.
            </p>
            <div className="flex items-center gap-6 text-xs text-slate-500">
              <span>Searching emails</span>
              <span>Extracting financial data</span>
              <span>Finding savings</span>
            </div>
          </div>
        </div>
      )}

      {/* Scan summary */}
      {!scanning && scanDebug && opportunities.length > 0 && (
        <div className="bg-slate-900/50 border border-green-500/30 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-white font-semibold mb-1">Scan complete</h3>
              <p className="text-slate-400 text-sm">
                Scanned {scanDebug.emailsScanned} emails from the last 12 months.
                Found {opportunities.length} {opportunities.length === 1 ? 'opportunity' : 'opportunities'} across {new Set(opportunities.map(o => o.provider)).size} providers
                with potential savings of £{totalSavings.toFixed(2)}.
                {highConfidence > 0 && ` ${highConfidence} ${highConfidence === 1 ? 'item' : 'items'} need attention.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {!scanning && opportunities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">£{totalSavings.toFixed(2)}</h3>
            <p className="text-slate-400 text-sm">Potential savings found</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-amber-500" />
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">{opportunities.length}</h3>
            <p className="text-slate-400 text-sm">Opportunities detected</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">{highConfidence}</h3>
            <p className="text-slate-400 text-sm">High confidence (80%+)</p>
          </div>
        </div>
      )}

      {/* First-time prompt */}
      {!loading && !scanning && connectedAccounts.length > 0 && opportunities.length === 0 && !scannedAt && (
        <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <Sparkles className="h-16 w-16 text-amber-500/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Ready to scan</h3>
          <p className="text-slate-400 mb-2">Click "Scan All" to analyse your inbox for savings opportunities</p>
          <p className="text-slate-600 text-sm mb-6">Covers the last 12 months of emails</p>
          <button
            onClick={handleScan}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-8 py-3 rounded-lg transition-all"
          >
            Start Scanning
          </button>
        </div>
      )}

      {/* Scanning spinner */}
      {scanning && (
        <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <Loader2 className="h-16 w-16 text-amber-500 mx-auto mb-4 animate-spin" />
          <h3 className="text-xl font-semibold text-white mb-2">Scanning your inbox...</h3>
          <p className="text-slate-400">Paybacker is scanning your bills and subscription emails</p>
        </div>
      )}

      {/* No results after scan */}
      {!scanning && scannedAt && opportunities.length === 0 && (
        <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <CheckCircle2 className="h-16 w-16 text-green-500/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No opportunities found</h3>
          {scanDebug && (
            <p className="text-slate-500 text-sm mb-2">
              Scanned {scanDebug.emailsScanned} of {scanDebug.emailsFound} matching emails
            </p>
          )}
          {scanDebug && scanDebug.emailsFound === 0 && (
            <p className="text-amber-400 text-sm mb-4">
              No billing emails matched — try disconnecting and reconnecting your inbox to refresh permissions.
            </p>
          )}
          <p className="text-slate-400 text-sm">Check back after new bills or subscription emails arrive.</p>
        </div>
      )}

      {/* Scanned at */}
      {scannedAt && opportunities.length > 0 && (
        <p className="text-slate-500 text-sm mb-4">
          Last scanned {new Date(scannedAt).toLocaleTimeString('en-GB')} · {connectedAccounts.length} inbox{connectedAccounts.length > 1 ? 'es' : ''}
          {scanDebug && ` · ${scanDebug.emailsScanned} emails analysed`}
        </p>
      )}

      {/* Filter + Results */}
      {opportunities.length > 0 && (
        <>
          <div className="flex gap-2 mb-6">
            {['all', 'new', 'reviewing'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === f ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {f === 'all' ? 'All' : f === 'new' ? 'New' : 'Reviewing'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredOpportunities.map((opp) => {
              const config = typeConfig[opp.type] || typeConfig.overcharge;
              const Icon = config.icon;
              return (
                <div key={opp.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4 flex-1">
                      <div className={`${config.bg} w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`h-6 w-6 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-xs font-semibold ${config.color} ${config.bg} px-2 py-1 rounded`}>
                            {config.label}
                          </span>
                          <span className="text-xs text-slate-500">
                            {opp.provider} · Detected {new Date(opp.detected).toLocaleDateString('en-GB')}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">{opp.title}</h3>
                        <p className="text-slate-400 text-sm mb-4">{opp.description}</p>
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-xs text-slate-500">Confidence:</span>
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden max-w-xs">
                            <div
                              className={`h-full ${opp.confidence >= 80 ? 'bg-green-500' : opp.confidence >= 60 ? 'bg-amber-500' : 'bg-slate-500'}`}
                              style={{ width: `${opp.confidence}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-white">{opp.confidence}%</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {opp.type === 'forgotten_subscription' ? (
                            <button
                              disabled={actionLoading === opp.id}
                              onClick={async () => {
                                setActionLoading(opp.id);
                                try {
                                  const res = await fetch('/api/subscriptions', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      provider_name: opp.provider,
                                      category: 'other',
                                      amount: opp.amount ?? 0,
                                      billing_cycle: 'monthly',
                                      usage_frequency: 'rarely',
                                    }),
                                  });
                                  if (!res.ok) {
                                    const d = await res.json();
                                    throw new Error(d.error || 'Failed to save subscription');
                                  }
                                } catch (err: any) {
                                  setError(`Track failed: ${err.message}`);
                                } finally {
                                  setActionLoading(null);
                                  router.push('/dashboard/subscriptions');
                                }
                              }}
                              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold px-5 py-2 rounded-lg transition-all text-sm"
                            >
                              {actionLoading === opp.id ? 'Saving...' : (actionLabels[opp.suggestedAction || 'track']?.text || 'Track')}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const params = new URLSearchParams({
                                  company: opp.provider,
                                  issue: opp.description,
                                  amount: opp.amount > 0 ? String(opp.amount) : '',
                                });
                                router.push(`/dashboard/complaints?${params}`);
                              }}
                              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-5 py-2 rounded-lg transition-all text-sm"
                            >
                              Raise Complaint
                            </button>
                          )}
                          <button
                            onClick={() => setOpportunities((prev) => prev.filter((o) => o.id !== opp.id))}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-lg transition-all text-sm"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                    {opp.amount > 0 && (
                      <div className="text-right ml-4 flex-shrink-0">
                        <div className="text-2xl font-bold text-green-500">+£{opp.amount.toFixed(2)}</div>
                        <div className="text-xs text-slate-500">Potential savings</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
