/**
 * POST /api/disputes/from-email/preview
 *
 * Same AI extraction as the create endpoint, but doesn\'t persist
 * anything. The email picker calls this when the user selects a
 * thread so the next page can show "we read your email — here\'s
 * what we found" before they spend time typing context.
 *
 * Body: { connectionId, threadId }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fetchNewMessages } from '@/lib/dispute-sync/fetchers';
import type { EmailConnection } from '@/lib/dispute-sync/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_ISSUE_TYPES = new Set([
  'complaint', 'energy_dispute', 'broadband_complaint', 'flight_compensation',
  'parking_appeal', 'debt_dispute', 'refund_request', 'hmrc_tax_rebate',
  'council_tax_band', 'dvla_vehicle', 'nhs_complaint',
]);

const ISSUE_LABEL: Record<string, string> = {
  complaint: 'General complaint',
  energy_dispute: 'Energy bill dispute',
  broadband_complaint: 'Broadband / mobile complaint',
  flight_compensation: 'Flight delay / cancellation',
  parking_appeal: 'Parking ticket appeal',
  debt_dispute: 'Debt dispute',
  refund_request: 'Refund request',
  hmrc_tax_rebate: 'HMRC tax issue',
  council_tax_band: 'Council tax / business rates',
  dvla_vehicle: 'DVLA / vehicle',
  nhs_complaint: 'NHS complaint',
};

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { connectionId, threadId } = body as { connectionId?: string; threadId?: string };
  if (!connectionId || !threadId) {
    return NextResponse.json({ error: 'connectionId and threadId required' }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: conn } = await admin
    .from('email_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: 'Email connection not found' }, { status: 404 });

  let messages: Array<{ subject: string; fromAddress: string; fromName: string; receivedAt: Date; body: string; snippet: string }>;
  try {
    messages = await fetchNewMessages(conn as unknown as EmailConnection, threadId, null);
  } catch (err) {
    return NextResponse.json({ error: `Couldn\'t read the email: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 502 });
  }
  if (messages.length === 0) return NextResponse.json({ error: 'Thread is empty' }, { status: 400 });

  const threadText = messages
    .map((m) => `From: ${m.fromName || m.fromAddress}\nDate: ${m.receivedAt.toISOString()}\nSubject: ${m.subject}\n\n${m.body || m.snippet}`)
    .join('\n\n---\n\n');

  const prompt = `Extract structured facts from this email thread. Return JSON only.

EMAIL THREAD (most recent last):
${threadText.slice(0, 8000)}

Return JSON with these keys:
- "provider_name": company involved, clean (e.g. "ACI Worldwide", "Broxbourne Borough Council"). Never an email domain.
- "account_number": account / reference / ticket number from the email, or null.
- "disputed_amount": GBP amount in dispute as a positive number, or null.
- "issue_type": one of: complaint, energy_dispute, broadband_complaint, flight_compensation, parking_appeal, debt_dispute, refund_request, hmrc_tax_rebate, council_tax_band, dvla_vehicle, nhs_complaint.
- "issue_summary": ONE sentence (≤30 words) describing what they\'re claiming/asking.
- "thread_summary": 2-3 sentence summary of the email thread.
- "suggested_user_context": 1-2 sentences a user might write about why the company\'s position is wrong, given the email content. Phrase as IF they were the user (start with "I", "My", etc.). If you can\'t guess, return empty string.
- "suggested_outcome": 1 sentence describing what outcome the user probably wants (refund of £X, write off the debt, cancel the contract, reduce the bill, etc.). Start with a verb.

Output JSON only.`;

  let parsed: any;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0];
    const raw = text.type === 'text' ? text.text : '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returned no JSON');
    parsed = JSON.parse(match[0]);
  } catch (err) {
    return NextResponse.json({ error: `AI extraction failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }

  const issueType = ALLOWED_ISSUE_TYPES.has(parsed.issue_type) ? parsed.issue_type : 'complaint';
  return NextResponse.json({
    provider_name: String(parsed.provider_name ?? '').trim() || messages[0].fromName || 'Unknown company',
    account_number: parsed.account_number ? String(parsed.account_number) : null,
    disputed_amount: typeof parsed.disputed_amount === 'number' ? parsed.disputed_amount : null,
    issue_type: issueType,
    issue_type_label: ISSUE_LABEL[issueType] ?? issueType,
    issue_summary: String(parsed.issue_summary ?? '').trim(),
    thread_summary: String(parsed.thread_summary ?? '').trim(),
    suggested_user_context: String(parsed.suggested_user_context ?? '').trim(),
    suggested_outcome: String(parsed.suggested_outcome ?? '').trim(),
    sender_email: messages[0].fromAddress,
    sender_name: messages[0].fromName,
    subject: messages[0].subject,
    message_count: messages.length,
  });
}
