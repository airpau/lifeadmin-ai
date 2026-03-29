'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CreditCard, Repeat, ArrowUpRight, ChevronLeft, Loader2,
  AlertCircle, TrendingUp, TrendingDown, Calendar, Zap, FileText,
  ExternalLink, Tag, X as XIcon,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Payment {
  id: string;
  provider_name: string;
  amount: number;
  billing_cycle: string;
  category: string;
  status: string;
  next_billing_date: string | null;
  contract_end_date: string | null;
  last_used_date: string | null;
  source: string;
  created_at: string;
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: '/mo', weekly: '/wk', yearly: '/yr', quarterly: '/qtr',
};

import { getCategoryLabel } from '@/lib/category-config';

const PIE_COLORS = ['#a78bfa', '#3b82f6', '#34d399', '#f59e0b', '#ef4444', '#64748b'];

const DD_CATEGORIES = new Set(['utility', 'broadband', 'mobile', 'insurance', 'mortgage', 'council_tax', 'loan', 'water']);
const APP_SUB_CATEGORIES = new Set(['streaming', 'software', 'fitness']);

function annualCost(amount: number, cycle: string): number {
  if (cycle === 'weekly') return amount * 52;
  if (cycle === 'monthly') return amount * 12;
  if (cycle === 'quarterly') return amount * 4;
  return amount;
}

function monthlyEquiv(amount: number, cycle: string): number {
  if (cycle === 'weekly') return amount * 4.33;
  if (cycle === 'quarterly') return amount / 3;
  if (cycle === 'yearly') return amount / 12;
  return amount;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function cleanProviderName(raw: string): string {
  // Strip common bank noise: reference numbers, payment prefixes, PayPal wrappers
  let clean = raw
    .replace(/^DD\s+/i, '')
    .replace(/^STO\s+/i, '')
    .replace(/^PAYPAL \*/i, '')
    .replace(/\d{10,}/g, '') // long reference numbers
    .replace(/\s+(LTD|LIMITED|PLC|UK|GB|CO)\s*$/i, '')
    .replace(/\s+\d+\s*$/g, '') // trailing numbers
    .trim();

  // Title case
  if (clean === clean.toUpperCase() && clean.length > 3) {
    clean = clean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  return clean || raw;
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function daysSince(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// ============================================================
// Payment Card
// ============================================================
function PaymentCard({ payment, type }: { payment: Payment; type: string }) {
  const name = cleanProviderName(payment.provider_name);
  const initials = getInitials(name);
  const lastUsedDays = daysSince(payment.last_used_date);
  const unusedWarning = type === 'subscription' && lastUsedDays != null && lastUsedDays > 30;

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4 hover:border-mint-400/30 transition-all">
      <div className="flex items-start gap-3">
        {/* Logo / initials */}
        <div className="w-10 h-10 rounded-lg bg-navy-800 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-white font-semibold text-sm truncate">{name}</h3>
              <span className="text-slate-500 text-xs">{getCategoryLabel(payment.category)}</span>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <p className="text-mint-400 font-bold">£{Math.abs(payment.amount).toFixed(2)}</p>
              <p className="text-slate-500 text-[10px]">{CYCLE_LABELS[payment.billing_cycle] || payment.billing_cycle}</p>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 flex-wrap">
            {payment.next_billing_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Next: {formatDate(payment.next_billing_date)}
              </span>
            )}
            <span className="text-slate-600">£{annualCost(Math.abs(payment.amount), payment.billing_cycle).toFixed(0)}/year</span>
          </div>

          {/* Usage warning */}
          {unusedWarning && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1">
              <AlertCircle className="h-3 w-3" />
              Not used in {lastUsedDays}+ days — consider cancelling
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            {type === 'subscription' && (
              <Link
                href={`/dashboard/subscriptions`}
                className="text-[10px] bg-navy-800 hover:bg-navy-700 text-slate-300 px-2 py-1 rounded transition-all"
              >
                View details
              </Link>
            )}
            {['energy', 'broadband', 'mobile', 'insurance', 'streaming', 'software'].includes(payment.category) && (
              <Link
                href={`/dashboard/deals`}
                className="text-[10px] bg-mint-400/10 text-mint-400 px-2 py-1 rounded transition-all hover:bg-mint-400/20"
              >
                Switch & Save
              </Link>
            )}
            <Link
              href={`/dashboard/complaints?new=1&company=${encodeURIComponent(name)}`}
              className="text-[10px] bg-navy-800 hover:bg-navy-700 text-slate-300 px-2 py-1 rounded transition-all"
            >
              Dispute
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================
export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'subscriptions' | 'direct_debits' | 'standing_orders'>('subscriptions');

  useEffect(() => {
    fetch('/api/subscriptions')
      .then(r => r.json())
      .then((data: any) => {
        const subs = Array.isArray(data) ? data : data.subscriptions || [];
        setPayments(subs.filter((s: any) => s.status === 'active'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // All = everything from subscriptions table (matches subscriptions page count)
  const appSubs = payments.filter(p => APP_SUB_CATEGORIES.has(p.category));
  const directDebits = payments.filter(p => DD_CATEGORIES.has(p.category));
  const otherPayments = payments.filter(p => !APP_SUB_CATEGORIES.has(p.category) && !DD_CATEGORIES.has(p.category));

  const totalMonthly = payments.reduce((sum, p) => sum + monthlyEquiv(Math.abs(p.amount), p.billing_cycle), 0);

  const tabPayments = tab === 'subscriptions' ? payments // "All Payments" shows everything
    : tab === 'direct_debits' ? directDebits
    : appSubs;

  // Pie chart data
  const pieData = [
    { name: 'Apps & Streaming', value: Math.round(appSubs.reduce((s, p) => s + monthlyEquiv(Math.abs(p.amount), p.billing_cycle), 0)) },
    { name: 'Bills & Utilities', value: Math.round(directDebits.reduce((s, p) => s + monthlyEquiv(Math.abs(p.amount), p.billing_cycle), 0)) },
    { name: 'Other', value: Math.round(otherPayments.reduce((s, p) => s + monthlyEquiv(Math.abs(p.amount), p.billing_cycle), 0)) },
  ].filter(d => d.value > 0);

  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/money-hub" className="flex items-center gap-1 text-slate-400 hover:text-white mb-4 text-sm transition-all">
        <ChevronLeft className="h-4 w-4" /> Back to Money Hub
      </Link>

      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white font-[family-name:var(--font-heading)]">Regular Payments</h1>
        <p className="text-slate-400 mt-1">Every subscription, direct debit, and standing order in one place</p>
      </div>

      {/* Overview with Pie Chart */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Pie chart */}
          {pieData.length > 0 && (
            <div className="w-40 h-40 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    formatter={(value: any) => [`£${value}/mo`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 w-full">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Total monthly</p>
              <p className="text-2xl font-bold text-white">£{totalMonthly.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Total payments</p>
              <p className="text-xl font-bold text-purple-400">{payments.length}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Bills & utilities</p>
              <p className="text-xl font-bold text-blue-400">{directDebits.length}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Annual total</p>
              <p className="text-xl font-bold text-mint-400">£{(totalMonthly * 12).toFixed(0)}</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        {pieData.length > 0 && (
          <div className="flex gap-4 mt-4 justify-center">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name}: £{d.value}/mo
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {[
          { key: 'subscriptions' as const, label: 'All Payments', count: payments.length, icon: Zap },
          { key: 'direct_debits' as const, label: 'Bills & Utilities', count: directDebits.length, icon: Repeat },
          { key: 'standing_orders' as const, label: 'Apps & Streaming', count: appSubs.length, icon: ArrowUpRight },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-mint-400 text-navy-950' : 'bg-navy-800 text-slate-400 hover:text-white'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-mint-400" />
        </div>
      ) : tabPayments.length === 0 ? (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-12 text-center">
          <CreditCard className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No {tab.replace('_', ' ')} found</p>
          <p className="text-slate-500 text-sm mt-1">Connect your bank account to auto-detect payments</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {tabPayments
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
            .map(p => (
              <PaymentCard key={p.id} payment={p} type={tab === 'subscriptions' ? 'subscription' : tab === 'direct_debits' ? 'direct_debit' : 'standing_order'} />
            ))
          }
        </div>
      )}

      {/* Annual total */}
      {tabPayments.length > 0 && (
        <div className="mt-6 bg-navy-900/50 border border-navy-700/50 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-sm">
            Annual cost: <span className="text-white font-bold">
              £{tabPayments.reduce((s, p) => s + annualCost(Math.abs(p.amount), p.billing_cycle), 0).toFixed(0)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
