// @ts-nocheck - Scanner disabled while Google OAuth verification is pending
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ScanSearch, AlertCircle, TrendingUp, Calendar, CreditCard,
  Sparkles, Mail, CheckCircle2, RefreshCw, Loader2, Plus, Shield,
  X, Lock, Eye, EyeOff, Camera, FileText,
} from 'lucide-react';
import ReceiptScanner from '@/components/scanner/ReceiptScanner';
import ReceiptResults from '@/components/scanner/ReceiptResults';

interface EmailConnection {
  id: string;
  email: string;
  provider: string;
  authMethod: string;
  status: string;
  last_scanned_at: string | null;
}

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
  renewal: { icon: Calendar, color: 'text-mint-400', bg: 'bg-mint-400/10', label: 'Renewal Alert' },
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
  switch_deal: { text: 'Track & Find Deal', color: 'bg-mint-400 hover:bg-mint-500 text-navy-950' },
  dispute: { text: 'Track & Dispute', color: 'bg-orange-600 hover:bg-orange-700' },
  claim_refund: { text: 'Track & Claim', color: 'bg-green-600 hover:bg-green-700' },
  monitor: { text: 'Monitor', color: 'bg-navy-700 hover:bg-navy-600' },
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
  const [bankConnections, setBankConnections] = useState<Array<{
    id: string; bank_name: string | null; status: string; last_synced_at: string | null;
    account_display_names: string[] | null; account_ids: string[] | null;
  }>>([]);
  const [expiredBanks, setExpiredBanks] = useState<Array<{ id: string; bank_name: string | null }>>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Email IMAP connections
  const [emailConns, setEmailConns] = useState<EmailConnection[]>([]);
  const [emailLoading, setEmailLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectEmail, setConnectEmail] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [scanningEmailId, setScanningEmailId] = useState<string | null>(null);
  const [emailScanResults, setEmailScanResults] = useState<Record<string, number>>({});

  // Receipt scanner state
  const [showReceiptScanner, setShowReceiptScanner] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);

  const loadReceipts = async () => {
    try {
      const res = await fetch('/api/receipts');
      const data = await res.json();
      if (Array.isArray(data)) setReceipts(data);
    } catch {}
    setReceiptsLoading(false);
  };

  const detectProvider = (email: string): { name: string; note?: string } => {
    const domain = email.split('@')[1]?.toLowerCase();
    const providers: Record<string, { name: string; note?: string }> = {
      'gmail.com': { name: 'Gmail', note: 'Requires an App Password if 2FA is enabled. Go to myaccount.google.com > Security > App Passwords.' },
      'googlemail.com': { name: 'Gmail', note: 'Requires an App Password if 2FA is enabled.' },
      'outlook.com': { name: 'Outlook' },
      'hotmail.com': { name: 'Outlook' },
      'hotmail.co.uk': { name: 'Outlook' },
      'live.com': { name: 'Outlook' },
      'live.co.uk': { name: 'Outlook' },
      'yahoo.com': { name: 'Yahoo', note: 'Requires an App Password.' },
      'yahoo.co.uk': { name: 'Yahoo', note: 'Requires an App Password.' },
      'icloud.com': { name: 'iCloud', note: 'Requires an App-Specific Password from appleid.apple.com.' },
      'me.com': { name: 'iCloud', note: 'Requires an App-Specific Password.' },
      'btinternet.com': { name: 'BT' },
      'sky.com': { name: 'Sky' },
      'virginmedia.com': { name: 'Virgin Media' },
      'aol.com': { name: 'AOL' },
      'protonmail.com': { name: 'ProtonMail', note: 'Requires ProtonMail Bridge.' },
      'proton.me': { name: 'ProtonMail', note: 'Requires ProtonMail Bridge.' },
    };
    if (!domain) return { name: 'Email' };
    return providers[domain] || { name: domain };
  };

  const detectedProvider = connectEmail ? detectProvider(connectEmail) : null;

  const loadEmailConnections = async () => {
    try {
      const res = await fetch('/api/email/connections');
      if (res.ok) {
        const d = await res.json();
        // Map API field names to our interface
        const mapped = (d.connections || []).map((c: any) => ({
          id: c.id,
          email: c.email_address || c.email || '',
          provider: c.provider_type || c.provider || 'email',
          authMethod: c.auth_method || 'imap',
          status: c.status || 'active',
          last_scanned_at: c.last_scanned_at,
        }));
        setEmailConns(mapped);
      }
    } catch {}
    setEmailLoading(false);
  };

  const handleConnectEmail = async () => {
    if (!connectEmail || !connectPassword) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch('/api/email/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: connectEmail, password: connectPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error || 'Connection failed');
        return;
      }
      setShowConnectModal(false);
      setConnectEmail('');
      setConnectPassword('');
      loadEmailConnections();
    } catch (err: any) {
      setConnectError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectEmail = async (id: string) => {
    try {
      await fetch(`/api/email/connections?id=${id}`, { method: 'DELETE' });
      setEmailConns((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  };

  const handleScanEmail = async (connectionId: string) => {
    setScanningEmailId(connectionId);
    try {
      const res = await fetch('/api/email/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmailScanResults((prev) => ({ ...prev, [connectionId]: data.opportunities?.length || 0 }));
        loadEmailConnections();
      }
    } catch {}
    setScanningEmailId(null);
  };

  useEffect(() => {
    fetch('/api/bank/connection')
      .then(r => r.json())
      .then(d => {
        setBankConnections(d.connections || []);
        setExpiredBanks(d.expired || []);
      })
      .catch(() => {})
      .finally(() => setBankLoading(false));
    loadEmailConnections();
    loadReceipts();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/bank/sync', { method: 'POST' });
      const res = await fetch('/api/bank/connection');
      const d = await res.json();
      setBankConnections(d.connections || []);
    } catch {}
    setSyncing(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Scanner</h1>
        <p className="text-slate-400">Detect subscriptions, overcharges, and savings opportunities</p>
      </div>

      {/* Bank connections */}
      {!bankLoading && bankConnections.length > 0 && (
        <div className="mb-6 space-y-3">
          {bankConnections.map((conn) => (
            <div key={conn.id} className="bg-navy-900 border border-green-500/30 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="bg-green-500/10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                  <Shield className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-green-400 font-semibold text-sm">{conn.bank_name || 'Bank connected'}</span>
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">Active</span>
                  </div>
                  <p className="text-slate-500 text-xs">
                    {conn.account_display_names?.join(', ')}
                    {conn.last_synced_at && ` · Last synced: ${new Date(conn.last_synced_at).toLocaleString('en-GB')}`}
                  </p>
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-all text-sm"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Email Accounts */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-mint-400/10 w-10 h-10 rounded-xl flex items-center justify-center">
              <Mail className="h-5 w-5 text-mint-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">Email Accounts</h2>
              <p className="text-slate-500 text-xs">Connect any email to scan for bills, subscriptions, and savings</p>
            </div>
          </div>
          <button
            onClick={() => { setShowConnectModal(true); setConnectError(null); }}
            className="flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm"
          >
            <Plus className="h-4 w-4" />
            Connect Email
          </button>
        </div>

        {/* Connected email accounts */}
        {!emailLoading && emailConns.length > 0 && (
          <div className="space-y-3 mb-3">
            {emailConns.map((conn) => (
              <div key={conn.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-navy-950/50 rounded-xl px-4 py-3 border border-navy-700/50 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium capitalize">{conn.provider === 'outlook' ? 'Outlook' : conn.provider === 'gmail' ? 'Gmail' : conn.provider}</span>
                      <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">Connected</span>
                    </div>
                    <p className="text-slate-400 text-xs truncate">{conn.email}</p>
                    {conn.last_scanned_at && (
                      <p className="text-slate-500 text-xs">Last scanned: {new Date(conn.last_scanned_at).toLocaleString('en-GB')}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {emailScanResults[conn.id] !== undefined && (
                    <span className="text-xs text-mint-400">{emailScanResults[conn.id]} opportunities found</span>
                  )}
                  <button
                    onClick={() => handleScanEmail(conn.id)}
                    disabled={scanningEmailId === conn.id}
                    className="flex items-center gap-1.5 bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition-all text-sm"
                  >
                    {scanningEmailId === conn.id ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning...</>
                    ) : (
                      <><RefreshCw className="h-3.5 w-3.5" /> Scan Now</>
                    )}
                  </button>
                  <button
                    onClick={() => handleDisconnectEmail(conn.id)}
                    className="text-slate-500 hover:text-red-400 text-xs transition-all"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!emailLoading && emailConns.length === 0 && (
          <div className="text-center py-6 bg-navy-950/30 rounded-xl border border-navy-700/30">
            <Mail className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No email accounts connected yet</p>
            <p className="text-slate-600 text-xs mt-1">Connect your email to scan for overcharges, forgotten subscriptions, and savings</p>
          </div>
        )}

        {/* Security note */}
        <div className="flex items-start gap-2 mt-3 bg-navy-950/30 rounded-lg px-3 py-2">
          <Lock className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            Your credentials are encrypted and used only to scan for bills. We never send emails from your account.
          </p>
        </div>
      </div>

      {/* Connect Email Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-navy-900 border border-navy-700 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => { setShowConnectModal(false); setConnectError(null); setConnectEmail(''); setConnectPassword(''); }}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="bg-mint-400/10 w-10 h-10 rounded-xl flex items-center justify-center">
                <Mail className="h-5 w-5 text-mint-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Connect Email</h3>
                <p className="text-slate-400 text-sm">Works with Gmail, Outlook, Yahoo, iCloud, and more</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Provider selector */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Choose your email provider</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { window.location.href = '/api/gmail/auth'; }}
                    className="flex items-center gap-2 bg-navy-950 border border-navy-700 hover:border-mint-400/50 rounded-lg px-4 py-3 transition-all text-left"
                  >
                    <span className="text-xl">📧</span>
                    <div>
                      <p className="text-white text-sm font-medium">Gmail</p>
                      <p className="text-slate-500 text-[10px]">One-click connect</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { window.location.href = '/api/outlook/auth'; }}
                    className="flex items-center gap-2 bg-navy-950 border border-navy-700 hover:border-mint-400/50 rounded-lg px-4 py-3 transition-all text-left"
                  >
                    <span className="text-xl">📬</span>
                    <div>
                      <p className="text-white text-sm font-medium">Outlook / Hotmail</p>
                      <p className="text-slate-500 text-[10px]">One-click connect</p>
                    </div>
                  </button>
                  <button onClick={() => setConnectEmail('@yahoo.')} className="flex items-center gap-2 bg-navy-950 border border-navy-700 hover:border-mint-400/50 rounded-lg px-4 py-3 transition-all text-left">
                    <span className="text-xl">📨</span>
                    <div>
                      <p className="text-white text-sm font-medium">Yahoo Mail</p>
                      <p className="text-slate-500 text-[10px]">Password required</p>
                    </div>
                  </button>
                  <button onClick={() => setConnectEmail('@')} className="flex items-center gap-2 bg-navy-950 border border-navy-700 hover:border-mint-400/50 rounded-lg px-4 py-3 transition-all text-left">
                    <span className="text-xl">✉️</span>
                    <div>
                      <p className="text-white text-sm font-medium">Other</p>
                      <p className="text-slate-500 text-[10px]">iCloud, BT, Sky, etc.</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* IMAP fields for Yahoo/Other */}
              {connectEmail && connectEmail.includes('@') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                    <input
                      type="email"
                      value={connectEmail === '@yahoo.' || connectEmail === '@' ? '' : connectEmail}
                      onChange={(e) => setConnectEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-navy-950 border border-navy-700 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-mint-400/50 text-sm"
                      autoFocus
                    />
                    {detectedProvider && connectEmail.length > 3 && connectEmail.includes('@') && connectEmail !== '@yahoo.' && connectEmail !== '@' && (
                      <p className="text-xs text-mint-400 mt-1.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Detected: {detectedProvider.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Password or App Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={connectPassword}
                        onChange={(e) => setConnectPassword(e.target.value)}
                        placeholder="Your email password"
                        className="w-full bg-navy-950 border border-navy-700 rounded-lg px-4 py-2.5 pr-10 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-mint-400/50 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {detectedProvider?.note && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-amber-400">{detectedProvider.note}</p>
                    </div>
                  )}

                  <button
                    onClick={handleConnectEmail}
                    disabled={connecting || !connectEmail || connectEmail === '@yahoo.' || connectEmail === '@' || !connectPassword}
                    className="w-full flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 disabled:opacity-50 disabled:cursor-not-allowed text-navy-950 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm"
                  >
                    {connecting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
                    ) : (
                      <><Lock className="h-4 w-4" /> Connect Securely</>
                    )}
                  </button>
                </>
              )}

              {connectError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-red-400">{connectError}</p>
                </div>
              )}

              <div className="flex items-start gap-2 bg-navy-950/50 rounded-lg px-3 py-2">
                <Shield className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500">
                  Gmail and Outlook use secure OAuth (no password stored). Other providers use encrypted IMAP. Read-only access. We never send emails from your account.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expired bank connections */}
      {!bankLoading && expiredBanks.length > 0 && bankConnections.length === 0 && (
        <div className="mb-6 space-y-3">
          {expiredBanks.map((conn) => (
            <div key={conn.id} className="bg-navy-900 border border-mint-400/30 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="bg-mint-400/10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                  <Shield className="h-5 w-5 text-mint-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-mint-400 font-semibold text-sm">{conn.bank_name || 'Bank'}</span>
                    <span className="text-xs bg-mint-400/10 text-mint-400 px-2 py-0.5 rounded">Expired</span>
                  </div>
                  <p className="text-slate-500 text-xs">Connection expired. Your data is safe. Reconnect to resume syncing.</p>
                </div>
                <a
                  href="/api/auth/truelayer"
                  className="flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reconnect
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect bank if not connected */}
      {!bankLoading && bankConnections.length === 0 && expiredBanks.length === 0 && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Connect your bank to detect subscriptions</h3>
              <p className="text-slate-400 text-sm">We use TrueLayer (FCA regulated) to securely read your transactions. We never store your credentials.</p>
            </div>
            <a
              href="/api/auth/truelayer"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-xl transition-all text-sm shrink-0"
            >
              <Plus className="h-4 w-4" />
              Connect Bank Account
            </a>
          </div>
        </div>
      )}

      {/* Receipt scanning is now integrated into the AI Letters tab */}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <a href="/dashboard/subscriptions" className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 hover:border-mint-400/30 transition-all">
          <CreditCard className="h-8 w-8 text-mint-400 mb-3" />
          <h3 className="text-white font-semibold mb-1">Track Subscriptions</h3>
          <p className="text-slate-400 text-sm">View and manage all your subscriptions, contracts, and recurring payments</p>
        </a>
        <a href="/dashboard/money-hub" className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 hover:border-mint-400/30 transition-all">
          <TrendingUp className="h-8 w-8 text-green-500 mb-3" />
          <h3 className="text-white font-semibold mb-1">Spending Intelligence</h3>
          <p className="text-slate-400 text-sm">See your full spending breakdown, budgets, and savings opportunities</p>
        </a>
      </div>
    </div>
  );

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
      setError(messages[errParam] || decodeURIComponent(errParam));
      // Don't clear URL immediately so user can see the error
      setTimeout(() => window.history.replaceState({}, '', '/dashboard/scanner'), 5000);
    }
    checkConnections();
  }, []);

  const checkConnections = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check Gmail (legacy table)
    const { data: gmail } = await supabase.from('gmail_tokens').select('email').eq('user_id', user.id).maybeSingle();

    // Check all email connections (Outlook OAuth + IMAP)
    const { data: allEmailConns, error: emailErr } = await supabase
      .from('email_connections')
      .select('email_address, provider_type, auth_method, status')
      .eq('user_id', user.id)
      .eq('status', 'active');

    console.log('[scanner] email_connections query:', { allEmailConns, emailErr, userId: user.id });

    const accounts: ConnectedAccount[] = [];
    if (gmail) accounts.push({ provider: 'gmail', email: gmail.email });

    // Add OAuth connections (Outlook)
    for (const conn of (allEmailConns || [])) {
      if (conn.provider_type === 'outlook' && conn.auth_method === 'oauth') {
        accounts.push({ provider: 'outlook', email: conn.email_address });
      }
    }
    setConnectedAccounts(accounts);

    // Load saved opportunities from database
    const { data: savedOpps } = await supabase
      .from('tasks')
      .select('id, title, description, provider_name, priority, created_at')
      .eq('user_id', user.id)
      .eq('type', 'opportunity')
      .in('status', ['pending_review', 'in_progress'])
      .order('created_at', { ascending: false });

    if (savedOpps && savedOpps.length > 0) {
      const loaded: Opportunity[] = savedOpps.map((t: any) => {
        try {
          const parsed = JSON.parse(t.description);
          return { ...parsed, id: t.id, status: 'new' };
        } catch {
          return {
            id: t.id,
            type: 'other',
            title: t.title,
            description: t.description,
            amount: 0,
            confidence: 50,
            provider: t.provider_name || 'Unknown',
            detected: t.created_at?.substring(0, 10),
            status: 'new',
            emailId: '',
          };
        }
      });
      setOpportunities(loaded);
      setScannedAt(savedOpps[0]?.created_at || null);
    }

    setLoading(false);
  };

  const handleDisconnect = async (provider: 'gmail' | 'outlook') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (provider === 'gmail') {
      await supabase.from('gmail_tokens').delete().eq('user_id', user.id);
    } else {
      await supabase.from('email_connections').delete().eq('user_id', user.id).eq('provider_type', 'outlook').eq('auth_method', 'oauth');
    }
    setConnectedAccounts((prev) => prev.filter((a) => a.provider !== provider));
    setOpportunities([]);
  };

  const handleScan = async () => {
    if (!connectedAccounts.length) return;
    setScanning(true);
    setError(null);

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

      // Merge with existing, dedup by title+provider
      const existingKeys = new Set(opportunities.map(o => `${o.provider}-${o.title}`));
      const newOnly = all.filter((o) => {
        const key = `${o.provider}-${o.title}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      setOpportunities(prev => [...prev, ...newOnly]);
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
          <ScanSearch className="h-10 w-10 text-mint-400" />
          Opportunity Scanner
        </h1>
        <p className="text-slate-400">
          AI scans your inbox for overcharges, renewals, and forgotten subscriptions
        </p>
      </div>

      {/* Data security notice */}
      <div className="flex items-start gap-3 bg-navy-800/40 border border-navy-700/50 rounded-xl px-4 py-3 mb-6">
        <Shield className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Your data is 100% secure.</span> We use read-only access to scan for financial information. We never store full email content, never share your data with third parties, and you can disconnect at any time. All data is encrypted and stored on UK/EU servers.
        </p>
      </div>

      {/* Connect prompt */}
      {!loading && connectedAccounts.length === 0 && (
        <div className="bg-mint-400/10 border border-mint-400/20 rounded-2xl p-8 mb-8 text-center">
          <ScanSearch className="h-12 w-12 text-mint-400/40 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Connect your email to scan for savings</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto mb-4">
            Connect your Gmail or Outlook and our AI will scan up to 2 years of email history to find overcharges, forgotten subscriptions, and savings opportunities.
          </p>
          <p className="text-slate-500 text-sm">
            All plans include a free scan. Essential and Pro get monthly re-scans.
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
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Connected Inboxes</h2>
            {connectedAccounts.length > 0 && (
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-2 bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold px-5 py-2 rounded-lg transition-all text-sm"
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
                <div key={acct.provider} className="flex items-center justify-between bg-navy-950/50 rounded-xl px-4 py-3 border border-navy-700/50">
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
                onClick={() => { window.location.href = '/api/gmail/auth'; }}
                className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm"
              >
                <GoogleIcon />
                Connect Gmail
              </button>
            )}
            {!connectedAccounts.find((a) => a.provider === 'outlook') && (
              <button
                onClick={() => { window.location.href = '/api/outlook/auth'; }}
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
        <div className="bg-navy-900 border border-mint-400/30 rounded-2xl p-8 mb-6">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="h-12 w-12 text-mint-400 animate-spin mb-4" />
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
        <div className="bg-navy-900 border border-green-500/30 rounded-2xl p-5 mb-6">
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
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
            <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">£{totalSavings.toFixed(2)}</h3>
            <p className="text-slate-400 text-sm">Potential savings found</p>
          </div>
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
            <div className="bg-mint-400/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-mint-400" />
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">{opportunities.length}</h3>
            <p className="text-slate-400 text-sm">Opportunities detected</p>
          </div>
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
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
        <div className="text-center py-16 bg-navy-900 border border-navy-700/50 rounded-2xl">
          <Sparkles className="h-16 w-16 text-mint-400/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Ready to scan</h3>
          <p className="text-slate-400 mb-2">Click "Scan All" to analyse your inbox for savings opportunities</p>
          <p className="text-slate-600 text-sm mb-6">Covers the last 12 months of emails</p>
          <button
            onClick={handleScan}
            className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-3 rounded-lg transition-all"
          >
            Start Scanning
          </button>
        </div>
      )}

      {/* Scanning spinner */}
      {scanning && (
        <div className="text-center py-16 bg-navy-900 border border-navy-700/50 rounded-2xl">
          <Loader2 className="h-16 w-16 text-mint-400 mx-auto mb-4 animate-spin" />
          <h3 className="text-xl font-semibold text-white mb-2">Scanning your inbox...</h3>
          <p className="text-slate-400">Paybacker is scanning your bills and subscription emails</p>
        </div>
      )}

      {/* No results after scan */}
      {!scanning && scannedAt && opportunities.length === 0 && (
        <div className="text-center py-16 bg-navy-900 border border-navy-700/50 rounded-2xl">
          <CheckCircle2 className="h-16 w-16 text-green-500/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No opportunities found</h3>
          {scanDebug && (
            <p className="text-slate-500 text-sm mb-2">
              Scanned {scanDebug.emailsScanned} of {scanDebug.emailsFound} matching emails
            </p>
          )}
          {scanDebug && scanDebug.emailsFound === 0 && (
            <p className="text-mint-400 text-sm mb-4">
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
                  filter === f ? 'bg-mint-400 text-navy-950' : 'bg-navy-800 text-slate-400 hover:text-white'
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
                <div key={opp.id} className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 hover:border-mint-400/50 transition-all">
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
                          <div className="flex-1 h-2 bg-navy-800 rounded-full overflow-hidden max-w-xs">
                            <div
                              className={`h-full ${opp.confidence >= 80 ? 'bg-green-500' : opp.confidence >= 60 ? 'bg-amber-500' : 'bg-slate-500'}`}
                              style={{ width: `${opp.confidence}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-white">{opp.confidence}%</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {/* Add to subscriptions - for subscriptions, bills, utilities */}
                          {['subscription', 'forgotten_subscription', 'utility_bill', 'renewal', 'insurance'].includes(opp.type) && (
                            <button
                              disabled={actionLoading === opp.id}
                              onClick={async () => {
                                setActionLoading(opp.id);
                                try {
                                  await fetch('/api/subscriptions', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      provider_name: opp.provider,
                                      category: opp.category || 'other',
                                      amount: opp.paymentAmount || opp.amount || 0,
                                      billing_cycle: opp.paymentFrequency || 'monthly',
                                      source: 'email',
                                    }),
                                  });
                                  setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
                                } catch (err: any) {
                                  setError(`Failed to add: ${err.message}`);
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                            >
                              {actionLoading === opp.id ? 'Adding...' : 'Add to Subscriptions'}
                            </button>
                          )}

                          {/* Write complaint letter - for overcharges, disputes, price increases */}
                          {['overcharge', 'price_increase', 'debt_dispute'].includes(opp.type) && (
                            <button
                              onClick={() => {
                                const params = new URLSearchParams({
                                  company: opp.provider,
                                  issue: opp.description,
                                  amount: opp.amount > 0 ? String(opp.amount) : '',
                                });
                                router.push(`/dashboard/complaints?${params}`);
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                            >
                              Write Complaint Letter
                            </button>
                          )}

                          {/* Claim compensation - for flight delays */}
                          {opp.type === 'flight_delay' && (
                            <button
                              onClick={() => {
                                const params = new URLSearchParams({
                                  company: opp.provider,
                                  issue: opp.description,
                                  amount: opp.amount > 0 ? String(opp.amount) : '520',
                                });
                                router.push(`/dashboard/complaints?${params}`);
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                            >
                              Claim Compensation
                            </button>
                          )}

                          {/* Tax rebate - for HMRC related */}
                          {opp.type === 'tax_rebate' && (
                            <button
                              onClick={() => router.push('/dashboard/complaints?type=hmrc_tax_rebate&new=1')}
                              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                            >
                              Generate HMRC Letter
                            </button>
                          )}

                          {/* Generic track button for anything else */}
                          {!['subscription', 'forgotten_subscription', 'utility_bill', 'renewal', 'insurance', 'overcharge', 'price_increase', 'debt_dispute', 'flight_delay', 'tax_rebate'].includes(opp.type) && (
                            <button
                              onClick={() => {
                                const params = new URLSearchParams({
                                  company: opp.provider,
                                  issue: opp.description,
                                  amount: opp.amount > 0 ? String(opp.amount) : '',
                                });
                                router.push(`/dashboard/complaints?${params}`);
                              }}
                              className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                            >
                              Take Action
                            </button>
                          )}

                          {/* Create Task - always available */}
                          <button
                            onClick={async () => {
                              const taskTitle = prompt('Task name:', opp.title);
                              if (!taskTitle) return;
                              try {
                                await supabase.from('tasks').update({
                                  title: taskTitle,
                                  type: 'other',
                                  status: 'pending_review',
                                }).eq('id', opp.id);
                                setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
                              } catch {}
                            }}
                            className="bg-navy-700 hover:bg-navy-600 text-white px-4 py-2 rounded-lg transition-all text-sm"
                          >
                            Create Task
                          </button>

                          {/* Dismiss - always available */}
                          <button
                            onClick={async () => {
                              setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
                              // Mark as dismissed in DB
                              try { await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', opp.id); } catch {};
                            }}
                            className="bg-navy-800 hover:bg-navy-700 text-slate-400 px-4 py-2 rounded-lg transition-all text-sm"
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
