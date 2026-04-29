import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { resend, FROM_EMAIL } from '@/lib/resend';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

// GET — list proposals
export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('improvement_proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proposals: data || [] });
}

// POST — create a new proposal (called by agents or meeting)
export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { title, description, implementation, category, priority, estimated_impact, proposed_by, source_report_id, send_email } = body;

  if (!title || !description || !implementation || !category) {
    return NextResponse.json({ error: 'title, description, implementation, and category are required' }, { status: 400 });
  }

  const supabase = getAdmin();
  const approval_token = randomBytes(32).toString('hex');

  const { data: proposal, error } = await supabase
    .from('improvement_proposals')
    .insert({
      title,
      description,
      implementation,
      category: category || 'feature',
      priority: priority || 'medium',
      estimated_impact: estimated_impact || null,
      proposed_by: proposed_by || 'system',
      source_report_id: source_report_id || null,
      approval_token,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send approval email if requested
  if (send_email !== false && proposal) {
    const approveUrl = `${SITE_URL}/api/admin/proposals/approve?token=${approval_token}&action=approve`;
    const rejectUrl = `${SITE_URL}/api/admin/proposals/approve?token=${approval_token}&action=reject`;

    const priorityColor = priority === 'urgent' ? '#ef4444' : priority === 'high' ? '#f97316' : priority === 'medium' ? '#f59e0b' : '#94a3b8';
    const categoryLabel = category === 'config' || category === 'prompt' || category === 'schedule' || category === 'data'
      ? 'Auto-executable on approval'
      : 'Creates GitHub issue on approval';

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: 'hello@paybacker.co.uk',
        subject: `[Approve/Reject] ${title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
            <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px;">
              <h1 style="color: #f59e0b; font-size: 20px; margin: 0;">Improvement Proposal</h1>
              <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">From: ${proposed_by || 'AI Team'} · <span style="color: ${priorityColor};">${(priority || 'medium').toUpperCase()}</span> · ${category}</p>
            </div>

            <h2 style="color: #fff; font-size: 18px; margin: 0 0 12px;">${title}</h2>

            <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="color: #f59e0b; font-weight: bold; font-size: 12px; margin: 0 0 8px;">WHY</p>
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0;">${description}</p>
            </div>

            <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="color: #f59e0b; font-weight: bold; font-size: 12px; margin: 0 0 8px;">HOW</p>
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${implementation}</p>
            </div>

            ${estimated_impact ? `
            <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="color: #f59e0b; font-weight: bold; font-size: 12px; margin: 0 0 8px;">EXPECTED IMPACT</p>
              <p style="color: #94a3b8; font-size: 14px; margin: 0;">${estimated_impact}</p>
            </div>
            ` : ''}

            <p style="color: #64748b; font-size: 12px; margin: 16px 0 8px;">${categoryLabel}</p>

            <div style="margin: 24px 0; text-align: center;">
              <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: #fff; font-weight: bold; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin-right: 12px; font-size: 14px;">Approve</a>
              <a href="${rejectUrl}" style="display: inline-block; background: #ef4444; color: #fff; font-weight: bold; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 14px;">Reject</a>
            </div>

            <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
            <p style="color: #475569; font-size: 11px; margin: 0;">Paybacker AI · Improvement Proposals</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Failed to send proposal email:', emailErr);
    }
  }

  return NextResponse.json({ proposal }, { status: 201 });
}
