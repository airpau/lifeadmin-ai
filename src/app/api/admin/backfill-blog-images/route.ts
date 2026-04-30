/**
 * POST /api/admin/backfill-blog-images
 *
 * One-off endpoint that walks blog_posts where image_url IS NULL,
 * generates a per-post hero image via Imagen using the deterministic
 * category-aware visual-brief helper, uploads to Supabase Storage,
 * and persists the URL.
 *
 * Originally built 2026-04-27 to backfill 16 posts that pre-dated the
 * publish-blog image-generation feature. After that one-shot run the
 * endpoint stays available for future use (e.g. if Imagen returns
 * something obviously wrong on a fresh post and we need to regenerate).
 *
 * Auth: Bearer CRON_SECRET (curl from a trusted host) OR a Supabase
 * session whose email is in NEXT_PUBLIC_ADMIN_EMAILS. The CRON_SECRET
 * path lets us script the run; the admin-email path lets a future
 * support agent trigger it from the dashboard if we wire a button.
 *
 * Body (optional): { slug?: string; force?: boolean }
 *   - slug:  regenerate just this one post (handy for fixing a single
 *            bad image without rerunning the whole batch).
 *   - force: regenerate even when image_url IS NOT NULL.
 *
 * Returns: { processed: number; succeeded: string[]; failed: Array<{slug, error}> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateSocialImage, buildBrandedPrompt } from '@/lib/generate-image';
import { uploadImageToStorage } from '@/lib/storage';
import { buildVisualBrief } from '@/lib/blog-visual-brief';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel free Pro tier max — covers ~30 posts at ~6s each.

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function authorize(request: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  // Path 1: Bearer CRON_SECRET — for scripted/curl invocations.
  const authHeader = request.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { ok: true };
  }
  // Path 2: Supabase session + admin email — for dashboard triggering.
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email && getAdminEmails().includes(user.email.toLowerCase())) {
      return { ok: true };
    }
  } catch {
    // fall through
  }
  return { ok: false, status: 401, error: 'Unauthorized — needs Bearer CRON_SECRET or admin session' };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const targetSlug: string | undefined = body?.slug?.trim();
  const force: boolean = body?.force === true;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured — cannot generate images' }, { status: 500 });
  }

  const admin = getAdminClient();

  // Build the work queue.
  let query = admin
    .from('blog_posts')
    .select('slug, title, target_keyword, category, image_url')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (targetSlug) {
    query = query.eq('slug', targetSlug);
  } else if (!force) {
    query = query.is('image_url', null);
  }

  const { data: posts, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: `Failed to load posts: ${fetchErr.message}` }, { status: 500 });
  }
  if (!posts || posts.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: targetSlug ? `No post matching slug "${targetSlug}"` : 'No posts need backfill',
    });
  }

  const succeeded: string[] = [];
  const failed: Array<{ slug: string; error: string }> = [];

  // Imagen free tier is 10 req/min. Pace between requests at ~7s so we
  // average ~8.5/min and never trip the rate limit. The first call has
  // no preceding delay; every subsequent call waits PACE_MS before
  // firing. generateSocialImage also retries internally with backoff
  // if Imagen still returns 429/503 (e.g. shared quota with another
  // caller burning through the budget at the same time).
  const PACE_MS = 7_000;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, PACE_MS));
    }
    try {
      const brief = buildVisualBrief({
        title: post.title || '',
        keyword: post.target_keyword || '',
        category: post.category,
      });
      const prompt = buildBrandedPrompt(brief);

      const { imageBase64, mimeType } = await generateSocialImage(prompt, { aspectRatio: '16:9' });
      const imageUrl = await uploadImageToStorage(imageBase64, mimeType, `blog/${post.slug}.png`);

      const { error: updErr } = await admin
        .from('blog_posts')
        .update({
          image_url: imageUrl,
          image_alt: `Editorial illustration for ${post.title}`,
        })
        .eq('slug', post.slug);

      if (updErr) {
        failed.push({ slug: post.slug, error: `DB update failed: ${updErr.message}` });
        continue;
      }
      succeeded.push(post.slug);
      console.log(`[backfill-blog-images] ${post.slug} → ${imageUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ slug: post.slug, error: msg });
      console.error(`[backfill-blog-images] ${post.slug} FAILED: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: posts.length,
    succeeded,
    failed,
  });
}
