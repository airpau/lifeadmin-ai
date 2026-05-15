/**
 * Managed Agents Cron Endpoint
 *
 * Triggers Claude Managed Agent sessions on schedule.
 *
 * Usage:
 *   POST /api/cron/managed-agents                       — run ALL scheduled agents
 *   POST /api/cron/managed-agents?agent=builder         — run a specific agent by key
 *   POST /api/cron/managed-agents?agent=builder&task=X  — custom task
 *
 * Auth: Bearer CRON_SECRET (same as all other Vercel cron endpoints)
 *
 * Observability:
 *   - Every session create/task send writes a row to `agent_messages` (status='ok'
 *     or 'error'). The admin AI Team panel reads this to show "last fired" per agent.
 *   - Failures additionally write to `business_log` (category='alert',
 *     created_by='managed-agents-cron') so the digest cron surfaces them.
 *   - We do NOT cost-log Anthropic spend here because the platform.claude.com
 *     billing is per-session and not exposed via the create-session response.
 *     Use the platform billing dashboard for spend visibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  AGENTS,
  type AgentConfig,
  agentsDueAt,
  createSession,
  sendTaskMessage,
} from '@/lib/managed-agents/config';

export const maxDuration = 60;

type DispatchResult = {
  agent: string;
  sessionId?: string;
  status: 'ok' | 'error';
  error?: string;
};

function getAdmin() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

async function logAgentMessage(row: {
  agentKey: string;
  agentId?: string | null;
  sessionId?: string | null;
  eventType: 'session_created' | 'task_sent' | 'error';
  triggeredBy: string;
  status: 'ok' | 'error';
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const admin = getAdmin();
    const { error } = await admin.from('agent_messages').insert({
      agent_key: row.agentKey,
      agent_id: row.agentId ?? null,
      session_id: row.sessionId ?? null,
      event_type: row.eventType,
      triggered_by: row.triggeredBy,
      status: row.status,
      error: row.error ?? null,
      metadata: row.metadata ?? null,
    });
    if (error) {
      console.warn('[managed-agents] agent_messages insert failed:', error.message);
    }
  } catch (err: unknown) {
    console.warn(
      '[managed-agents] agent_messages insert threw:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function logFailureToBusinessLog(
  agentKey: string,
  errorMsg: string
): Promise<void> {
  try {
    const admin = getAdmin();
    const { error } = await admin.from('business_log').insert({
      category: 'alert',
      title: `Managed agent failed: ${agentKey}`,
      content: `The managed-agents cron failed to dispatch '${agentKey}'. Error: ${errorMsg}`,
      created_by: 'managed-agents-cron',
    });
    if (error) {
      console.warn('[managed-agents] business_log insert failed:', error.message);
    }
  } catch (err: unknown) {
    console.warn(
      '[managed-agents] business_log insert threw:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function dispatchAgent(
  key: string,
  config: AgentConfig,
  taskOverride: string | null,
  triggeredBy: string
): Promise<DispatchResult> {
  const startedAt = Date.now();
  try {
    const session = await createSession(config);
    await logAgentMessage({
      agentKey: key,
      agentId: config.id,
      sessionId: session.id,
      eventType: 'session_created',
      triggeredBy,
      status: 'ok',
      metadata: { name: config.name, schedule: config.schedule },
    });

    const taskMessage = taskOverride || config.taskPrompt;
    await sendTaskMessage(session.id, taskMessage);
    await logAgentMessage({
      agentKey: key,
      agentId: config.id,
      sessionId: session.id,
      eventType: 'task_sent',
      triggeredBy,
      status: 'ok',
      metadata: {
        name: config.name,
        custom_task: !!taskOverride,
        elapsed_ms: Date.now() - startedAt,
      },
    });

    return { agent: key, sessionId: session.id, status: 'ok' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logAgentMessage({
      agentKey: key,
      agentId: config.id,
      eventType: 'error',
      triggeredBy,
      status: 'error',
      error: errorMsg,
      metadata: { name: config.name, elapsed_ms: Date.now() - startedAt },
    });
    await logFailureToBusinessLog(key, errorMsg);
    return { agent: key, status: 'error', error: errorMsg };
  }
}

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

async function runDispatch(
  req: NextRequest,
  triggeredBy: string,
  forCron: boolean
): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const agentKey = searchParams.get('agent');
  const customTask = searchParams.get('task');

  let agentsToRun: Array<[string, AgentConfig]>;

  if (agentKey) {
    const config = AGENTS[agentKey];
    if (!config) {
      return NextResponse.json(
        {
          error: `Unknown agent: ${agentKey}. Valid keys: ${Object.keys(AGENTS).join(', ')}`,
        },
        { status: 400 }
      );
    }
    agentsToRun = [[agentKey, config]];
  } else if (forCron) {
    // Vercel cron: only fire agents whose cron expression matches NOW (UTC).
    const dueAgents = agentsDueAt(new Date());
    agentsToRun = dueAgents.map((config) => {
      const k = Object.entries(AGENTS).find(([, c]) => c === config)?.[0] ?? 'unknown';
      return [k, config] as [string, AgentConfig];
    });
  } else {
    // Manual POST without ?agent=: run every scheduled agent (operator override).
    agentsToRun = Object.entries(AGENTS).filter(([, c]) => c.schedule !== null);
  }

  const results = await Promise.all(
    agentsToRun.map(([k, c]) => dispatchAgent(k, c, customTask, triggeredBy))
  );

  const succeeded = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'error').length;

  return NextResponse.json({
    ok: failed === 0,
    triggered: results.length,
    succeeded,
    failed,
    results,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runDispatch(req, 'manual', false);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runDispatch(req, 'vercel-cron', true);
}
