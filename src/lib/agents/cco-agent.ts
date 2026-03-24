import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { randomBytes } from 'crypto';
import { generateImage } from '@/lib/content-apis';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

export async function runCCOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Read Taylor's latest marketing report for context
  const [taylorReport, recentPosts, userStats] = await Promise.all([
    supabase.from('executive_reports')
      .select('content, data, recommendations')
      .eq('report_type', 'cmo')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('content_drafts')
      .select('platform, theme, status, created_at')
      .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const taylorContext = taylorReport.data?.[0]
    ? `Taylor (CMO) latest report: ${taylorReport.data[0].content}. Recommendations: ${JSON.stringify(taylorReport.data[0].recommendations)}`
    : 'No recent CMO report available.';

  // Recent content themes to avoid repetition
  const recentThemes = (recentPosts.data || []).map(p => p.theme).filter(Boolean);
  const recentPlatforms = (recentPosts.data || []).map(p => p.platform);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDate = tomorrow.toISOString().split('T')[0];

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}. Generate content for tomorrow (${tomorrowDate}).

## Marketing Context
${taylorContext}

## Current Stats
- Total users: ${userStats.count || 0}
- Content posted this week: ${(recentPosts.data || []).filter(p => p.status === 'posted').length}
- Pending drafts: ${(recentPosts.data || []).filter(p => p.status === 'pending').length}

## Recent Themes Used (avoid repetition)
${recentThemes.length > 0 ? recentThemes.join(', ') : 'None this week'}

## Platform Distribution This Week
${['instagram', 'tiktok', 'linkedin', 'twitter'].map(p =>
  `${p}: ${recentPlatforms.filter(rp => rp === p).length} posts`
).join(', ')}

Generate 5-8 pieces of content for tomorrow. Mix platforms evenly. Vary themes. Schedule throughout the day (10am, 12pm, 2pm, 4pm, 6pm UK time).

For image prompts: use abstract visuals with dark navy (#0f172a) and gold (#f59e0b). Shields, flowing light trails, geometric patterns. ABSOLUTELY NO TEXT in images.

For video prompts: describe motion graphics showing data flowing, shields protecting, money being saved. Abstract, premium feel. 5-10 seconds.`;

  // Get content calendar from Claude
  const report = await runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });

  // Parse content items from the report data
  const contentItems = report.data?.content || [];

  if (contentItems.length > 0) {
    let savedCount = 0;

    for (const item of contentItems) {
      const approvalToken = randomBytes(32).toString('hex');

      // Try to generate image if there's a prompt
      let assetUrl: string | null = null;
      if (item.image_prompt && process.env.FAL_API_KEY) {
        const result = await generateImage(item.image_prompt);
        if (result) assetUrl = result.url;
      }

      // Save to content_drafts
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

    console.log(`[cco-agent] Casey created ${savedCount} content drafts for ${tomorrowDate}`);

    // Send approval email with all pending content
    const { data: pendingDrafts } = await supabase.from('content_drafts')
      .select('id, platform, content_type, caption, hashtags, theme, scheduled_time, approval_token, asset_url')
      .eq('status', 'pending')
      .order('scheduled_time', { ascending: true })
      .limit(20);

    if (pendingDrafts && pendingDrafts.length > 0) {
      const contentHtml = pendingDrafts.map((d, i) => {
        const approveUrl = `${SITE_URL}/api/admin/content/approve?token=${d.approval_token}&action=approve`;
        const rejectUrl = `${SITE_URL}/api/admin/content/approve?token=${d.approval_token}&action=reject`;
        const time = d.scheduled_time ? new Date(d.scheduled_time).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : 'TBD';

        return `
          <div style="background:#1e293b;border-radius:8px;padding:16px;margin:12px 0;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#f59e0b;font-weight:bold;font-size:12px;">${(d.platform || '').toUpperCase()} / ${d.content_type} / ${time}</span>
              <span style="color:#64748b;font-size:11px;">${d.theme}</span>
            </div>
            <p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0 0 8px;">${d.caption}</p>
            ${d.hashtags ? `<p style="color:#64748b;font-size:11px;margin:0 0 8px;">${d.hashtags}</p>` : ''}
            ${d.asset_url ? `<p style="color:#3b82f6;font-size:11px;margin:0 0 8px;"><a href="${d.asset_url}" style="color:#3b82f6;">View generated image</a></p>` : ''}
            <div style="margin-top:12px;">
              <a href="${approveUrl}" style="display:inline-block;background:#22c55e;color:#fff;font-weight:bold;padding:8px 20px;border-radius:6px;text-decoration:none;font-size:12px;margin-right:8px;">Approve</a>
              <a href="${rejectUrl}" style="display:inline-block;background:#ef4444;color:#fff;font-weight:bold;padding:8px 20px;border-radius:6px;text-decoration:none;font-size:12px;">Reject</a>
            </div>
          </div>`;
      }).join('');

      await resend.emails.send({
        from: FROM_EMAIL,
        to: 'hello@paybacker.co.uk',
        subject: `[Content Calendar] ${pendingDrafts.length} posts ready for approval`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
            <div style="border-bottom:2px solid #f59e0b;padding-bottom:16px;margin-bottom:24px;">
              <h1 style="color:#f59e0b;font-size:20px;margin:0;">Content Calendar</h1>
              <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Casey (CCO) has ${pendingDrafts.length} posts ready for tomorrow</p>
            </div>
            ${contentHtml}
            <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0;" />
            <p style="color:#475569;font-size:11px;">Paybacker AI Content Team</p>
          </div>
        `,
      }).catch(err => console.error('[cco-agent] Email failed:', err));
    }
  }

  return report;
}
