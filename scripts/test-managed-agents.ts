/**
 * Test script: dispatch each Claude Managed Agent ONCE and print results.
 *
 * Run:
 *   ANTHROPIC_AGENTS_API_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/test-managed-agents.ts
 *
 * Optional: pass an agent key to dispatch only that one:
 *   npx tsx scripts/test-managed-agents.ts builder
 *
 * The script bypasses the cron route and calls createSession + sendTaskMessage
 * directly, so it works locally without CRON_SECRET. It does NOT write to
 * agent_messages — the production cron route does that.
 *
 * Use this to:
 *   1. Verify ANTHROPIC_AGENTS_API_KEY (or ANTHROPIC_API_KEY) works.
 *   2. Verify the platform.claude.com agents and memory stores are reachable.
 *   3. See actual error responses if dispatch is failing.
 */

import { AGENTS, createSession, sendTaskMessage } from '../src/lib/managed-agents/config';

async function main() {
  const targetKey = process.argv[2];

  const entries = targetKey
    ? Object.entries(AGENTS).filter(([k]) => k === targetKey)
    : Object.entries(AGENTS);

  if (entries.length === 0) {
    console.error(
      `Unknown agent: ${targetKey}. Valid keys: ${Object.keys(AGENTS).join(', ')}`
    );
    process.exit(1);
  }

  console.log(`Dispatching ${entries.length} agent(s)...\n`);

  for (const [key, config] of entries) {
    process.stdout.write(`[${key}] (${config.name}) — `);
    try {
      const session = await createSession(config, `${config.name} — manual test`);
      process.stdout.write(`session ${session.id} created — `);
      await sendTaskMessage(session.id, config.taskPrompt);
      console.log(`task sent ✓`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
    }
  }

  console.log(`\nDone. Check platform.claude.com or query \`agent_messages\` to verify.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
