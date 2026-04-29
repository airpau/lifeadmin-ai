/**
 * Managed Agents Cron Endpoint
 *
 * Triggers Claude Managed Agent sessions on schedule.
 *
 * Usage:
 *   POST /api/cron/managed-agents                — run ALL scheduled agents
 *   POST /api/cron/managed-agents?agent=builder   — run a specific agent by key
 *   POST /api/cron/managed-agents?agent=builder&task=Fix the login bug  — custom task
 *
 * Auth: Bearer CRON_SECRET (same as all other Vercel cron endpoints)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  AGENTS,
  type AgentConfig,
  createSession,
  sendTaskMessage,
} from '@/lib/managed-agents/config';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const agentKey = searchParams.get('agent');
  const customTask = searchParams.get('task');

  // Determine which agents to run
  let agentsToRun: Array<[string, AgentConfig]>;

  if (agentKey) {
    // Run a specific agent
    const config = AGENTS[agentKey];
    if (!config) {
      return NextResponse.json(
        { error: `Unknown agent: ${agentKey}. Valid keys: ${Object.keys(AGENTS).join(', ')}` },
        { status: 400 }
      );
    }
    agentsToRun = [[agentKey, config]];
  } else {
    // Run all agents that have schedules (Vercel cron calls this)
    agentsToRun = Object.entries(AGENTS).filter(([, config]) => config.schedule !== null);
  }

  const results: Array<{
    agent: string;
    sessionId?: string;
    status?: string;
    error?: string;
  }> = [];

  // Create sessions in parallel (API allows 60/min)
  const promises = agentsToRun.map(async ([key, config]) => {
    try {
      const session = await createSession(config);
      const taskMessage = customTask || config.taskPrompt;
      await sendTaskMessage(session.id, taskMessage);

      results.push({
        agent: key,
        sessionId: session.id,
        status: 'started',
      });
    } catch (err) {
      results.push({
        agent: key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await Promise.all(promises);

  const succeeded = results.filter((r) => !r.error).length;
  const failed = results.filter((r) => r.error).length;

  return NextResponse.json({
    ok: failed === 0,
    triggered: results.length,
    succeeded,
    failed,
    results,
    timestamp: new Date().toISOString(),
  });
}

// GET handler for Vercel cron (Vercel cron sends GET requests)
export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Determine which agent to run from the URL path or query
  const { searchParams } = new URL(req.url);
  const agentKey = searchParams.get('agent');

  if (agentKey) {
    // Run a specific agent
    const config = AGENTS[agentKey];
    if (!config) {
      return NextResponse.json(
        { error: `Unknown agent: ${agentKey}` },
        { status: 400 }
      );
    }

    try {
      const session = await createSession(config);
      await sendTaskMessage(session.id, config.taskPrompt);

      return NextResponse.json({
        ok: true,
        agent: agentKey,
        sessionId: session.id,
        status: 'started',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          agent: agentKey,
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }
  }

  // No specific agent — run all scheduled agents
  const agentsToRun = Object.entries(AGENTS).filter(([, config]) => config.schedule !== null);
  const results: Array<{
    agent: string;
    sessionId?: string;
    error?: string;
  }> = [];

  const promises = agentsToRun.map(async ([key, config]) => {
    try {
      const session = await createSession(config);
      await sendTaskMessage(session.id, config.taskPrompt);
      results.push({ agent: key, sessionId: session.id });
    } catch (err) {
      results.push({
        agent: key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await Promise.all(promises);

  return NextResponse.json({
    ok: results.every((r) => !r.error),
    triggered: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
