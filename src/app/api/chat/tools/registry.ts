export interface ChatTool {
  name: string;
  description: string;
  input_schema: Record<string, any>;
  handler: (args: any, userId: string) => Promise<any>;
}

import { subscriptionTools } from './subscriptions';
import { moneyHubTools } from './money-hub';
import { crossTabTools } from './cross-tab';
import { disputeTools } from './disputes';
import { pocketAgentBridgedTools } from './pocket-agent-bridge';

/**
 * Tool layering — last entry wins on name collision.
 *
 * 1. pocketAgentBridgedTools — the canonical 64+ Pocket Agent tools,
 *    auto-imported via src/lib/telegram/tools.ts. Adding a new tool
 *    on the Pocket Agent now lights it up here automatically.
 * 2. Chatbot-specific overrides — older bespoke tools where the
 *    schema or handler genuinely differs from the Pocket Agent
 *    version (e.g. find_deals' enum, manage_challenges' compound
 *    action, generate_complaint_with_context). These come AFTER
 *    the bridge so they override on collision.
 * 3. disputeTools — the 4 already-bridged dispute tools, kept
 *    explicitly so the existing wiring path doesn't break.
 *
 * The dedupe at the end ensures no name appears twice (later
 * entries override earlier).
 */
export function getAllTools(): ChatTool[] {
  const all = [
    ...pocketAgentBridgedTools,
    ...subscriptionTools,
    ...moneyHubTools,
    ...crossTabTools,
    ...disputeTools,
  ];
  const byName = new Map<string, ChatTool>();
  for (const t of all) byName.set(t.name, t);
  return Array.from(byName.values());
}

export function getToolDefinitions(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, any>;
}> {
  return getAllTools().map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

export async function executeTool(
  toolName: string,
  args: any,
  userId: string
): Promise<any> {
  const tool = getAllTools().find((t) => t.name === toolName);
  if (!tool) {
    return { error: `Unknown tool: ${toolName}` };
  }
  return tool.handler(args, userId);
}
