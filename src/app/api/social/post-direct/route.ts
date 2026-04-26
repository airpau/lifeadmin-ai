import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API = 'https://graph.facebook.com/v25.0';
const PAGE_ID = '1056645287525328';
const IG_ID = '17841440175351137';

async function getPageToken(systemToken: string): Promise<string> {
  const res = await fetch(`${API}/${PAGE_ID}?fields=access_token&access_token=${systemToken}`);
  const data = await res.json();
  return data.access_token || systemToken;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 503 });
  }

  const { message, image_url, platform } = await request.json();
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const results: Record<string, any> = {};

  try {
    // Post to Facebook (unless platform is 'instagram' only)
    if (!platform || platform === 'facebook' || platform === 'both') {
      const pageToken = await getPageToken(systemToken);

      if (image_url) {
        // Photo post via /photos endpoint (proper image upload, no link preview)
        const params = new URLSearchParams({
          message,
          url: image_url,
          access_token: pageToken,
        });
        const res = await fetch(`${API}/${PAGE_ID}/photos`, { method: 'POST', body: params });
        const data = await res.json();
        results.facebook = data.error ? { error: data.error.message } : { ok: true, postId: data.id };
      } else {
        const params = new URLSearchParams({
          message,
          access_token: pageToken,
        });
        const res = await fetch(`${API}/${PAGE_ID}/feed`, { method: 'POST', body: params });
        const data = await res.json();
        results.facebook = data.error ? { error: data.error.message } : { ok: true, postId: data.id };
      }
    }

    // Post to Instagram (unless platform is 'facebook' only)
    if (platform === 'instagram' || platform === 'both') {
      if (!image_url) {
        results.instagram = { error: 'Instagram requires an image_url' };
      } else {
        // Step 1: Create media container
        const createParams = new URLSearchParams({
          image_url,
          caption: message,
          access_token: systemToken,
        });
        const createRes = await fetch(`${API}/${IG_ID}/media`, { method: 'POST', body: createParams });
        const createData = await createRes.json();

        if (createData.error) {
          results.instagram = { error: createData.error.message };
        } else {
          const creationId = createData.id;

          // Step 2: Wait and check status
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Step 3: Publish
          const publishParams = new URLSearchParams({
            creation_id: creationId,
            access_token: systemToken,
          });
          const publishRes = await fetch(`${API}/${IG_ID}/media_publish`, { method: 'POST', body: publishParams });
          const publishData = await publishRes.json();

          results.instagram = publishData.error
            ? { error: publishData.error.message }
            : { ok: true, postId: publishData.id };
        }
      }
    }

    // Post to X/Twitter (unless platform excludes it)
    if (!platform || platform === 'twitter' || platform === 'all') {
      try {
        const { postTweet } = await import('@/lib/twitter');
        let tweetText = message;
        if (tweetText.length > 280) {
          tweetText = tweetText.replace(/#\w+/g, '').trim();
          if (tweetText.length > 280) tweetText = tweetText.substring(0, 277) + '...';
        }
        const tweet = await postTweet(tweetText);
        results.twitter = { ok: true, tweetId: tweet.id };
      } catch (err: any) {
        results.twitter = { error: err.message };
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, ...results }, { status: 500 });
  }
}
