import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { subscriptionId, issueType, issueSummary, desiredOutcome } = body || {};
    if (!subscriptionId || typeof subscriptionId !== 'string') {
      return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('create_dispute_from_subscription', {
      p_user_id: user.id,
      p_subscription_id: subscriptionId,
      p_issue_type: issueType || 'cancellation',
      p_issue_summary: issueSummary || null,
      p_desired_outcome: desiredOutcome || 'Cancel subscription and confirm no further charges',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('create-dispute error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
