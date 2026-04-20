import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Careers — Paybacker',
  description: 'Join the Paybacker team. We\'re building the UK\'s AI money-back engine.',
};

export default function CareersPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', fontFamily: 'system-ui, sans-serif', color: '#0f172a' }}>
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(52,211,153,0.12)', border: '2px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 24 }}>
          🚀
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 16px' }}>
          We&rsquo;re hiring soon.
        </h1>
        <p style={{ fontSize: 18, color: '#334155', lineHeight: 1.65, margin: '0 0 24px' }}>
          Paybacker is building the UK&rsquo;s AI money-back engine. We&rsquo;re a small, ambitious
          team — and we&rsquo;re always interested in hearing from great people.
        </p>
        <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.65, margin: '0 0 36px' }}>
          We don&rsquo;t have open roles listed yet, but if you&rsquo;re passionate about consumer
          rights, AI, or fintech, reach out. We&rsquo;d love to hear from you.
        </p>
        <a
          href="mailto:hello@paybacker.co.uk?subject=Career enquiry"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#34d399', color: '#0d2018', fontWeight: 700, fontSize: 16, padding: '14px 28px', borderRadius: 999, textDecoration: 'none' }}
        >
          Get in touch →
        </a>
        <p style={{ marginTop: 32, fontSize: 14 }}>
          <Link href="/" style={{ color: '#059669', textDecoration: 'none', fontWeight: 600 }}>
            ← Back to Paybacker
          </Link>
        </p>
      </div>
    </main>
  );
}
