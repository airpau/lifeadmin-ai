import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const generateImage: ToolDef = {
  name: 'generate_image',
  description: 'Generate an image using fal.ai. Returns the image URL. Images must NEVER contain text (AI produces garbled text). Use for social media posts, blog illustrations.',
  schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Image generation prompt. Do NOT include any text in the image.' },
      model: { type: 'string', enum: ['fal-ai/flux-pro', 'fal-ai/recraft-v3'], default: 'fal-ai/flux-pro' },
      width: { type: 'number', default: 1024 },
      height: { type: 'number', default: 1024 },
    },
    required: ['prompt'],
  },
  handler: async (args) => {
    if (!config.FAL_KEY) {
      return 'FAL_KEY not configured. Cannot generate images.';
    }

    try {
      const response = await fetch(`https://queue.fal.run/${args.model || 'fal-ai/flux-pro'}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${config.FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: args.prompt,
          image_size: { width: args.width || 1024, height: args.height || 1024 },
          num_images: 1,
        }),
      });

      const data: any = await response.json();
      if (data.images?.[0]?.url) {
        return `Image generated: ${data.images[0].url}`;
      }

      // If queued, return request ID for polling
      if (data.request_id) {
        return `Image generation queued (request_id: ${data.request_id}). Check status later.`;
      }

      return `Unexpected response: ${JSON.stringify(data)}`;
    } catch (err: any) {
      return `Image generation failed: ${err.message}`;
    }
  },
};

const createContentDraft: ToolDef = {
  name: 'create_content_draft',
  description: 'Create a social media content draft for founder approval. Drafts are reviewed before posting. NEVER auto-post.',
  schema: {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'] },
      content_type: { type: 'string', enum: ['image_post', 'video_post', 'text_post', 'reel', 'story'] },
      caption: { type: 'string', description: 'Post caption/text' },
      hashtags: { type: 'string', description: 'Hashtags as comma-separated string' },
      asset_url: { type: 'string', description: 'URL to image/video asset' },
      scheduled_time: { type: 'string', description: 'ISO timestamp for scheduling' },
    },
    required: ['platform', 'content_type', 'caption'],
  },
  handler: async (args) => {
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
      return `Failed: ${error.message}`;
    }
    return `Content draft created (id: ${data.id}) for ${args.platform}. Status: pending founder approval.`;
  },
};

const getRecentPosts: ToolDef = {
  name: 'get_recent_posts',
  description: 'Get recent social media posts and drafts to avoid repetition and understand what has been posted.',
  schema: {
    type: 'object',
    properties: {
      days: { type: 'number', default: 7, description: 'How many days back to look' },
      limit: { type: 'number', maximum: 20, default: 10 },
    },
  },
  handler: async (args) => {
    const sb = getSupabase();
    const since = new Date(Date.now() - (args.days || 7) * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb.from('content_drafts')
      .select('platform, content_type, caption, status, created_at, posted_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(args.limit || 10);

    if (error) {
      return `Error: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return 'No recent posts found.';
    }

    const formatted = data.map((p: any) =>
      `[${p.platform}/${p.status}] ${p.caption?.substring(0, 100)}...`
    ).join('\n');

    return formatted;
  },
};

export const contentTools: ToolDef[] = [generateImage, createContentDraft, getRecentPosts];
