import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { postToFacebook, postToInstagram } from '@/lib/meta-social';

export async function POST(request: NextRequest) {
  if (!process.env.META_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: 'Meta API not configured. Set META_ACCESS_TOKEN in environment variables.' },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { post_id } = body as { post_id: string };

  if (!post_id) {
    return NextResponse.json({ error: 'Missing post_id' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: post, error: fetchError } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', post_id)
    .eq('status', 'approved')
    .single();

  if (fetchError || !post) {
    return NextResponse.json({ error: 'Post not found or not approved' }, { status: 404 });
  }

  const platformPostIds: { facebook?: string; instagram?: string } = {};

  try {
    if (post.platform === 'facebook' || post.platform === 'both') {
      const { postId } = await postToFacebook(post.content, post.hashtags ?? '');
      platformPostIds.facebook = postId;
    }

    if (post.platform === 'instagram' || post.platform === 'both') {
      const { postId } = await postToInstagram(post.content, post.hashtags ?? '');
      platformPostIds.instagram = postId;
    }
  } catch (err: any) {
    console.error('Meta API posting error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  await supabase
    .from('social_posts')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', post_id);

  return NextResponse.json({ ok: true, platform_post_ids: platformPostIds });
}
