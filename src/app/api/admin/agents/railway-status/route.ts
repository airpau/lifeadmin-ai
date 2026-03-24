import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const railwayUrl = process.env.RAILWAY_URL;
  if (!railwayUrl) {
    return NextResponse.json({
      railway: null,
      learning: null,
      error: 'RAILWAY_URL not configured',
    });
  }

  try {
    // Fetch health and learning data in parallel
    const [healthRes, learningRes] = await Promise.all([
      fetch(`${railwayUrl}/health`).then(r => r.json()).catch(() => null),
      fetch(`${railwayUrl}/api/learning`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).then(r => r.json()).catch(() => null),
    ]);

    return NextResponse.json({
      railway: healthRes,
      learning: learningRes,
    });
  } catch (err: any) {
    return NextResponse.json({
      railway: null,
      learning: null,
      error: err.message,
    });
  }
}
