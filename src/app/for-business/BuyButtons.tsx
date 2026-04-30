'use client';

/**
 * BuyButtons — three CTAs the /for-business landing page hangs off:
 *
 *   1. Starter (free pilot) — collect name/email/company/use_case,
 *      POST /api/v1/free-pilot, key arrives by email immediately.
 *   2. Growth — Stripe Checkout, £499/month, key minted by webhook.
 *   3. Enterprise — Stripe Checkout, £1,999/month, key minted by webhook.
 *
 * Replaces the previous waitlist form. The waitlist persists at the
 * bottom for genuinely-bespoke "talk to us" requests.
 */

import { useState } from 'react';

export default function BuyButtons() {
  return (
    <div className="m-business-buy-grid">
      <FreePilot />
      <PaidCheckout
        anchor="buy-growth"
        tier="growth"
        label="Subscribe to Growth — £499/month"
        sub="10,000 calls/month. Cancel anytime."
      />
      <PaidCheckout
        anchor="buy-enterprise"
        tier="enterprise"
        label="Subscribe to Enterprise — £1,999/month"
        sub="100,000 calls/month + SLA. Cancel anytime."
      />
    </div>
  );
}

function FreePilot() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(e.currentTarget);
    const body = {
      name: String(data.get('name') || ''),
      work_email: String(data.get('work_email') || ''),
      company: String(data.get('company') || ''),
      use_case: String(data.get('use_case') || ''),
    };
    try {
      const res = await fetch('/api/v1/free-pilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Something went wrong');
      } else if (j.already_minted) {
        setDone(j.message || 'A key has already been issued to this email.');
      } else {
        setDone('Key sent. Check the inbox at the email you used. Did not arrive in 60s? Check spam, then email hello@paybacker.co.uk.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form id="free-pilot" className="m-business-buy-card" onSubmit={onSubmit}>
      <h3>Starter — free pilot</h3>
      <p className="m-business-sub">1,000 calls. No card. Key by email in seconds.</p>
      <input name="name" placeholder="Your name" required minLength={2} />
      <input name="work_email" type="email" placeholder="Work email" required />
      <input name="company" placeholder="Company" required minLength={2} />
      <textarea name="use_case" placeholder="In one sentence — what will you call the API for?" required minLength={20} rows={3} />
      <button type="submit" className="m-business-cta" disabled={submitting}>
        {submitting ? 'Minting…' : 'Get free key'}
      </button>
      {done && <p className="m-business-success">{done}</p>}
      {error && <p className="m-business-error">{error}</p>}
    </form>
  );
}

function PaidCheckout({ anchor, tier, label, sub }: { anchor: string; tier: 'growth' | 'enterprise'; label: string; sub: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(e.currentTarget);
    const body = {
      tier,
      email: String(data.get('email') || ''),
      name: String(data.get('name') || ''),
      company: String(data.get('company') || ''),
    };
    try {
      const res = await fetch('/api/v1/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.url) {
        setError(j.error || 'Could not start checkout');
        setSubmitting(false);
        return;
      }
      window.location.href = j.url;
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <form id={anchor} className="m-business-buy-card" onSubmit={onSubmit}>
      <h3>{tier === 'growth' ? 'Growth' : 'Enterprise'}</h3>
      <p className="m-business-sub">{sub}</p>
      <input name="name" placeholder="Your name" required minLength={2} />
      <input name="email" type="email" placeholder="Billing email" required />
      <input name="company" placeholder="Company" required minLength={2} />
      <button type="submit" className="m-business-cta" disabled={submitting}>
        {submitting ? 'Redirecting to Stripe…' : label}
      </button>
      {error && <p className="m-business-error">{error}</p>}
    </form>
  );
}
