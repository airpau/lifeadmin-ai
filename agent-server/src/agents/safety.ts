import { createClient } from '@supabase/supabase-js';
import type { HookCallback, HookCallbackMatcher } from '@anthropic-ai/claude-agent-sdk';
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

/**
 * Create safety hook matchers for an agent run.
 * Returns PreToolUse and PostToolUse hook matchers.
 */
export function createSafetyHooks(agentDef: AgentDefinition, runId: string): {
  preToolUse: HookCallbackMatcher[];
  postToolUse: HookCallbackMatcher[];
} {
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

  const preToolUseHook: HookCallback = async (input, _toolUseID, _options) => {
    const hookInput = input as any;
    const toolName: string = hookInput.tool_name || '';
    const toolInput: Record<string, any> = hookInput.tool_input || {};

    // Rate limit supabase calls
    if (toolName.includes('query_table') || toolName.includes('insert_row') ||
        toolName.includes('update_row') || toolName.includes('count_rows') ||
        toolName.includes('run_sql')) {
      supabaseCallCount++;
      if (supabaseCallCount > MAX_SUPABASE_CALLS) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny' as const,
            permissionDecisionReason: `Rate limit: max ${MAX_SUPABASE_CALLS} database calls per run.`,
          },
        };
      }
    }

    // Rate limit email calls
    if (toolName.includes('send_') && toolName.includes('email')) {
      emailCallCount++;
      if (emailCallCount > MAX_EMAIL_CALLS) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny' as const,
            permissionDecisionReason: `Rate limit: max ${MAX_EMAIL_CALLS} emails per run.`,
          },
        };
      }
    }

    // Block writes to protected tables
    if (toolName.includes('insert_row') || toolName.includes('update_row')) {
      const table = toolInput.table as string;
      if (table) {
        if (NEVER_WRITE_TABLES.includes(table)) {
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny' as const,
              permissionDecisionReason: `Table "${table}" is never writable by agents.`,
            },
          };
        }

        if (!allowedWriteTables.includes(table)) {
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny' as const,
              permissionDecisionReason: `Agent "${agentDef.role}" has no write access to "${table}".`,
            },
          };
        }
      }
    }

    // Block user emails if agent doesn't have permission
    if (toolName.includes('send_user_email') && !agentDef.canEmailUsers) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny' as const,
          permissionDecisionReason: `Agent "${agentDef.role}" cannot email users directly.`,
        },
      };
    }

    return {};
  };

  const postToolUseHook: HookCallback = async (input, _toolUseID, _options) => {
    const hookInput = input as any;
    // Audit log every tool call
    try {
      const sb = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
      await sb.from('agent_run_audit').insert({
        agent_role: agentDef.role,
        run_id: runId,
        tool_name: hookInput.tool_name || 'unknown',
        tool_input: hookInput.tool_input ? JSON.parse(JSON.stringify(hookInput.tool_input)) : null,
        tool_output_summary: typeof hookInput.tool_result === 'string'
          ? hookInput.tool_result.substring(0, 500)
          : JSON.stringify(hookInput.tool_result)?.substring(0, 500),
      });
    } catch {
      // Audit logging should never block agent execution
    }
    return {};
  };

  return {
    preToolUse: [{ hooks: [preToolUseHook] }],
    postToolUse: [{ hooks: [postToolUseHook] }],
  };
}
