/**
 * /for-business/thanks — post-Stripe-checkout landing.
 *
 * The webhook does the work (mints key, emails plaintext). This page
 * just reassures the customer their payment went through.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Thanks — Paybacker for Business',
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: '#0f172a', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h1 style={{ fontSize: 28, letterSpacing: '-0.01em', marginTop: 8 }}>Subscription live.</h1>
        <p style={{ fontSize: 16, color: '#475569', marginTop: 12 }}>
          Your API key is on its way to your billing email — it should arrive within 30 seconds.
          Save it now: it is only shown once.
        </p>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 16 }}>
          Not arrived in 2 minutes? Check spam, then email{' '}
          <a href="mailto:hello@paybacker.co.uk" style={{ color: '#0f172a' }}>hello@paybacker.co.uk</a> with
          your billing email and we will resend.
        </p>
        <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/for-business/docs" style={{ background: '#0f172a', color: '#fff', padding: '12px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>Read the docs</Link>
          <Link href="/for-business" style={{ background: 'transparent', color: '#475569', padding: '12px 18px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e2e8f0', fontWeight: 600 }}>Back to /for-business</Link>
        </div>
      </div>
    </main>
  );
}
