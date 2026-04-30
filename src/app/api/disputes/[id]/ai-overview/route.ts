/**
 * GET /api/disputes/[id]/ai-overview
 *
 * Returns a cached Haiku-generated overview of the dispute for the
 * detail page header card:
 *   - summary       : 2-3 sentence "what is this dispute"
 *   - latest_update : one-sentence note on the most recent activity
 *   - next_action   : what the user should do right now
 *   - suggested_steps: 2-3 concrete bullets
 *
 * Caching is keyed on the correspondence count — a new message
 * arriving naturally invalidates the cache and re-runs Haiku next
 * page load. Force a refresh with ?refresh=1.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface OverviewPayload {
  summary: string;
  latest_update: string;
  next_action: string;
  suggested_steps: string[];
  generated_at: string;
  correspondence_count: number;
  cached: boolean;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  const admin = getAdmin();
  const { data: dispute } = await admin
    .from('disputes')
    .select('id, user_id, provider_name, issue_type, issue_summary, desired_outcome, status, created_at, ai_summary, ai_latest_update, ai_next_action, ai_suggested_steps, ai_summary_correspondence_count, ai_summary_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!dispute) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: correspondence } = await admin
    .from('correspondence')
    .select('id, entry_type, direction, content, sender_name, occurred_at, entry_date, title')
    .eq('dispute_id', id)
    .order('occurred_at', { ascending: true, nullsFirst: false });
  const corrs = correspondence ?? [];

  // Cache hit — same number of messages and we already have a summary.
  if (
    !forceRefresh
    && dispute.ai_summary
    && dispute.ai_summary_correspondence_count === corrs.length
  ) {
    const payload: OverviewPayload = {
      summary: dispute.ai_summary,
      latest_update: dispute.ai_latest_update ?? '',
      next_action: dispute.ai_next_action ?? '',
      suggested_steps: Array.isArray(dispute.ai_suggested_steps) ? dispute.ai_suggested_steps : [],
      generated_at: dispute.ai_summary_at ?? new Date().toISOString(),
      correspondence_count: corrs.length,
      cached: true,
    };
    return NextResponse.json(payload);
  }

  // Build a compact thread digest for the prompt — cap each entry so
  // we stay within Haiku\'s context budget on long disputes.
  const lines = corrs.map((c) => {
    const date = (c.occurred_at || c.entry_date || '').slice(0, 10);
    const who = c.entry_type === 'ai_letter' ? 'You sent (AI letter)'
      : c.entry_type === 'user_note' || c.entry_type === 'user_reply' ? `You wrote`
      : c.entry_type === 'company_email' ? `${c.sender_name ?? 'Company'} replied`
      : c.entry_type === 'company_response' || c.entry_type === 'company_letter' ? 'Company responded'
      : c.entry_type === 'phone_call' ? 'Phone call'
      : c.entry_type;
    const body = (c.content || '').slice(0, 600);
    return `[${date}] ${who}${c.title ? ` — ${c.title}` : ''}\n${body}`;
  }).join('\n\n---\n\n');

  const prompt = `You\'re writing a status update for a UK consumer dispute, addressed to the customer (the person reading this is the customer, not the company).

Provider being disputed: ${dispute.provider_name}
Type: ${dispute.issue_type}
What the dispute is about: ${dispute.issue_summary || 'not stated'}
Desired outcome: ${dispute.desired_outcome || 'not stated'}
Status: ${dispute.status}

Correspondence so far (oldest → newest):
${lines || '(no correspondence yet — only the user\'s opening note)'}

Return JSON only with these keys:
- "summary": 2-3 sentence neutral overview of what this dispute is about and the current state. Plain English.
- "latest_update": one sentence describing the MOST RECENT activity (e.g. "The company replied on 21 April offering a £50 partial refund", "Your AI letter was sent on 18 April but no reply yet"). If no correspondence beyond the opening note: "No reply yet from ${dispute.provider_name}."
- "next_action": one short sentence telling the user what to do RIGHT NOW. Start with a verb. Examples: "Reply to their partial-refund offer.", "Wait 14 days then escalate to the ombudsman.", "Send the first complaint letter."
- "suggested_steps": array of 2-3 concrete bullet-point next steps in plain English. Each ≤ 18 words.

Output JSON only.`;

  let parsed: any;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0];
    const raw = text.type === 'text' ? text.text : '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    parsed = JSON.parse(match[0]);
  } catch (err) {
    return NextResponse.json({ error: `AI overview failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }

  const summary = String(parsed.summary ?? '').trim();
  const latestUpdate = String(parsed.latest_update ?? '').trim();
  const nextAction = String(parsed.next_action ?? '').trim();
  const steps = Array.isArray(parsed.suggested_steps) ? parsed.suggested_steps.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 5) : [];

  await admin
    .from('disputes')
    .update({
      ai_summary: summary,
      ai_latest_update: latestUpdate,
      ai_next_action: nextAction,
      ai_suggested_steps: steps,
      ai_summary_correspondence_count: corrs.length,
      ai_summary_at: new Date().toISOString(),
    })
    .eq('id', id);

  const payload: OverviewPayload = {
    summary,
    latest_update: latestUpdate,
    next_action: nextAction,
    suggested_steps: steps,
    generated_at: new Date().toISOString(),
    correspondence_count: corrs.length,
    cached: false,
  };
  return NextResponse.json(payload);
}
