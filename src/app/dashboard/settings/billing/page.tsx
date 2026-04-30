'use client';
// src/app/dashboard/settings/billing/page.tsx
// Dedicated billing route — batch8 BillingPage design ported onto the
// existing Stripe sync + customer-portal flow.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { CreditCard, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';

type Tier = 'free' | 'essential' | 'pro';

interface ProfileRow {
  subscription_tier: Tier | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  trial_ends_at: string | null;
  founding_member: boolean | null;
}

const TIER_COPY: Record<Tier, { price: string; cadence: string; include: string }> = {
  free: { price: '£0', cadence: '/forever', include: '3 letters/mo · manual tracker · one-time scans' },
  essential: { price: '£4.99', cadence: '/month', include: 'Unlimited letters · 1 bank + 1 email · daily auto-sync' },
  pro: { price: '£9.99', cadence: '/month', include: 'Unlimited banks + emails · priority support · export + MCP' },
};

export default function BillingPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('subscription_tier, subscription_status, stripe_customer_id, trial_ends_at, founding_member')
          .eq('id', user.id)
          .single();
        if (data) setProfile(data as ProfileRow);
      } finally {
        setLoading(false);
      }

      try {
        const res = await fetch('/api/stripe/sync', { method: 'POST' });
        const d = await res.json();
        if (d?.currentPeriodEnd) {
          setRenewalDate(
            new Date(d.currentPeriodEnd).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric',
            })
          );
        }
      } catch {}
    })();
  }, [supabase]);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setPortalError(data?.error || 'Could not open the billing portal. Try again shortly.');
    } catch {
      setPortalError('Could not open the billing portal. Try again shortly.');
    } finally {
      setPortalLoading(false);
    }
  };

  const tier: Tier = (profile?.subscription_tier as Tier) || 'free';
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const isFree = tier === 'free' || !profile?.stripe_customer_id;

  if (loading) {
    return (
      <div className="max-w-5xl flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="page-title-row" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Billing &amp; subscription</h1>
          <p className="page-sub">
            Manage your Paybacker plan, payment method, and invoice history. Changes prorate instantly through Stripe.
          </p>
        </div>
      </div>

      {/* Current plan */}
      <div
        className="card"
        style={{
          background: tier === 'pro'
            ? 'linear-gradient(135deg,#F0FDF4,#DCFCE7)'
            : tier === 'essential'
              ? 'linear-gradient(135deg,#F0F9FF,#E0F2FE)'
              : '#FFFFFF',
          borderColor: tier === 'pro' ? '#86EFAC' : tier === 'essential' ? '#BAE6FD' : undefined,
          marginBottom: 14,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
          Current plan
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>Paybacker {tierLabel}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 4 }}>
              {isFree
                ? 'No active subscription — upgrade to unlock full access.'
                : `${TIER_COPY[tier].price}${TIER_COPY[tier].cadence}${renewalDate ? ` · renews ${renewalDate}` : ''} · 0% success fee, always`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isFree ? (
              <Link href="/pricing" className="cta">Upgrade plan</Link>
            ) : (
              <button onClick={handleManageBilling} disabled={portalLoading} className="cta-ghost">
                {portalLoading ? 'Opening…' : 'Manage plan'}
              </button>
            )}
          </div>
        </div>
        {portalError && (
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--rose-deep)' }}>{portalError}</p>
        )}
      </div>

      {/* Switch tier */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 14 }}>
          Switch tier
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="tier-grid">
          {(['free', 'essential', 'pro'] as Tier[]).map((t) => {
            const on = t === tier;
            const copy = TIER_COPY[t];
            return (
              <div
                key={t}
                style={{
                  padding: '18px 20px',
                  borderRadius: 12,
                  border: '2px solid',
                  borderColor: on ? 'var(--mint-deep)' : 'var(--divider)',
                  background: on ? 'var(--mint-wash)' : '#fff',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{t}</div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--text)', margin: '4px 0' }}>
                  {copy.price}
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>{copy.cadence}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 12, minHeight: 52 }}>
                  {copy.include}
                </div>
                {on ? (
                  <button
                    disabled
                    style={{
                      width: '100%', padding: 8, fontSize: 12.5, fontWeight: 600,
                      background: 'transparent', color: 'var(--mint-deep)', border: '1px solid var(--mint-deep)',
                      borderRadius: 8, cursor: 'default', fontFamily: 'inherit',
                    }}
                  >
                    <CheckCircle2 style={{ display: 'inline', width: 13, height: 13, marginRight: 4 }} /> Current plan
                  </button>
                ) : t === 'free' ? (
                  <button
                    onClick={handleManageBilling}
                    disabled={portalLoading || isFree}
                    style={{ width: '100%', padding: 8, fontSize: 12.5, fontWeight: 600, background: '#fff', color: 'var(--text-2)', border: '1px solid var(--divider)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Downgrade
                  </button>
                ) : (
                  <Link
                    href="/pricing"
                    style={{ display: 'block', width: '100%', padding: 8, fontSize: 12.5, fontWeight: 600, background: 'var(--text)', color: '#fff', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontFamily: 'inherit' }}
                  >
                    {tier === 'free' ? 'Upgrade' : tier === 'essential' && t === 'pro' ? 'Upgrade to Pro' : 'Change'}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '14px 0 0', lineHeight: 1.5 }}>
          Paid tiers are never auto-downgraded — you always stay on your plan unless you cancel. Stripe handles proration on plan changes.
        </p>
      </div>

      {/* Payment method + invoices — handled by Stripe's portal */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 42, height: 42, borderRadius: 10, background: 'var(--mint-wash)',
                color: 'var(--mint-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CreditCard style={{ width: 20, height: 20 }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Payment method &amp; invoices</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {profile?.stripe_customer_id
                  ? 'Update card, download invoices, change address — all handled in Stripe.'
                  : 'No billing account yet. Start a subscription to add a payment method.'}
              </div>
            </div>
          </div>
          {profile?.stripe_customer_id && (
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="cta-ghost"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Open Stripe portal <ExternalLink style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Payments processed by Stripe. We never see your card number. Paybacker is UK-registered (Paybacker LTD) and ICO-registered for data handling.
      </p>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.shell-v2 .tier-grid) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
