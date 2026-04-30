/**
 * Legal-references freshness guardrail.
 *
 * Compliance is the entire selling point of Paybacker — both the B2C
 * complaint engine and the B2B `/v1/disputes` endpoint promise current
 * UK statute citations. This module is the pre-send guard:
 *
 *  1. `checkRefFreshness(supabase, refIds)` — given the rows the engine
 *     intends to FEED INTO the prompt, return which are stale / broken
 *     and which are still fresh. Used to decide whether we need to
 *     refresh-or-substitute before calling the LLM.
 *
 *  2. `refreshSingleRef(supabase, refId)` — synchronous Perplexity call
 *     hard-capped to 5 seconds. If it returns in time, we update the
 *     row and use the refreshed copy. If it doesn't, we fall back to
 *     whatever is in the DB rather than hanging the user-facing
 *     request.
 *
 *  3. `findFreshSubstitute(supabase, category, excludeIds)` — when a
 *     ref can't be salvaged, pull the most-recently-verified fresh row
 *     in the same category as a drop-in replacement. Lets the engine
 *     substitute a stale citation rather than strip it entirely.
 *
 * The freshness contract (per founder spec):
 *   - `verification_status` ∈ {current, updated, verified}
 *   - `last_verified` IS NOT NULL
 *   - `last_verified > NOW() - LEGAL_REF_MAX_AGE_DAYS` (default 14)
 *
 * Anything else is "stale" and triggers the guardrail. We deliberately
 * check the refs FED INTO the prompt rather than parsing citations
 * back out of the LLM output — the model can paraphrase a statute
 * name and name-matching from output is unreliable. The fetched IDs
 * are what we control; we guard those.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RefFreshness = 'fresh' | 'stale' | 'broken' | 'unknown';

export interface LegalRef {
  id: string;
  category: string;
  subcategory?: string | null;
  law_name: string;
  section: string | null;
  summary: string;
  source_url: string;
  verification_status: string | null;
  last_verified: string | null;
  verified_url?: string | null;
}

const FRESH_STATUSES = new Set(['current', 'updated', 'verified']);
const PERPLEXITY_TIMEOUT_MS = 5000;

/**
 * Tiered freshness cascade (PR — 503-softening).
 *
 * Replaces the binary fresh/stale split with four bands. Tier 1 is the
 * historical "fresh" window — citations in this band emit no warning.
 * Tiers 2-4 are progressively older but still usable; the engine cites
 * them and surfaces a `_compliance_warnings` entry so the API consumer
 * can decide whether to surface to the agent. Beyond tier 4 (or with
 * an ineligible verification_status) the ref is unusable and falls
 * through to the substitute / category-chain logic.
 *
 * Tier 1 is governed by `LEGAL_REF_MAX_AGE_DAYS` so existing operator
 * configuration still controls the "no-warning" window. Tiers 2-4 are
 * fixed at 30/60/90 days because their semantics (warning copy) is
 * baked into product UX.
 */
export const FRESHNESS_TIER_CAPS_DAYS = [14, 30, 60, 90] as const;

export interface FreshnessTier {
  /** 1-4. Tier 1 = no warning, tiers 2-4 emit progressively stronger warnings. */
  tier: 1 | 2 | 3 | 4;
  /** Age in whole days at the time of evaluation. */
  ageDays: number;
}

function tier1MaxDays(): number {
  const days = Number.parseInt(process.env.LEGAL_REF_MAX_AGE_DAYS || '14', 10);
  return Number.isFinite(days) && days > 0 ? days : 14;
}

function maxAgeMs(): number {
  return tier1MaxDays() * 24 * 60 * 60 * 1000;
}

/**
 * Classify a single ref. Returns the freshness bucket so callers can
 * branch ("substitute" vs "refresh" vs "keep").
 */
export function freshnessOf(ref: LegalRef, opts?: { maxAgeDays?: number }): RefFreshness {
  if (!ref) return 'unknown';
  const status = (ref.verification_status || '').toLowerCase();
  if (status === 'broken' || status === 'superseded') return 'broken';
  if (!FRESH_STATUSES.has(status)) return 'stale';
  if (!ref.last_verified) return 'stale';
  const verifiedAt = new Date(ref.last_verified).getTime();
  if (!Number.isFinite(verifiedAt)) return 'stale';
  const cap = opts?.maxAgeDays ? opts.maxAgeDays * 24 * 60 * 60 * 1000 : maxAgeMs();
  if (Date.now() - verifiedAt > cap) return 'stale';
  return 'fresh';
}

export interface FreshnessReport {
  ok: boolean;
  stale: { id: string; reason: string }[];
  refs: LegalRef[];
}

/**
 * Pull the candidate refs from `legal_references` and bucket them. The
 * caller passes the IDs it intends to feed into the prompt — we fetch
 * the rows so we can both classify them AND return them for downstream
 * substitution / annotation.
 */
export async function checkRefFreshness(
  supabase: SupabaseClient,
  refIds: string[],
  opts?: { maxAgeDays?: number }
): Promise<FreshnessReport> {
  const ids = refIds.filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return { ok: true, stale: [], refs: [] };

  const { data, error } = await supabase
    .from('legal_references')
    .select('id, category, subcategory, law_name, section, summary, source_url, verification_status, last_verified, verified_url')
    .in('id', ids);
  if (error || !data) {
    // Fail-open: if the freshness check itself errors, we don't block
    // the user. Treat refs as unknown — caller decides whether to
    // proceed with the original payload or fall back.
    return { ok: true, stale: [], refs: [] };
  }

  const refs = data as LegalRef[];
  const stale: { id: string; reason: string }[] = [];
  for (const ref of refs) {
    const f = freshnessOf(ref, opts);
    if (f === 'fresh') continue;
    const reason = f === 'broken'
      ? `verification_status=${ref.verification_status}`
      : !ref.last_verified
        ? 'never verified'
        : !FRESH_STATUSES.has((ref.verification_status || '').toLowerCase())
          ? `verification_status=${ref.verification_status}`
          : 'last_verified older than threshold';
    stale.push({ id: ref.id, reason });
  }
  return { ok: stale.length === 0, stale, refs };
}

/**
 * Synchronous refresh — calls Perplexity with a hard 5 s timeout. If
 * it returns in time we apply the same auto-overwrite logic the admin
 * `/api/admin/legal-refs/verify` endpoint uses. If it doesn't, we
 * return the row as-is so the user-facing flow keeps moving.
 *
 * Never throws — every failure path returns the latest DB copy.
 */
export async function refreshSingleRef(
  supabase: SupabaseClient,
  refId: string
): Promise<LegalRef | null> {
  const { data: ref } = await supabase
    .from('legal_references')
    .select('id, category, subcategory, law_name, section, summary, source_url, source_type, created_at, verification_status, last_verified, verified_url')
    .eq('id', refId)
    .maybeSingle();
  if (!ref) return null;

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return ref as LegalRef;

  const yearMatch = (ref.created_at as string | undefined)?.match(/^(\d{4})/);
  const year = yearMatch ? yearMatch[1] : 'unknown';
  const titleParts = [ref.law_name, ref.section].filter(Boolean).join(' — ');
  const prompt = [
    `Verify this UK legal citation:`,
    `title='${titleParts}',`,
    `source='${ref.source_type || 'unknown'}' (${year}),`,
    `current URL='${ref.source_url}'.`,
    `Confirm: (a) does the URL still resolve to the right document,`,
    `(b) is the citation accurate,`,
    `(c) has it been superseded by a newer reference.`,
    `Return STRICT JSON only, no markdown, no commentary:`,
    `{"valid": bool, "current_url": string|null, "superseded_by": string|null, "confidence": "high"|"medium"|"low", "notes": string}`,
  ].join(' ');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: 'You are a UK legal-citation verification assistant. Return STRICT JSON only — no markdown, no commentary. If unsure, set confidence to "low" and explain in notes.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return ref as LegalRef;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return ref as LegalRef;
    const parsed = JSON.parse(match[0]);
    const conf = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low' ? parsed.confidence : 'low';

    const update: Record<string, unknown> = {
      last_verified: new Date().toISOString(),
      verification_notes: typeof parsed.notes === 'string' ? parsed.notes : null,
    };
    if (typeof parsed.current_url === 'string') update.verified_url = parsed.current_url;

    let newStatus: string;
    if (conf === 'high' && typeof parsed.superseded_by === 'string') {
      newStatus = 'superseded';
    } else if (conf === 'high' && parsed.valid === false && typeof parsed.current_url === 'string') {
      update.source_url = parsed.current_url;
      newStatus = 'updated';
    } else if (conf === 'medium') {
      newStatus = 'needs_review';
    } else if (conf === 'low') {
      newStatus = 'broken';
    } else {
      newStatus = parsed.valid ? 'verified' : 'broken';
    }
    update.verification_status = newStatus;

    const { data: updated } = await supabase
      .from('legal_references')
      .update(update)
      .eq('id', refId)
      .select('id, category, subcategory, law_name, section, summary, source_url, verification_status, last_verified, verified_url')
      .maybeSingle();
    return (updated as LegalRef) ?? (ref as LegalRef);
  } catch {
    clearTimeout(timer);
    return ref as LegalRef;
  }
}

/**
 * Pick a fresh substitute in the same category. Used when a ref the
 * engine intended to cite is stale-after-refresh — we'd rather replace
 * it with a working sibling than strip it entirely. Falls back to
 * `null` if none found, in which case the caller strips the citation
 * and adds a footer note.
 */
export async function findFreshSubstitute(
  supabase: SupabaseClient,
  category: string,
  excludeIds: string[]
): Promise<LegalRef | null> {
  if (!category) return null;
  let query = supabase
    .from('legal_references')
    .select('id, category, subcategory, law_name, section, summary, source_url, verification_status, last_verified, verified_url')
    .eq('category', category)
    .in('verification_status', ['current', 'updated', 'verified'])
    .order('last_verified', { ascending: false })
    .limit(20);
  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.map((id) => `"${id}"`).join(',')})`);
  }
  const { data } = await query;
  if (!data || data.length === 0) return null;
  // Filter to refs that pass the freshness check (last_verified within window).
  for (const row of data as LegalRef[]) {
    if (freshnessOf(row) === 'fresh') return row;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  TIERED FRESHNESS + CATEGORY FALLBACK CHAIN                                 */
/* -------------------------------------------------------------------------- */
/*
 * 503-softening (PR — make B2B 503 essentially never).
 *
 * The pre-flight guardrail above is binary: a ref either passes the 14-day
 * window or it doesn't. In practice the founder's verification cron runs
 * daily but third-party rate limits + Perplexity flakes occasionally
 * leave a category with NO ref freshly verified in the last fortnight,
 * which forces a 503 even though we have a perfectly serviceable copy
 * verified 21 days ago.
 *
 * `freshnessTier` returns the freshest tier a ref qualifies under so
 * the engine can decide:
 *   - tier 1 (≤14d): use silently
 *   - tier 2 (15-30d): use + emit "within acceptable bounds" warning
 *   - tier 3 (31-60d): use + emit "stronger" warning
 *   - tier 4 (61-90d): use + emit "critical" warning
 *   - null: ineligible status, never verified, or older than 90d
 *
 * `findTieredSubstitute` walks tier 1 → 4 and returns the first fresh
 * substitute it finds in the same category, plus the tier it qualified
 * under (so the caller can emit the right warning).
 *
 * `CATEGORY_FALLBACK_CHAINS` lets a stale category borrow from a
 * legally-adjacent neighbour. Energy + broadband + mobile all fall back
 * to "general" (which holds CRA 2015, CCA 1974 — pan-sector statutes
 * that apply regardless of vertical). Travel + rail share. Finance +
 * insurance share. The chains were chosen so that every fallback is
 * legally defensible: a CRA 2015 citation is correct on an energy
 * dispute even when there's no fresh Gas Act ref.
 */

export const CATEGORY_FALLBACK_CHAINS: Record<string, string[]> = {
  energy: ['utilities', 'general'],
  utilities: ['general'],
  broadband: ['telecoms', 'general'],
  telecoms: ['general'],
  mobile: ['telecoms', 'general'],
  finance: ['banking', 'general'],
  banking: ['finance', 'general'],
  insurance: ['finance', 'general'],
  travel: ['general'],
  rail: ['travel', 'general'],
  parking: ['general'],
  council_tax: ['general'],
  hmrc: ['general'],
  dvla: ['general'],
  nhs: ['general'],
  gym: ['general'],
  debt: ['finance', 'general'],
  general: [],
};

/**
 * Classify a ref by the freshest tier it qualifies under. Returns
 * null when the ref is unusable (broken/superseded status, missing
 * last_verified, ineligible verification_status, or older than the
 * tier-4 cap of 90 days).
 *
 * Tier 1's cap is read from LEGAL_REF_MAX_AGE_DAYS (defaults to 14).
 * Tiers 2-4 are fixed at 30/60/90 days.
 */
export function freshnessTier(ref: LegalRef, now: Date = new Date()): FreshnessTier | null {
  if (!ref) return null;
  const status = (ref.verification_status || '').toLowerCase();
  if (status === 'broken' || status === 'superseded') return null;
  if (!FRESH_STATUSES.has(status)) return null;
  if (!ref.last_verified) return null;
  const verifiedAt = new Date(ref.last_verified).getTime();
  if (!Number.isFinite(verifiedAt)) return null;
  const ageMs = now.getTime() - verifiedAt;
  if (ageMs < 0) return { tier: 1, ageDays: 0 };
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const tier1Cap = tier1MaxDays();
  // Tier 1 follows operator configuration; tiers 2-4 are product-fixed.
  if (ageDays <= tier1Cap) return { tier: 1, ageDays };
  if (ageDays <= 30) return { tier: 2, ageDays };
  if (ageDays <= 60) return { tier: 3, ageDays };
  if (ageDays <= 90) return { tier: 4, ageDays };
  return null;
}

/**
 * Build the human-readable `_compliance_warnings` string for a ref
 * cited under tier 2-4. Tier 1 returns null (no warning needed).
 */
export function tierWarning(ref: LegalRef, t: FreshnessTier): string | null {
  if (t.tier === 1) return null;
  const name = ref.law_name || 'statute';
  if (t.tier === 2) {
    return `Statute '${name}' last verified ${t.ageDays} days ago — within acceptable bounds but flagged for review`;
  }
  if (t.tier === 3) {
    return `Statute '${name}' last verified ${t.ageDays} days ago — stronger review recommended before relying on quantitative figures`;
  }
  // tier 4
  return `Statute '${name}' last verified ${t.ageDays} days ago — CRITICAL: verify before sending`;
}

/**
 * Same as `findFreshSubstitute` but walks the tier cascade. Returns the
 * freshest tier-N substitute found (where N is the lowest tier with a
 * usable ref). The `tier` field tells the caller which warning to emit;
 * tier 1 means a "normal" substitute (no warning), tiers 2-4 require a
 * warning.
 *
 * Used by both pre-flight (substitute a stale ref the engine wanted to
 * cite) and category-chain fallback (borrow from a neighbour category).
 */
export async function findTieredSubstitute(
  supabase: SupabaseClient,
  category: string,
  excludeIds: string[],
): Promise<{ ref: LegalRef; tier: FreshnessTier } | null> {
  if (!category) return null;
  let query = supabase
    .from('legal_references')
    .select('id, category, subcategory, law_name, section, summary, source_url, verification_status, last_verified, verified_url')
    .eq('category', category)
    .in('verification_status', ['current', 'updated', 'verified'])
    .order('last_verified', { ascending: false })
    .limit(50);
  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.map((id) => `"${id}"`).join(',')})`);
  }
  const { data } = await query;
  if (!data || data.length === 0) return null;
  const now = new Date();
  let best: { ref: LegalRef; tier: FreshnessTier } | null = null;
  for (const row of data as LegalRef[]) {
    const t = freshnessTier(row, now);
    if (!t) continue;
    if (!best || t.tier < best.tier.tier || (t.tier === best.tier.tier && t.ageDays < best.tier.ageDays)) {
      best = { ref: row, tier: t };
      if (t.tier === 1) break; // can't beat tier 1
    }
  }
  return best;
}

/**
 * Walk the category fallback chain. Returns the first chain entry that
 * yields a tier 1-4 substitute. Caller is expected to emit a
 * `_compliance_warnings` line referencing the original category and
 * the fallback that was used.
 */
export async function findChainSubstitute(
  supabase: SupabaseClient,
  originalCategory: string,
  excludeIds: string[],
): Promise<{ ref: LegalRef; tier: FreshnessTier; fallbackCategory: string } | null> {
  const chain = CATEGORY_FALLBACK_CHAINS[originalCategory] ?? ['general'];
  for (const fallback of chain) {
    const found = await findTieredSubstitute(supabase, fallback, excludeIds);
    if (found) {
      return { ref: found.ref, tier: found.tier, fallbackCategory: fallback };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  POST-FLIGHT citation validation                                            */
/* -------------------------------------------------------------------------- */
/*
 * The pre-flight check (above) only feeds FRESH refs into the LLM
 * prompt. It does NOT stop the LLM from inventing a UK statute that
 * wasn't in the pool we provided — exactly the failure mode generic
 * LLMs exhibit when asked about UK law (Consumer Rights Act 2014,
 * "Section 999 of the CCA", etc.).
 *
 * Post-flight validation parses the LLM output for UK statute
 * references and cross-checks each against the fresh pool we fed in.
 * Anything not in the pool is rogue and either substituted or
 * stripped + warned.
 *
 * Patterns kept deliberately narrow — focus on the ~25 most-cited
 * UK statutes / regulators in this product. Cheap to add more.
 */

const CITATION_PATTERNS: RegExp[] = [
  /Consumer Rights Act\s+\d{4}/gi,
  /Consumer Credit Act\s+\d{4}/gi,
  /Sale of Goods Act\s+\d{4}/gi,
  /Supply of Goods and Services Act\s+\d{4}/gi,
  /Unfair Contract Terms Act\s+\d{4}/gi,
  /Consumer Contracts Regulations?\s+\d{4}/gi,
  /Communications Act\s+\d{4}/gi,
  /Gas Act\s+\d{4}/gi,
  /Electricity Act\s+\d{4}/gi,
  /Data Protection Act\s+\d{4}/gi,
  /Equality Act\s+\d{4}/gi,
  /Limitation Act\s+\d{4}/gi,
  /Local Government Finance Act\s+\d{4}/gi,
  /Protection of Freedoms Act\s+\d{4}/gi,
  /Financial Services and Markets Act\s+\d{4}/gi,
  /Payment Services Regulations?\s+\d{4}/gi,
  /Misrepresentation Act\s+\d{4}/gi,
  /Road Traffic Act\s+\d{4}/gi,
  /(?:UK|EU)\s*261\b/gi,
  /Regulation\s+\(EC\)\s+No\s+261\/2004/gi,
  /\bOfcom(?:'s)?(?:\s+(?:General Conditions|rules?|Standards|Code))?/gi,
  /\bOfgem(?:'s)?(?:\s+(?:Standards of Conduct|rules?|Code))?/gi,
  /\bOfwat\b/gi,
  /\bFCA\s+(?:Handbook|CONC|DISP|BCOBS|ICOBS|Consumer Duty)/gi,
  /\bICO\b/gi,
];

/**
 * Extract every UK statute / regulator citation that appears in a
 * piece of text. Case-insensitive dedup on surface form. Used to feed
 * `validateCitations`.
 */
export function extractCitations(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const seen = new Set<string>();
  for (const re of CITATION_PATTERNS) {
    const matches = text.match(re);
    if (!matches) continue;
    for (const m of matches) {
      const trimmed = m.trim();
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.add(trimmed);
    }
  }
  return [...found];
}

/**
 * Cross-check what the LLM cited against the fresh pool we fed in.
 * Case-insensitive substring match against `law_name` (either way —
 * cite contains pool law_name OR law_name contains cite).
 *
 * Anything not matched is rogue: a hallucinated act, a statute the LLM
 * dredged from training data, or a mis-spelled year.
 */
export function validateCitations(
  cited: string[],
  freshPool: { law_name: string; category?: string | null }[]
): { valid: string[]; rogue: string[] } {
  const haystack = freshPool
    .map((r) => (r.law_name || '').toLowerCase().trim())
    .filter(Boolean);
  const valid: string[] = [];
  const rogue: string[] = [];
  for (const c of cited) {
    const lc = c.toLowerCase().trim();
    const matched = haystack.some((h) => h.includes(lc) || lc.includes(h));
    if (matched) valid.push(c);
    else rogue.push(c);
  }
  return { valid, rogue };
}

/**
 * Pick the closest fresh-pool law_name as a substitute for each rogue
 * citation. Strategy: word-token overlap. Returns null for a rogue
 * when no fresh ref shares any 4+-char token with it (caller strips
 * rather than substitutes).
 */
export function planSubstitutions(
  rogue: string[],
  freshPool: { law_name: string; category?: string | null }[]
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const r of rogue) {
    const tokens = r
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    let best: { name: string; score: number } | null = null;
    for (const ref of freshPool) {
      const name = ref.law_name || '';
      const lc = name.toLowerCase();
      const score = tokens.reduce((s, t) => s + (lc.includes(t) ? 1 : 0), 0);
      if (score > 0 && (!best || score > best.score)) best = { name, score };
    }
    out[r] = best?.name ?? null;
  }
  return out;
}

/**
 * Strip or replace rogue citations in free-form text. Returns the
 * sanitised text and human-readable warnings.
 *
 * Substitutions[r]=string → replace; Substitutions[r]=null → strip.
 */
export function sanitiseLetter(
  letterText: string,
  rogueCitations: string[],
  substitutions: Record<string, string | null>
): { sanitised: string; warnings: string[] } {
  let out = letterText;
  const warnings: string[] = [];
  for (const rogue of rogueCitations) {
    const sub = substitutions[rogue];
    const escaped = rogue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    if (sub) {
      out = out.replace(re, sub);
      warnings.push(`Replaced unverified citation '${rogue}' with '${sub}'`);
    } else {
      out = out.replace(re, '');
      // Light cleanup: collapse orphaned " under , " or double spaces.
      out = out.replace(/\bunder\s*([,.;])/gi, '$1');
      out = out.replace(/\s{2,}/g, ' ');
      warnings.push(`Removed unverified citation: '${rogue}'`);
    }
  }
  return { sanitised: out.trim(), warnings };
}

/**
 * One-shot post-flight pass. Pure regex + substring; expected p95
 * well under 100ms. Caller is responsible for logging if it does
 * exceed 100ms — see B2C / B2B wiring.
 */
export function postFlightSanitise(
  letterText: string,
  freshPool: { law_name: string; category?: string | null }[]
): { sanitised: string; rogue: string[]; warnings: string[] } {
  const cited = extractCitations(letterText);
  const { rogue } = validateCitations(cited, freshPool);
  if (rogue.length === 0) return { sanitised: letterText, rogue: [], warnings: [] };
  const subs = planSubstitutions(rogue, freshPool);
  const { sanitised, warnings } = sanitiseLetter(letterText, rogue, subs);
  return { sanitised, rogue, warnings };
}
