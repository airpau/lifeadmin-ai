/**
 * POST /api/disputes/from-email
 *
 * One-shot "create a dispute from an existing email thread" flow.
 *
 * Body:
 *   { connectionId, threadId, userContext, desiredOutcome, issueTypeHint? }
 *
 * Steps:
 *   1. Verify connection ownership; load it.
 *   2. Fetch the full thread via fetchNewMessages (threads up to 365d back).
 *   3. AI-extract structured facts from the thread + user context
 *      (Claude Haiku for cost — this isn\'t the user-facing letter,
 *       just key/value extraction).
 *   4. Create the dispute row with extracted + user-supplied data.
 *   5. Insert a `dispute_watchdog_links` row so the thread is
 *      monitored from now on; backfill correspondence with the
 *      thread history.
 *   6. Generate the actual complaint letter (Sonnet) using the
 *      existing /api/complaints/generate endpoint as a sub-call.
 *   7. Return the dispute id so the UI can route to the detail page.
 *
 * The reply-detection cron + telegram alerting are unchanged — once
 * the watchdog link exists, every new message in the thread triggers
 * the existing pipeline.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fetchNewMessages } from '@/lib/dispute-sync/fetchers';
import type { EmailConnection } from '@/lib/dispute-sync/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_ISSUE_TYPES = new Set([
  'complaint', 'energy_dispute', 'broadband_complaint', 'flight_compensation',
  'parking_appeal', 'debt_dispute', 'refund_request', 'hmrc_tax_rebate',
  'council_tax_band', 'dvla_vehicle', 'nhs_complaint',
]);

interface ExtractedFacts {
  provider_name: string;
  account_number: string | null;
  disputed_amount: number | null;
  issue_type: string;
  issue_summary: string;
  thread_summary: string;
}

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function extractFacts(
  threadText: string,
  userContext: string,
  desiredOutcome: string,
  issueTypeHint?: string,
): Promise<ExtractedFacts> {
  const prompt = `You are extracting structured facts from an email thread so a UK consumer-rights tool can build a dispute. Return ONLY valid JSON, no preamble.

EMAIL THREAD (most recent last):
${threadText.slice(0, 8000)}

USER CONTEXT (what happened from their side):
${userContext.slice(0, 1000)}

DESIRED OUTCOME (what they want):
${desiredOutcome.slice(0, 500)}

USER\'S CATEGORY HINT (may be empty): ${issueTypeHint ?? ''}

Return JSON with exactly these keys:
- "provider_name": the company involved (clean, e.g. "British Gas", "Broxbourne Borough Council", "EuroCarParks Ltd"). NEVER an email domain or technical id.
- "account_number": account / reference / ticket number found in the email, or null if none.
- "disputed_amount": the GBP amount in dispute as a positive number (no symbols), or null if not specified.
- "issue_type": ONE of these UK-specific dispute categories — pick the closest match:
    "complaint" (generic / shopping / service)
    "energy_dispute"
    "broadband_complaint" (broadband, mobile, phone)
    "flight_compensation"
    "parking_appeal"
    "debt_dispute" (debt collector, missed payment, CCJ)
    "refund_request"
    "hmrc_tax_rebate"
    "council_tax_band" (also use for council tax billing or business rates)
    "dvla_vehicle"
    "nhs_complaint"
- "issue_summary": ONE-SENTENCE summary of the dispute (≤ 30 words).
- "thread_summary": 2-3 sentence summary of the email thread for context.

Output JSON only.`;

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content[0];
  const raw = text.type === 'text' ? text.text : '{}';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI extraction returned no JSON');
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('AI extraction returned invalid JSON');
  }
  const facts: ExtractedFacts = {
    provider_name: String(parsed.provider_name ?? '').trim() || 'Unknown company',
    account_number: parsed.account_number ? String(parsed.account_number) : null,
    disputed_amount: typeof parsed.disputed_amount === 'number' ? parsed.disputed_amount : null,
    issue_type: ALLOWED_ISSUE_TYPES.has(parsed.issue_type) ? parsed.issue_type : (issueTypeHint && ALLOWED_ISSUE_TYPES.has(issueTypeHint) ? issueTypeHint : 'complaint'),
    issue_summary: String(parsed.issue_summary ?? '').trim() || userContext.slice(0, 120),
    thread_summary: String(parsed.thread_summary ?? '').trim(),
  };
  return facts;
}

interface Body {
  connectionId?: string;
  threadId?: string;
  userContext?: string;
  desiredOutcome?: string;
  issueTypeHint?: string;
  // Optional pre-extracted overrides — when the UI has already shown
  // the user the AI preview, these come back so we don\'t bin
  // changes the user made (e.g. correcting a wrong company name).
  providerOverride?: string;
  amountOverride?: number | null;
  accountOverride?: string | null;
  issueTypeOverride?: string | null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const { connectionId, threadId } = body;
  const userContext = (body.userContext ?? '').trim();
  const desiredOutcome = (body.desiredOutcome ?? '').trim();
  if (!connectionId || !threadId) {
    return NextResponse.json({ error: 'connectionId and threadId are required' }, { status: 400 });
  }
  if (!userContext || !desiredOutcome) {
    return NextResponse.json({ error: 'Tell us what happened and what outcome you want.' }, { status: 400 });
  }

  // Use the service-role client for the connection load + writes —
  // RLS would still gate it but this matches the existing complaint
  // generator pattern (token decryption etc).
  const admin = getAdmin();
  const { data: conn } = await admin
    .from('email_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: 'Email connection not found' }, { status: 404 });

  // 1. Pull the entire thread (since: null = full history) for AI context.
  let messages: Array<{ subject: string; fromAddress: string; fromName: string; receivedAt: Date; body: string; snippet: string }>;
  try {
    messages = await fetchNewMessages(conn as unknown as EmailConnection, threadId, null);
  } catch (err) {
    return NextResponse.json({ error: `Couldn\'t read the email thread: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 502 });
  }
  if (messages.length === 0) {
    return NextResponse.json({ error: 'Thread is empty.' }, { status: 400 });
  }

  // 2. Build a compact text dump for the extraction prompt.
  const threadText = messages
    .map((m) => `From: ${m.fromName || m.fromAddress}\nDate: ${m.receivedAt.toISOString()}\nSubject: ${m.subject}\n\n${m.body || m.snippet}`)
    .join('\n\n---\n\n');

  // 3. AI extraction. User-provided overrides win over AI guesses
  // so corrections made on the preview screen survive the create.
  let facts: ExtractedFacts;
  try {
    facts = await extractFacts(threadText, userContext, desiredOutcome, body.issueTypeHint);
  } catch (err) {
    return NextResponse.json({ error: `AI extraction failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }
  if (body.providerOverride && body.providerOverride.trim()) {
    facts.provider_name = body.providerOverride.trim();
  }
  if (body.amountOverride !== undefined) facts.disputed_amount = body.amountOverride;
  if (body.accountOverride !== undefined) facts.account_number = body.accountOverride;
  if (body.issueTypeOverride && ALLOWED_ISSUE_TYPES.has(body.issueTypeOverride)) {
    facts.issue_type = body.issueTypeOverride;
  }

  // 4. Create dispute row directly so we can also stamp the
  // detected_from_email + thread_summary fields.
  const { data: dispute, error: insertErr } = await admin
    .from('disputes')
    .insert({
      user_id: user.id,
      provider_name: facts.provider_name,
      issue_type: facts.issue_type,
      issue_summary: facts.issue_summary,
      desired_outcome: desiredOutcome,
      account_number: facts.account_number,
      disputed_amount: facts.disputed_amount,
      status: 'open',
    })
    .select('*')
    .single();
  if (insertErr || !dispute) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to create dispute' }, { status: 500 });
  }

  // 5. Link the email thread for ongoing Watchdog monitoring + import history.
  //
  // Pick the SUPPLIER side of the conversation. fetchNewMessages already
  // strips user-own messages, so walking backwards here picks the most
  // recent supplier sender. If every message is from the user (outbound-
  // only thread, e.g. they only just sent the complaint), fall back to the
  // user\'s own address so we at least store something non-null — a
  // follow-up sync will replace this once the supplier replies.
  let supplierMsg = [...messages].reverse().find((m) => {
    const addr = (m.fromAddress ?? '').toLowerCase();
    return addr && addr !== (conn.email_address ?? '').toLowerCase();
  });
  if (!supplierMsg) supplierMsg = messages[messages.length - 1];
  const senderDomain = (supplierMsg.fromAddress.split('@')[1] || '').toLowerCase();
  const lastMsg = messages[messages.length - 1];
  const { data: link, error: linkErr } = await admin
    .from('dispute_watchdog_links')
    .insert({
      dispute_id: dispute.id,
      user_id: user.id,
      email_connection_id: connectionId,
      provider: ((conn.provider_type ?? '').toLowerCase().startsWith('g') ? 'gmail' : 'outlook'),
      thread_id: threadId,
      subject: lastMsg.subject,
      sender_domain: senderDomain,
      sender_address: supplierMsg.fromAddress.toLowerCase(),
      sync_enabled: true,
      match_source: 'user_confirmed',
      match_confidence: 1.0,
      last_synced_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (linkErr) {
    console.error('[from-email] watchdog link insert failed:', linkErr.message);
  }

  // 6. Import the thread history into correspondence so the dispute
  // detail page renders the existing emails immediately.
  if (messages.length > 0) {
    const rows = messages.map((m) => ({
      dispute_id: dispute.id,
      user_id: user.id,
      entry_type: 'company_email',
      direction: 'inbound',
      content: m.body || m.snippet || '',
      sender_name: m.fromName || m.fromAddress,
      sender_address: m.fromAddress.toLowerCase(),
      detected_from_email: true,
      external_message_id: undefined,
      occurred_at: m.receivedAt.toISOString(),
    }));
    await admin.from('correspondence').insert(rows);
  }

  // 7. Kick off the AI letter generation by calling the existing
  // /api/complaints/generate endpoint via internal fetch — keeps
  // the same legal-reference injection + verification path.
  let draftLetter: string | null = null;
  try {
    const origin = new URL(request.url).origin;
    const cookieHeader = request.headers.get('cookie') ?? '';
    const genRes = await fetch(`${origin}/api/complaints/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        companyName: facts.provider_name,
        issueDescription: `${facts.issue_summary}\n\nUser context:\n${userContext}\n\nThread summary:\n${facts.thread_summary}`,
        desiredOutcome,
        amount: facts.disputed_amount ? String(facts.disputed_amount) : '',
        accountNumber: facts.account_number ?? '',
        letterType: facts.issue_type,
        disputeId: dispute.id,
      }),
    });
    if (genRes.ok) {
      const genJson = await genRes.json();
      draftLetter = genJson.letter ?? null;
    }
  } catch (err) {
    console.error('[from-email] complaint generation failed:', err);
  }

  return NextResponse.json({
    dispute,
    extracted: facts,
    watchdogLinkId: link?.id ?? null,
    importedMessages: messages.length,
    draftLetter,
  });
}
