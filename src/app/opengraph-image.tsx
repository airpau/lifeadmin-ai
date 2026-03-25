import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Paybacker - AI-Powered Money Recovery for UK Consumers';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
          position: 'relative',
        }}
      >
        {/* Amber glow */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(245, 158, 11, 0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Logo text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <span style={{ fontSize: '52px', fontWeight: 800, color: '#ffffff' }}>Pay</span>
          <span style={{ fontSize: '52px', fontWeight: 800, color: '#f59e0b' }}>backer</span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: '48px',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.2,
            marginBottom: '24px',
            maxWidth: '900px',
            display: 'flex',
          }}
        >
          Get your money back in 30 seconds
        </div>

        {/* Subheadline */}
        <div
          style={{
            fontSize: '24px',
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '800px',
            lineHeight: 1.5,
            marginBottom: '40px',
            display: 'flex',
          }}
        >
          AI complaint letters citing exact UK law. Free.
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '48px' }}>
          {[
            { value: '£520', label: 'max flight claim' },
            { value: '30 sec', label: 'to generate letter' },
            { value: '56', label: 'cheaper deals' },
            { value: '3 free', label: 'letters per month' },
          ].map((stat) => (
            <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{stat.value}</span>
              <span style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>{stat.label}</span>
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            fontSize: '18px',
            color: '#475569',
            display: 'flex',
          }}
        >
          paybacker.co.uk
        </div>
      </div>
    ),
    { ...size }
  );
}
