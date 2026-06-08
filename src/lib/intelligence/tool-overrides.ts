/**
 * P5-2 — runtime tool downrank lookup.
 *
 * Called from the Pocket Agent loops (Telegram + WhatsApp) BEFORE the
 * tools list is sent to Claude. Any tool with an active override is
 * stripped from the list. Sonnet/Haiku never see it and can't pick it.
 *
 * Cache: in-memory per-request. The list is small (<100 tools) and the
 * lookup is a single Supabase query, so we don't bother with a
 * cross-request cache. The cost is one read per agent turn — negligible
 * relative to the LLM call.
 *
 * Failure mode: if Supabase is unavailable, we return an empty Set and
 * the agent gets the full toolbox. Better than blocking on telemetry.
 *
 * Daily cron writes the rows; founder dashboard manages clears. See
 * src/app/api/cron/intelligence-rollup-daily/route.ts for the writer
 * and /dashboard/admin/intelligence Card 5 for the surface.
 */

import { createClient } from '@supabase/supabase-js';

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Returns the set of tool names currently downranked at runtime.
 * Active = expires_at > NOW() AND reactivated_at IS NULL.
 *
 * Never throws — returns an empty Set on any failure so the agent keeps
 * working with the full toolbox. The intelligence layer must never
 * block the product.
 */
export async function getActiveDownrankedTools(): Promise<Set<string>> {
  const sb = admin();
  if (!sb) return new Set();
  try {
    const { data } = await sb
      .from('tool_registry_overrides')
      .select('tool_name, expires_at, reactivated_at')
      .is('reactivated_at', null)
      .gt('expires_at', new Date().toISOString());
    if (!data) return new Set();
    return new Set(data.map((r) => r.tool_name as string).filter(Boolean));
  } catch (err) {
    console.warn('[intelligence/tool-overrides] read failed:', err);
    return new Set();
  }
}

/**
 * Filter an Anthropic tools array by the active downrank list. Agents
 * call this right before building the request. The fire-and-forget
 * `recordAction` lets the dashboard show how often filtering bit.
 */
export async function filterDownrankedTools<T extends { name: string }>(
  tools: T[],
): Promise<T[]> {
  const blocked = await getActiveDownrankedTools();
  if (blocked.size === 0) return tools;
  return tools.filter((t) => !blocked.has(t.name));
}
