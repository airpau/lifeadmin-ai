/**
 * Builder Proposal — Reject
 *
 * Founder clicks the Reject link from email/Telegram. Marks the proposal as
 * rejected. Builder will see the rejection on its next run and can either
 * re-propose with a different approach, or surface the issue for manual
 * handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function htmlPage(title: string, body: string, color = '#0B1220'): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:24px;color:${color};line-height:1.55;}
.box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;}</style></head>
<body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html' } }
  );
}

async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = (searchParams.get('token') || '').trim();
  const reason = (searchParams.get('reason') || '').slice(0, 500);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return htmlPage('Invalid token', `<div class="box"><h2>❌ Invalid token</h2></div>`);
  }
  const supabase = getAdmin();
  const { data: updated, error } = await supabase
    .from('builder_proposals')
    .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason || 'rejected via URL' })
    .eq('approval_token', token)
    .eq('status', 'pending_review')
    .select('id, summary, ticket_number')
    .single();
  if (error || !updated) {
    return htmlPage('Already actioned', `<div class="box"><h2>ℹ️ Already actioned</h2><p>This proposal token is no longer pending — it was already approved, rejected, or expired.</p></div>`);
  }

  // Audit row so Builder sees the rejection on next run.
  await supabase.from('business_log').insert({
    category: 'agent_governance',
    title: `Builder proposal rejected — ${updated.summary.slice(0, 100)}`,
    content: `Founder rejected proposal ${updated.id}${updated.ticket_number ? ` (ticket ${updated.ticket_number})` : ''}. Reason: ${reason || '(none provided)'}`,
    created_by: 'builder-reject',
  });

  return htmlPage(
    'Rejected',
    `<div class="box">
      <h2>❌ Rejected</h2>
      <p>Proposal: <strong>${updated.summary}</strong></p>
      <p>Builder will see this rejection on its next pickup cycle and can either re-propose with a different approach or surface the issue for manual handling.</p>
    </div>`,
    '#dc2626'
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
