// src/__tests__/e2e/_harness.ts
//
// Hermetic test harness for the compliance-engine E2E suite.
//
// These tests must NOT hit the real network or a real Supabase. The
// harness provides:
//
//   1. `mockFetch(routes)` — installs `globalThis.fetch` that resolves
//      against an in-memory route table keyed by URL prefix. Records
//      every call so tests can assert "legislation.gov.uk was hit".
//
//   2. `inMemorySupabase()` — a chainable stub of the Supabase client
//      used by the freshness gate + dispute resolvers. Tracks inserted
//      rows for `legal_ref_freshness_audit`, `legal_ref_corrections`,
//      `legal_references` updates, and `disputes` so tests can assert
//      side-effects without DB I/O.
//
//   3. `tryLoadFreshnessGate()` — dynamic-imports the freshness gate
//      module from its expected location. Returns null when the
//      module isn't on master yet; tests treat that as a graceful
//      skip with a clear message rather than a hard failure. This is
//      the explicit "degrade gracefully if not" contract from the PR
//      brief — master may not yet ship the gate, but the same tests
//      run green once the in-flight PR lands.
//
// Run an individual test:
//   node --experimental-strip-types --test src/__tests__/e2e/<file>.test.ts

export type FetchRoute = {
  match: (url: string) => boolean;
  respond: (url: string, init?: RequestInit) => Promise<Response> | Response;
};

export interface FetchRecorder {
  calls: Array<{ url: string; init?: RequestInit }>;
  restore: () => void;
}

const originalFetch = globalThis.fetch;

export function mockFetch(routes: FetchRoute[]): FetchRecorder {
  const recorder: FetchRecorder = {
    calls: [],
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    recorder.calls.push({ url, init });
    for (const route of routes) {
      if (route.match(url)) return route.respond(url, init);
    }
    // Default deny — surface unexpected outbound calls loudly.
    throw new Error(`[mockFetch] unmocked outbound request: ${url}`);
  }) as typeof fetch;
  return recorder;
}

// Minimal supabase-js–shaped stub. Covers `from(table).select/insert/update/upsert/eq/in/order/limit/single` chains used by the gate + B2C/B2B paths.
export interface MemTable {
  rows: any[];
}

export interface InMemorySupabase {
  client: any;
  tables: Record<string, MemTable>;
  inserts: Record<string, any[]>;
  updates: Record<string, any[]>;
}

export function inMemorySupabase(seed: Record<string, any[]> = {}): InMemorySupabase {
  const tables: Record<string, MemTable> = {};
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = { rows: [...v] };

  function tableRef(name: string) {
    if (!tables[name]) tables[name] = { rows: [] };
    if (!inserts[name]) inserts[name] = [];
    if (!updates[name]) updates[name] = [];
    let filtered = [...tables[name].rows];

    const builder: any = {
      select: (_cols?: string) => builder,
      insert: (row: any) => {
        const rows = Array.isArray(row) ? row : [row];
        inserts[name].push(...rows);
        tables[name].rows.push(...rows);
        return {
          select: () => ({ single: async () => ({ data: rows[0], error: null }) }),
          then: (cb: any) => cb({ data: rows, error: null }),
        };
      },
      upsert: (row: any) => {
        const rows = Array.isArray(row) ? row : [row];
        inserts[name].push(...rows);
        tables[name].rows.push(...rows);
        return Promise.resolve({ data: rows, error: null });
      },
      update: (patch: any) => {
        updates[name].push(patch);
        const updateBuilder: any = {
          eq: (col: string, val: any) => {
            for (const r of tables[name].rows) {
              if (r[col] === val) Object.assign(r, patch);
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return updateBuilder;
      },
      eq: (col: string, val: any) => {
        filtered = filtered.filter((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: any[]) => {
        filtered = filtered.filter((r) => vals.includes(r[col]));
        return builder;
      },
      order: () => builder,
      limit: (n: number) => {
        filtered = filtered.slice(0, n);
        return builder;
      },
      single: async () => ({ data: filtered[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      then: (cb: any) => cb({ data: filtered, error: null }),
    };
    return builder;
  }

  return {
    client: { from: tableRef, auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) } },
    tables,
    inserts,
    updates,
  };
}

// Try to dynamic-load the freshness-gate module. Returns null when it
// doesn't exist on this branch — callers should skip-with-message.
export async function tryLoadFreshnessGate(): Promise<{
  loadFreshLegalRefs: (...args: any[]) => Promise<any>;
} | null> {
  // Candidate module paths the in-flight PR may use.
  const candidates = [
    '@/lib/legal-refs-freshness',
    '@/lib/legal-refs-freshness-gate',
    '../../lib/legal-refs-freshness',
    '../../lib/legal-refs-freshness-gate',
  ];
  for (const c of candidates) {
    try {
      const mod = await import(c);
      if (mod && typeof mod.loadFreshLegalRefs === 'function') {
        return mod as any;
      }
    } catch {
      /* keep trying */
    }
  }
  return null;
}

// Sample fresh legislation.gov.uk XML payload used across tests.
export const FRESH_CRA2015_XML = `<?xml version="1.0"?>
<Legislation xmlns="http://www.legislation.gov.uk/namespaces/legislation">
  <Metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Consumer Rights Act 2015 (FRESH-2026-05)</dc:title></Metadata>
  <Body>
    <P1>Section 49 — Service to be performed with reasonable care and skill (FRESH).</P1>
  </Body>
</Legislation>`;

export const STALE_CACHED_TEXT = 'Section 49 — Service to be performed with reasonable care and skill (STALE-2024).';
