import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Fetch all agents with their latest report
  const { data: agents, error } = await supabase
    .from('ai_executives')
    .select('*')
    .order('role');

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }

  // Fetch latest report for each agent
  const agentsWithReports = await Promise.all(
    (agents || []).map(async (agent) => {
      const { data: reports } = await supabase
        .from('executive_reports')
        .select('id, title, content, data, recommendations, status, created_at')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(1);

      return {
        ...agent,
        latest_report: reports?.[0] || null,
      };
    })
  );

  return NextResponse.json({ agents: agentsWithReports });
}
