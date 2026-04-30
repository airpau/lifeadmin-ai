import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

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

// Roster of agents whose business_log activity feeds the admin team-status dashboard.
// Updated 2026-04-25: removed dead paperclip-business-monitor and dev-sprint-runner;
// added the 10 Claude Managed Agents now running with memory.
const MONITORED_AGENTS: AgentDef[] = [
  // --- Active production worker ---
  {
    id: 'riley-support-agent',
    name: 'Support Agent (Riley)',
    role: 'Responds to support tickets automatically',
    schedule: 'Every 15 mins',
    warningMinutes: 20,
    missedMinutes: 35,
  },

  // --- Claude Managed Agents (with native memory) ---
  {
    id: 'alert-tester',
    name: 'Alert Tester',
    role: 'Monitors MCP server health and error logs',
    schedule: 'Every 6 hours',
    warningMinutes: 7 * 60,
    missedMinutes: 9 * 60,
  },
  {
    id: 'digest-compiler',
    name: 'Digest Compiler',
    role: 'Synthesises agent activity into the founder digest',
    schedule: '4x daily (07/12/17/20 UTC)',
    warningMinutes: 7 * 60,
    missedMinutes: 9 * 60,
  },
  {
    id: 'support-triager',
    name: 'Support Triager',
    role: 'Triages tickets by severity, queues priorities',
    schedule: 'Every 6 hours',
    warningMinutes: 7 * 60,
    missedMinutes: 9 * 60,
  },
  {
    id: 'email-marketer',
    name: 'Email Marketer',
    role: 'Drafts lifecycle emails for founder approval',
    schedule: 'Daily 8am UTC',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'ux-auditor',
    name: 'UX Auditor',
    role: 'Surfaces friction patterns from tickets + funnel',
    schedule: 'Daily 9am UTC',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'feature-tester',
    name: 'Feature Tester',
    role: 'Verifies critical user flows and compliance',
    schedule: 'Daily 10am UTC',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'finance-analyst',
    name: 'Finance Analyst',
    role: 'Tracks MRR, churn, tier mix, Stripe webhook health',
    schedule: 'Daily 11am UTC',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
  },
  {
    id: 'bug-triager',
    name: 'Bug Triager',
    role: 'Categorises issues + recommends fixes',
    schedule: 'Every 12 hours',
    warningMinutes: 14 * 60,
    missedMinutes: 16 * 60,
  },
  {
    id: 'reviewer',
    name: 'PR Reviewer',
    role: 'Checks open PRs against CLAUDE.md rules',
    schedule: 'Every 12 hours',
    warningMinutes: 14 * 60,
    missedMinutes: 16 * 60,
  },
  {
    id: 'builder',
    name: 'Builder',
    role: 'On-demand: picks dev task, drafts PR for founder review',
    schedule: 'On-demand only',
    // On-demand agents never raise alerts based on idle time.
    warningMinutes: 365 * 24 * 60,
    missedMinutes: 365 * 24 * 60,
  },

  // --- Other infrastructure crons that write to business_log ---
  {
    id: 'ceo-briefing',
    name: 'CEO Briefing',
    role: 'Compiles daily report for the founder',
    schedule: 'Daily 7:30am',
    warningMinutes: 26 * 60,
    missedMinutes: 32 * 60,
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
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();

  // Fetch per-agent to avoid high-frequency agents consuming the global limit
  const perAgentResults = await Promise.all(
    MONITORED_AGENTS.map(agent =>
      supabase
        .from('business_log')
        .select('id, category, title, content, created_by, created_at')
        .eq('created_by', agent.id)
        .order('created_at', { ascending: false })
        .limit(10)
    )
  );

  const hasError = perAgentResults.some(r => r.error);
  if (hasError) {
    return NextResponse.json({ error: 'Failed to fetch business_log' }, { status: 500 });
  }

  const grouped: Record<string, NonNullable<(typeof perAgentResults)[number]['data']>> = {};
  for (let i = 0; i < MONITORED_AGENTS.length; i++) {
    grouped[MONITORED_AGENTS[i].id] = perAgentResults[i].data || [];
  }

  const agents = MONITORED_AGENTS.map(agent => {
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
