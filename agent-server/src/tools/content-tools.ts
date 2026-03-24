import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

export const generateImage = tool(
  'generate_image',
  'Generate an image using fal.ai. Returns the image URL. Images must NEVER contain text (AI produces garbled text). Use for social media posts, blog illustrations.',
  {
    prompt: z.string().describe('Image generation prompt. Do NOT include any text in the image.'),
    model: z.enum(['fal-ai/flux-pro', 'fal-ai/recraft-v3']).default('fal-ai/flux-pro'),
    width: z.number().default(1024),
    height: z.number().default(1024),
  },
  async (args) => {
    if (!config.FAL_KEY) {
      return { content: [{ type: 'text' as const, text: 'FAL_KEY not configured. Cannot generate images.' }], isError: true };
    }

    try {
      const response = await fetch(`https://queue.fal.run/${args.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${config.FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: args.prompt,
          image_size: { width: args.width, height: args.height },
          num_images: 1,
        }),
      });

      const data: any = await response.json();
      if (data.images?.[0]?.url) {
        return { content: [{ type: 'text' as const, text: `Image generated: ${data.images[0].url}` }] };
      }

      // If queued, return request ID for polling
      if (data.request_id) {
        return { content: [{ type: 'text' as const, text: `Image generation queued (request_id: ${data.request_id}). Check status later.` }] };
      }

      return { content: [{ type: 'text' as const, text: `Unexpected response: ${JSON.stringify(data)}` }], isError: true };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Image generation failed: ${err.message}` }], isError: true };
    }
  }
);

export const createContentDraft = tool(
  'create_content_draft',
  'Create a social media content draft for founder approval. Drafts are reviewed before posting. NEVER auto-post.',
  {
    platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok']),
    content_type: z.enum(['image_post', 'video_post', 'text_post', 'reel', 'story']),
    caption: z.string().describe('Post caption/text'),
    hashtags: z.string().optional().describe('Hashtags as comma-separated string'),
    asset_url: z.string().optional().describe('URL to image/video asset'),
    scheduled_time: z.string().optional().describe('ISO timestamp for scheduling'),
  },
  async (args) => {
    const sb = getSupabase();
    const { data, error } = await sb.from('content_drafts').insert({
      platform: args.platform,
      content_type: args.content_type,
      caption: args.caption,
      hashtags: args.hashtags,
      asset_url: args.asset_url,
      status: 'pending',
      scheduled_time: args.scheduled_time,
    }).select('id').single();

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Content draft created (id: ${data.id}) for ${args.platform}. Status: pending founder approval.` }] };
  }
);

export const getRecentPosts = tool(
  'get_recent_posts',
  'Get recent social media posts and drafts to avoid repetition and understand what has been posted.',
  {
    days: z.number().default(7).describe('How many days back to look'),
    limit: z.number().max(20).default(10),
  },
  async (args) => {
    const sb = getSupabase();
    const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb.from('content_drafts')
      .select('platform, content_type, caption, status, created_at, posted_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(args.limit);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
    }

    if (!data || data.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No recent posts found.' }] };
    }

    const formatted = data.map(p =>
      `[${p.platform}/${p.status}] ${p.caption?.substring(0, 100)}...`
    ).join('\n');

    return { content: [{ type: 'text' as const, text: formatted }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const contentTools = [generateImage, createContentDraft, getRecentPosts];
