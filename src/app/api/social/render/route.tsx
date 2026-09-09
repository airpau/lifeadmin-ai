import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Composes the daily social image for Facebook and Instagram.
 *
 * GET /api/social/render?hook=...&kicker=...&sub=...&photo=<https url>&ratio=4x5|1x1
 *
 * A Higgsfield photograph goes underneath, a deep ink gradient rises from the
 * bottom, and the hook, kicker, sub line, logo and domain sit on top. Same
 * layout as gymIQ's /api/social/render so the two scheduled tasks share one
 * shape. Called once by the daily task and once by the paybacker-social edge
 * function when it copies the result into storage.
 *
 * No hex colours reach any model: the photo prompt lives in the task, this
 * route only draws.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE = 'https://paybacker.co.uk';
const INK = '#0B1220';
const MINT = '#34D399';
const ORANGE = '#F59E0B';

const SIZES: Record<string, { width: number; height: number }> = {
  '4x5': { width: 1080, height: 1350 },
  '1x1': { width: 1080, height: 1080 },
  '9x16': { width: 1080, height: 1920 },
};

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: 'normal' };

let fontCache: Font[] | null = null;

/** Fetch a Google Font TTF. The old-Safari user agent makes Google serve truetype rather than woff2, which Satori cannot read. */
async function googleFont(family: string, weight: 400 | 500 | 600 | 700 | 800): Promise<Font | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
        },
      },
    ).then((r) => r.text());
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/);
    if (!m) return null;
    const data = await fetch(m[1]).then((r) => r.arrayBuffer());
    return { name: family, data, weight, style: 'normal' };
  } catch {
    return null;
  }
}

async function fonts(): Promise<Font[] | undefined> {
  if (fontCache) return fontCache;
  const loaded = (
    await Promise.all([
      googleFont('Plus Jakarta Sans', 800),
      googleFont('Plus Jakarta Sans', 600),
      googleFont('Plus Jakarta Sans', 500),
    ])
  ).filter((f): f is Font => f !== null);
  if (loaded.length === 0) return undefined; // ImageResponse falls back to its bundled Noto Sans
  fontCache = loaded;
  return loaded;
}

/** Fetch a remote image as a data URI. Satori reads PNG and JPEG; anything else is rejected so the caller sees a clear error rather than a blank canvas. */
async function dataUri(url: string, maxBytes: number): Promise<string> {
  const res = await fetch(url, { headers: { Accept: 'image/png,image/jpeg' } });
  if (!res.ok) throw new Error(`photo fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`photo too large (${buf.length} bytes)`);
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpeg) throw new Error('photo must be PNG or JPEG');
  return `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}`;
}

function clamp(s: string | null, max: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const hook = clamp(q.get('hook'), 110);
  const kicker = clamp(q.get('kicker'), 32).toUpperCase();
  const sub = clamp(q.get('sub'), 130);
  const photo = q.get('photo') || '';
  const ratio = q.get('ratio') || '4x5';
  const size = SIZES[ratio] ?? SIZES['4x5'];

  if (!hook) return NextResponse.json({ error: 'hook is required' }, { status: 400 });
  if (photo && !/^https:\/\//.test(photo)) return NextResponse.json({ error: 'photo must be an https URL' }, { status: 400 });

  let photoSrc: string | null = null;
  let logoSrc: string | null = null;
  try {
    [photoSrc, logoSrc] = await Promise.all([
      photo ? dataUri(photo, 14 * 1024 * 1024) : Promise.resolve(null),
      dataUri(`${SITE}/logo-new.png`, 4 * 1024 * 1024).catch(() => null),
    ]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  const hookSize = hook.length > 80 ? 60 : hook.length > 56 ? 66 : 74;
  const pad = 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: INK,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          overflow: 'hidden',
        }}
      >
        {photoSrc ? (
          <img
            src={photoSrc}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(160deg, #162544 0%, #0B1220 60%, #06101c 100%)',
            }}
          />
        )}

        {/* Ink gradient so the type always reads, whatever the photo does */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '62%',
            background: 'linear-gradient(180deg, rgba(11,18,32,0) 0%, rgba(11,18,32,0.55) 35%, rgba(11,18,32,0.94) 100%)',
          }}
        />
        {/* Soft top shade for the kicker */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '22%',
            background: 'linear-gradient(180deg, rgba(11,18,32,0.55) 0%, rgba(11,18,32,0) 100%)',
          }}
        />

        {/* Kicker */}
        {kicker ? (
          <div
            style={{
              position: 'absolute',
              top: pad - 8,
              left: pad,
              display: 'flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 999,
              backgroundColor: 'rgba(11,18,32,0.72)',
              border: `1.5px solid ${MINT}`,
              color: MINT,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 3,
            }}
          >
            {kicker}
          </div>
        ) : null}

        {/* Text block */}
        <div
          style={{
            position: 'absolute',
            left: pad,
            right: pad,
            bottom: pad + 96,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ width: 64, height: 6, borderRadius: 3, backgroundColor: ORANGE, marginBottom: 26, display: 'flex' }} />
          <div
            style={{
              display: 'flex',
              color: '#FFFFFF',
              fontSize: hookSize,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -1.2,
              textShadow: '0 2px 18px rgba(0,0,0,0.35)',
            }}
          >
            {hook}
          </div>
          {sub ? (
            <div
              style={{
                display: 'flex',
                color: '#CBD5E1',
                fontSize: 30,
                fontWeight: 500,
                lineHeight: 1.35,
                marginTop: 22,
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>

        {/* Footer: logo + wordmark left, domain right */}
        <div
          style={{
            position: 'absolute',
            left: pad,
            right: pad,
            bottom: pad - 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {logoSrc ? (
              <img src={logoSrc} width={56} height={56} style={{ width: 56, height: 56, borderRadius: 14, marginRight: 16 }} />
            ) : null}
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>
              <span style={{ color: '#FFFFFF' }}>Pay</span>
              <span style={{ color: MINT }}>backer</span>
            </div>
          </div>
          <div style={{ display: 'flex', color: '#94A3B8', fontSize: 24, fontWeight: 500 }}>paybacker.co.uk</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: await fonts(),
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
