/**
 * Per-lead admin actions.
 *
 *   GET    /api/admin/consumer-leads/:id              — drill-in view incl. email log
 *   PATCH  /api/admin/consumer-leads/:id              — { notes, funnel_stage }
 *   POST   /api/admin/consumer-leads/:id/action       — { action: 'mark_converted_paid' | 'mark_unsubscribed' | 'fresh_discount' | 'manual_handling' | 'send_manual_email', subject?, body? }
 *
 * Founder-gated via authorizeAdminOrCron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { createOneOffDiscountCoupon } from '@/lib/stripe/coupons';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const supabase = getAdmin();

  const [{ data: lead }, { data: log }] = await Promise.all([
    supabase.from('consumer_leads').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('consumer_lead_email_log')
      .select('*')
      .eq('consumer_lead_id', id)
      .order('sent_at', { ascending: false }),
  ]);
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ lead, email_log: log ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const supabase = getAdmin();
  const body = (await req.json().catch(() => ({}))) as { notes?: string; funnel_stage?: string };

  const updates: Record<string, unknown> = {};
  if (typeof body.notes === 'string') updates.notes = body.notes;
  if (typeof body.funnel_stage === 'string') updates.funnel_stage = body.funnel_stage;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('consumer_leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const supabase = getAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    subject?: string;
    body_html?: string;
    body_text?: string;
  };

  const { data: lead } = await supabase.from('consumer_leads').select('*').eq('id', id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  switch (body.action) {
    case 'mark_converted_paid': {
      await supabase
        .from('consumer_leads')
        .update({ funnel_stage: 'converted_paid', converted_at: new Date().toISOString() })
        .eq('id', id);
      return NextResponse.json({ ok: true });
    }
    case 'mark_unsubscribed': {
      await supabase
        .from('consumer_leads')
        .update({ funnel_stage: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('id', id);
      return NextResponse.json({ ok: true });
    }
    case 'manual_handling': {
      await supabase.from('consumer_leads').update({ funnel_stage: 'manual_handling' }).eq('id', id);
      return NextResponse.json({ ok: true });
    }
    case 'fresh_discount': {
      const created = await createOneOffDiscountCoupon(lead.email, 10, 7);
      await supabase
        .from('consumer_leads')
        .update({
          discount_code: created.promo_code,
          discount_coupon_id: created.coupon_id,
          discount_code_expires_at: created.expires_at.toISOString(),
        })
        .eq('id', id);
      return NextResponse.json({ ok: true, promo_code: created.promo_code, expires_at: created.expires_at });
    }
    case 'send_manual_email': {
      const subject = body.subject || 'A quick note from Paybacker';
      const html = body.body_html || `<p>${(body.body_text || '').replace(/\n/g, '<br/>')}</p>`;
      const text = body.body_text || '';
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: lead.email,
        replyTo: REPLY_TO,
        subject,
        html,
        text,
      });
      const messageId = (result as { data?: { id?: string } }).data?.id;
      await supabase.from('consumer_lead_email_log').insert({
        consumer_lead_id: id,
        template: 'manual_followup',
        subject,
        resend_message_id: messageId ?? null,
        metadata: { sent_by: auth.userId ?? 'cron' },
      });
      await supabase
        .from('consumer_leads')
        .update({
          last_emailed_at: new Date().toISOString(),
          email_count: lead.email_count + 1,
          last_contacted_via: 'email',
        })
        .eq('id', id);
      return NextResponse.json({ ok: true, message_id: messageId });
    }
    default:
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  }
}
