import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const alt = 'Paybacker - AI-Powered Money Recovery for UK Consumers';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const bgBytes = readFileSync(join(process.cwd(), 'public', 'og-background.png'));
  const bgBase64 = bgBytes.toString('base64');
  const bgSrc = `data:image/png;base64,${bgBase64}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background image */}
        <img
          src={bgSrc}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />

        {/* Content overlay */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', maxWidth: '800px' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
            <span style={{ fontSize: '44px', fontWeight: 800, color: '#ffffff' }}>Pay</span>
            <span style={{ fontSize: '44px', fontWeight: 800, color: '#34D399' }}>backer</span>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: '52px',
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.15,
              marginBottom: '20px',
              display: 'flex',
            }}
          >
            Get your money back in 30 seconds
          </div>

          {/* Subheadline */}
          <div
            style={{
              fontSize: '22px',
              color: '#94a3b8',
              lineHeight: 1.5,
              marginBottom: '36px',
              display: 'flex',
            }}
          >
            AI complaint letters citing exact UK consumer law. Free to use.
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '40px' }}>
            {[
              { value: '£520', label: 'max flight claim' },
              { value: '30 sec', label: 'letter generation' },
              { value: '56', label: 'UK deals' },
            ].map((stat) => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#34D399' }}>{stat.value}</span>
                <span style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* URL bottom left */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            left: '80px',
            fontSize: '16px',
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
