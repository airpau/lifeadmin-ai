import { agentRegistry } from './agents/registry';
import { runAgent } from './agents/run-agent';
import { checkOverdueGoals } from './learning/goals';
import { cleanupExpiredMemories } from './learning/self-eval';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Track running agents to prevent overlapping runs
const runningAgents = new Set<string>();

// Queue for agents that need to run immediately (triggered by other agents)
const urgentQueue = new Set<string>();

// Track last run time per agent to enforce minimum intervals
const lastRunTimes: Record<string, number> = {};

// Minimum interval between runs (milliseconds) - prevents burning API credits
// Minimum intervals prevent burning API credits when there's no new work.
// Agents still run IMMEDIATELY when triggered by another agent's task.
// All agents use Haiku except Charlie (Sonnet).
// Estimated daily cost: ~$8-12/day (~$250-350/month)
const MIN_INTERVALS: Record<string, number> = {
  // SUPPORT - responsive
  support_agent: 15 * 60 * 1000,     // Riley: every 15 mins (Haiku ~$0.10/run, ~$3/day with skips)
  support_lead: 30 * 60 * 1000,      // Sam: every 30 mins (Haiku ~$0.10/run, ~$1.50/day)

  // COORDINATOR - frequent
  exec_assistant: 4 * 60 * 60 * 1000,// Charlie: every 4 hours (Sonnet ~$0.40/run, ~$2.40/day)

  // CORE EXECUTIVES - 4x daily
  cfo: 6 * 60 * 60 * 1000,           // Alex: every 6 hours (Haiku ~$0.15/run, ~$0.60/day)
  cto: 6 * 60 * 60 * 1000,           // Morgan: every 6 hours (~$0.60/day)
  cao: 6 * 60 * 60 * 1000,           // Jamie: every 6 hours (~$0.60/day)
  cmo: 6 * 60 * 60 * 1000,           // Taylor: every 6 hours (~$0.60/day)

  // SPECIALISTS - 2x daily
  head_of_ads: 12 * 60 * 60 * 1000,  // Jordan: every 12 hours (~$0.30/day)
  cco: 12 * 60 * 60 * 1000,          // Casey: every 12 hours (~$0.30/day)
  cgo: 12 * 60 * 60 * 1000,          // Drew: every 12 hours (~$0.30/day)
  cro: 6 * 60 * 60 * 1000,           // Pippa: every 6 hours (~$0.60/day)
  cxo: 12 * 60 * 60 * 1000,          // Bella: every 12 hours (~$0.30/day)
  cfraudo: 12 * 60 * 60 * 1000,      // Finn: every 12 hours (~$0.20/day)

  // RESEARCH - 1x daily
  clo: 24 * 60 * 60 * 1000,          // Leo: daily (~$0.15/day)
  cio: 48 * 60 * 60 * 1000,          // Nico: every 2 days (~$0.08/day)
};

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Check if an agent has pending work (new tasks, unprocessed feedback, etc.)
 * If they do, they should run even if their minimum interval hasn't elapsed
 */
async function hasPendingWork(role: string): Promise<boolean> {
  const sb = getSupabase();

  const [tasks, feedback] = await Promise.all([
    sb.from('agent_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', role)
      .in('status', ['pending', 'in_progress']),
    sb.from('agent_feedback_events')
      .select('id', { count: 'exact', head: true })
      .eq('agent_role', role)
      .eq('processed', false),
  ]);

  return (tasks.count || 0) > 0 || (feedback.count || 0) > 0;
}

/**
 * Check if any agent has created a task for another agent since the last check
 */
async function checkForNewTasks(): Promise<string[]> {
  const sb = getSupabase();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data } = await sb.from('agent_tasks')
    .select('assigned_to')
    .eq('status', 'pending')
    .gte('created_at', fiveMinutesAgo);

  const roles = new Set<string>();
  for (const t of data || []) {
    if (!runningAgents.has(t.assigned_to)) {
      roles.add(t.assigned_to);
    }
  }
  return Array.from(roles);
}

async function executeAgent(role: string) {
  if (!config.AGENTS_ENABLED) return;
  if (runningAgents.has(role)) return;

  runningAgents.add(role);
  try {
    const result = await runAgent(role);
    lastRunTimes[role] = Date.now();
    if (result.success) {
      console.log(`[Loop] ${role} completed. Cost: $${result.cost?.toFixed(4) || '0'}`);
    } else {
      console.error(`[Loop] ${role} failed: ${result.error}`);
    }
  } catch (err: any) {
    console.error(`[Loop] ${role} threw error:`, err.message);
  } finally {
    runningAgents.delete(role);
    urgentQueue.delete(role);
  }
}

/**
 * Trigger an agent to run as soon as possible (called when another agent creates a task for it)
 */
export function triggerAgentNow(role: string) {
  if (agentRegistry[role] && !runningAgents.has(role)) {
    urgentQueue.add(role);
    console.log(`[Loop] ${role} queued for immediate run (triggered by another agent)`);
  }
}

/**
 * Main continuous loop - runs forever, cycling through agents
 */
async function mainLoop() {
  console.log('[Loop] Starting continuous agent loop...');

  while (true) {
    if (!config.AGENTS_ENABLED) {
      await sleep(30000);
      continue;
    }

    // 1. Run any agents in the urgent queue first (triggered by other agents)
    for (const role of Array.from(urgentQueue)) {
      if (!runningAgents.has(role)) {
        console.log(`[Loop] Running ${role} (urgent - triggered by task)`);
        await executeAgent(role);
      }
    }

    // 2. Check for new inter-agent tasks
    const agentsWithNewTasks = await checkForNewTasks();
    for (const role of agentsWithNewTasks) {
      if (!runningAgents.has(role)) {
        console.log(`[Loop] Running ${role} (new task assigned)`);
        await executeAgent(role);
      }
    }

    // 3. Run agents whose minimum interval has elapsed
    for (const [role, agentDef] of Object.entries(agentRegistry)) {
      if (runningAgents.has(role)) continue;

      const lastRun = lastRunTimes[role] || 0;
      const interval = MIN_INTERVALS[role] || 60 * 60 * 1000;
      const timeSinceLastRun = Date.now() - lastRun;

      if (timeSinceLastRun >= interval) {
        // Check if there's actually something to do (avoid wasting API credits)
        const hasWork = await hasPendingWork(role);
        const isFirstRun = lastRun === 0;
        const isOverdue = timeSinceLastRun >= interval * 1.5;

        if (hasWork || isFirstRun || isOverdue) {
          console.log(`[Loop] Running ${agentDef.name} (${hasWork ? 'pending work' : isFirstRun ? 'first run' : 'scheduled'})`);
          // Run without awaiting so multiple agents can run in parallel
          executeAgent(role);
          // Small delay between launching agents to avoid API rate limits
          await sleep(2000);
        }
      }
    }

    // 4. Short sleep before next cycle
    await sleep(60000); // Check every minute
  }
}

/**
 * Maintenance loop - runs hourly tasks
 */
async function maintenanceLoop() {
  while (true) {
    await sleep(60 * 60 * 1000); // Every hour
    try {
      console.log('[Maintenance] Checking overdue goals...');
      await checkOverdueGoals();
    } catch (err: any) {
      console.error('[Maintenance] Goals check failed:', err.message);
    }
  }
}

/**
 * Daily cleanup loop
 */
async function cleanupLoop() {
  while (true) {
    await sleep(24 * 60 * 60 * 1000); // Every 24 hours
    try {
      console.log('[Maintenance] Cleaning expired memories...');
      await cleanupExpiredMemories();
    } catch (err: any) {
      console.error('[Maintenance] Cleanup failed:', err.message);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Start the continuous agent system
 */
export function startScheduler() {
  console.log('[Loop] Initialising continuous agent system...');
  console.log(`[Loop] ${Object.keys(agentRegistry).length} agents registered`);

  for (const [role, agent] of Object.entries(agentRegistry)) {
    const interval = MIN_INTERVALS[role] || 60 * 60 * 1000;
    console.log(`  ${agent.name.padEnd(35)} min interval: ${Math.round(interval / 60000)}m`);
  }

  // Start all loops
  mainLoop().catch(err => console.error('[Loop] Main loop crashed:', err));
  maintenanceLoop().catch(err => console.error('[Maintenance] Crashed:', err));
  cleanupLoop().catch(err => console.error('[Cleanup] Crashed:', err));

  console.log('[Loop] Agents are running continuously. They will trigger each other when needed.');
}

/**
 * Manually trigger an agent run (for API endpoint)
 */
export async function triggerAgent(role: string): Promise<{ success: boolean; error?: string; cost?: number }> {
  if (!agentRegistry[role]) {
    return { success: false, error: `Unknown agent: ${role}` };
  }
  if (runningAgents.has(role)) {
    return { success: false, error: `Agent ${role} is already running.` };
  }
  return runAgent(role);
}

/**
 * Get status of all agents
 */
export function getAgentStatuses(): Array<{
  role: string;
  name: string;
  running: boolean;
  lastRun: string | null;
  minInterval: string;
  queued: boolean;
}> {
  return Object.values(agentRegistry).map(a => ({
    role: a.role,
    name: a.name,
    running: runningAgents.has(a.role),
    lastRun: lastRunTimes[a.role] ? new Date(lastRunTimes[a.role]).toISOString() : null,
    minInterval: `${Math.round((MIN_INTERVALS[a.role] || 3600000) / 60000)}m`,
    queued: urgentQueue.has(a.role),
  }));
}
