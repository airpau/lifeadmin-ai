import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSocialImage, buildBrandedPrompt } from '@/lib/generate-image';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { post_id, prompt } = body as { post_id?: string; prompt?: string };

  if (!post_id && !prompt) {
    return NextResponse.json({ error: 'Provide either post_id or prompt' }, { status: 400 });
  }

  let imagePrompt: string;
  let supabase: ReturnType<typeof createClient> | null = null;

  if (post_id) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: post, error } = await supabase
      .from('social_posts')
      .select('image_prompt')
      .eq('id', post_id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const rawPrompt = (post as Record<string, unknown>).image_prompt as string | null;
    if (!rawPrompt) {
      return NextResponse.json({ error: 'Post has no image_prompt' }, { status: 400 });
    }

    imagePrompt = buildBrandedPrompt(rawPrompt);
  } else {
    imagePrompt = buildBrandedPrompt(prompt!);
  }

  let imageBase64: string;
  let mimeType: string;

  try {
    const result = await generateSocialImage(imagePrompt);
    imageBase64 = result.imageBase64;
    mimeType = result.mimeType;
  } catch (err: any) {
    console.error('Image generation failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  if (post_id && supabase) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('social_posts')
      .update({
        image_data: imageBase64,
        image_generated_at: new Date().toISOString(),
      })
      .eq('id', post_id);

    if (updateError) {
      console.error('Failed to save image to post:', updateError.message);
    }
  }

  return NextResponse.json({ imageBase64, mimeType });
}
