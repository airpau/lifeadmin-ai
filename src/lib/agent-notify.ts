import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Map of which agents care about which event types
const EVENT_SUBSCRIBERS: Record<string, string[]> = {
  // When a proposal is approved, notify the proposer + relevant agents
  proposal_approved: ['exec_assistant', 'cto'],
  // When a PR is created, notify CTO and the proposer
  pr_created: ['exec_assistant', 'cto'],
  // When a new user signs up, notify CGO, CRO, CAO
  new_signup: ['cgo', 'cro', 'cao', 'exec_assistant'],
  // When a support ticket is created, notify support team
  new_ticket: ['support_lead', 'support_agent', 'exec_assistant'],
  // When revenue changes (subscription), notify CFO
  subscription_change: ['cfo', 'exec_assistant'],
  // When founder gives instruction via Telegram, notify all execs
  founder_instruction: ['exec_assistant', 'cfo', 'cto', 'cao', 'cmo'],
  // When deals are clicked, notify CMO and Head of Ads
  deal_engagement: ['cmo', 'head_of_ads'],
  // When content is published, notify CMO and CCO
  content_published: ['cmo', 'cco', 'exec_assistant'],
  // When an agent completes a run, notify Charlie
  agent_run_complete: ['exec_assistant'],
};

/**
 * Notify relevant agents about a business event.
 * Creates tasks in agent_tasks so agents pick them up on their next run.
 * Also logs to business_log for persistent context.
 */
export async function notifyAgents(
  eventType: string,
  title: string,
  details: string,
  source: string = 'system',
  additionalAgents?: string[],
) {
  const supabase = getAdmin();
  const subscribers = [
    ...(EVENT_SUBSCRIBERS[eventType] || ['exec_assistant']),
    ...(additionalAgents || []),
  ];

  // Deduplicate
  const uniqueAgents = [...new Set(subscribers)];

  // Create tasks for each subscribed agent
  const tasks = uniqueAgents.map(agentRole => ({
    created_by: source,
    assigned_to: agentRole,
    title: `[${eventType}] ${title}`,
    description: details,
    priority: 'medium' as const,
    category: 'notification',
    status: 'pending' as const,
  }));

  if (tasks.length > 0) {
    await supabase.from('agent_tasks').insert(tasks);
  }

  // Also log to business_log
  await supabase.from('business_log').insert({
    category: eventType.includes('approved') ? 'decision' : 'progress',
    title,
    content: details,
    created_by: source,
  });
}

/**
 * Quick helper to notify about a founder instruction from Telegram
 */
export async function notifyFounderInstruction(instruction: string) {
  await notifyAgents(
    'founder_instruction',
    'Founder instruction via Telegram',
    instruction,
    'founder',
  );
}
