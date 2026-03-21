import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { postToFacebook, postToInstagram } from '@/lib/meta-social';

// Runs daily at 10am (see vercel.json) — posts oldest approved social post

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.META_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: 'Meta API not configured. Set META_ACCESS_TOKEN in environment variables.' },
      { status: 503 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find oldest approved post that is due (scheduled_for is null or in the past)
  const { data: post, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'approved')
    .or('scheduled_for.is.null,scheduled_for.lte.' + new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !post) {
    console.log('post-social: no approved posts to publish');
    return NextResponse.json({ ok: true, published: 0 });
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
    console.error('post-social: Meta API error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  await supabase
    .from('social_posts')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', post.id);

  console.log(`post-social: published post ${post.id} to ${post.platform}`);

  return NextResponse.json({ ok: true, published: 1, platform_post_ids: platformPostIds });
}
