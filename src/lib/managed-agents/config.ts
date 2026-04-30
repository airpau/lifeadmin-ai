/**
 * Claude Managed Agents — Configuration & API Helpers
 *
 * All 9 agents on platform.claude.com with their IDs, schedules, task prompts, and the
 * memory stores attached to each session. Used by /api/cron/managed-agents.
 *
 * Memory stores are provisioned by `scripts/bootstrap-managed-agents-memory.ts`. The
 * resulting store ids are written to `memory-stores.json` (next to this file). Re-run the
 * bootstrap script when you want to re-seed core knowledge.
 */

import storeIdsFile from './memory-stores.json';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.anthropic.com/v1';
const BETA_HEADER = 'managed-agents-2026-04-01';
const API_VERSION = '2023-06-01';

// Shared infrastructure IDs
export const ENVIRONMENT_ID = 'env_01ABgB5TPX6twhTW3ENz9nbL';
export const VAULT_IDS = ['vlt_011CZwFDK98rFsmB5jp9JdjN'];

// Memory store ids loaded from bootstrap output. If the file hasn't been generated yet
// (fresh checkout pre-bootstrap) the registry is empty — sessions still create, just
// without memory until the bootstrap script runs.
const STORE_IDS: Record<string, string> = (storeIdsFile as { stores?: Record<string, string> })
  .stores ?? {};

const SHARED_CORE_INSTRUCTIONS =
  'Paybacker shared operating knowledge — product, pricing, architecture, deployment safety, agent roster, operating principles. Read this BEFORE any other action. If anything in your per-role memory contradicts this store, this store wins. Read-only.';

const PER_ROLE_INSTRUCTIONS =
  'Your per-role memory. Recall prior findings before analysing. Persist only durable learnings (memory_type: learning | decision); status snapshots belong in business_log, not memory. Stamp new files with the date. Max 100 KB per file.';

// ---------------------------------------------------------------------------
// Agent Registry
// ---------------------------------------------------------------------------

export interface AgentConfig {
  id: string;
  name: string;
  /** Cron expression (UTC). null = on-demand only */
  schedule: string | null;
  /** Memory-store key in STORE_IDS for this agent's per-role memory */
  memoryKey: string;
  /** The initial task message sent when the session starts */
  taskPrompt: string;
}

const TASK_FOOTER = `

## Operating posture (mandatory)
- You are an OBSERVE-AND-RECOMMEND agent. You DO NOT execute production changes.
- Before doing anything, read the \`paybacker_core\` shared memory store and your per-role memory store.
- After analysing, on EVERY session call the paybacker MCP \`append_business_log\` tool with one row summarising your run. Use category \`clean\` if nothing notable, \`finding\` for patterns, \`recommendation\` for proposed actions, \`alert/warn/critical\` for degraded/broken systems. The digest cron at 07:00/12:30/19:00 UTC reads this table and surfaces escalated rows to the founder via Telegram.
- Optionally also append narrative context to the markdown file \`business-ops.md\` via \`append_context\` for human-readable history; the structured \`business_log\` row is the one that drives the digest.
- Persist a per-role memory file ONLY for durable learnings (a pattern, a rule, a correlation). Status snapshots and dated incident reports belong in business_log, not memory.
- Use \`post_to_telegram_admin\` ONLY when the founder needs to decide something BEFORE the next digest cycle, or when severity is critical (production user-facing breakage, security exposure, time-sensitive decision). If unsure: do not ping. The digest will surface it.
- Never modify \`complaint_writer\` or \`riley-support-agent\`. Never re-enable a decommissioned legacy agent.

End your session with a one-line summary of what you wrote where.`;

export const AGENTS: Record<string, AgentConfig> = {
  'alert-tester': {
    id: 'agent_011CZw4nzW8NDuqXLu4Ywmet',
    name: 'Alert Tester',
    schedule: '0 */6 * * *',
    memoryKey: 'alert-tester',
    taskPrompt:
      `Run your scheduled alert monitoring check. Verify Paybacker MCP server health, scan the last 6 hours of business_log for severity warn/critical, look for spikes in agent_runs errors (especially complaint_writer), confirm Riley fired in the last 30 minutes, check for Stripe webhook failures, and watch the Meta token expiry. Ping Telegram only for criticals (complaint_writer broken, Riley silent >2h, Stripe 500s, secret leak, Meta token <48h to expiry).${TASK_FOOTER}`,
  },
  'digest-compiler': {
    id: 'agent_011CZw4gBduH7cS1PqGD6XZH',
    name: 'Digest Compiler',
    schedule: '0 7,12,17,20 * * *',
    memoryKey: 'digest-compiler',
    taskPrompt:
      `Run your scheduled digest compilation. Read the last business_log entries (limit 50) via paybacker MCP, plus active-sessions.md, handoff-notes.md, task-queue.md. Pull last-24h MRR/active-user/support-volume signals from Supabase. Update the relevant section of handoff-notes.md with a terse digest in the format defined in your role memory (Pulse / Findings / Needs founder decision / Tomorrow's schedule for the 07:00 run only). Do not send Telegram yourself — the agent-digest cron reads handoff-notes.md and posts.${TASK_FOOTER}`,
  },
  'support-triager': {
    id: 'agent_011CZw4ZHwE6ikLkk3yu2aJ1',
    name: 'Support Triager',
    schedule: '0 */6 * * *',
    memoryKey: 'support-triager',
    taskPrompt:
      `Run your scheduled support triage. Pull open tickets and Riley's last 6h of activity. Categorise tickets (bug/billing/banking/email-scan/dispute_help/account_access/data_concern/other), flag tickets without a Riley response after 30 minutes, identify clusters (≥3 tickets on same theme in 24h), and update task-queue.md with priorities (🔴/🟡/🟢). Ping Telegram immediately for any ticket containing GDPR/DPO/ICO/data-breach language (legal exposure) and for clusters affecting paying tiers.${TASK_FOOTER}`,
  },
  'email-marketer': {
    id: 'agent_011CZw4SqDibRow9aJsjF1Sx',
    name: 'Email Marketer',
    schedule: '0 8 * * *',
    memoryKey: 'email-marketer',
    taskPrompt:
      `Run your scheduled email marketing review. Check Resend webhook engagement (open/click) for the last 24h, PostHog funnel (signup → bank-connect → first-letter), the renewal-reminder queue (30/14/7 days), and any new waitlist signups. Draft up to 3 lifecycle emails per session into the content_drafts (or email_drafts) staging table with status='pending' — DO NOT SEND. If unapproved drafts exceed 5, ping Telegram severity 'notice' once and stop drafting. Brand rules from paybacker_core/02-pricing.md and your role memory apply absolutely.${TASK_FOOTER}`,
  },
  'ux-auditor': {
    id: 'agent_011CZw4L9qCxfsFp4yWe3BfR',
    name: 'UX Auditor',
    schedule: '0 9 * * *',
    memoryKey: 'ux-auditor',
    taskPrompt:
      `Run your scheduled UX audit. Pull last-24h support tickets categorised by support-triager, NPS responses with feedback, PostHog funnel drop-offs, Money Hub feature usage by Pro users, and onboarded_at population for new signups. Identify top 3 friction points ranked by user count, with hypothesis + proposed test/fix + confidence. Append a UX Audit section to handoff-notes.md and write to business_log. Ping Telegram for critical regressions (signup broken on mobile, conversion drop >30% week-on-week).${TASK_FOOTER}`,
  },
  'feature-tester': {
    id: 'agent_011CZw4DpeNicjV7wWDLQ8Fz',
    name: 'Feature Tester',
    schedule: '0 10 * * *',
    memoryKey: 'feature-tester',
    taskPrompt:
      `Run your scheduled feature test sweep. Verify the 7 critical flows (signup→onboarded_at, TrueLayer connect, Gmail/Outlook connect, complaint letter generation with UK legislation citations, Stripe upgrade path, renewal reminder dispatch, Watchdog dispute polling). Mark each ✅/⚠️/🔴 with evidence pointers (table+row id). For 🔴 entries write business_log severity warn (or critical if paying-tier flow). Compliance check: any complaint letter generated in the last 24h missing a UK legislation citation = critical ping.${TASK_FOOTER}`,
  },
  'finance-analyst': {
    // Registered on platform.claude.com 2026-04-25.
    id: 'agent_011CaQXPwBoYxEWBN8F6sJ31',
    name: 'Finance Analyst',
    schedule: '0 11 * * *',
    memoryKey: 'finance-analyst',
    taskPrompt:
      `Run your scheduled finance health-check. Call the paybacker MCP get_finance_snapshot tool first — it returns user counts by tier, MRR/ARR, signups, active/converted/expired trials, plan downgrade events, expiring subscriptions, and upcoming payments. Compare against your memorised MRR baseline. Flag: tier-mix imbalances, MRR moves > ±5%, trial conversion rate drops, Stripe webhook failures, revenue-concentration risk, contract-end exposure. NEVER move money — observe and recommend only. Critical pings: Stripe webhook failing, MRR drop > 10% DoD, lost a Pro user > 5% of MRR.${TASK_FOOTER}`,
  },
  'bug-triager': {
    id: 'agent_011CZw46PZ4nvYmgynHJtnGF',
    name: 'Bug Triager',
    schedule: '0 */12 * * *',
    memoryKey: 'bug-triager',
    taskPrompt:
      `Run your scheduled bug triage. Pull new GitHub issues (last 12h), Vercel error log dominant signatures, last-12h agent_runs with status=error (especially complaint_writer), and business_log entries from alert-tester / feature-tester. Categorise by component+severity+cause-hypothesis+proposed-fix+risk-of-fix+requires-migration. Append to task-queue.md under '## Bug queue' with highest severity at top. Ping Telegram for criticals (complaint_writer broken, Stripe webhook failing, auth regression, broken main branch).${TASK_FOOTER}`,
  },
  'reviewer': {
    id: 'agent_011CZw3yRD5e4tuRNCCajHXy',
    name: 'Reviewer',
    schedule: '0 */12 * * *',
    memoryKey: 'reviewer',
    taskPrompt:
      `Run your scheduled PR review check. List open PRs and verify each against the checklist in your role memory: typecheck green, no DROP/ALTER-DROP, CREATE TABLE IF NOT EXISTS, no banned integrations (OpenAI image / Stability / Mixpanel / GA / Meta direct / etc.), no client-side API keys, complaint_writer + riley-support-agent untouched, RLS preserved, no localStorage in artifacts, getEffectiveTier source-of-truth preserved. Output ✅/⚠️/🔴 to task-queue.md per PR. Critical-rule violation = immediate Telegram ping.${TASK_FOOTER}`,
  },
  'builder': {
    id: 'agent_011CZtGoggET6auW3EKPdp2M',
    name: 'Builder',
    schedule: null,
    memoryKey: 'builder',
    taskPrompt:
      `On-demand build run. Read the triggering task carefully — if under-specified, write a clarifying question to task-queue.md and STOP, do not guess. Otherwise: branch via git worktree, implement with strict TS, additive migrations only, no banned integrations, no modifications to complaint_writer or riley-support-agent. Run npx tsc --noEmit (must be clean), run any existing tests, open a PR with gh pr create including risk assessment and Co-Authored-By: Claude. Telegram ping severity 'info' with the PR url so the founder can review. NEVER push to main, NEVER auto-merge.${TASK_FOOTER}`,
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

interface SessionResource {
  type: 'memory_store';
  memory_store_id: string;
  access: 'read_only' | 'read_write';
  instructions?: string;
}

function buildResources(agent: AgentConfig): SessionResource[] {
  const resources: SessionResource[] = [];

  const coreId = STORE_IDS['paybacker_core'];
  if (coreId) {
    resources.push({
      type: 'memory_store',
      memory_store_id: coreId,
      access: 'read_only',
      instructions: SHARED_CORE_INSTRUCTIONS,
    });
  }

  const roleId = STORE_IDS[agent.memoryKey];
  if (roleId) {
    resources.push({
      type: 'memory_store',
      memory_store_id: roleId,
      access: 'read_write',
      instructions: PER_ROLE_INSTRUCTIONS,
    });
  }

  return resources;
}

/** Create a new managed agent session (now with memory stores attached) */
export async function createSession(agent: AgentConfig, title?: string) {
  const body: Record<string, unknown> = {
    agent: agent.id,
    environment_id: ENVIRONMENT_ID,
    vault_ids: VAULT_IDS,
    title: title || `${agent.name} — ${new Date().toISOString().slice(0, 16)}`,
    metadata: {
      triggered_by: 'vercel-cron',
      agent_name: agent.name,
    },
  };

  const resources = buildResources(agent);
  if (resources.length > 0) {
    body.resources = resources;
  }

  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session for ${agent.name}: ${res.status} ${text}`);
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
    const text = await res.text();
    throw new Error(`Failed to send message to session ${sessionId}: ${res.status} ${text}`);
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
    const text = await res.text();
    throw new Error(`Failed to get session ${sessionId}: ${res.status} ${text}`);
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
    const text = await res.text();
    throw new Error(`Failed to list sessions: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    data: Array<{ id: string; status: string; created_at: string }>;
  }>;
}

/** Helper for the cron route: figure out which agents should fire on a given UTC minute */
export function agentsDueAt(date: Date): AgentConfig[] {
  // Lazy cron-match: simple field comparison for `m h dom mon dow` (no ranges, no /).
  // Our schedules use only literals, lists, and `*/N`, which we handle below.
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();

  const due: AgentConfig[] = [];
  for (const agent of Object.values(AGENTS)) {
    if (!agent.schedule) continue;
    if (cronMatches(agent.schedule, { minute, hour })) due.push(agent);
  }
  return due;
}

function cronMatches(
  expr: string,
  now: { minute: number; hour: number },
): boolean {
  // Simplified matcher: only checks minute + hour fields (we don't use dom/mon/dow yet).
  const [m, h] = expr.split(/\s+/);
  return matchField(m, now.minute, 0, 59) && matchField(h, now.hour, 0, 23);
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (!Number.isFinite(step) || step <= 0) return false;
    return (value - min) % step === 0;
  }
  for (const part of field.split(',')) {
    if (parseInt(part, 10) === value) return true;
  }
  return false;
}
