/**
 * POST /api/for-business-waitlist
 *
 * Receives a B2B waitlist submission from /for-business and:
 *   1. Validates + dedupes by work_email
 *   2. Inserts into b2b_waitlist
 *   3. Sends a confirmation email to the submitter via Resend
 *   4. Pings the founder Telegram admin chat with the lead
 *
 * Validation lives at both layers — client-side for UX, server-side
 * for trust. The DB CHECK constraint catches the use_case length and
 * expected_volume enum if either layer slips.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const VALID_VOLUME = new Set(['<1k', '1k-10k', '10k-100k', '100k+']);

interface SubmissionBody {
  name?: string;
  work_email?: string;
  company?: string;
  role?: string;
  expected_volume?: string;
  use_case?: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
}

function validate(body: SubmissionBody): { ok: true } | { ok: false; error: string } {
  if (!body.name || body.name.trim().length < 2) return { ok: false, error: 'Name is required' };
  if (!body.work_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.work_email))
    return { ok: false, error: 'A work email address is required' };
  if (!body.company || body.company.trim().length < 2) return { ok: false, error: 'Company is required' };
  if (!body.expected_volume || !VALID_VOLUME.has(body.expected_volume))
    return { ok: false, error: 'Pick an expected monthly volume' };
  if (!body.use_case || body.use_case.trim().length < 20)
    return { ok: false, error: 'Tell us a bit about your use case (20+ characters)' };
  return { ok: true };
}

async function sendConfirmation(submitter: { name: string; email: string; company: string }) {
  if (!process.env.RESEND_API_KEY) return; // local dev / preview without secrets
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: auto; color: #0f172a;">
      <p>Hi ${escapeHtml(submitter.name)},</p>
      <p>Thanks for putting <strong>${escapeHtml(submitter.company)}</strong> on the Paybacker for Business waitlist.</p>
      <p>
        We review every submission personally. If your use case looks like a fit, we&rsquo;ll reach out within
        five working days with a design-partner offer. If we&rsquo;re not the right fit yet, we&rsquo;ll tell you
        directly so you don&rsquo;t sit waiting.
      </p>
      <p>
        While you&rsquo;re here — reply to this email with the two or three statutes you most need cited
        correctly inside your product. That single sentence helps us prioritise the index and the example
        scenarios we ship at launch.
      </p>
      <p style="color: #64748b; font-size: 13px;">— Paybacker for Business</p>
    </div>
  `;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: submitter.email,
      subject: 'You\'re on the Paybacker for Business waitlist',
      html,
    });
  } catch (e: any) {
    console.error('[for-business-waitlist] confirmation email failed', e?.message);
  }
}

async function notifyFounder(s: { name: string; work_email: string; company: string; role: string | null; expected_volume: string; use_case: string }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;
  const text = [
    '🛠 *New B2B waitlist signup*',
    '',
    `*${s.name}* @ *${s.company}*${s.role ? ` (${s.role})` : ''}`,
    `${s.work_email}`,
    `Volume: ${s.expected_volume}`,
    '',
    `_${s.use_case.slice(0, 600)}_`,
    '',
    'Review at paybacker.co.uk/dashboard/admin/b2b',
  ].join('\n');
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
  } catch (e: any) {
    console.error('[for-business-waitlist] telegram notify failed', e?.message);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(request: NextRequest) {
  let body: SubmissionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const supabase = getAdmin();
  const work_email = body.work_email!.trim().toLowerCase();

  // Dedupe by email — second submission shouldn't 500, just say
  // "you're already on the list".
  const { data: existing } = await supabase
    .from('b2b_waitlist')
    .select('id')
    .eq('work_email', work_email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, alreadyOnList: true }, { status: 200 });
  }

  const { error: insertErr } = await supabase.from('b2b_waitlist').insert({
    name: body.name!.trim(),
    work_email,
    company: body.company!.trim(),
    role: body.role?.trim() || null,
    expected_volume: body.expected_volume,
    use_case: body.use_case!.trim(),
    referrer: body.referrer || null,
    utm_source: body.utm_source || null,
    utm_medium: body.utm_medium || null,
    utm_campaign: body.utm_campaign || null,
  });

  if (insertErr) {
    console.error('[for-business-waitlist] insert failed', insertErr.message);
    return NextResponse.json({ error: 'Could not save submission' }, { status: 500 });
  }

  // Fire-and-forget side effects. We don't fail the response if either
  // notification fails — the row is the source of truth.
  await Promise.all([
    sendConfirmation({ name: body.name!.trim(), email: work_email, company: body.company!.trim() }),
    notifyFounder({
      name: body.name!.trim(),
      work_email,
      company: body.company!.trim(),
      role: body.role?.trim() || null,
      expected_volume: body.expected_volume!,
      use_case: body.use_case!.trim(),
    }),
  ]);

  return NextResponse.json({ ok: true }, { status: 201 });
}
