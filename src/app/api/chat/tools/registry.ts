export interface ChatTool {
  name: string;
  description: string;
  input_schema: Record<string, any>;
  handler: (args: any, userId: string) => Promise<any>;
}

import { subscriptionTools } from './subscriptions';
import { moneyHubTools } from './money-hub';
import { crossTabTools } from './cross-tab';

export function getAllTools(): ChatTool[] {
  return [...subscriptionTools, ...moneyHubTools, ...crossTabTools];
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
