# Cron — Daily Content Generator

**Purpose:** Every morning at 07:00 UK, generate a tranche of marketing content (social captions + images + video idea suggestions) and queue it for Paul's approval in the admin dashboard.

**Why this exists:** Paybacker can't afford a content person. This cron replaces one by turning each day's work into "approve/reject/edit 5 cards on the phone while commuting" rather than "find ideas, write copy, generate images, caption, schedule."

## File: `src/app/api/cron/generate-content/route.ts`

```typescript
// NEW ROUTE — add to vercel.json cron schedule below

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateImage } from '@/lib/fal'; // new helper (see below)

const CRON_SECRET = process.env.CRON_SECRET!;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AGENTS_API_KEY! });

export async function GET(req: NextRequest) {
  // Auth check
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient();

  // 1. Pick 3 unused ideas from tiktok-reels-30-seed-ideas.md
  //    Stored in Supabase `content_ideas` table, seeded from the .md file
  const { data: ideas } = await supabase
    .from('content_ideas')
    .select('*')
    .is('last_used_at', null)
    .limit(3)
    .order('created_at', { ascending: true });

  if (!ideas || ideas.length === 0) {
    return NextResponse.json({ error: 'No unused ideas — reseed content_ideas table' });
  }

  // 2. For each idea: draft caption, pick hook copy, generate 1 image via fal.ai
  const drafts = [];
  for (const idea of ideas) {
    const caption = await generateCaption(idea);
    const imageUrl = await generateImage({
      prompt: idea.image_prompt,
      model: 'fal-ai/flux-pro/v1.1-ultra',
    });

    // 3. Insert into content_drafts for Paul to approve
    const { data: draft, error } = await supabase
      .from('content_drafts')
      .insert({
        platform: idea.target_platform, // 'tiktok' | 'instagram' | 'linkedin' etc.
        content_type: idea.format,       // 'reel' | 'static' | 'carousel'
        caption: caption.caption,
        hashtags: caption.hashtags,
        asset_url: imageUrl,
        status: 'pending',
        source_idea_id: idea.id,
      })
      .select()
      .single();

    if (!error) drafts.push(draft);
  }

  // 4. Mark ideas as used
  await supabase
    .from('content_ideas')
    .update({ last_used_at: new Date().toISOString() })
    .in('id', ideas.map(i => i.id));

  // 5. Log run
  await supabase.from('agent_runs').insert({
    agent_name: 'cron-content-generator',
    status: drafts.length > 0 ? 'success' : 'no_output',
    output: { drafts_created: drafts.length, draft_ids: drafts.map(d => d.id) },
  });

  return NextResponse.json({ success: true, drafts_created: drafts.length });
}

async function generateCaption(idea: any) {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You write social media captions for Paybacker, a UK AI tool that drafts formal consumer-rights complaint letters.

Idea: ${idea.title}
Hook: ${idea.hook}
Pillar: ${idea.pillar}
Platform: ${idea.target_platform}

Write ONE caption for this platform that:
- Opens with the hook (first 10 words must grab)
- Is 80-180 words
- Never uses marketing-speak ("empowering", "democratising") or generic fintech phrases
- Ends with a clear "Try it free at paybacker.co.uk"
- Includes NO emojis unless the platform is TikTok (then sparingly)
- Sounds like a specific founder writing, not a brand

Then on a new line, list 5-8 hashtags appropriate for the platform (TikTok: 5; Instagram: 8; LinkedIn: 3).

Return JSON: {"caption": "...", "hashtags": "..."}`
    }],
  });

  const text = (res.content[0] as any).text;
  return JSON.parse(text);
}
```

## vercel.json entry

Add to `vercel.json` under `"crons"`:

```json
{
  "path": "/api/cron/generate-content",
  "schedule": "0 7 * * *"
}
```

## New table — content_ideas

Needs a migration to add, then seed from `tiktok-reels-30-seed-ideas.md` (one row per numbered idea).

```sql
CREATE TABLE IF NOT EXISTS content_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  pillar TEXT NOT NULL,            -- 'injustice' | 'product' | 'education' | 'founder'
  target_platform TEXT NOT NULL,   -- 'tiktok' | 'instagram' | 'linkedin' | 'x' | 'facebook'
  format TEXT NOT NULL,            -- 'reel' | 'static' | 'carousel' | 'long_form'
  image_prompt TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  performance_avg JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Seeding script (one-time): parses `tiktok-reels-30-seed-ideas.md`, splits into 30 rows, assigns `target_platform` and `format` based on pillar, and derives `image_prompt` by matching to `ad-creative-prompts.md` prompts.

## New table — content_drafts already exists

From `/sessions/determined-dreamy-mendel/mnt/lifeadmin-ai/CLAUDE.md`, schema already defined. Just needs `source_idea_id UUID` column added:

```sql
ALTER TABLE content_drafts
ADD COLUMN IF NOT EXISTS source_idea_id UUID REFERENCES content_ideas(id);
```

## fal.ai helper (new file)

`src/lib/fal/generate-image.ts`:

```typescript
import * as fal from '@fal-ai/serverless-client';

fal.config({ credentials: process.env.FAL_KEY });

export async function generateImage({ prompt, model = 'fal-ai/flux-pro/v1.1-ultra' }: {
  prompt: string;
  model?: string;
}): Promise<string> {
  const result: any = await fal.subscribe(model, {
    input: {
      prompt: `${prompt} Brand colours: deep navy #0F172A, gold accent #F59E0B. No text in image. No hallucinated letters or signs. UK-specific.`,
      image_size: { width: 1080, height: 1920 },
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
  });

  const generatedUrl = result.images[0].url;

  // Download and re-upload to Supabase Storage (so we don't depend on fal.ai CDN)
  const { uploadToStorage } = await import('@/lib/storage');
  const finalUrl = await uploadToStorage({
    bucket: 'social-images',
    pathPrefix: 'generated',
    sourceUrl: generatedUrl,
  });

  return finalUrl;
}
```

## Admin UI — drafts review page

`/admin/content-drafts` — a simple table listing pending drafts. Each row: thumbnail, caption preview, platform, "Approve", "Edit", "Reject" buttons.

On Approve: queues in Late API via `/api/social/post`. On Reject: drops to `status = 'rejected'`. On Edit: modal with caption/hashtag editing before approve.

## Estimated cost per day

- Anthropic: ~3 captions × 500 output tokens ≈ 1,500 tokens ≈ £0.004
- fal.ai Flux Pro: 3 images × £0.04 ≈ £0.12
- **Total: £0.13/day ≈ £4/month**

## Failure modes to guard against

- **fal.ai rate-limit:** retry with backoff (3x); if still fails, mark draft as `status = 'image_failed'` and Paul generates manually
- **Hallucinated text in image:** Paul catches in review. Add a future Claude Vision check step — small model verifies no legible text before inserting.
- **Seed table empty:** cron returns `{error: 'reseed'}` — Paul's signal to add more ideas
- **Caption contains banned phrases** (see CLAUDE.md rules, e.g. "democratising"): post-generation regex filter; retry if caught

## Kill switch

`VERCEL_CONTENT_CRON_ENABLED=false` env var disables the cron. Check this at the top of the route and return early if set.
