/**
 * Pre-send guardrail for legal references used in citations.
 *
 * NOTE(after-β): If/when feat/legal-refs-pre-send-guardrail (PR β) lands,
 * the helper signature here may need adjusting to match β's call sites.
 * For now this file is the canonical entry point — both B2C complaint
 * generation and B2B dispute generation should call `assertCitable()`
 * before quoting a ref to a customer.
 *
 * The principle (PR ε): no ref is "fresh enough to cite" unless ALL of:
 *   1. last_verified IS NOT NULL AND newer than the configured age cutoff
 *   2. verification_status IN ('current','updated','verified')
 *   3. last_human_review_at IS NOT NULL — a founder has approved or
 *      hand-curated this ref at least once
 *
 * Thresholds:
 *   - B2B: 7 days (paid customers expect guaranteed-current law)
 *   - B2C: 14 days (lower stakes, better UX)
 *
 * Override via env: LEGAL_REF_MAX_AGE_DAYS_B2B / LEGAL_REF_MAX_AGE_DAYS_B2C.
 * Legacy LEGAL_REF_MAX_AGE_DAYS sets B2C if the B2C-specific var is unset.
 */

export type Surface = 'b2b' | 'b2c';

export interface CitableRef {
  id: string;
  law_name: string;
  source_url: string;
  verification_status?: string | null;
  last_verified?: string | null;
  last_human_review_at?: string | null;
}

export interface GuardrailResult {
  ok: boolean;
  reason?: string;
}

const VALID_STATUSES = new Set(['current', 'updated', 'verified']);

function maxAgeDays(surface: Surface): number {
  if (surface === 'b2b') {
    const v = process.env.LEGAL_REF_MAX_AGE_DAYS_B2B;
    const n = v ? Number(v) : 7;
    return Number.isFinite(n) && n > 0 ? n : 7;
  }
  const specific = process.env.LEGAL_REF_MAX_AGE_DAYS_B2C;
  const legacy = process.env.LEGAL_REF_MAX_AGE_DAYS;
  const raw = specific ?? legacy;
  const n = raw ? Number(raw) : 14;
  return Number.isFinite(n) && n > 0 ? n : 14;
}

export function evaluateRef(ref: CitableRef, surface: Surface, now: Date = new Date()): GuardrailResult {
  if (!ref.last_human_review_at) {
    return {
      ok: false,
      reason: `Ref ${ref.id} has never been human-reviewed. Refusing to cite.`,
    };
  }
  const status = ref.verification_status ?? '';
  if (!VALID_STATUSES.has(status)) {
    return {
      ok: false,
      reason: `Ref ${ref.id} has verification_status='${status}' (not in current/updated/verified).`,
    };
  }
  if (!ref.last_verified) {
    return { ok: false, reason: `Ref ${ref.id} has no last_verified timestamp.` };
  }
  const ageMs = now.getTime() - new Date(ref.last_verified).getTime();
  const maxMs = maxAgeDays(surface) * 24 * 60 * 60 * 1000;
  if (ageMs > maxMs) {
    return {
      ok: false,
      reason: `Ref ${ref.id} last_verified ${Math.round(ageMs / 86400000)} days ago, exceeds ${maxAgeDays(surface)}d cap for ${surface}.`,
    };
  }
  return { ok: true };
}

/**
 * Filter a list of refs to only those that are safe to cite. Drops the rest
 * silently — caller should check if the returned list is empty and react.
 */
export function filterCitable<T extends CitableRef>(refs: T[], surface: Surface): T[] {
  return refs.filter((r) => evaluateRef(r, surface).ok);
}

/**
 * Throw if a ref isn't citable. Use at the moment of quoting law to a
 * customer — it should be impossible to send a letter quoting a stale
 * or never-human-reviewed citation.
 */
export function assertCitable(ref: CitableRef, surface: Surface): void {
  const verdict = evaluateRef(ref, surface);
  if (!verdict.ok) {
    throw new Error(`[legal-refs-guardrail] ${verdict.reason}`);
  }
}
