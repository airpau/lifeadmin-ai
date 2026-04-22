import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F9FAFB',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header style={{ padding: '28px 32px' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#0B1220',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            P
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: '#0B1220' }}>
            Pay<span style={{ color: '#059669' }}>backer</span>
          </span>
        </Link>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px 64px',
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div style={{ background: '#FEF3C7', padding: '44px 36px 32px', textAlign: 'center' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: '#fff',
                margin: '0 auto 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 34,
                boxShadow: '0 4px 16px -4px rgba(0,0,0,.08)',
              }}
            >
              🔍
            </div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: '#78350F',
                marginBottom: 10,
              }}
            >
              404
            </div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.015em',
                margin: '0 0 10px',
                color: '#0B1220',
                lineHeight: 1.25,
              }}
            >
              We can't find that page.
            </h1>
            <p
              style={{
                fontSize: 14,
                color: '#4B5563',
                margin: 0,
                maxWidth: 420,
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: 1.55,
              }}
            >
              The link might be broken, or the page might have moved. Try the dashboard or head back home.
            </p>
          </div>

          <div
            style={{
              padding: '20px 32px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href="/"
              style={{
                padding: '10px 18px',
                fontSize: 13.5,
                fontWeight: 600,
                background: '#0B1220',
                color: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Back home
            </Link>
            <Link
              href="/dashboard"
              style={{
                padding: '10px 18px',
                fontSize: 13.5,
                fontWeight: 600,
                background: 'transparent',
                color: '#4B5563',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </main>

      <footer
        style={{
          padding: '24px 32px',
          display: 'flex',
          gap: 18,
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontSize: 12.5,
          color: '#9CA3AF',
        }}
      >
        <Link href="/pricing" style={{ color: '#6B7280', textDecoration: 'none' }}>Pricing</Link>
        <Link href="/deals" style={{ color: '#6B7280', textDecoration: 'none' }}>Deals</Link>
        <Link href="/blog" style={{ color: '#6B7280', textDecoration: 'none' }}>Blog</Link>
        <Link href="/about" style={{ color: '#6B7280', textDecoration: 'none' }}>About</Link>
        <Link href="/privacy-policy" style={{ color: '#6B7280', textDecoration: 'none' }}>Privacy</Link>
        <Link href="/terms-of-service" style={{ color: '#6B7280', textDecoration: 'none' }}>Terms</Link>
      </footer>
    </div>
  );
}
