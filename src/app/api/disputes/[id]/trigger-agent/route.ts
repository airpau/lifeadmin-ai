import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runDisputeAgentForDispute } from '@/lib/dispute-agent/run-agent';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cronSecret = process.env.CRON_SECRET;
  const isServiceRole = !!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`;

  let userId: string | null = null;

  if (!isServiceRole) {
    // The RLS-scoped user client is used ONLY for auth + verifying the
    // dispute belongs to the caller. All dispute_agent_decisions and
    // disputes writes happen inside runDisputeAgentForDispute via the
    // service-role admin client, so RLS can never silently block them.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
    }
    userId = user.id;

    const { data: owned } = await supabase
      .from('disputes')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ ok: false, error: 'Dispute not found' }, { status: 404 });
    }
  }

  const result = await runDisputeAgentForDispute(id, userId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, decision: result.decision });
}
