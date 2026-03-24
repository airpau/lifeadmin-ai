import { supabaseTools, supabaseReadOnlyTools } from './supabase-tools';
import { emailTools, userEmailTools } from './email-tools';
import { memoryTools } from './memory-tools';
import { taskTools } from './task-tools';
import { reportTools } from './report-tools';
import { supportTools } from './support-tools';
import { contentTools } from './content-tools';
import { researchTools } from './research-tools';
import { stripeTools } from './stripe-tools';
import { googleAdsTools } from './google-ads-tools';
import { ToolGroup } from '../types';

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

// Tool group definitions
const toolGroupMap: Record<ToolGroup, ToolDef[]> = {
  supabase: supabaseReadOnlyTools,
  email: emailTools,
  stripe: stripeTools,
  support: supportTools,
  content: contentTools,
  research: researchTools,
  memory: memoryTools,
  tasks: taskTools,
  reports: reportTools,
  google_ads: googleAdsTools,
};

// Agents with write access get full supabase tools
const writeableSupabaseTools = supabaseTools;

/**
 * Collect all ToolDef objects an agent is permitted to use.
 */
export function getToolsForAgent(
  agentRole: string,
  toolGroups: ToolGroup[],
  options?: {
    supabaseWriteTables?: string[];
    canEmailUsers?: boolean;
  }
): ToolDef[] {
  const tools: ToolDef[] = [];

  for (const group of toolGroups) {
    if (group === 'supabase' && options?.supabaseWriteTables?.length) {
      tools.push(...writeableSupabaseTools);
    } else if (group === 'email' && options?.canEmailUsers) {
      tools.push(...userEmailTools);
    } else {
      tools.push(...(toolGroupMap[group] || []));
    }
  }

  return tools;
}

/**
 * Get the list of allowed tool names for an agent.
 */
export function getAllowedToolNames(
  agentRole: string,
  toolGroups: ToolGroup[],
  options?: {
    supabaseWriteTables?: string[];
    canEmailUsers?: boolean;
  }
): string[] {
  const tools = getToolsForAgent(agentRole, toolGroups, options);
  return tools.map(t => t.name);
}

export { supabaseTools, supabaseReadOnlyTools } from './supabase-tools';
export { emailTools, userEmailTools } from './email-tools';
export { memoryTools } from './memory-tools';
export { taskTools } from './task-tools';
export { reportTools } from './report-tools';
export { supportTools } from './support-tools';
export { contentTools } from './content-tools';
export { researchTools } from './research-tools';
export { stripeTools } from './stripe-tools';
export { googleAdsTools } from './google-ads-tools';
