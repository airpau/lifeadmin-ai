#!/usr/bin/env node
// @paybacker/mcp — stdio MCP server that exposes the user's own Paybacker
// account data to Claude Desktop. All tools are read-only.
//
// Runs with:  npx @paybacker/mcp
// Requires:   PAYBACKER_TOKEN env var (personal access token minted at
//             https://paybacker.co.uk/dashboard/settings/mcp)
//
// Protocol: Model Context Protocol over stdio. Claude Desktop spawns this
// process on startup and talks to it via JSON-RPC on stdin/stdout.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = process.env.PAYBACKER_API_URL ?? 'https://lifeadmin-ai.vercel.app';
const TOKEN = process.env.PAYBACKER_TOKEN;
const VERSION = '0.1.0';

if (!TOKEN) {
  console.error(
    '[paybacker-mcp] Missing PAYBACKER_TOKEN env var.\n' +
      'Generate one at https://paybacker.co.uk/dashboard/settings/mcp then\n' +
      'add it to your Claude Desktop config. See README for details.',
  );
  process.exit(1);
}

// ---------- HTTP helper --------------------------------------------------

async function call(path: string, params: Record<string, string | undefined> = {}) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': `paybacker-mcp/${VERSION}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface the server's error payload so Claude can pass the real reason
    // to the user (e.g. "Token revoked", "MCP access requires Pro").
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(
      `Paybacker API ${res.status}: ${
        typeof body === 'object' && body && 'error' in (body as Record<string, unknown>)
          ? (body as { error: string }).error
          : text
      }`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ---------- Tool catalogue ----------------------------------------------

const TOOLS: Tool[] = [
  {
    name: 'get_transactions',
    description:
      "List the user's bank transactions from Paybacker. Returns newest first. " +
      'Use `since` and `until` (ISO date) to restrict the range. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO date, e.g. 2026-01-01' },
        until: { type: 'string', description: 'ISO date, inclusive upper bound' },
        category: { type: 'string', description: 'Exact category name, optional' },
        limit: {
          type: 'number',
          description: 'Max rows, default 100, max 500',
          minimum: 1,
          maximum: 500,
        },
      },
    },
  },
  {
    name: 'get_subscriptions',
    description:
      "List the user's tracked subscriptions and recurring contracts. " +
      'Includes monthly and annual totals. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        include_dismissed: {
          type: 'boolean',
          description: 'Include dismissed/hidden subscriptions. Default false.',
        },
      },
    },
  },
  {
    name: 'get_budget_summary',
    description:
      "Return the user's current-month spending against each budget category, " +
      'including percentage used and on_track/warning/over_budget status. Read-only.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_net_worth_snapshot',
    description:
      "Return the user's net worth = total assets - total liabilities, plus " +
      'a list of savings goals with progress percentages. Read-only.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_open_disputes',
    description:
      "List the user's complaint / dispute cases with Paybacker. By default " +
      'excludes resolved and dismissed cases. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        include_closed: {
          type: 'boolean',
          description: 'Include resolved/dismissed disputes. Default false.',
        },
        limit: { type: 'number', minimum: 1, maximum: 200 },
      },
    },
  },
  {
    name: 'search_transactions',
    description:
      "Free-text search across the user's transactions. Matches description " +
      'and merchant. Useful for questions like "did I pay Netflix last month?".',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query, 1-80 chars' },
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 200 },
      },
      required: ['q'],
    },
  },
];

// ---------- Tool routing -------------------------------------------------

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_transactions':
      return call('/api/mcp/transactions', {
        since: args.since as string | undefined,
        until: args.until as string | undefined,
        category: args.category as string | undefined,
        limit: args.limit != null ? String(args.limit) : undefined,
      });
    case 'get_subscriptions':
      return call('/api/mcp/subscriptions', {
        include_dismissed: args.include_dismissed ? 'true' : undefined,
      });
    case 'get_budget_summary':
      return call('/api/mcp/budget');
    case 'get_net_worth_snapshot':
      return call('/api/mcp/net-worth');
    case 'get_open_disputes':
      return call('/api/mcp/disputes', {
        include_closed: args.include_closed ? 'true' : undefined,
        limit: args.limit != null ? String(args.limit) : undefined,
      });
    case 'search_transactions':
      return call('/api/mcp/search', {
        q: args.q as string,
        since: args.since as string | undefined,
        until: args.until as string | undefined,
        limit: args.limit != null ? String(args.limit) : undefined,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- Wire up the MCP server --------------------------------------

const server = new Server(
  { name: '@paybacker/mcp', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    const result = await runTool(name, args as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: `Paybacker MCP error: ${message}` }],
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((e) => {
  console.error('[paybacker-mcp] failed to start:', e);
  process.exit(1);
});
