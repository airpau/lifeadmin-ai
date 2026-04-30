/**
 * Cron — Daily Content Ideas Generator
 *
 * Schedule: 07:00 UK daily (see vercel.json).
 * Purpose:  Pull 3 unused ideas from content_ideas, draft platform-specific
 *           captions with Claude, generate 1 fal.ai image per idea, and insert
 *           rows into content_drafts awaiting founder approval.
 *
 * IMPORTANT — does NOT post anything. content_drafts rows land with
 * status='pending' and are published only via the admin approve flow that
 * already exists for the other Casey crons (see src/app/api/social/approve).
 *
 * Kill switch: set VERCEL_CONTENT_IDEAS_CRON_ENABLED=false in Vercel env.
 * Secret:      CRON_SECRET (same as every other cron route).
 *
 * Template source: docs/marketing/templates/cron-content-generator.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { generateFalImage } from '@/lib/fal/generate-image';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY!,
});

const BANNED_PHRASES = [
  'democratising',
  'democratizing',
  'empowering',
  'revolutionising',
  'revolutionizing',
  'game-changing',
  'game changer',
  'disrupting',
];

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_CONTENT_IDEAS_CRON_ENABLED === 'false') {
    return NextResponse.json({ skipped: true, reason: 'kill_switch' });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: ideas, error: ideasErr } = await supabase
    .from('content_ideas')
    .select('*')
    .is('last_used_at', null)
    .order('created_at', { ascending: true })
    .limit(3);

  if (ideasErr) {
    await logRun(supabase, 'error', { error: ideasErr.message });
    return NextResponse.json({ error: ideasErr.message }, { status: 500 });
  }

  if (!ideas || ideas.length === 0) {
    await logRun(supabase, 'no_output', { reason: 'no_unused_ideas' });
    return NextResponse.json({
      success: true,
      drafts_created: 0,
      note: 'content_ideas table has no unused rows — reseed it',
    });
  }

  const drafts: any[] = [];
  const failures: Array<{ ideaId: string; stage: string; message: string }> = [];

  for (const idea of ideas) {
    try {
      const caption = await generateCaption(idea);

      let imageUrl: string | null = null;
      try {
        imageUrl = await generateFalImage({
          prompt: idea.image_prompt,
          filename: `generated/${idea.target_platform}-${idea.id}.jpg`,
        });
      } catch (imgErr: any) {
        failures.push({
          ideaId: idea.id,
          stage: 'image_generation',
          message: imgErr?.message ?? 'unknown',
        });
      }

      const { data: draft, error: draftErr } = await supabase
        .from('content_drafts')
        .insert({
          platform: idea.target_platform,
          content_type: idea.format,
          caption: caption.caption,
          hashtags: caption.hashtags,
          asset_url: imageUrl,
          status: imageUrl ? 'pending' : 'image_failed',
          source_idea_id: idea.id,
        })
        .select()
        .single();

      if (draftErr) {
        failures.push({ ideaId: idea.id, stage: 'db_insert', message: draftErr.message });
        continue;
      }

      drafts.push(draft);
    } catch (err: any) {
      failures.push({
        ideaId: idea.id,
        stage: 'caption',
        message: err?.message ?? 'unknown',
      });
    }
  }

  if (drafts.length > 0) {
    await supabase
      .from('content_ideas')
      .update({ last_used_at: new Date().toISOString() })
      .in(
        'id',
        drafts.map((d) => d.source_idea_id).filter(Boolean),
      );
  }

  await logRun(
    supabase,
    drafts.length > 0 ? 'success' : 'no_output',
    {
      drafts_created: drafts.length,
      draft_ids: drafts.map((d) => d.id),
      failures,
    },
  );

  return NextResponse.json({
    success: true,
    drafts_created: drafts.length,
    failures: failures.length,
  });
}

async function generateCaption(idea: any): Promise<{ caption: string; hashtags: string }> {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You write social captions for Paybacker, a UK AI tool that drafts formal consumer-rights complaint letters (paybacker.co.uk).

Idea: ${idea.title}
Hook: ${idea.hook}
Pillar: ${idea.pillar}
Platform: ${idea.target_platform}
Format: ${idea.format}

Write ONE caption for this platform that:
- Opens with the hook (first 10 words must grab)
- Is 80-180 words
- Never uses marketing-speak (e.g. "empowering", "democratising", "game-changing")
- Ends with a clear "Try it free at paybacker.co.uk"
- Includes NO emojis unless the platform is TikTok (then max 1-2)
- Sounds like a specific founder writing, not a brand voice

Then on a new line, list hashtags appropriate for the platform (TikTok: 5; Instagram: 8; LinkedIn: 3; X: 2; Facebook: none).

Return ONLY valid JSON: {"caption": "...", "hashtags": "..."}`,
      },
    ],
  });

  const text = (res.content[0] as any).text as string;
  const parsed = JSON.parse(text);

  // Safety filter: if Claude slipped in a banned phrase, retry once with
  // tighter guidance. One retry only to bound cost.
  const lowered = parsed.caption.toLowerCase();
  if (BANNED_PHRASES.some((p) => lowered.includes(p))) {
    const retry = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Rewrite this caption without any of these banned phrases: ${BANNED_PHRASES.join(', ')}. Keep the hook, keep the CTA. Return JSON: {"caption": "...", "hashtags": "..."}\n\nCurrent draft:\n${parsed.caption}`,
        },
      ],
    });
    const retryText = (retry.content[0] as any).text as string;
    return JSON.parse(retryText);
  }

  return parsed;
}

async function logRun(supabase: any, status: string, output: Record<string, unknown>) {
  await supabase.from('agent_runs').insert({
    agent_name: 'cron-content-ideas-generator',
    status,
    output,
  });
}
