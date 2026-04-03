import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { subscriptionId, issueType, issueSummary, desiredOutcome } = await request.json();
  const { data, error } = await supabase.rpc('create_dispute_from_subscription', {
    p_user_id: user.id,
    p_subscription_id: subscriptionId,
    p_issue_type: issueType || 'cancellation',
    p_issue_summary: issueSummary || null,
    p_desired_outcome: desiredOutcome || 'Cancel subscription and confirm no further charges',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
