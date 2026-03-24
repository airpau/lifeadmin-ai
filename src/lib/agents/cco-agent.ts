import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { randomBytes } from 'crypto';
import { generateImageFal } from '@/lib/content-apis';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

export async function runCCOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Read Taylor's latest report and pull stats
  const [taylorReport, recentPosts, totalLetters, totalUsers, mrr] = await Promise.all([
    supabase.from('executive_reports').select('content, data, recommendations')
      .eq('report_type', 'cmo').order('created_at', { ascending: false }).limit(1),
    supabase.from('content_drafts').select('platform, theme, status, created_at')
      .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('type', 'complaint_letter'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('subscription_tier'),
  ]);

  const tiers: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of mrr.data || []) tiers[p.subscription_tier || 'free']++;
  const mrrValue = tiers.essential * 9.99 + tiers.pro * 19.99;

  const recentThemes = (recentPosts.data || []).map(p => p.theme).filter(Boolean);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const contextPrompt = `Today: ${now.toISOString().split('T')[0]}. Generate content for ${tomorrow}.

## Live Stats (use in content)
- Total AI letters generated: ${totalLetters.count || 0}
- Total users: ${totalUsers.count || 0}
- MRR: £${mrrValue.toFixed(2)}
- Weekly signups: ${(totalUsers.count || 0)}

## Taylor (CMO) Context
${taylorReport.data?.[0]?.content || 'No recent CMO report.'}

## Recent Themes (avoid repetition): ${recentThemes.join(', ') || 'None'}

## Image Generation Models Available
- fal-ai/flux-pro: photorealistic ($0.03/image)
- fal-ai/recraft-v3: branded graphics, can include text
- fal-ai/google/nano-banana-2: fast social graphics ($0.06)

Generate 5 pieces of content. For each specify which fal.ai model to use in image_model field.
For video content, set video_prompt (will use fal-ai/kling-video).
Schedule: 10am, 12pm, 2pm, 4pm, 6pm UK time.`;

  const report = await runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });

  // Save content drafts
  const contentItems = report.data?.content || [];
  let savedCount = 0;

  for (const item of contentItems) {
    const approvalToken = randomBytes(32).toString('hex');

    // Generate image via fal.ai if prompt provided
    let assetUrl: string | null = null;
    if (item.image_prompt && process.env.FAL_KEY) {
      const model = item.image_model || 'fal-ai/flux-pro';
      const result = await generateImageFal(item.image_prompt, model);
      if (result) assetUrl = result.url;
    }

    const { error } = await supabase.from('content_drafts').insert({
      platform: item.platform || 'instagram',
      content_type: item.content_type || 'image_post',
      theme: item.theme || 'general',
      caption: item.caption || '',
      hashtags: item.hashtags || '',
      cta: item.cta || 'Try free at paybacker.co.uk',
      image_prompt: item.image_prompt || null,
      video_prompt: item.video_prompt || null,
      asset_url: assetUrl,
      asset_type: item.video_prompt ? 'video' : item.image_prompt ? 'image' : 'none',
      status: 'pending',
      approval_token: approvalToken,
      scheduled_time: item.scheduled_time || null,
    });

    if (!error) savedCount++;
  }

  console.log(`[cco-agent] Casey created ${savedCount} content drafts`);

  // Content approval is handled via Charlie's digest email (approve/reject links)
  // The content_drafts with status='pending' will be picked up by Charlie

  return report;
}
