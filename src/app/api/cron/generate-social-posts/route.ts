import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSocialImage, buildBrandedPrompt } from '@/lib/generate-image';
import { pickTemplate } from '@/lib/social-templates';
import { postToFacebook } from '@/lib/meta-social';

// Runs weekly Monday 9am (see vercel.json)
// Picks a template, generates image, saves to DB, and auto-posts to Facebook

const PLATFORMS = ['twitter', 'facebook', 'instagram', 'linkedin'] as const;
type Platform = typeof PLATFORMS[number];

const IMAGE_PLATFORMS: Platform[] = ['facebook', 'instagram'];

const PILLARS = ['money_tip', 'complaint_win', 'product_feature', 'consumer_rights'] as const;
type Pillar = typeof PILLARS[number];

function getDailyPillarForPlatform(platform: Platform): Pillar {
  const platformIndex = PLATFORMS.indexOf(platform);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return PILLARS[(dayOfYear + platformIndex) % PILLARS.length];
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.MANAGED_AGENTS_ENABLED !== 'true') {
    console.log('[generate-social-posts] Managed agents disabled (MANAGED_AGENTS_ENABLED != true)');
    return NextResponse.json({ ok: true, message: 'Managed agents disabled' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: Array<{ platform: string; pillar: string; ok: boolean; imageGenerated?: boolean; posted?: boolean; error?: string }> = [];

  for (const platform of PLATFORMS) {
    const pillar = getDailyPillarForPlatform(platform);
    const platformOffset = PLATFORMS.indexOf(platform);

    try {
      const template = pickTemplate(pillar, platformOffset);

      // Generate image for facebook and instagram
      let imageData: string | null = null;
      let imageGeneratedAt: string | null = null;

      if (IMAGE_PLATFORMS.includes(platform)) {
        try {
          const brandedPrompt = buildBrandedPrompt(template.image_prompt);
          const { imageBase64 } = await generateSocialImage(brandedPrompt);
          imageData = imageBase64;
          imageGeneratedAt = new Date().toISOString();
        } catch (imgErr: any) {
          console.error(`Image generation failed for ${platform} post:`, imgErr.message);
        }
      }

      const postContent = `${template.content}\n\n${template.hashtags}`;

      const { data: savedPost, error } = await supabase.from('social_posts').insert({
        platform,
        pillar,
        content: template.content,
        hashtags: template.hashtags,
        image_prompt: template.image_prompt,
        image_data: imageData,
        image_generated_at: imageGeneratedAt,
        status: 'draft',
      }).select('id').single();

      if (error) throw new Error(error.message);

      // Auto-post to Facebook if token is available
      let posted = false;
      if (platform === 'facebook' && process.env.META_ACCESS_TOKEN && savedPost) {
        try {
          const fbResult = await postToFacebook(template.content, template.hashtags, imageData || undefined);
          if (fbResult.postId) {
            await supabase.from('social_posts').update({
              status: 'published',
              published_at: new Date().toISOString(),
              external_id: fbResult.postId,
            }).eq('id', savedPost.id);
            posted = true;
            console.log(`Auto-posted to Facebook: ${fbResult.postId}`);
          }
        } catch (fbErr: any) {
          console.error(`Facebook auto-post failed:`, fbErr.message);
        }
      }

      results.push({ platform, pillar, ok: true, imageGenerated: imageData !== null, posted });
    } catch (err: any) {
      console.error(`Failed to generate ${platform} post:`, err.message);
      results.push({ platform, pillar, ok: false, error: err.message });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const imagesGenerated = results.filter((r) => r.imageGenerated).length;
  console.log(
    `generate-social-posts: template-based generated=${results.length - failed} failed=${failed} images=${imagesGenerated}`
  );

  return NextResponse.json({ ok: true, source: 'templates', results });
}
