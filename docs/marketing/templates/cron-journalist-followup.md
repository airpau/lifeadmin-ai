# Cron — Journalist Query Monitor + Follow-Up

**Purpose:** Daily at 09:00 UK, pull new journalist source-requests from ResponseSource, Qwoted, and HARO, filter to UK consumer/finance/tech queries, auto-draft responses using Paybacker's angle library (`haro-qwoted-responses.md`), and queue them in Paul's admin dashboard for manual review. Also runs a follow-up pass on unanswered press pitches from `master-pr-pitch.md`.

**Why manual send:** templated responses destroy journalist relationships. The saving here is in "you never wrote a response from scratch; always from a pre-draft," not in automation of send.

## File: `src/app/api/cron/press-outreach/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const CRON_SECRET = process.env.CRON_SECRET!;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AGENTS_API_KEY! });

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient();

  // A. QUERY MONITORING
  const queries = await fetchJournalistQueries();
  const filtered = queries.filter(isPaybackerRelevant);

  const draftedResponses = [];
  for (const q of filtered) {
    const draft = await draftResponse(q);
    const { data, error } = await supabase.from('press_outreach').insert({
      journalist_name: q.journalist,
      publication: q.publication,
      query_source: q.source,
      query_text: q.queryText,
      query_deadline: q.deadline,
      draft_response: draft.response,
      angle_used: draft.angleUsed,
      status: 'pending_send',
    }).select().single();
    if (!error) draftedResponses.push(data);
  }

  // B. FOLLOW-UP PASS
  //    Find cold pitches sent 5-7 days ago with no reply, draft follow-up.
  const { data: staleSends } = await supabase
    .from('press_outreach')
    .select('*')
    .eq('status', 'sent')
    .is('replied_at', null)
    .gte('sent_at', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
    .lte('sent_at', new Date(Date.now() - 5 * 86400 * 1000).toISOString())
    .is('followup_draft', null);

  const followupDrafts = [];
  for (const send of staleSends ?? []) {
    const followup = await draftFollowup(send);
    const { error } = await supabase
      .from('press_outreach')
      .update({ followup_draft: followup, status: 'followup_pending' })
      .eq('id', send.id);
    if (!error) followupDrafts.push(send.id);
  }

  await supabase.from('agent_runs').insert({
    agent_name: 'cron-press-outreach',
    status: 'success',
    output: {
      new_query_drafts: draftedResponses.length,
      followup_drafts: followupDrafts.length,
    },
  });

  return NextResponse.json({
    success: true,
    query_drafts: draftedResponses.length,
    followup_drafts: followupDrafts.length,
  });
}

async function fetchJournalistQueries() {
  // Three sources; the most reliable is ResponseSource if on paid plan.
  // Qwoted has a partial API. HARO (now Muck Rack Connect) has no public API
  // — monitor via email-to-Supabase pipeline (forwarded to an alias that parses).
  const [rs, qw, haro] = await Promise.all([
    fetchResponseSource(),
    fetchQwoted(),
    fetchHaroFromEmailInbox(),
  ]);
  return [...rs, ...qw, ...haro];
}

function isPaybackerRelevant(q: any): boolean {
  const relevance = /consumer|bill|broadband|parking|energy|ofgem|ofcom|flight|delay|refund|complaint|subscription|scam|cost of living|fintech|AI/i;
  return relevance.test(q.queryText + ' ' + q.subject);
}

async function draftResponse(query: any) {
  // Load Paybacker angle library from a stored string (or from the .md file on disk)
  const angleLibrary = await loadAngleLibrary();

  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are drafting a HARO / Qwoted response as Paul Airey (founder of Paybacker, paybacker.co.uk, a UK AI consumer-rights tool).

Journalist query:
"${query.queryText}"

Deadline: ${query.deadline}
Publication: ${query.publication}

Paybacker angle library (pick the closest match or synthesise a new angle):
${angleLibrary}

Draft a response following this structure:
1. One-sentence opener acknowledging the query
2. Pull quote (40-70 words, first-person Paul Airey, specific, with one concrete number/citation)
3. Supporting context (30-60 words, adds depth with UK legislation or body named)
4. Attribution line: "Happy to be quoted as 'Paul Airey, Founder of Paybacker (paybacker.co.uk), a UK-registered FCA-authorised AI tool helping consumers dispute unfair bills.'"

Return JSON: {"response": "...", "angleUsed": "e.g. 'broadband mid-contract', 'UK261 flight delays'"}`
    }],
  });

  return JSON.parse((res.content[0] as any).text);
}

async function draftFollowup(send: any) {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Draft a SHORT (50-80 words) follow-up to this originally-sent press pitch. Tone: polite, low-pressure, one-chance-only.

Original pitch:
"${send.original_pitch}"

Draft the follow-up — start with "Hi ${send.journalist_first_name}" and end "Paul".
Never say "just following up". Use "bumping in case it got lost".`
    }],
  });
  return (res.content[0] as any).text;
}
```

## vercel.json entry

```json
{
  "path": "/api/cron/press-outreach",
  "schedule": "0 9 * * 1-5"
}
```

Weekdays only. Weekend queries are dead.

## New table — press_outreach

Add a migration:

```sql
CREATE TABLE IF NOT EXISTS press_outreach (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journalist_name TEXT,
  journalist_email TEXT,
  publication TEXT,
  query_source TEXT,            -- 'responsesource' | 'qwoted' | 'haro' | 'cold' | 'warm_reconnect'
  query_text TEXT,
  query_deadline TIMESTAMPTZ,
  angle_used TEXT,
  original_pitch TEXT,
  draft_response TEXT,
  followup_draft TEXT,
  status TEXT DEFAULT 'pending_send',  -- pending_send | sent | followup_pending | replied | placed | dead
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  placed_at TIMESTAMPTZ,
  coverage_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Data sources

| Source | Method | Notes |
|---|---|---|
| ResponseSource | API if on paid plan (~£50/mo), else email scrape | Best UK source |
| Qwoted | Free daily digest email → forward to `press@paybacker.co.uk` → Mail parser → Supabase | Works with Cloudflare Email Workers or Resend inbound |
| HARO (Muck Rack Connect) | Email digest 3x/day → same inbound parser | 80% US noise, filter aggressively |
| Twitter #journorequest | Skipped in cron — Paul checks manually when on X anyway | Real-time, manual |

The email-to-Supabase parser is a new small serverless function that takes an inbound email, parses the digest format for each source, and inserts rows into a `raw_press_queries` staging table. The cron reads from there.

## Angle library loader

Load once per cron run from a Supabase `marketing_angles` table (seeded from `haro-qwoted-responses.md`). Table schema:

```sql
CREATE TABLE IF NOT EXISTS marketing_angles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT,                -- 'broadband_mid_contract' | 'pofa_parking' | 'uk261' etc.
  pull_quote TEXT,
  supporting_context TEXT,
  legislation_cited TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Seed from `haro-qwoted-responses.md` at build-time via `scripts/seed-marketing-angles.ts`.

## Admin UI — press review page

`/admin/press-outreach` — tabs for "New query drafts", "Follow-up drafts", "Sent awaiting reply", "Placed".

Each draft row: journalist, publication, query text, deadline, draft response in editable textarea, Send/Skip/Save for later buttons.

On Send: Paul copies the draft, opens email client, sends manually. Marks `sent_at` + `status = 'sent'`. Does NOT auto-send (journalist relationships are fragile).

## Estimated cost

- Anthropic: typically 3-10 new query drafts/day + 0-3 follow-ups = ~10k tokens/day = £0.04/day = £1.20/month
- Apify / scraping: free tier
- **Total: ≈ £1-2/month** (not counting ResponseSource subscription if we take it)

## Failure modes

- **Source down (API/email):** log, continue; other sources keep running
- **Query batched incorrectly:** Paul filters in the admin UI
- **Draft off-angle:** Paul edits or rejects. Edit patterns feed a prompt-improvement cron monthly.

## Kill switch

`VERCEL_PRESS_CRON_ENABLED=false`.

## Not covered in this cron

- Warm reconnect emails (Katie Morley, personal contacts): never automated. Paul writes personally.
- Martin Lewis pitch: never sent via cron. Specific hand-crafted send only.
- Partnership emails: see `partnership-pitch.md` — separate workflow, less time-sensitive than journalist queries.
