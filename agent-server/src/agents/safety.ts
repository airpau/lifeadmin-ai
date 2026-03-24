import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { AgentDefinition } from '../types';

// Tables that are NEVER writable by any agent
const NEVER_WRITE_TABLES = [
  'auth.users',
  'stripe_events',
  'encryption_keys',
];

// Tables each agent can write to (in addition to agent system tables)
const AGENT_SYSTEM_WRITE_TABLES = [
  'executive_reports',
  'agent_action_items',
  'agent_memory',
  'agent_goals',
  'agent_predictions',
  'agent_feedback_events',
  'agent_tasks',
  'improvement_proposals',
  'agent_run_audit',
];

export interface SafetyDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Pre-tool-use safety check. Returns whether the tool call should be allowed.
 */
export function createSafetyChecker(agentDef: AgentDefinition, runId: string) {
  const allowedWriteTables = [
    ...AGENT_SYSTEM_WRITE_TABLES,
    ...(agentDef.supabaseWriteTables || []),
    ...(agentDef.toolGroups.includes('support') ? ['support_tickets', 'ticket_messages'] : []),
    ...(agentDef.toolGroups.includes('content') ? ['content_drafts'] : []),
  ];

  let supabaseCallCount = 0;
  let emailCallCount = 0;
  const MAX_SUPABASE_CALLS = 30;
  const MAX_EMAIL_CALLS = 5;

  async function checkPreToolUse(toolName: string, toolInput: Record<string, any>): Promise<SafetyDecision> {
    // Rate limit supabase calls
    if (toolName.includes('query_table') || toolName.includes('insert_row') ||
        toolName.includes('update_row') || toolName.includes('count_rows') ||
        toolName.includes('run_sql')) {
      supabaseCallCount++;
      if (supabaseCallCount > MAX_SUPABASE_CALLS) {
        return { allowed: false, reason: `Rate limit: max ${MAX_SUPABASE_CALLS} database calls per run.` };
      }
    }

    // Rate limit email calls
    if (toolName.includes('send_') && toolName.includes('email')) {
      emailCallCount++;
      if (emailCallCount > MAX_EMAIL_CALLS) {
        return { allowed: false, reason: `Rate limit: max ${MAX_EMAIL_CALLS} emails per run.` };
      }
    }

    // Block writes to protected tables
    if (toolName.includes('insert_row') || toolName.includes('update_row')) {
      const table = toolInput.table as string;
      if (table) {
        if (NEVER_WRITE_TABLES.includes(table)) {
          return { allowed: false, reason: `Table "${table}" is never writable by agents.` };
        }

        if (!allowedWriteTables.includes(table)) {
          return { allowed: false, reason: `Agent "${agentDef.role}" has no write access to "${table}".` };
        }
      }
    }

    // Block user emails if agent doesn't have permission
    if (toolName.includes('send_user_email') && !agentDef.canEmailUsers) {
      return { allowed: false, reason: `Agent "${agentDef.role}" cannot email users directly.` };
    }

    return { allowed: true };
  }

  async function auditToolCall(toolName: string, toolInput: any, toolOutput: string): Promise<void> {
    try {
      const sb = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
      await sb.from('agent_run_audit').insert({
        agent_role: agentDef.role,
        run_id: runId,
        tool_name: toolName,
        tool_input: toolInput ? JSON.parse(JSON.stringify(toolInput)) : null,
        tool_output_summary: toolOutput?.substring(0, 500) || null,
      });
    } catch {
      // Audit logging should never block agent execution
    }
  }

  return { checkPreToolUse, auditToolCall };
}
