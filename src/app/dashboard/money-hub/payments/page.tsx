'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CreditCard, Repeat, ArrowUpRight, ChevronLeft, Loader2,
  AlertCircle, TrendingUp, Calendar, Clock, Zap, X,
} from 'lucide-react';

interface Payment {
  id: string;
  provider_name: string;
  amount: number;
  billing_cycle: string;
  category: string;
  status: string;
  next_billing_date: string | null;
  contract_end_date: string | null;
  source: string;
  detected_at: string | null;
  created_at: string;
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: '/month', weekly: '/week', yearly: '/year', quarterly: '/quarter',
};

const CAT_LABELS: Record<string, string> = {
  streaming: 'Streaming', software: 'Software', fitness: 'Gym & Fitness',
  utility: 'Energy', broadband: 'Broadband', mobile: 'Mobile',
  insurance: 'Insurance', mortgage: 'Mortgage', council_tax: 'Council Tax',
  loan: 'Loans', food: 'Food', other: 'Other',
};

function annualCost(amount: number, cycle: string): number {
  if (cycle === 'weekly') return amount * 52;
  if (cycle === 'monthly') return amount * 12;
  if (cycle === 'quarterly') return amount * 4;
  return amount;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function PaymentCard({ payment, type }: { payment: Payment; type: 'subscription' | 'direct_debit' | 'standing_order' }) {
  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4 hover:border-mint-400/30 transition-all">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-white font-semibold text-sm">{payment.provider_name}</h3>
          <span className="text-slate-500 text-xs">{CAT_LABELS[payment.category] || payment.category}</span>
        </div>
        <div className="text-right">
          <p className="text-mint-400 font-bold">£{Math.abs(payment.amount).toFixed(2)}</p>
          <p className="text-slate-500 text-[10px]">{CYCLE_LABELS[payment.billing_cycle] || payment.billing_cycle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
        {payment.next_billing_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Next: {formatDate(payment.next_billing_date)}
          </span>
        )}
        <span className="text-slate-600">£{annualCost(Math.abs(payment.amount), payment.billing_cycle).toFixed(0)}/year</span>
      </div>
    </div>
  );
}

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

  // Categorise by payment type
  const subscriptions = payments.filter(p =>
    ['streaming', 'software', 'fitness'].includes(p.category)
  );
  const directDebits = payments.filter(p =>
    ['utility', 'broadband', 'mobile', 'insurance', 'mortgage', 'council_tax', 'loan'].includes(p.category)
  );
  const standingOrders = payments.filter(p =>
    !['streaming', 'software', 'fitness', 'utility', 'broadband', 'mobile', 'insurance', 'mortgage', 'council_tax', 'loan'].includes(p.category)
  );

  const totalMonthly = payments.reduce((sum, p) => {
    const amt = Math.abs(p.amount);
    if (p.billing_cycle === 'yearly') return sum + amt / 12;
    if (p.billing_cycle === 'quarterly') return sum + amt / 4;
    if (p.billing_cycle === 'weekly') return sum + amt * 4.33;
    return sum + amt;
  }, 0);

  const tabPayments = tab === 'subscriptions' ? subscriptions
    : tab === 'direct_debits' ? directDebits
    : standingOrders;

  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/money-hub" className="flex items-center gap-1 text-slate-400 hover:text-white mb-4 text-sm transition-all">
        <ChevronLeft className="h-4 w-4" /> Back to Money Hub
      </Link>

      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white font-[family-name:var(--font-heading)]">Regular Payments</h1>
        <p className="text-slate-400 mt-1">Every subscription, direct debit, and standing order in one place</p>
      </div>

      {/* Overview Banner */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Total monthly</p>
            <p className="text-2xl font-bold text-white">£{totalMonthly.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Subscriptions</p>
            <p className="text-xl font-bold text-purple-400">{subscriptions.length}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Direct debits</p>
            <p className="text-xl font-bold text-blue-400">{directDebits.length}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Other</p>
            <p className="text-xl font-bold text-slate-400">{standingOrders.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'subscriptions' as const, label: 'Subscriptions', count: subscriptions.length, icon: Zap },
          { key: 'direct_debits' as const, label: 'Direct Debits', count: directDebits.length, icon: Repeat },
          { key: 'standing_orders' as const, label: 'Other Payments', count: standingOrders.length, icon: ArrowUpRight },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
            Total annual cost of {tab.replace('_', ' ')}: <span className="text-white font-bold">
              £{tabPayments.reduce((s, p) => s + annualCost(Math.abs(p.amount), p.billing_cycle), 0).toFixed(0)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
