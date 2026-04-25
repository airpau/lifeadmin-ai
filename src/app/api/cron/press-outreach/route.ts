/**
 * Cron — Press Outreach (HARO / Qwoted / ResponseSource + follow-ups)
 *
 * Schedule: 09:00 UK weekdays (see vercel.json).
 * Purpose:  (A) Pull new journalist queries from raw_press_queries staging
 *               table, filter to Paybacker-relevant UK consumer/finance/tech,
 *               draft responses grounded in marketing_angles, queue in
 *               press_outreach with status='pending_send' for manual review.
 *           (B) Find cold pitches sent 5-7 days ago with no reply, draft
 *               follow-up, move status to 'followup_pending'.
 *
 * IMPORTANT — does NOT send anything. Templated responses destroy journalist
 * relationships. Paul sends manually from /admin/press-outreach.
 *
 * Kill switch: VERCEL_PRESS_CRON_ENABLED=false
 * Secret:      CRON_SECRET
 *
 * Template source: docs/marketing/templates/cron-journalist-followup.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY!,
});

const RELEVANCE_REGEX =
  /consumer|bill|broadband|parking|energy|ofgem|ofcom|flight|delay|refund|complaint|subscription|scam|cost of living|fintech|AI|consumer rights|tenant|council tax|HMRC/i;

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_PRESS_CRON_ENABLED === 'false') {
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

  // -----------------------------------------------------------------------
  // A) Pull unparsed raw queries, parse & filter, draft responses.
  // -----------------------------------------------------------------------
  const { data: rawRows } = await supabase
    .from('raw_press_queries')
    .select('*')
    .eq('parsed', false)
    .limit(50);

  const queries: Array<{
    rawId: string;
    source: string;
    journalist: string | null;
    firstName: string | null;
    publication: string | null;
    queryText: string;
    deadline: string | null;
  }> = [];

  for (const raw of rawRows ?? []) {
    try {
      const parsed = parseDigest(raw.source, raw.raw_body ?? '');
      for (const q of parsed) {
        queries.push({ rawId: raw.id, ...q });
      }
      await supabase
        .from('raw_press_queries')
        .update({ parsed: true })
        .eq('id', raw.id);
    } catch (err: any) {
      await supabase
        .from('raw_press_queries')
        .update({ parsed: true, parse_error: err?.message ?? 'unknown' })
        .eq('id', raw.id);
    }
  }

  const relevant = queries.filter((q) => RELEVANCE_REGEX.test(q.queryText));

  // Load angle library once per run.
  const { data: angles } = await supabase
    .from('marketing_angles')
    .select('topic, pull_quote, supporting_context, legislation_cited, evidence_numbers');

  const angleLibrary =
    (angles ?? [])
      .map(
        (a: any) =>
          `TOPIC: ${a.topic}\nQUOTE: ${a.pull_quote}\nCONTEXT: ${a.supporting_context ?? ''}\nLEGISLATION: ${a.legislation_cited ?? ''}\nEVIDENCE: ${a.evidence_numbers ?? ''}`,
      )
      .join('\n---\n') || '(no angles seeded — reseed marketing_angles)';

  const newDrafts: any[] = [];
  for (const q of relevant) {
    try {
      const draft = await draftResponse(q, angleLibrary);
      const { data, error } = await supabase
        .from('press_outreach')
        .insert({
          journalist_name: q.journalist,
          journalist_first_name: q.firstName,
          publication: q.publication,
          query_source: q.source,
          query_text: q.queryText,
          query_deadline: q.deadline,
          draft_response: draft.response,
          angle_used: draft.angleUsed,
          status: 'pending_send',
        })
        .select()
        .single();
      if (!error) newDrafts.push(data);
    } catch (err) {
      // swallow — one bad draft shouldn't kill the run
    }
  }

  // -----------------------------------------------------------------------
  // B) Follow-up pass: sent 5-7d ago, no reply, no follow-up draft yet.
  // -----------------------------------------------------------------------
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();

  const { data: staleSends } = await supabase
    .from('press_outreach')
    .select('*')
    .eq('status', 'sent')
    .is('replied_at', null)
    .gte('sent_at', sevenDaysAgo)
    .lte('sent_at', fiveDaysAgo)
    .is('followup_draft', null);

  const followups: string[] = [];
  for (const send of staleSends ?? []) {
    try {
      const followup = await draftFollowup(send);
      const { error } = await supabase
        .from('press_outreach')
        .update({ followup_draft: followup, status: 'followup_pending' })
        .eq('id', send.id);
      if (!error) followups.push(send.id);
    } catch {
      // continue
    }
  }

  await supabase.from('agent_runs').insert({
    agent_name: 'cron-press-outreach',
    status: 'success',
    output: {
      raw_rows_parsed: rawRows?.length ?? 0,
      queries_extracted: queries.length,
      queries_relevant: relevant.length,
      new_drafts: newDrafts.length,
      followup_drafts: followups.length,
    },
  });

  return NextResponse.json({
    success: true,
    query_drafts: newDrafts.length,
    followup_drafts: followups.length,
  });
}

// -------------------------------------------------------------------------
// Digest parsers — stubs for now; real parsers hang off inbound email webhook.
// -------------------------------------------------------------------------
function parseDigest(
  source: string,
  body: string,
): Array<{
  source: string;
  journalist: string | null;
  firstName: string | null;
  publication: string | null;
  queryText: string;
  deadline: string | null;
}> {
  // Minimal placeholder: one query per row with the whole body as queryText.
  // Replace with proper per-source parsers once Qwoted / HARO inbound email
  // alias is wired (see docs/marketing/templates/cron-journalist-followup.md).
  if (!body.trim()) return [];
  return [
    {
      source,
      journalist: null,
      firstName: null,
      publication: null,
      queryText: body.trim().slice(0, 4_000),
      deadline: null,
    },
  ];
}

async function draftResponse(query: any, angleLibrary: string) {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `You are drafting a HARO / Qwoted response as Paul Airey (founder of Paybacker, paybacker.co.uk, a UK AI consumer-rights tool).

Journalist query:
"""
${query.queryText}
"""

Deadline: ${query.deadline ?? 'not stated'}
Publication: ${query.publication ?? 'unknown'}

Paybacker angle library (pick the closest match or synthesise a new angle using real UK legislation):
${angleLibrary}

Draft a response following this structure:
1. One-sentence opener acknowledging the query
2. Pull quote (40-70 words, first-person Paul Airey, specific, with one concrete number)
3. Supporting context (30-60 words, adds depth with UK legislation or regulator named)
4. Attribution line: "Happy to be quoted as 'Paul Airey, Founder of Paybacker (paybacker.co.uk), a UK AI tool helping consumers dispute unfair bills.'"

Return ONLY valid JSON: {"response": "...", "angleUsed": "topic identifier e.g. broadband_mid_contract"}`,
      },
    ],
  });

  const text = (res.content[0] as any).text as string;
  return JSON.parse(text);
}

async function draftFollowup(send: any): Promise<string> {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Draft a SHORT (50-80 words) follow-up to this press pitch. Tone: polite, low-pressure, one-chance-only.

Original pitch:
"""
${send.original_pitch ?? send.draft_response ?? ''}
"""

Start with "Hi ${send.journalist_first_name ?? 'there'}" and sign off "Paul".
Do NOT say "just following up". Use "bumping in case it got lost" or similar.`,
      },
    ],
  });
  return (res.content[0] as any).text.trim();
}
