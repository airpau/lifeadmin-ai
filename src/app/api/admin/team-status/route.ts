import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface AgentDef {
  id: string;
  name: string;
  role: string;
  schedule: string;
  /** Minutes after last run before showing amber warning */
  warningMinutes: number;
  /** Minutes after last run before showing red missed */
  missedMinutes: number;
}

const PAPERCLIP_AGENTS: AgentDef[] = [
  {
    id: 'riley-support-agent',
    name: 'Support Agent (Riley)',
    role: 'Responds to support tickets automatically',
    schedule: 'Every 15 mins',
    warningMinutes: 20,
    missedMinutes: 35,
  },
  {
    id: 'heartbeat-monitor',
    name: 'Heartbeat Monitor',
    role: 'Watches all agents, alerts if anything fails',
    schedule: 'Every 30 mins',
    warningMinutes: 40,
    missedMinutes: 60,
  },
  {
    id: 'ceo-briefing',
    name: 'CEO Briefing',
    role: 'Compiles daily report for the founder',
    schedule: 'Daily 7:30am',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'dev-sprint-runner',
    name: 'Sprint Runner',
    role: 'Picks tasks, writes code, creates PRs',
    schedule: 'Daily 10am',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'paperclip-business-monitor',
    name: 'Business Monitor',
    role: 'Coordinates team, checks activity across the platform',
    schedule: '3x daily',
    warningMinutes: 9 * 60,
    missedMinutes: 12 * 60,
  },
  {
    id: 'social-media-agent',
    name: 'Social Media',
    role: 'Generates and posts branded content',
    schedule: 'Daily 9am',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'morning-briefing',
    name: 'Morning Briefing',
    role: 'Sends email briefing to founder each morning',
    schedule: 'Daily 8:30am',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'obsidian-ideas',
    name: 'Obsidian Ideas',
    role: 'Syncs ideas and notes to the task queue',
    schedule: 'Daily 9am',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'receipt-scanner',
    name: 'Receipt Scanner',
    role: 'Scans Gmail for receipts and tracks spending',
    schedule: 'Daily 8pm',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'upwork-scout',
    name: 'Upwork Scout',
    role: 'Finds and flags freelance opportunities',
    schedule: 'Daily 3am',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
];

type AgentStatus = 'healthy' | 'warning' | 'missed' | 'never';

function computeStatus(lastRunAt: string | null, agent: AgentDef): AgentStatus {
  if (!lastRunAt) return 'never';
  const minutesSince = (Date.now() - new Date(lastRunAt).getTime()) / 60000;
  if (minutesSince >= agent.missedMinutes) return 'missed';
  if (minutesSince >= agent.warningMinutes) return 'warning';
  return 'healthy';
}

function nextExpectedRun(lastRunAt: string | null, agent: AgentDef): string | null {
  if (!lastRunAt) return null;
  const last = new Date(lastRunAt);

  // For interval-based agents (Riley, Heartbeat)
  if (agent.schedule.startsWith('Every')) {
    return new Date(last.getTime() + agent.warningMinutes * 0.8 * 60 * 1000).toISOString();
  }

  // For 3x daily (every ~8 hours)
  if (agent.schedule === '3x daily') {
    return new Date(last.getTime() + 8 * 60 * 60 * 1000).toISOString();
  }

  // For daily agents, next occurrence is last run + 24h (approximation)
  return new Date(last.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const agentIds = PAPERCLIP_AGENTS.map(a => a.id);

  // Fetch last 10 entries per agent in one query
  const { data: logs, error } = await supabase
    .from('business_log')
    .select('id, category, title, content, created_by, created_at')
    .in('created_by', agentIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch business_log' }, { status: 500 });
  }

  // Group entries by created_by
  const grouped: Record<string, typeof logs> = {};
  for (const entry of logs || []) {
    if (!grouped[entry.created_by]) grouped[entry.created_by] = [];
    if (grouped[entry.created_by]!.length < 5) {
      grouped[entry.created_by]!.push(entry);
    }
  }

  const agents = PAPERCLIP_AGENTS.map(agent => {
    const entries = grouped[agent.id] || [];
    const latest = entries[0] || null;
    const lastRunAt = latest?.created_at || null;
    const status = computeStatus(lastRunAt, agent);

    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      schedule: agent.schedule,
      status,
      last_run: lastRunAt,
      next_run: nextExpectedRun(lastRunAt, agent),
      latest_summary: latest?.content || null,
      latest_title: latest?.title || null,
      recent_entries: entries,
    };
  });

  const healthy = agents.filter(a => a.status === 'healthy').length;
  const warning = agents.filter(a => a.status === 'warning').length;
  const missed = agents.filter(a => a.status === 'missed' || a.status === 'never').length;

  return NextResponse.json({
    agents,
    summary: { healthy, warning, missed, total: agents.length },
  });
}
