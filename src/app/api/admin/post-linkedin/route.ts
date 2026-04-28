/**
 * POST /api/admin/post-linkedin — auth via X-Cron-Secret header.
 *
 * Body: { text: string, dry_run?: boolean }
 *
 * Posts to LinkedIn via the Late API (getlate.dev). Used by the
 * Sunday LinkedIn cron when the founder is ready to switch from
 * Gmail-draft approval flow to full auto-post.
 *
 * Auth: X-Cron-Secret header must equal CRON_SECRET env. This is
 * a server-to-server endpoint — not exposed to portal users.
 *
 * dry_run=true returns the would-be payload without calling Late,
 * so the cron can A/B test before flipping the switch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { postViaLate } from '@/lib/content-apis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = String(body?.text || '').trim();
  if (text.length < 10) return NextResponse.json({ error: 'text required (>=10 chars)' }, { status: 400 });
  if (text.length > 3000) return NextResponse.json({ error: 'text exceeds LinkedIn 3000-char cap' }, { status: 400 });

  if (body?.dry_run) {
    return NextResponse.json({ ok: true, dry_run: true, text, length: text.length });
  }

  if (!process.env.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not set in Vercel env. Get one at getlate.dev/dashboard, then add LATE_API_KEY in Vercel and redeploy.' }, { status: 503 });
  }

  const result = await postViaLate({ platform: 'linkedin', text });
  if (!result) {
    return NextResponse.json({ error: 'Late API call failed (see server logs)' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, post_id: result.postId, platform: result.platform });
}
