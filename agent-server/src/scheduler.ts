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
// Minimum intervals - agents ONLY run when this interval has passed AND they have work.
// Target: ~$3-5/day (~$90-150/month)
const MIN_INTERVALS: Record<string, number> = {
  // SUPPORT - responsive to tickets
  support_agent: 60 * 60 * 1000,       // Riley: every hour
  support_lead: 2 * 60 * 60 * 1000,   // Sam: every 2 hours

  // COORDINATOR
  exec_assistant: 8 * 60 * 60 * 1000, // Charlie: every 8 hours (3x daily)

  // CORE EXECUTIVES - 1x daily
  cfo: 24 * 60 * 60 * 1000,           // Alex: daily
  cto: 24 * 60 * 60 * 1000,           // Morgan: daily
  cao: 24 * 60 * 60 * 1000,           // Jamie: daily
  cmo: 24 * 60 * 60 * 1000,           // Taylor: daily

  // SPECIALISTS - 1x daily
  head_of_ads: 24 * 60 * 60 * 1000,   // Jordan: daily
  cco: 24 * 60 * 60 * 1000,           // Casey: daily
  cgo: 24 * 60 * 60 * 1000,           // Drew: daily
  cro: 24 * 60 * 60 * 1000,           // Pippa: daily
  cxo: 48 * 60 * 60 * 1000,           // Bella: every 2 days
  cfraudo: 48 * 60 * 60 * 1000,       // Finn: every 2 days

  // RESEARCH - infrequent
  clo: 7 * 24 * 60 * 60 * 1000,       // Leo: weekly
  cio: 14 * 24 * 60 * 60 * 1000,      // Nico: fortnightly
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
  const startTime = Date.now();
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
      const interval = MIN_INTERVALS[role] || 24 * 60 * 60 * 1000;
      const timeSinceLastRun = Date.now() - lastRun;

      // Only run if interval has passed
      if (timeSinceLastRun < interval) continue;

      // For first run after server start, stagger agents over 30 minutes
      const isFirstRun = lastRun === 0;
      if (isFirstRun) {
        const allRoles = Object.keys(agentRegistry);
        const myIndex = allRoles.indexOf(role);
        const staggerDelay = myIndex * 2 * 60 * 1000; // 2 mins apart
        if (Date.now() - startTime < staggerDelay) continue;
      }

      console.log(`[Loop] Running ${agentDef.name} (interval elapsed)`);
      executeAgent(role);
      await sleep(5000); // 5s between launches to avoid rate limits
    }

    // 4. Sleep 5 minutes between cycles (not 1 minute)
    await sleep(5 * 60 * 1000);
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
