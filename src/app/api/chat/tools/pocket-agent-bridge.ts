/**
 * Pocket-Agent → Chatbot bridge.
 *
 * The on-site /api/chat chatbot was built first with its own
 * 27-tool registry. The WhatsApp + Telegram Pocket Agents were
 * rebuilt later via src/lib/telegram/tools.ts with a much richer
 * 64-tool surface. The two diverged — Paul flagged the gap on
 * 2026-04-29 and the right answer is single-source-of-truth: the
 * chatbot inherits every Pocket Agent tool automatically.
 *
 * This bridge imports `telegramTools` and emits ChatTool entries
 * whose handler routes through `executeToolCall` with the
 * 'chatbot' channel arg. Any new Pocket Agent tool now lights up
 * across all three surfaces (Telegram, WhatsApp, on-site chatbot)
 * with no extra wiring.
 */

import { telegramTools } from '@/lib/telegram/tools';
import { executeToolCall } from '@/lib/telegram/tool-handlers';
import type { ChatTool } from './registry';

export const pocketAgentBridgedTools: ChatTool[] = telegramTools.map((tool) => ({
  name: tool.name,
  description: tool.description ?? '',
  // The Pocket Agent tools use `as const` on enum + `as const` on
  // the property keys — the on-site chat infrastructure expects
  // plain JSON-Schema-shaped Record<string, any>, so cast through.
  input_schema: tool.input_schema as unknown as Record<string, unknown>,
  handler: async (args: unknown, userId: string) => {
    const result = await executeToolCall(
      tool.name,
      (args as Record<string, unknown>) ?? {},
      userId,
      'chatbot',
    );
    return { text: result.text };
  },
}));
