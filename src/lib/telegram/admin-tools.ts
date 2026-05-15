/**
 * Anthropic tool-use definitions + dispatcher for the founder-only
 * Paybacker Assistant admin bot (TELEGRAM_ADMIN_BOT_TOKEN).
 *
 * Wired into the natural-language fallback at
 *   src/app/api/telegram/admin-command/route.ts
 * so when the founder replies in plain English the bot can actually
 * carry out work — read DB rows, fire crons, resubmit templates —
 * not just talk about it.
 *
 * AUTH MODEL
 * ──────────
 * The route already gates on FOUNDER_CHAT_ID before this module is
 * even imported, so we don't re-check identity here. Every tool runs
 * with full service-role privileges; never expose this dispatcher to
 * an endpoint that's reachable by anyone other than the founder.
 *
 * TOOLS
 * ─────
 *   - run_sql_query           SELECT-only ad-hoc queries
 *   - trigger_cron            Fire any cron in the whitelist
 *   - resubmit_whatsapp_templates  Resubmit pending WhatsApp templates to Meta
 *   - send_test_whatsapp_template  Send a real template to founder for verification
 *   - morning_brief_now       Convenience: trigger telegram-morning-summary
 *
 * Adding a tool: append to TOOL_DEFINITIONS + a `case` in `executeAdminTool`.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron routes the admin bot is allowed to fire on demand. Keep this
 * tight — anything not on the list is rejected. Mirrors the entries
 * in vercel.json that are safe to manually trigger (read-mostly or
 * idempotent).
 */
const CRON_WHITELIST = new Set<string>([
  'telegram-morning-summary',
  'telegram-evening-summary',
  'telegram-alerts',
  'whatsapp-alerts',
  'whatsapp-template-status',
  'income-received',
  'bank-sync',
  'dispute-agent',
  'dispute-reply-sync',
  'compliance-sync',
  'weekly-money-digest',
  'weekly-newsletter',
  'consumer-nurture',
  'b2b-nurture',
  'price-increases',
  'renewal-reminders',
  'compute-dispute-intelligence',
]);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'run_sql_query',
    description:
      'Run a read-only SELECT query against the Paybacker Postgres database (Supabase) and return the rows as JSON. ' +
      'Use this for ad-hoc business questions: MRR, signups today, dispute counts, recent errors, ' +
      'whatsapp_message_log inspection, etc. ' +
      'STRICT RULES: SELECT only. No DDL/DML — anything other than SELECT is rejected. ' +
      'Auto-LIMIT 100 rows is added if you omit LIMIT. The function rejects multi-statement queries. ' +
      'Schema-qualify auth tables (auth.users) but plain table names are fine for the public schema.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A single SELECT statement. Must start with SELECT (case-insensitive, leading whitespace allowed).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'trigger_cron',
    description:
      'Manually fire one of our Vercel cron routes by name. The route runs end-to-end (same path the scheduler uses) and returns its JSON response. ' +
      'Use this when the founder wants to force a refresh — e.g. "send me the morning brief now", "rerun the dispute-agent", ' +
      '"resync the bank". Only whitelisted crons can be triggered. ' +
      'Long-running crons may exceed the bot\'s timeout — they will still complete on Vercel even if this tool returns a timeout.',
    input_schema: {
      type: 'object',
      properties: {
        cron_name: {
          type: 'string',
          description:
            'Path segment under /api/cron — e.g. "telegram-morning-summary", "income-received", "compliance-sync".',
        },
      },
      required: ['cron_name'],
    },
  },
  {
    name: 'resubmit_whatsapp_templates',
    description:
      'Resubmit one or more PENDING_RESUBMISSION WhatsApp templates to Meta via Twilio. ' +
      'Use when the founder asks to fix a rejected template (e.g. "resubmit the price increase template") ' +
      'or after a code change to a template body. ' +
      'Pass an array of template names from the registry, or omit to resubmit ALL pending templates. ' +
      'Returns per-template outcome (success / error). Approval still takes Meta hours-to-days afterward.',
    input_schema: {
      type: 'object',
      properties: {
        template_names: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific templates to resubmit, e.g. ["paybacker_alert_price_increase", "paybacker_alert_unusual_charge"]. ' +
            'Omit to resubmit every PENDING_RESUBMISSION template at once.',
        },
      },
    },
  },
  {
    name: 'send_test_whatsapp_template',
    description:
      'Send a real approved WhatsApp template to the founder\'s own WhatsApp number for verification. ' +
      'Use after a resubmit to confirm Meta has approved it, or to spot-check formatting. ' +
      'Costs one Meta template fee per call — use sparingly. Fails cleanly if the template is not yet approved.',
    input_schema: {
      type: 'object',
      properties: {
        template_name: {
          type: 'string',
          description: 'Template name from the registry, e.g. "paybacker_morning_summary".',
        },
        parameters: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Positional parameters filling {{1}}, {{2}}, ... in the template. ' +
            'Provide sensible test values matching the template\'s vars order.',
        },
      },
      required: ['template_name'],
    },
  },
  {
    name: 'morning_brief_now',
    description:
      'Convenience wrapper: trigger the telegram-morning-summary cron immediately. ' +
      'Equivalent to trigger_cron with cron_name="telegram-morning-summary" but presented as ' +
      'a friendlier verb so the founder can just say "send me the morning brief".',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

interface ExecutionContext {
  cronSecret: string;
  baseUrl: string;
  founderWhatsAppPhone: string | null;
}

interface ToolResult {
  text: string;
}

export async function executeAdminTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  switch (name) {
    case 'run_sql_query':
      return runSqlQuery(String(input.query ?? ''));
    case 'trigger_cron':
      return triggerCron(String(input.cron_name ?? ''), ctx);
    case 'resubmit_whatsapp_templates':
      return resubmitTemplates(input.template_names as string[] | undefined, ctx);
    case 'send_test_whatsapp_template':
      return sendTestTemplate(
        String(input.template_name ?? ''),
        (input.parameters as string[] | undefined) ?? [],
        ctx,
      );
    case 'morning_brief_now':
      return triggerCron('telegram-morning-summary', ctx);
    default:
      return { text: `Unknown tool: ${name}` };
  }
}

/* ---------- Tool implementations ---------- */

async function runSqlQuery(rawQuery: string): Promise<ToolResult> {
  const query = rawQuery.trim();
  if (!query) return { text: 'Error: empty query.' };
  // Mirror the RPC's accepted shapes: leading SELECT or WITH (CTE).
  // Codex P2 (PR #454): LLMs commonly write CTE-prefixed analytics
  // queries; rejecting them here would cause avoidable tool failures
  // even though the underlying RPC accepts them.
  if (!/^(select|with)\b/i.test(query)) {
    return { text: 'Error: only SELECT or WITH queries are allowed. Got: ' + query.slice(0, 60) };
  }
  // Reject multi-statement queries — semicolons inside string literals
  // would be a false positive, but ad-hoc admin queries don't need
  // them and the safe stance wins.
  if (/;\s*\S/.test(query)) {
    return { text: 'Error: multi-statement queries are not allowed.' };
  }
  // Add an implicit LIMIT 100 if the query doesn't already have one,
  // so a careless `SELECT * FROM bank_transactions` doesn't spam back
  // 50k rows into a Telegram message.
  const hasLimit = /\blimit\b\s+\d+/i.test(query);
  const finalQuery = hasLimit ? query : `${query.replace(/;\s*$/, '')} LIMIT 100`;

  const sb = adminSupabase();
  if (!sb) return { text: 'Error: Supabase admin client not available (env not set).' };

  // Use rpc('exec_sql') if the project has it; otherwise fall back to
  // pg-meta. We keep it simple and rely on a `pg_query` RPC convention
  // — most Supabase projects don't have this, so we use a safer
  // workaround: ask Postgres to format the rows as JSON via a wrapping
  // SELECT. That requires querying via the supabase-js generic SQL
  // path, which doesn't exist for arbitrary SQL — so we use the
  // PostgREST endpoint with `rpc('run_sql', { query })` if available,
  // else surface a clear error.
  //
  // Reality: the project relies on the MCP `execute_sql` tool for
  // ad-hoc SQL, not a permanent endpoint. To keep this admin tool
  // self-contained without adding a new RPC, we use the postgres
  // metadata via service-role REST, which only supports table reads.
  // For arbitrary SELECT we POST to a `/rest/v1/rpc/run_sql` if the
  // founder has set one up; if not, return a clear instruction so
  // the founder can wire it in 30 seconds.
  const rpcRes = await sb.rpc('run_sql', { query: finalQuery });
  if (rpcRes.error) {
    return {
      text:
        `Error running query: ${rpcRes.error.message}. ` +
        `If the error mentions "function run_sql" or "could not find function", ` +
        `the project doesn't have the helper RPC yet. Create it once with: ` +
        `CREATE OR REPLACE FUNCTION run_sql(query text) RETURNS jsonb LANGUAGE plpgsql ` +
        `SECURITY DEFINER AS $$ DECLARE result jsonb; BEGIN EXECUTE 'SELECT to_jsonb(array_agg(row_to_json(t))) FROM (' || query || ') t' INTO result; RETURN COALESCE(result, '[]'::jsonb); END; $$; ` +
        `Then revoke EXECUTE from anon: REVOKE EXECUTE ON FUNCTION run_sql FROM anon, authenticated;`,
    };
  }
  const rows = rpcRes.data as unknown[];
  const json = JSON.stringify(rows, null, 2);
  // Telegram caps at 4096 chars per message; the route splits, but
  // we cap the JSON we hand back to Claude at 8KB so the next loop
  // iteration's context doesn't balloon.
  const trimmed = json.length > 8000 ? json.slice(0, 8000) + '\n... (truncated)' : json;
  return { text: trimmed };
}

async function triggerCron(name: string, ctx: ExecutionContext): Promise<ToolResult> {
  if (!CRON_WHITELIST.has(name)) {
    return {
      text:
        `Cron "${name}" is not in the admin-bot whitelist. ` +
        `Allowed: ${[...CRON_WHITELIST].sort().join(', ')}.`,
    };
  }
  if (!ctx.cronSecret) return { text: 'Error: CRON_SECRET not configured.' };

  const url = `${ctx.baseUrl}/api/cron/${name}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.cronSecret}`,
        'Content-Type': 'application/json',
      },
      // Some crons use GET — we try POST first, retry GET on 405.
      body: '{}',
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 405) {
      const getRes = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${ctx.cronSecret}` },
        signal: AbortSignal.timeout(60_000),
      });
      const body = await safeReadBody(getRes);
      return { text: `Cron ${name} (GET) → ${getRes.status}: ${body}` };
    }
    const body = await safeReadBody(res);
    return { text: `Cron ${name} → ${res.status}: ${body}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Failed to trigger cron ${name}: ${msg}` };
  }
}

async function resubmitTemplates(
  names: string[] | undefined,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  if (!ctx.cronSecret) return { text: 'Error: CRON_SECRET not configured.' };
  const url = `${ctx.baseUrl}/api/admin/whatsapp/resubmit-pending`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(names && names.length > 0 ? { template_names: names } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await safeReadBody(res);
    return { text: `Resubmit → ${res.status}: ${body}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Resubmit failed: ${msg}` };
  }
}

async function sendTestTemplate(
  templateName: string,
  parameters: string[],
  ctx: ExecutionContext,
): Promise<ToolResult> {
  if (!templateName) return { text: 'Error: template_name is required.' };
  if (!ctx.founderWhatsAppPhone) {
    return {
      text:
        'No active WhatsApp session for the founder — link your number via the Pocket Agent flow first ' +
        '(/dashboard/pocket-agent), then retry.',
    };
  }
  try {
    const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
    const result = await sendWhatsAppTemplate({
      to: ctx.founderWhatsAppPhone,
      templateName,
      parameters,
    });
    return {
      text: `Sent ${templateName} to ${ctx.founderWhatsAppPhone}. Provider message id: ${result.providerMessageId ?? '(none)'}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Test send failed: ${msg}` };
  }
}

/* ---------- Helpers ---------- */

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text.length > 1500) return text.slice(0, 1500) + '... (truncated)';
    return text;
  } catch {
    return '(unreadable response body)';
  }
}

export async function loadFounderWhatsAppPhone(founderUserId: string): Promise<string | null> {
  const sb = adminSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from('whatsapp_sessions')
    .select('whatsapp_phone')
    .eq('user_id', founderUserId)
    .eq('is_active', true)
    .is('opted_out_at', null)
    .maybeSingle();
  return data?.whatsapp_phone ?? null;
}
