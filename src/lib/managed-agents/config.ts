/**
 * Claude Managed Agents — Configuration & API Helpers
 *
 * All 9 agents on platform.claude.com with their IDs, schedules, and task prompts.
 * Used by the /api/cron/managed-agents endpoint to create sessions.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.anthropic.com/v1';
const BETA_HEADER = 'managed-agents-2026-04-01';
const API_VERSION = '2023-06-01';

// Shared infrastructure IDs
export const ENVIRONMENT_ID = 'env_01ABgB5TPX6twhTW3ENz9nbL';
export const VAULT_IDS = ['vlt_011CZwFDK98rFsmB5jp9JdjN'];

// ---------------------------------------------------------------------------
// Agent Registry
// ---------------------------------------------------------------------------

export interface AgentConfig {
  id: string;
  name: string;
  /** Cron expression (UTC). null = on-demand only */
  schedule: string | null;
  /** The initial task message sent when the session starts */
  taskPrompt: string;
}

export const AGENTS: Record<string, AgentConfig> = {
  'alert-tester': {
    id: 'agent_011CZw4nzW8NDuqXLu4Ywmet',
    name: 'Alert Tester',
    schedule: '0 */6 * * *', // every 6 hours
    taskPrompt:
      'Run your scheduled alert monitoring check. Read /CLAUDE.md first, then check the Paybacker MCP server health, review recent error logs, and report any issues. Log your findings via the MCP write_context tool.',
  },
  'digest-compiler': {
    id: 'agent_011CZw4gBduH7cS1PqGD6XZH',
    name: 'Digest Compiler',
    schedule: '0 7,12,17,20 * * *', // 7am, 12pm, 5pm, 8pm UTC
    taskPrompt:
      'Run your scheduled digest compilation. Read /CLAUDE.md first, then read all shared context files via MCP, check recent agent reports in the business_log, compile a summary of activity, decisions, and pending tasks. Write the digest to the handoff-notes via MCP.',
  },
  'support-triager': {
    id: 'agent_011CZw4ZHwE6ikLkk3yu2aJ1',
    name: 'Support Triager',
    schedule: '0 */6 * * *', // every 6 hours
    taskPrompt:
      'Run your scheduled support triage. Read /CLAUDE.md first, then check for new support tickets, categorise them by severity and type, assign priorities, and update the task queue via MCP. Escalate critical issues immediately.',
  },
  'email-marketer': {
    id: 'agent_011CZw4SqDibRow9aJsjF1Sx',
    name: 'Email Marketer',
    schedule: '0 8 * * *', // daily 8am UTC
    taskPrompt:
      'Run your scheduled email marketing check. Read /CLAUDE.md first, then review user engagement data, identify opportunities for lifecycle emails, check email campaign performance, and log recommendations via MCP.',
  },
  'ux-auditor': {
    id: 'agent_011CZw4L9qCxfsFp4yWe3BfR',
    name: 'UX Auditor',
    schedule: '0 9 * * *', // daily 9am UTC
    taskPrompt:
      'Run your scheduled UX audit. Read /CLAUDE.md first, then analyse recent support tickets for UX patterns, review user feedback, identify usability issues, and write a UX report via MCP. Flag any critical UX problems.',
  },
  'feature-tester': {
    id: 'agent_011CZw4DpeNicjV7wWDLQ8Fz',
    name: 'Feature Tester',
    schedule: '0 10 * * *', // daily 10am UTC
    taskPrompt:
      'Run your scheduled feature testing. Read /CLAUDE.md first, then check the MCP server health, verify key API endpoints are responding, test critical user flows, and report test results via MCP.',
  },
  'bug-triager': {
    id: 'agent_011CZw46PZ4nvYmgynHJtnGF',
    name: 'Bug Triager',
    schedule: '0 */12 * * *', // twice daily
    taskPrompt:
      'Run your scheduled bug triage. Read /CLAUDE.md first, then check for new GitHub issues and error logs, categorise bugs by severity and component, recommend fixes, and update the task queue via MCP.',
  },
  'reviewer': {
    id: 'agent_011CZw3yRD5e4tuRNCCajHXy',
    name: 'Reviewer',
    schedule: '0 */12 * * *', // twice daily
    taskPrompt:
      'Run your scheduled PR review check. Read /CLAUDE.md first, then check for open pull requests that need review, verify they comply with CLAUDE.md rules (no DROP TABLE, additive migrations only, no existing agent modifications), and log your findings via MCP.',
  },
  'builder': {
    id: 'agent_011CZtGoggET6auW3EKPdp2M',
    name: 'Builder',
    schedule: null, // on-demand only — triggered by task queue
    taskPrompt:
      'Check the task queue for pending development tasks. Read /CLAUDE.md first, then pick up the highest-priority task, implement it following all CLAUDE.md rules, create a PR, and update the task queue via MCP.',
  },
};

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_AGENTS_API_KEY or ANTHROPIC_API_KEY');
  return key;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    'anthropic-version': API_VERSION,
    'anthropic-beta': BETA_HEADER,
  };
}

/** Create a new managed agent session */
export async function createSession(agent: AgentConfig, title?: string) {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      agent: agent.id,
      environment_id: ENVIRONMENT_ID,
      vault_ids: VAULT_IDS,
      title: title || `${agent.name} — ${new Date().toISOString().slice(0, 16)}`,
      metadata: {
        triggered_by: 'vercel-cron',
        agent_name: agent.name,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create session for ${agent.name}: ${res.status} ${body}`);
  }

  return res.json() as Promise<{ id: string; status: string }>;
}

/** Send the initial task message to a session */
export async function sendTaskMessage(sessionId: string, message: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: message }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to send message to session ${sessionId}: ${res.status} ${body}`);
  }

  return res.json();
}

/** Get the status of a session */
export async function getSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'GET',
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get session ${sessionId}: ${res.status} ${body}`);
  }

  return res.json() as Promise<{ id: string; status: string; usage: unknown; stats: unknown }>;
}

/** List recent sessions for an agent */
export async function listSessions(agentId: string, limit = 5) {
  const params = new URLSearchParams({
    agent_id: agentId,
    limit: String(limit),
    order: 'desc',
  });

  const res = await fetch(`${API_BASE}/sessions?${params}`, {
    method: 'GET',
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list sessions: ${res.status} ${body}`);
  }

  return res.json() as Promise<{ data: Array<{ id: string; status: string; created_at: string }> }>;
}
