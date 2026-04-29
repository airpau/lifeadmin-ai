/**
 * Dispute tools for the on-site chatbot — feature parity with the
 * WhatsApp / Telegram Pocket Agent. Wraps the canonical handlers
 * in src/lib/telegram/tool-handlers.ts via executeToolCall so the
 * dispute selection logic, plan-limit checks, and watchdog sync
 * stay in one place.
 *
 * Added 2026-04-29 — Paul asked the on-site chatbot to expose the
 * same status-query and link-an-email flows the WhatsApp bot has.
 */

import { ChatTool } from './registry';
import { executeToolCall } from '@/lib/telegram/tool-handlers';

const getDisputesTool: ChatTool = {
  name: 'get_disputes',
  description:
    "List the user's disputes (open, awaiting response, escalated, resolved). Use when the user asks 'what disputes do I have', 'show me my open complaints', 'how's my OneStream case'. Surfaces opened date AND last-activity date explicitly so don't conflate them.",
  input_schema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'resolved', 'all'],
        description: "Optional filter — 'open' for active cases, 'resolved' for closed, omit for all.",
      },
    },
    required: [],
  },
  handler: async (args: { status?: string }, userId: string) => {
    const result = await executeToolCall('get_disputes', { status: args.status }, userId, 'chatbot');
    return { text: result.text };
  },
};

const getDisputeDetailTool: ChatTool = {
  name: 'get_dispute_detail',
  description:
    "Get the full detail of a specific dispute including all correspondence (letters sent, supplier replies). Prefers the active dispute when multiple match a provider name; if multiple actives match, returns a disambiguation list. If only resolved matches exist, the response is loudly prefixed '(This dispute is CLOSED ...)' so don't describe a closed case as the current state.",
  input_schema: {
    type: 'object' as const,
    properties: {
      provider: {
        type: 'string',
        description: 'Provider/dispute name (case-insensitive partial match — "Nuki" matches "Nuki Home Solutions").',
      },
    },
    required: ['provider'],
  },
  handler: async (args: { provider: string }, userId: string) => {
    const result = await executeToolCall('get_dispute_detail', { provider: args.provider }, userId, 'chatbot');
    return { text: result.text };
  },
};

const findEmailThreadForDisputeTool: ChatTool = {
  name: 'find_email_thread_for_dispute',
  description:
    "Search the user's connected inboxes (Gmail / Outlook) for email threads that could be linked to one of their disputes. Use when the user says 'link an email', 'connect a thread', 'find the email about X'. Returns up to 5 candidates with subject + sender + date + a metadata blob containing connection_id, thread_id, and provider_type. Always present the list to the user and ask them to pick — never auto-link the top result.",
  input_schema: {
    type: 'object' as const,
    properties: {
      provider: {
        type: 'string',
        description: 'Provider/dispute name to seed the inbox search (case-insensitive partial match).',
      },
      query: {
        type: 'string',
        description: "Optional extra search keyword (e.g. 'alice', 'refund', 'ticket 785661') if the user gave one. Falls back to provider name.",
      },
    },
    required: ['provider'],
  },
  handler: async (args: { provider: string; query?: string }, userId: string) => {
    const result = await executeToolCall(
      'find_email_thread_for_dispute',
      { provider: args.provider, query: args.query },
      userId,
      'chatbot',
    );
    return { text: result.text };
  },
};

const linkEmailThreadToDisputeTool: ChatTool = {
  name: 'link_email_thread_to_dispute',
  description:
    "Link a specific email thread to a dispute. Call AFTER find_email_thread_for_dispute returned candidates AND the user picked one. Pass connection_id + thread_id + provider_type from the chosen candidate. Triggers an immediate sync so the body imports right away.",
  input_schema: {
    type: 'object' as const,
    properties: {
      provider: { type: 'string', description: 'Dispute provider name.' },
      connection_id: { type: 'string', description: "From the candidate's metadata blob." },
      thread_id: { type: 'string', description: "From the candidate's metadata blob." },
      provider_type: {
        type: 'string',
        enum: ['gmail', 'outlook', 'imap'],
        description: 'gmail | outlook | imap — from the candidate.',
      },
      subject: { type: 'string', description: 'Optional thread subject.' },
      sender_address: { type: 'string', description: 'Optional supplier email address.' },
    },
    required: ['provider', 'connection_id', 'thread_id', 'provider_type'],
  },
  handler: async (
    args: {
      provider: string;
      connection_id: string;
      thread_id: string;
      provider_type: 'gmail' | 'outlook' | 'imap';
      subject?: string;
      sender_address?: string;
    },
    userId: string,
  ) => {
    const result = await executeToolCall(
      'link_email_thread_to_dispute',
      {
        provider: args.provider,
        connection_id: args.connection_id,
        thread_id: args.thread_id,
        provider_type: args.provider_type,
        subject: args.subject,
        sender_address: args.sender_address,
      },
      userId,
      'chatbot',
    );
    return { text: result.text };
  },
};

export const disputeTools: ChatTool[] = [
  getDisputesTool,
  getDisputeDetailTool,
  findEmailThreadForDisputeTool,
  linkEmailThreadToDisputeTool,
];
