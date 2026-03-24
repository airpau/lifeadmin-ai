import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;

  if (!accessToken || !pageId) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN or META_PAGE_ID not configured' }, { status: 503 });
  }

  const { message, image_url } = await request.json();

  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  try {
    let postId: string;

    if (image_url) {
      // Post photo with caption
      const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: image_url,
          message,
          access_token: accessToken,
        }),
      });

      const data = await res.json();
      if (data.error) {
        return NextResponse.json({ error: data.error.message }, { status: 502 });
      }
      postId = data.post_id || data.id;
    } else {
      // Text-only post
      const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          access_token: accessToken,
        }),
      });

      const data = await res.json();
      if (data.error) {
        return NextResponse.json({ error: data.error.message }, { status: 502 });
      }
      postId = data.id;
    }

    return NextResponse.json({ ok: true, postId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
