/**
 * Bootstrap script: Claude Managed Agents memory stores
 *
 * One-shot. Creates 10 memory stores (1 shared `paybacker_core` + 9 per-role) in the Claude
 * platform, uploads the markdown seed files from supabase/memory-seeds/, and pulls
 * high-importance legacy `agent_memory` rows from Supabase for each managed agent that
 * absorbs duties from a decommissioned executive.
 *
 * Run:
 *   ANTHROPIC_AGENTS_API_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *     npx tsx scripts/bootstrap-managed-agents-memory.ts
 *
 * Output: writes the resulting store ids to `src/lib/managed-agents/memory-stores.json`,
 * which is then read by `src/lib/managed-agents/config.ts` at session-creation time.
 *
 * Idempotent: if a store with the same `name` already exists, it reuses the id and updates
 * the seed files in-place (memory-store memories support an upsert via `update`).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.anthropic.com/v1';
const BETA_HEADER = 'managed-agents-2026-04-01';
const API_VERSION = '2023-06-01';

const SEED_ROOT = path.join(process.cwd(), 'supabase', 'memory-seeds');
const OUTPUT_FILE = path.join(process.cwd(), 'src', 'lib', 'managed-agents', 'memory-stores.json');

// Maps each managed agent (per-role store name) to the legacy `agent_memory.agent_role` rows
// it should absorb. Memories filtered to `memory_type IN ('learning','decision')` and
// `importance >= 8` so seeds stay durable, not stale operational notes.
const LEGACY_ROLE_INHERITANCE: Record<string, string[]> = {
  'paybacker_core': [], // shared core is hand-curated only
  'alert-tester': ['cfraudo'],
  'digest-compiler': ['exec_assistant'],
  'support-triager': ['support_lead'],
  'email-marketer': ['cco', 'cmo', 'head_of_ads'],
  'ux-auditor': ['cxo', 'cro', 'cgo'],
  'feature-tester': ['clo', 'cio'],
  'finance-analyst': ['cfo'],
  'bug-triager': ['cto'],
  'reviewer': ['cao', 'cto'],
  'builder': [], // builder learns its own conventions; no legacy seed
};

const STORE_DESCRIPTIONS: Record<string, string> = {
  'paybacker_core':
    'Shared product, pricing, architecture, deployment-safety, agent-roster and operating-principles knowledge. Read-only for managed agents; updated only via this bootstrap script.',
  'alert-tester':
    'Alert-tester per-role memory. Recurring alert patterns, false-positive history, fraud signals.',
  'digest-compiler':
    'Digest-compiler per-role memory. Synthesis patterns, founder-attention prioritisation rules, recurring weekly cycles.',
  'support-triager':
    'Support-triager per-role memory. Ticket-cluster patterns, churn-risk signals, escalation rules.',
  'email-marketer':
    'Email-marketer per-role memory. Brand voice, send-window data, inherited Casey/Taylor/Jordan campaign learnings.',
  'ux-auditor':
    'UX-auditor per-role memory. Funnel-friction patterns, retention correlations, inherited Bella/Pippa/Drew learnings.',
  'feature-tester':
    'Feature-tester per-role memory. Critical-flow regression history, compliance tripwires, competitor watch.',
  'finance-analyst':
    'Finance-analyst per-role memory. MRR baselines, churn-cohort patterns, tier-mix history, Stripe-webhook failure modes, inherited Alex (cfo) learnings.',
  'bug-triager':
    'Bug-triager per-role memory. Recurring failure modes, fix-risk priors.',
  'reviewer':
    'Reviewer per-role memory. PR review patterns, NEVER-VIOLATE rule library, deploy-freeze awareness.',
  'builder':
    'Builder per-role memory. Code conventions discovered, prior PR feedback, common pitfalls.',
};

// ---------------------------------------------------------------------------
// Anthropic API helpers
// ---------------------------------------------------------------------------

function apiKey(): string {
  const key = process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_AGENTS_API_KEY or ANTHROPIC_API_KEY');
  return key;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey(),
    'anthropic-version': API_VERSION,
    'anthropic-beta': BETA_HEADER,
  };
}

async function listMemoryStores(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${API_BASE}/memory_stores`, { headers: headers() });
  if (!res.ok) throw new Error(`list_memory_stores failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data: Array<{ id: string; name: string }> };
  return json.data;
}

async function createMemoryStore(name: string, description: string): Promise<string> {
  const res = await fetch(`${API_BASE}/memory_stores`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(`create_memory_store failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function ensureMemoryStore(name: string): Promise<string> {
  const existing = await listMemoryStores();
  const match = existing.find((s) => s.name === name);
  if (match) {
    console.log(`  ↩ reusing existing store ${match.id} (${name})`);
    return match.id;
  }
  const id = await createMemoryStore(name, STORE_DESCRIPTIONS[name] ?? `Paybacker ${name}`);
  console.log(`  ✚ created store ${id} (${name})`);
  return id;
}

async function upsertMemory(
  storeId: string,
  memoryPath: string,
  content: string,
): Promise<void> {
  // Try update first (idempotent re-runs); fall back to create on 404.
  const updateRes = await fetch(
    `${API_BASE}/memory_stores/${storeId}/memories/${encodeURIComponent(memoryPath)}`,
    { method: 'PATCH', headers: headers(), body: JSON.stringify({ content }) },
  );
  if (updateRes.ok) return;
  if (updateRes.status !== 404) {
    throw new Error(
      `update memory ${memoryPath} failed: ${updateRes.status} ${await updateRes.text()}`,
    );
  }
  const createRes = await fetch(`${API_BASE}/memory_stores/${storeId}/memories`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ path: memoryPath, content }),
  });
  if (!createRes.ok) {
    throw new Error(
      `create memory ${memoryPath} failed: ${createRes.status} ${await createRes.text()}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Seed loading
// ---------------------------------------------------------------------------

async function loadStaticSeeds(storeName: string): Promise<Record<string, string>> {
  const dir = path.join(SEED_ROOT, storeName);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    out[f] = await fs.readFile(path.join(dir, f), 'utf8');
  }
  return out;
}

async function loadLegacySeeds(
  storeName: string,
): Promise<Record<string, string>> {
  const legacyRoles = LEGACY_ROLE_INHERITANCE[storeName] ?? [];
  if (legacyRoles.length === 0) return {};

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(`  ⚠ skipping legacy seeds for ${storeName}: missing Supabase env`);
    return {};
  }

  const supa = createClient(url, key);
  const { data, error } = await supa
    .from('agent_memory')
    .select('agent_role, memory_type, title, importance, content, created_at')
    .in('agent_role', legacyRoles)
    .in('memory_type', ['learning', 'decision'])
    .gte('importance', 8)
    .or('expires_at.is.null,expires_at.gt.now()')
    .order('importance', { ascending: false })
    .limit(40);

  if (error) {
    console.warn(`  ⚠ legacy fetch failed for ${storeName}: ${error.message}`);
    return {};
  }
  if (!data || data.length === 0) return {};

  // Group by source role and emit one markdown file per legacy role.
  const out: Record<string, string> = {};
  const grouped: Record<string, typeof data> = {};
  for (const row of data) {
    (grouped[row.agent_role] ||= []).push(row);
  }

  for (const [role, rows] of Object.entries(grouped)) {
    const lines: string[] = [];
    lines.push(`# Inherited from legacy role: ${role}`);
    lines.push('');
    lines.push(
      `Seeded ${new Date().toISOString().slice(0, 10)} from \`agent_memory\` (importance ≥ 8, types: learning + decision).`,
    );
    lines.push('Treat as historical priors. Verify any user-/IP-/date-specific claim against live data before acting on it.');
    lines.push('');
    for (const r of rows) {
      lines.push(`## [${r.memory_type}] ${r.title} (importance ${r.importance})`);
      lines.push(`*Recorded: ${(r.created_at as string).slice(0, 10)}*`);
      lines.push('');
      lines.push(r.content as string);
      lines.push('');
    }
    out[`legacy-${role}.md`] = lines.join('\n').slice(0, 95_000); // stay under 100KB hard limit
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const storeIds: Record<string, string> = {};

  for (const storeName of Object.keys(LEGACY_ROLE_INHERITANCE)) {
    console.log(`\n→ ${storeName}`);
    const id = await ensureMemoryStore(storeName);
    storeIds[storeName] = id;

    const staticSeeds = await loadStaticSeeds(storeName);
    const legacySeeds = await loadLegacySeeds(storeName);

    const allSeeds = { ...staticSeeds, ...legacySeeds };
    for (const [filename, content] of Object.entries(allSeeds)) {
      await upsertMemory(id, filename, content);
      console.log(`    ↑ ${filename} (${content.length} chars)`);
    }
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      { generated_at: new Date().toISOString(), stores: storeIds },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`\n✓ Wrote store ids to ${OUTPUT_FILE}`);
  console.log('  Next: redeploy so the managed-agents config picks up the new store ids.');
}

main().catch((err) => {
  console.error('\n✗ Bootstrap failed:', err);
  process.exit(1);
});
