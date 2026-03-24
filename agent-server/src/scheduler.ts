import cron from 'node-cron';
import { agentRegistry } from './agents/registry';
import { runAgent } from './agents/run-agent';
import { checkOverdueGoals } from './learning/goals';
import { cleanupExpiredMemories } from './learning/self-eval';
import { config } from './config';

// Track running agents to prevent overlapping runs
const runningAgents = new Set<string>();

async function executeAgent(role: string) {
  if (!config.AGENTS_ENABLED) {
    console.log(`[Scheduler] Agents disabled. Skipping ${role}.`);
    return;
  }

  if (runningAgents.has(role)) {
    console.log(`[Scheduler] ${role} is already running. Skipping.`);
    return;
  }

  runningAgents.add(role);
  try {
    const result = await runAgent(role);
    if (result.success) {
      console.log(`[Scheduler] ${role} completed successfully. Cost: $${result.cost?.toFixed(4) || '0'}`);
    } else {
      console.error(`[Scheduler] ${role} failed: ${result.error}`);
    }
  } catch (err: any) {
    console.error(`[Scheduler] ${role} threw error:`, err.message);
  } finally {
    runningAgents.delete(role);
  }
}

/**
 * Initialize all agent schedules and maintenance tasks.
 */
export function startScheduler() {
  console.log('[Scheduler] Starting agent scheduler...');

  // Register each agent's schedule
  for (const [role, agentDef] of Object.entries(agentRegistry)) {
    if (!cron.validate(agentDef.schedule)) {
      console.error(`[Scheduler] Invalid cron expression for ${role}: ${agentDef.schedule}`);
      continue;
    }

    cron.schedule(agentDef.schedule, () => {
      console.log(`[Scheduler] Triggering ${agentDef.name} (${agentDef.schedule})`);
      executeAgent(role);
    }, {
      timezone: 'Europe/London',
    });

    console.log(`[Scheduler] Registered: ${agentDef.name} -> ${agentDef.schedule}`);
  }

  // Maintenance tasks
  // Check overdue goals every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Maintenance] Checking overdue goals...');
    await checkOverdueGoals();
  }, { timezone: 'Europe/London' });

  // Clean up expired memories daily at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[Maintenance] Cleaning expired memories...');
    await cleanupExpiredMemories();
  }, { timezone: 'Europe/London' });

  console.log(`[Scheduler] ${Object.keys(agentRegistry).length} agents registered. Maintenance tasks scheduled.`);
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
 * Get status of all agents (for API endpoint)
 */
export function getAgentStatuses(): Array<{
  role: string;
  name: string;
  schedule: string;
  model: string;
  running: boolean;
}> {
  return Object.values(agentRegistry).map(a => ({
    role: a.role,
    name: a.name,
    schedule: a.schedule,
    model: a.model,
    running: runningAgents.has(a.role),
  }));
}
