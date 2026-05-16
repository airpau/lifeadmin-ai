import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

/**
 * Public landing page that anchors every "🎉 Share My Win" link sent
 * to social. Anonymous aggregate — no individual disputes are shown.
 *
 * Counter sums recovered_amount_gbp across all 'won' outcomes. Falls
 * back to the legacy money_recovered column when the new column is
 * NULL (older disputes were resolved before the dataset migration).
 */

export const metadata: Metadata = {
  title: 'Paybacker users have won back £' + '— see how much',
  description:
    'Every dispute is a story. Paybacker helps UK consumers dispute unfair bills with AI letters citing exact UK consumer law. See the aggregate total recovered.',
  openGraph: {
    title: 'Paybacker — winning back unfair charges, one dispute at a time',
    description:
      'Paybacker uses AI to dispute unfair bills citing UK consumer law. See the running total recovered by everyday users.',
    url: 'https://paybacker.co.uk/wins',
    siteName: 'Paybacker',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Paybacker — winning back unfair charges',
    description:
      'Every dispute is a story. See how much UK consumers have won back using Paybacker.',
  },
};

export const revalidate = 600; // 10 minutes

async function fetchTotalWon(): Promise<number> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 0;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data } = await supabase
      .from('disputes')
      .select('recovered_amount_gbp, money_recovered')
      .eq('outcome', 'won')
      .abortSignal(controller.signal);
    clearTimeout(timeout);
    if (!data) return 0;
    return data.reduce(
      (sum: number, r: { recovered_amount_gbp: number | string | null; money_recovered: number | string | null }) =>
        sum + (Number(r.recovered_amount_gbp ?? r.money_recovered) || 0),
      0,
    );
  } catch {
    clearTimeout(timeout);
    return 0;
  }
}

export default async function WinsPage() {
  const total = await fetchTotalWon();
  const totalText = total > 0
    ? `£${Math.round(total).toLocaleString('en-GB')}`
    : '£0';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a1628',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1.5rem',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <p
        style={{
          color: '#34d399',
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}
      >
        Paybacker
      </p>

      <h1
        style={{
          fontSize: 'clamp(2rem, 6vw, 3.75rem)',
          fontWeight: 800,
          lineHeight: 1.05,
          maxWidth: 880,
          margin: 0,
        }}
      >
        Paybacker users have won back{' '}
        <span style={{ color: '#34d399' }}>{totalText}</span>
      </h1>

      <p
        style={{
          marginTop: '1.5rem',
          fontSize: 'clamp(1rem, 2vw, 1.25rem)',
          color: 'rgba(255,255,255,0.75)',
          maxWidth: 640,
          lineHeight: 1.55,
        }}
      >
        Every dispute is a story. Here&apos;s how we&apos;re helping people fight back
        against unfair bills, sneaky price increases, and overcharges — using AI
        that cites the exact UK consumer law on your side.
      </p>

      <Link
        href="/"
        style={{
          marginTop: '2.5rem',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '0.95rem 1.75rem',
          background: '#34d399',
          color: '#0a1628',
          fontWeight: 700,
          fontSize: 16,
          borderRadius: 12,
          textDecoration: 'none',
          boxShadow: '0 12px 30px rgba(52,211,153,0.25)',
        }}
      >
        Start fighting back →
      </Link>

      <p style={{ marginTop: '3rem', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        Total recovered is the sum of all confirmed dispute wins logged in
        Paybacker. Individual cases are kept private.
      </p>

      <div
        style={{
          marginTop: '3rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          maxWidth: 720,
          width: '100%',
        }}
      >
        {[
          { k: 'AI letters', v: 'Cite exact UK law' },
          { k: 'Average time', v: 'Under 30 seconds' },
          { k: 'You stay in control', v: 'Nothing sent without your tap' },
        ].map((it) => (
          <div
            key={it.k}
            style={{
              padding: '1rem',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p style={{ color: '#34d399', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
              {it.k}
            </p>
            <p style={{ marginTop: 6, color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>
              {it.v}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
