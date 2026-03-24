import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { supabaseTools, supabaseReadOnlyTools } from './supabase-tools';
import { emailTools, userEmailTools } from './email-tools';
import { memoryTools } from './memory-tools';
import { taskTools } from './task-tools';
import { reportTools } from './report-tools';
import { supportTools } from './support-tools';
import { contentTools } from './content-tools';
import { researchTools } from './research-tools';
import { stripeTools } from './stripe-tools';
import { ToolGroup } from '../types';

// Tool group definitions
const toolGroupMap: Record<ToolGroup, any[]> = {
  supabase: supabaseReadOnlyTools,
  email: emailTools,
  stripe: stripeTools,
  support: supportTools,
  content: contentTools,
  research: researchTools,
  memory: memoryTools,
  tasks: taskTools,
  reports: reportTools,
};

// Agents with write access get full supabase tools
const writeableSupabaseTools = supabaseTools;

/**
 * Build an MCP server with only the tools an agent is permitted to use.
 */
export function buildToolServer(
  agentRole: string,
  toolGroups: ToolGroup[],
  options?: {
    supabaseWriteTables?: string[];
    canEmailUsers?: boolean;
  }
) {
  const tools: any[] = [];

  for (const group of toolGroups) {
    if (group === 'supabase' && options?.supabaseWriteTables?.length) {
      tools.push(...writeableSupabaseTools);
    } else if (group === 'email' && options?.canEmailUsers) {
      tools.push(...userEmailTools);
    } else {
      tools.push(...(toolGroupMap[group] || []));
    }
  }

  return createSdkMcpServer({
    name: `paybacker-${agentRole}`,
    version: '1.0.0',
    tools,
  });
}

/**
 * Get the list of allowed tool names for an agent (for SDK allowedTools config)
 */
export function getAllowedToolNames(
  agentRole: string,
  toolGroups: ToolGroup[],
  options?: {
    supabaseWriteTables?: string[];
    canEmailUsers?: boolean;
  }
): string[] {
  const serverName = `paybacker-${agentRole}`;
  const tools: any[] = [];

  for (const group of toolGroups) {
    if (group === 'supabase' && options?.supabaseWriteTables?.length) {
      tools.push(...writeableSupabaseTools);
    } else if (group === 'email' && options?.canEmailUsers) {
      tools.push(...userEmailTools);
    } else {
      tools.push(...(toolGroupMap[group] || []));
    }
  }

  return tools.map(t => `mcp__${serverName}__${t.name || t._name}`);
}
