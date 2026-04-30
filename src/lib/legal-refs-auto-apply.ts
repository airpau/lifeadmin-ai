/**
 * Tiered auto-apply for legal-reference corrections (PR η).
 *
 * Compliance principle: "No law should be cited that isn't 100% correct"
 * + "It should update laws if it knows they are correct" — reconciled to
 * "automate the mechanical, gate the semantic."
 *
 * This helper evaluates whether a pending row in `legal_ref_corrections`
 * (introduced by ε) is safe to auto-apply without founder click. It is
 * conservative by design: ALL THREE gates must pass.
 *
 *   Gate 1 — Risk score: enrichment_data.risk_score === 'low'
 *   Gate 2 — Source-text corroboration: fetched extracted_text contains
 *            the proposed law_name and the URL slug; for URL-only edits
 *            we additionally require a 301 redirect chain or a matching
 *            <link rel="canonical"> from the OLD url to the NEW url.
 *   Gate 3 — No semantic change: same domain, same statute year, same
 *            section number unless redirect chain proves identity.
 *
 * If you're tempted to widen these gates — don't. The "100% correct"
 * guarantee depends on this being conservative.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface LegalRefCorrection {
  id: string;
  // Schema uses `ref_id` (FK to legal_references.id). Earlier drafts of this
  // type used `legal_reference_id`, which silently broke the auto-apply
  // sweep — the canonical update never matched a row. See PR
  // feat/compliance-ops-from-dashboard for the fix.
  ref_id: string;
  status: string;
  before_law_name?: string | null;
  before_source_url?: string | null;
  before_section?: string | null;
  proposed_law_name?: string | null;
  proposed_source_url?: string | null;
  proposed_section?: string | null;
  enrichment_data?: EnrichmentData | null;
  enriched_at?: string | null;
  reviewed_by?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface EnrichmentData {
  risk_score?: 'low' | 'medium' | 'high' | null;
  extracted_text?: string | null;
  fetched_redirect_chain?: string[] | null;
  fetched_canonical_url?: string | null;
  fetched_at?: string | null;
  [k: string]: unknown;
}

export type FailedGate =
  | 'risk_high'
  | 'no_enrichment'
  | 'url_text_mismatch'
  | 'corroboration_missing'
  | 'no_redirect_proof'
  | 'semantic_change';

export interface AutoApplyDecision {
  shouldAutoApply: boolean;
  reasons: string[];
  failed_gates: FailedGate[];
}

function safeUrl(s: string | null | undefined): URL | null {
  if (!s) return null;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function normaliseDomain(host: string): string {
  return host.replace(/^www\./i, '').toLowerCase();
}

function urlSlug(s: string | null | undefined): string {
  if (!s) return '';
  const u = safeUrl(s);
  if (!u) return '';
  // last 2 path segments give us a useful slug e.g. "ukpga/2015/15"
  const parts = u.pathname.split('/').filter(Boolean);
  return parts.slice(-3).join('/').toLowerCase();
}

function extractYear(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? m[1] : null;
}

function extractSection(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/\b(?:s\.?|sec(?:tion)?\.?)\s*(\d+[A-Za-z]?)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function isUrlOnlyChange(c: LegalRefCorrection): boolean {
  const nameSame =
    (c.before_law_name ?? '').trim().toLowerCase() ===
    (c.proposed_law_name ?? '').trim().toLowerCase();
  const urlChanged =
    (c.before_source_url ?? '') !== (c.proposed_source_url ?? '');
  return nameSame && urlChanged;
}

function redirectChainProves(
  chain: string[] | null | undefined,
  fromUrl: string | null | undefined,
  toUrl: string | null | undefined,
): boolean {
  if (!chain || chain.length < 2 || !fromUrl || !toUrl) return false;
  // Compare canonical-ish forms (strip protocol-trailing slash)
  const norm = (u: string) => u.replace(/\/$/, '').toLowerCase();
  const first = norm(chain[0] ?? '');
  const last = norm(chain[chain.length - 1] ?? '');
  return first === norm(fromUrl) && last === norm(toUrl);
}

function canonicalProves(
  canonical: string | null | undefined,
  toUrl: string | null | undefined,
): boolean {
  if (!canonical || !toUrl) return false;
  const norm = (u: string) => u.replace(/\/$/, '').toLowerCase();
  return norm(canonical) === norm(toUrl);
}

/**
 * Evaluate whether a correction passes all three gates and is safe to
 * auto-apply. Pure function over the correction row — no DB reads here
 * (the caller is expected to have hydrated `enrichment_data`). The
 * supabase client is accepted for future extensibility (e.g. checking
 * sibling-row history) but is not currently used.
 */
export async function evaluateCorrection(
  _supabase: SupabaseClient,
  correction: LegalRefCorrection,
): Promise<AutoApplyDecision> {
  const reasons: string[] = [];
  const failed: FailedGate[] = [];

  // -------- Gate 1: risk score --------
  const enr = correction.enrichment_data;
  if (!enr || typeof enr !== 'object') {
    failed.push('no_enrichment');
    return {
      shouldAutoApply: false,
      reasons: ['no enrichment_data attached — cannot auto-apply'],
      failed_gates: failed,
    };
  }
  if (enr.risk_score !== 'low') {
    failed.push('risk_high');
    reasons.push(
      `risk_score=${enr.risk_score ?? 'null'} (need 'low' to auto-apply)`,
    );
  } else {
    reasons.push("gate 1 passed: enrichment risk_score='low'");
  }

  // -------- Gate 2: source-text corroboration --------
  const extracted = (enr.extracted_text ?? '').toString().toLowerCase();
  const proposedName = (correction.proposed_law_name ?? '').trim();
  const proposedUrl = correction.proposed_source_url ?? '';
  const beforeUrl = correction.before_source_url ?? '';
  const slug = urlSlug(proposedUrl);

  if (isUrlOnlyChange(correction)) {
    // URL-only path: need redirect proof or canonical proof.
    const redirectOk = redirectChainProves(
      enr.fetched_redirect_chain,
      beforeUrl,
      proposedUrl,
    );
    const canonicalOk = canonicalProves(enr.fetched_canonical_url, proposedUrl);
    if (!redirectOk && !canonicalOk) {
      failed.push('no_redirect_proof');
      reasons.push(
        'URL-only change but no 301 redirect chain and no matching canonical URL',
      );
    } else {
      reasons.push(
        redirectOk
          ? 'gate 2 passed: 301 redirect chain proves OLD→NEW url'
          : 'gate 2 passed: <link rel="canonical"> matches proposed url',
      );
    }
  } else {
    // Name (and possibly URL) change: corroborate text content.
    if (!extracted) {
      failed.push('corroboration_missing');
      reasons.push('no extracted_text from source — cannot corroborate');
    } else {
      const nameOk =
        proposedName.length > 0 &&
        extracted.includes(proposedName.toLowerCase());
      const slugOk = slug.length > 0 && extracted.includes(slug);
      if (!nameOk || !slugOk) {
        failed.push('url_text_mismatch');
        reasons.push(
          `extracted_text missing ${[
            !nameOk ? `law_name="${proposedName}"` : null,
            !slugOk ? `slug="${slug}"` : null,
          ]
            .filter(Boolean)
            .join(' and ')}`,
        );
      } else {
        reasons.push(
          'gate 2 passed: source-text contains both proposed law_name and URL slug',
        );
      }
    }
  }

  // -------- Gate 3: no semantic change --------
  const beforeUrlObj = safeUrl(beforeUrl);
  const proposedUrlObj = safeUrl(proposedUrl);
  if (beforeUrlObj && proposedUrlObj) {
    const beforeDomain = normaliseDomain(beforeUrlObj.hostname);
    const proposedDomain = normaliseDomain(proposedUrlObj.hostname);
    if (beforeDomain !== proposedDomain) {
      failed.push('semantic_change');
      reasons.push(
        `domain change ${beforeDomain} → ${proposedDomain} — semantic, not auto-applicable`,
      );
    }
  }

  const beforeYear = extractYear(correction.before_law_name);
  const proposedYear = extractYear(correction.proposed_law_name);
  if (beforeYear && proposedYear && beforeYear !== proposedYear) {
    failed.push('semantic_change');
    reasons.push(
      `statute year changed ${beforeYear} → ${proposedYear} — semantic`,
    );
  }

  const beforeSec = extractSection(
    correction.before_section ?? correction.before_law_name,
  );
  const proposedSec = extractSection(
    correction.proposed_section ?? correction.proposed_law_name,
  );
  if (beforeSec && proposedSec && beforeSec !== proposedSec) {
    // Allow if redirect chain demonstrates identity (rare).
    const redirectOk = redirectChainProves(
      enr.fetched_redirect_chain,
      beforeUrl,
      proposedUrl,
    );
    if (!redirectOk) {
      failed.push('semantic_change');
      reasons.push(
        `section number changed s.${beforeSec} → s.${proposedSec} without redirect proof`,
      );
    } else {
      reasons.push(
        `section change tolerated because redirect chain proves identity`,
      );
    }
  }

  if (!failed.includes('semantic_change')) {
    reasons.push(
      'gate 3 passed: no domain / year / section change detected',
    );
  }

  const shouldAutoApply = failed.length === 0;
  return {
    shouldAutoApply,
    reasons,
    // dedupe failed gates
    failed_gates: Array.from(new Set(failed)),
  };
}

/**
 * Helper: try-catch wrapped read of a single correction row plus its
 * enrichment payload. Returns null if the table doesn't exist (ε not
 * merged yet) or the row isn't found.
 */
export async function loadCorrectionSafe(
  supabase: SupabaseClient,
  id: string,
): Promise<LegalRefCorrection | null> {
  try {
    const { data, error } = await supabase
      .from('legal_ref_corrections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return null;
    return (data as LegalRefCorrection) ?? null;
  } catch {
    return null;
  }
}

/**
 * Apply a correction that has passed evaluateCorrection. Wrapped in
 * try/catch so a missing sibling table never errors the caller.
 *
 * Returns true if the apply succeeded end-to-end.
 */
export async function applyCorrection(
  supabase: SupabaseClient,
  correction: LegalRefCorrection,
  decision: AutoApplyDecision,
): Promise<boolean> {
  if (!decision.shouldAutoApply) return false;

  // 1. Overwrite the canonical legal_references row.
  try {
    const update: Record<string, unknown> = {};
    if (correction.proposed_law_name)
      update.law_name = correction.proposed_law_name;
    if (correction.proposed_source_url)
      update.source_url = correction.proposed_source_url;
    if (correction.proposed_section)
      update.section = correction.proposed_section;
    if (Object.keys(update).length === 0) return false;
    const { error } = await supabase
      .from('legal_references')
      .update(update)
      .eq('id', correction.ref_id);
    if (error) {
      console.error('[auto-apply] legal_references update failed', error);
      return false;
    }
  } catch (e) {
    console.error('[auto-apply] legal_references update threw', e);
    return false;
  }

  // 2. Mark the correction row auto_applied.
  try {
    await supabase
      .from('legal_ref_corrections')
      .update({
        status: 'auto_applied',
        applied_at: new Date().toISOString(),
        reviewed_by: 'system-auto-apply',
        notes: decision.reasons.join(' | '),
      })
      .eq('id', correction.id);
  } catch (e) {
    console.warn('[auto-apply] correction status update skipped', e);
  }

  // 3. Audit row in legal_ref_verifications (γ). Soft if missing.
  try {
    await supabase.from('legal_ref_verifications').insert({
      legal_reference_id: correction.ref_id,
      verifier: 'auto-apply-low-risk',
      changes: {
        before: {
          law_name: correction.before_law_name,
          source_url: correction.before_source_url,
          section: correction.before_section,
        },
        after: {
          law_name: correction.proposed_law_name,
          source_url: correction.proposed_source_url,
          section: correction.proposed_section,
        },
      },
      reasons: decision.reasons,
      verified_at: new Date().toISOString(),
    });
  } catch {
    // γ table may not exist yet — silent.
  }

  return true;
}
