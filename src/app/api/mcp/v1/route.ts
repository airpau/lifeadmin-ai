/**
 * Paybacker Assistant — per-user MCP server over streamable HTTP.
 *
 * Deployed at https://paybacker.co.uk/api/mcp/v1
 *
 * WHY THIS EXISTS
 *
 * There were already two MCP surfaces and neither let a user connect
 * Claude to their OWN money:
 *
 *   /api/mcp              founder/ops server. One static MCP_BEARER_TOKEN,
 *                         30 tools, can write. Not per-user, and not
 *                         something to hand a customer.
 *   packages/paybacker-mcp  the right tools (accounts, transactions,
 *                         subscriptions, budget, net worth, disputes),
 *                         but stdio ONLY and never published to npm, so
 *                         `npx -y @paybacker/mcp` 404s. A cloud connector
 *                         has nothing to reach.
 *
 * Meanwhile the underlying REST routes under /api/mcp/* are already
 * HTTPS, already authenticated with a per-user `pbk_` token, and already
 * Pro-gated. The only missing piece was an MCP transport in front of
 * them. That is all this is.
 *
 * CLAUDE.md lists "Paybacker Assistant (MCP integration)" as a Pro
 * feature; this is the surface that actually delivers it.
 *
 * DESIGN
 *
 * Every tool proxies to its existing REST route with the caller's own
 * bearer token, rather than re-implementing the query. That keeps ONE
 * implementation of each shape, so a fix to the REST route (the account
 * masking, the deleted_at filter, the dedupe_key field) reaches the MCP
 * surface for free and the two can never drift.
 *
 * Auth is checked once at the transport so an invalid or non-Pro token
 * fails on the first call rather than on the first tool. The bearer is
 * then passed through to the internal calls, which authenticate again.
 * That is deliberate: it means there is no privileged internal path that
 * skips the Pro gate, and no way for a bug here to widen access.
 *
 * READ ONLY. Every tool is a GET. Nothing here can move money, change a
 * category, cancel a subscription or touch a dispute. That is the whole
 * point of it being safe to hand to a cloud connector.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateMcp, isAuthSuccess } from '@/lib/mcp-auth';

export const runtime = 'nodejs';

const SERVER_NAME = 'paybacker-assistant';
const SERVER_VERSION = '1.0.0';
/** Keep in sync with the server.tool(...) registrations below. */
const TOOL_COUNT = 7;

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '');
}

/**
 * Proxy one tool call to its REST route using the caller's own token.
 *
 * Errors are returned as readable text rather than thrown: an MCP client
 * showing "Your Paybacker token has expired" is far more use than a
 * generic tool failure, and the user can act on it.
 */
async function callRest(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  bearer: string,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const url = new URL(`${appBaseUrl()}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: bearer, Accept: 'application/json' },
      cache: 'no-store',
    });

    const text = await res.text();

    if (!res.ok) {
      let hint = `Paybacker returned ${res.status}.`;
      if (res.status === 401) {
        hint =
          'Your Paybacker token is invalid, revoked or expired. Generate a new one at ' +
          'paybacker.co.uk/dashboard/settings/mcp and update it in your connector settings.';
      } else if (res.status === 403) {
        hint =
          'Paybacker Assistant requires an active Pro plan. Check your subscription at ' +
          'paybacker.co.uk/pricing.';
      }
      return { content: [{ type: 'text', text: `${hint}\n\n${text.slice(0, 500)}` }] };
    }

    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Could not reach Paybacker: ${message}` }],
    };
  }
}

function createAssistantServer(bearer: string): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.tool(
    'get_accounts',
    'Lists the user\'s connected bank accounts with institution, masked reference, account type and latest known balance. Check balance_class before totalling anything: "liability" accounts are credit cards and loans, which are debt rather than money, and must not be added to cash. Check balance_scope too — "connection" means the balance is shared across every account on that connection rather than being that account\'s own.',
    {
      include_inactive: z
        .boolean()
        .optional()
        .describe('Include archived connections. Defaults to false.'),
    },
    async ({ include_inactive }) =>
      callRest('/api/mcp/accounts', { include_inactive }, bearer),
  );

  server.tool(
    'get_transactions',
    'Lists bank transactions, newest first. amount_gbp is signed: negative is money out, positive is money in. Use account_ref to restrict to one account when a connection carries several, otherwise a business current account and its credit cards come back mixed together.',
    {
      since: z.string().optional().describe('ISO date, inclusive lower bound (YYYY-MM-DD).'),
      until: z.string().optional().describe('ISO date, inclusive upper bound (YYYY-MM-DD).'),
      category: z.string().optional().describe('Filter to one spending category, e.g. energy.'),
      account_ref: z
        .string()
        .optional()
        .describe('Masked account reference from get_accounts, e.g. ••••Xrvw.'),
      limit: z.number().min(1).max(500).optional().describe('Default 100, maximum 500.'),
    },
    async (args) => callRest('/api/mcp/transactions', args, bearer),
  );

  server.tool(
    'get_subscriptions',
    'Lists tracked subscriptions and recurring payments with amount, billing cycle, category and next billing date. Note these are TRACKED, not necessarily reflected in the spending totals, so a subscription can exist here without a matching categorised transaction.',
    {
      include_dismissed: z
        .boolean()
        .optional()
        .describe('Include dismissed subscriptions. Defaults to false.'),
    },
    async ({ include_dismissed }) =>
      callRest('/api/mcp/subscriptions', { include_dismissed }, bearer),
  );

  server.tool(
    'get_budget_summary',
    'Returns the current budget position: limits per category, spend against each, and how much is left.',
    {},
    async () => callRest('/api/mcp/budget', {}, bearer),
  );

  server.tool(
    'get_net_worth_snapshot',
    'Returns the latest net worth snapshot: assets, liabilities and the resulting position.',
    {},
    async () => callRest('/api/mcp/net-worth', {}, bearer),
  );

  server.tool(
    'get_open_disputes',
    'Lists bill disputes and complaints with their status, the merchant, and where each has got to.',
    {
      include_closed: z.boolean().optional().describe('Include resolved disputes.'),
      limit: z.number().min(1).max(200).optional(),
    },
    async (args) => callRest('/api/mcp/disputes', args, bearer),
  );

  server.tool(
    'search_transactions',
    'Free-text search across transaction descriptions and merchant names. Use this for "what did I pay British Gas" style questions rather than pulling every transaction and filtering.',
    {
      q: z.string().min(1).max(80).describe('Search text.'),
      since: z.string().optional().describe('ISO date lower bound.'),
      until: z.string().optional().describe('ISO date upper bound.'),
      limit: z.number().min(1).max(200).optional(),
    },
    async (args) => callRest('/api/mcp/search', args, bearer),
  );

  return server;
}

async function handle(req: NextRequest): Promise<Response> {
  // Authenticate ONCE here so a bad or non-Pro token fails on connect
  // rather than on the first tool call, which is a far clearer failure
  // for someone setting up a connector. authenticateMcp returns a ready
  // NextResponse on failure.
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const bearer = req.headers.get('authorization') || '';

  const server = createAssistantServer(bearer);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless, same as the founder server
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  // Unauthenticated health check, so a connector can be pointed here and
  // verified before a token is involved. Mirrors /api/mcp.
  if (!req.headers.get('accept')?.includes('text/event-stream')) {
    return NextResponse.json(
      {
        status: 'ok',
        server: SERVER_NAME,
        version: SERVER_VERSION,
        tools: TOOL_COUNT,
        auth: 'Bearer pbk_… token from /dashboard/settings/mcp. Pro plan required.',
        note: 'Read-only view of your own Paybacker data. No tool here can move money or change anything.',
      },
      { headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } },
    );
  }
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
