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
import { sendNotification } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Synchronous path: Haiku extraction (~3-10s) + DB writes (~1s) + sub-call
// to /api/complaints/generate (~30-90s for Sonnet + legal-refs guardrail).
// 180s comfortably covers the worst case while staying inside Vercel
// Pro's 300s ceiling. Earlier attempt (0ca55920) tried to defer the
// Sonnet call via after() so the response returned fast, but the
// deferred callback wasn't reliably completing on Vercel — disputes
// would land on the page with no ai_letter row in correspondence,
// leaving the agent banner stuck on "All caught up, no action needed"
// because there was no letter for the supplier to reply to. Synchronous
// generation is slower for the user (modal spinner stays up longer)
// but the letter is guaranteed to be in correspondence before they
// hit the dispute page.
export const maxDuration = 180;

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

  // 0. IDEMPOTENCY — if a watchdog link already exists for this user
  // + thread, a dispute for it has already been created. Return that
  // dispute instead of inserting a new one. Without this, every retry
  // (e.g. after the FUNCTION_INVOCATION_TIMEOUT bug below) inserts a
  // fresh dispute row and the disputes-centre fills with duplicates.
  const providerKey = (conn.provider_type ?? '').toLowerCase().startsWith('g') ? 'gmail' : 'outlook';
  const { data: existingLink } = await admin
    .from('dispute_watchdog_links')
    .select('id, dispute_id')
    .eq('user_id', user.id)
    .eq('provider', providerKey)
    .eq('thread_id', threadId)
    .maybeSingle();

  if (existingLink?.dispute_id) {
    const { data: existingDispute } = await admin
      .from('disputes')
      .select('*')
      .eq('id', existingLink.dispute_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingDispute) {
      return NextResponse.json({
        dispute: existingDispute,
        extracted: null,
        watchdogLinkId: existingLink.id,
        importedMessages: 0,
        draftLetter: null,
        letterPending: false,
        deduplicated: true,
      });
    }
  }

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
  // Upsert against the (user_id, provider, thread_id) unique index so a
  // concurrent retry can't duplicate the link. The idempotency check at
  // the top of the route should make this branch unreachable in practice,
  // but keep the upsert as a defensive belt-and-braces.
  const { data: link, error: linkErr } = await admin
    .from('dispute_watchdog_links')
    .upsert(
      {
        dispute_id: dispute.id,
        user_id: user.id,
        email_connection_id: connectionId,
        provider: providerKey,
        thread_id: threadId,
        subject: lastMsg.subject,
        sender_domain: senderDomain,
        sender_address: supplierMsg.fromAddress.toLowerCase(),
        sync_enabled: true,
        match_source: 'user_confirmed',
        match_confidence: 1.0,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider,thread_id', ignoreDuplicates: false },
    )
    .select('id')
    .single();
  if (linkErr) {
    console.error('[from-email] watchdog link upsert failed:', linkErr.message);
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

  // 7. Fire dispute_created across Pocket Agent channels NOW (telegram
  // + whatsapp + push) so the user knows the dispute landed before the
  // Sonnet letter finishes drafting. complaint_letter_ready fires
  // separately ~20-30s later from /api/complaints/generate. Non-blocking
  // — alert failure must never break the create flow.
  const disputeUrl = `https://paybacker.co.uk/dashboard/disputes?dispute=${dispute.id}`;
  sendNotification(admin, {
    userId: user.id,
    event: 'dispute_created',
    telegram: {
      text:
        `📝 *Dispute opened with ${facts.provider_name}*\n\n` +
        `${facts.issue_summary}\n\n` +
        `Follow it here: ${disputeUrl}\n\n` +
        `_The AI letter will arrive in this chat once it's drafted (~30s)._`,
    },
    whatsapp: {
      templateName: 'paybacker_dispute_created',
      templateParameters: [facts.provider_name, disputeUrl],
    },
    push: {
      title: 'Dispute opened',
      body: `Dispute against ${facts.provider_name} is live — letter on the way.`,
    },
  }).catch((e) =>
    console.error('[from-email] dispute_created alert failed:', e),
  );

  // 8. Generate the AI letter SYNCHRONOUSLY by calling the existing
  // /api/complaints/generate endpoint via internal fetch. We tried
  // deferring this via after() in 0ca55920 so the response returned
  // fast, but the deferred callback wasn't reliably completing on
  // Vercel — users landed on the dispute page with no ai_letter row
  // and the dispute agent banner stuck on "All caught up". Calling
  // it inline costs ~30-90s of modal spinner time but guarantees the
  // letter is in correspondence before the user navigates.
  //
  // The endpoint persists the letter to `correspondence`
  // (entry_type='ai_letter') when disputeId is supplied, creates a
  // task row, and fires complaint_letter_ready on completion. We pull
  // the letter text out of the JSON response so callers (and the
  // dispute page that opens next) can see what was drafted.
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';
  let draftLetter: string | null = null;
  let letterGenerated = false;
  try {
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
      letterGenerated = !!draftLetter;
    } else {
      // Non-fatal — dispute is already saved, user lands on the dispute
      // page, and they can click "Generate letter" from there to retry.
      // Logging the status code lets us spot recurring upstream issues
      // (rate-limit, plan cap, model-side errors) without taking the
      // whole flow down.
      const raw = await genRes.text().catch(() => '');
      console.error(`[from-email] /api/complaints/generate returned ${genRes.status}:`, raw.slice(0, 500));
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
    letterPending: !letterGenerated,
  });
}
