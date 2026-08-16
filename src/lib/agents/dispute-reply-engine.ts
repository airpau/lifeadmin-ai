/**
 * Unified dispute-reply engine.
 *
 * Single source of truth for drafting a reply to an ongoing dispute
 * thread (Pocket Agent on Telegram + WhatsApp, dashboard "Draft reply",
 * any future surface). Every reply produced here is grounded in UK
 * statute / regulator citations pulled from the `legal_references`
 * table — the same pipeline the initial complaint letter uses.
 *
 * Architectural rule (do not regress):
 *   PLAIN-PROSE REPLIES WITHOUT CITATIONS ARE A PRODUCT FAILURE.
 *
 * The Pocket Agent's old reply path bypassed the legal grounding
 * entirely and generated freehand prose. Founders had to ask the bot
 * "is there any legal citation needed?" before getting a proper
 * solicitor-style letter. This engine fixes that by routing every
 * reply through `generateComplaintLetter` with a curated
 * `verifiedLegalRefs` block — exactly the same way the dashboard
 * letter generator at /api/complaints/generate works.
 *
 * Inputs are loose by design (Telegram and WhatsApp tools have
 * different shapes). The engine normalises them, runs the retrieval +
 * substitution pipeline, calls the shared engine, and returns the
 * letter text + the citations that were actually grounded.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateComplaintLetter,
  type ComplaintInput,
  type ComplaintOutput,
} from './complaints-agent';
import { CITATION_PERMISSIVE_STATUSES } from '@/lib/legal-refs-statuses';
import { detectReplyCategories } from './dispute-reply-categories';
import { loadFreshLegalRefs } from '@/lib/legal-data/freshness-gate';
import {
  checkRefFreshness,
  refreshSingleRef,
  freshnessTier,
  tierWarning,
  findTieredSubstitute,
  findChainSubstitute,
  postFlightSanitise,
} from '@/lib/legal-refs-guardrail';

/**
 * Live re-check budget for the pre-flight guardrail.
 *
 * The B2C web generator (`/api/complaints/generate`) attempts a
 * synchronous Perplexity re-check for every stale ref. This engine also
 * serves the conversational surfaces (WhatsApp / Telegram Pocket Agent),
 * where a Twilio/Telegram round-trip is already waiting on a Sonnet call,
 * so we cap the number of 5-second re-checks per request. Stale refs
 * beyond the cap are NOT used blind — they fall straight through to the
 * substitute / category-chain / strip path, which is stricter than a
 * re-check, just cheaper and faster.
 */
const MAX_INLINE_REFRESHES = 3;

/**
 * Shape of a `legal_references` row as selected by this engine. Loose on
 * purpose — the retrieval SELECT and the guardrail's substitute helpers
 * return slightly different column sets, and the prompt builder only
 * reads a handful of them.
 */
type RetrievedRef = {
  id: string;
  category?: string | null;
  law_name?: string | null;
  section?: string | null;
  summary?: string | null;
  source_url?: string | null;
  escalation_body?: string | null;
  applies_to?: string[] | null;
  verification_status?: string | null;
};

export { detectReplyCategories };

export interface DraftDisputeReplyInput {
  /** Provider being replied to (e.g. "Octopus Energy"). */
  providerName: string;
  /** Customer name to sign off as. Required for natural letter prose. */
  customerName: string;
  /** Optional — used in the prompt header / address block. */
  customerAddress?: string | null;
  /** What the dispute is about (background only — not the reply body). */
  issueSummary: string;
  /** What the user is asking for. */
  desiredOutcome: string;
  /** Letter type from the dispute record (energy_dispute / broadband_complaint / etc.). */
  issueType?: string | null;
  /** Provider type from the dispute record (energy / broadband / finance / etc.). */
  providerType?: string | null;
  /**
   * The supplier's most recent message — the message we are replying TO.
   * Empty/undefined means this is a fresh letter, not a reply.
   */
  supplierLatestMessage?: string | null;
  /** Optional last outbound letter, for context only. */
  lastOutboundLetter?: string | null;
  /** Free-text adjustment from the user ("make it firmer", "shorter", etc.). */
  userTweakBrief?: string | null;
  /** Tone preference. Maps to the existing complaint engine's tone semantics. */
  tone?: 'auto' | 'friendly' | 'balanced' | 'firm' | null;
  /**
   * If supplied and resolves to an authenticated user, the engine will log
   * a `business_log` row when the legal_references table returns no
   * coverage for the scenario (so the founder sees the gap).
   */
  userId?: string | null;
  /** Surface that called the engine — for telemetry. */
  surface: 'telegram' | 'whatsapp' | 'dashboard' | 'chatbot' | 'cron' | 'test';
}

export interface DraftDisputeReplyResult extends ComplaintOutput {
  /** Categories that drove the legal_references query. */
  categoriesUsed: string[];
  /** Number of refs the retrieval pipeline surfaced (post-substitution). */
  groundedRefCount: number;
  /** True when no refs were available even after fallback. */
  groundingGap: boolean;
  /**
   * Human-readable guardrail warnings — tier 2-4 freshness caveats,
   * category-chain substitutions, and post-flight citation removals.
   * Additive and optional: existing callers can ignore it.
   */
  guardrailWarnings?: string[];
  /** Citations the model produced that were not in the supplied pool. */
  rogueCitations?: string[];
}

/**
 * The unified entry point. Pocket Agent (Telegram + WhatsApp) and the
 * dashboard reply path both call this. Output is always grounded in the
 * shared `legal_references` table — never freehand prose.
 */
export async function generateDisputeReply(
  supabase: SupabaseClient,
  input: DraftDisputeReplyInput,
): Promise<DraftDisputeReplyResult> {
  const isReply = (input.supplierLatestMessage ?? '').trim().length > 0;

  // 1. Resolve categories.
  const scenarioText = [
    input.issueSummary,
    input.providerName,
    input.desiredOutcome,
    input.supplierLatestMessage ?? '',
    input.userTweakBrief ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const categories = detectReplyCategories({
    issueType: input.issueType,
    providerType: input.providerType,
    scenarioText,
  });

  // 2. Pull candidate refs. Permissive statuses — we want to cover the
  //    long tail (needs_review etc.) the same way the consumer engine
  //    does. The engine prompt itself flags review-state rows.
  const { data: rawRefs } = await supabase
    .from('legal_references')
    .select('id, category, law_name, section, summary, source_url, escalation_body, applies_to, verification_status')
    .in('category', categories)
    .in('verification_status', CITATION_PERMISSIVE_STATUSES as unknown as string[]);

  let relevantRefs = (rawRefs || []).filter((r: any) => {
    if (r.category !== 'general') return true;
    const appliesTo: string[] = Array.isArray(r.applies_to) ? r.applies_to : [];
    if (appliesTo.length === 0) return true;
    return appliesTo.some((a: string) => categories.includes(String(a).toLowerCase()));
  });

  // 3. Last-resort fallback: if nothing matched, pull the broad
  //    'general' set so we never produce a citation-less reply.
  if (relevantRefs.length === 0) {
    const { data: fallback } = await supabase
      .from('legal_references')
      .select('id, category, law_name, section, summary, source_url, escalation_body, applies_to, verification_status')
      .eq('category', 'general')
      .in('verification_status', CITATION_PERMISSIVE_STATUSES as unknown as string[])
      .limit(20);
    relevantRefs = fallback || [];

    // Log the gap so the founder can extend coverage.
    if (input.userId) {
      void supabase.from('business_log').insert({
        category: 'compliance_grounding_gap',
        action: 'dispute_reply_no_category_match',
        details: {
          user_id: input.userId,
          surface: input.surface,
          provider: input.providerName,
          issue_type: input.issueType,
          provider_type: input.providerType,
          categories_attempted: categories,
          fallback_count: relevantRefs.length,
        },
      });
    }
  }

  // ---- PRE-FLIGHT GUARDRAIL ------------------------------------------
  // Same contract as `/api/complaints/generate` and `/v1/disputes`:
  // check every ref we intend to put in the prompt, try to salvage the
  // stale ones, substitute within the category, then along the category
  // fallback chain, and strip anything that cannot be salvaged. Never
  // blocks — a reply always goes out, worst case with a footer caveat.
  //
  // Added 16 Aug 2026 so this engine (Pocket Agent on WhatsApp and
  // Telegram, plus the dashboard "Draft reply" path) is covered by the
  // same guardrail as the web generator. /legal/how-we-cite previously
  // carved this surface out of its scope statement.
  const guardrailWarnings: string[] = [];
  let guardrailFooterNote: string | null = null;
  if (relevantRefs.length > 0) {
    try {
      const refs = relevantRefs as RetrievedRef[];
      const refIds = refs
        .map((r) => r.id)
        .filter((x: unknown): x is string => typeof x === 'string');
      const freshness = await checkRefFreshness(supabase, refIds);
      if (!freshness.ok && freshness.stale.length > 0) {
        const usedIds = new Set<string>(refIds);
        let refreshBudget = MAX_INLINE_REFRESHES;
        for (const { id: staleId, reason } of freshness.stale) {
          // 1. Live re-check (budget-capped).
          if (refreshBudget > 0) {
            refreshBudget--;
            const refreshed = await refreshSingleRef(supabase, staleId);
            if (refreshed) {
              const t = freshnessTier(refreshed);
              if (t) {
                const idx = refs.findIndex((r) => r.id === staleId);
                if (idx >= 0) refs[idx] = { ...refs[idx], ...refreshed };
                const w = tierWarning(refreshed, t);
                if (w) guardrailWarnings.push(w);
                continue;
              }
            }
          }

          const original = refs.find((r) => r.id === staleId);
          const category = original?.category ?? undefined;

          // 2. Fresher substitute in the same category.
          if (category) {
            const sub = await findTieredSubstitute(supabase, category, [...usedIds]);
            if (sub) {
              const idx = refs.findIndex((r) => r.id === staleId);
              if (idx >= 0) {
                refs[idx] = {
                  ...sub.ref,
                  applies_to: original?.applies_to || [],
                };
                usedIds.add(sub.ref.id);
              }
              const w = tierWarning(sub.ref, sub.tier);
              if (w) guardrailWarnings.push(w);
              continue;
            }

            // 3. Legally-adjacent category (energy → utilities → general).
            const chained = await findChainSubstitute(supabase, category, [...usedIds]);
            if (chained) {
              const idx = refs.findIndex((r) => r.id === staleId);
              if (idx >= 0) {
                refs[idx] = {
                  ...chained.ref,
                  applies_to: original?.applies_to || [],
                };
                usedIds.add(chained.ref.id);
              }
              guardrailWarnings.push(
                `No fresh ref for '${category}' — substituted with '${chained.fallbackCategory}' (${chained.ref.law_name})`,
              );
              const w = tierWarning(chained.ref, chained.tier);
              if (w) guardrailWarnings.push(w);
              continue;
            }
          }

          // 4. Nothing usable — strip it rather than cite it blind.
          const idx = refs.findIndex((r) => r.id === staleId);
          if (idx >= 0) refs.splice(idx, 1);
          guardrailFooterNote =
            "We couldn't verify the current statute reference for this point. Please confirm before sending.";
          void supabase.from('business_log').insert({
            category: 'legal_intelligence',
            action: 'guardrail_stripped_stale_ref',
            details: {
              user_id: input.userId ?? null,
              surface: input.surface,
              ref_id: staleId,
              reason,
              company: input.providerName,
            },
          });
        }
      }
    } catch (err) {
      // Fail-open, same as the web generator: a guardrail error must not
      // cost the user their reply. The post-flight pass below still runs.
      console.warn(
        '[guardrail] dispute-reply pre-flight failed (non-fatal):',
        (err as Error).message,
      );
    }
  }

  // Phase 4 — single freshness gate. Records audit rows for every ref
  // we're about to cite, alongside the B2C and B2B paths. Best-effort.
  try {
    const finalRefIds = relevantRefs.map((r: any) => r.id).filter((x: unknown): x is string => typeof x === 'string');
    if (finalRefIds.length > 0) {
      await loadFreshLegalRefs(finalRefIds, { caller: 'b2c', allowStale: true });
    }
  } catch (err) {
    console.warn('[freshness-gate] dispute-reply audit failed (non-fatal):', (err as Error).message);
  }

  const verifiedLegalRefs = relevantRefs.length > 0
    ? relevantRefs
        .map((r: any) => {
          const reviewFlag = r.verification_status === 'needs_review'
            ? ' [UNDER REVIEW — quantitative values may be slightly out-of-date; cite the rule and use directional language for specific figures]'
            : '';
          return `- ${r.law_name}${r.section ? `, ${r.section}` : ''}: ${r.summary || ''}${r.escalation_body ? ` (Escalate to: ${r.escalation_body})` : ''}${reviewFlag} [Source: ${r.source_url}]`;
        })
        .join('\n')
    : '';

  // 4. Build thread context for the shared engine. The complaints
  //    engine treats threadContext as background AND as a directive
  //    that this is a follow-up letter — exactly the right semantics
  //    for a dispute reply.
  const threadParts: string[] = [];
  if (isReply) {
    threadParts.push(
      `\nSUPPLIER'S LATEST MESSAGE — the message you are replying to (received recently):\n"""\n${(input.supplierLatestMessage ?? '').slice(0, 4000)}\n"""`,
    );
  }
  if (input.lastOutboundLetter) {
    threadParts.push(
      `\nThe customer's previous letter to this supplier (background only — do NOT quote or paraphrase):\n"""\n${String(input.lastOutboundLetter).slice(0, 1500)}\n"""`,
    );
  }
  if (input.userTweakBrief) {
    threadParts.push(`\nUser tweak instruction: ${input.userTweakBrief}`);
  }

  const tone = input.tone ?? 'auto';
  const toneLine =
    tone === 'firm'
      ? '\nTONE DIRECTIVE: firm but professional. Cite the most relevant statute. Set a 14-day deadline. Name the specific ombudsman as the next step.'
      : tone === 'friendly'
      ? '\nTONE DIRECTIVE: warm, polite, concise — but UK consumer law citations are still REQUIRED where they apply (one or two woven naturally into the prose). Never plain prose without grounding.'
      : tone === 'balanced'
      ? '\nTONE DIRECTIVE: neutral, businesslike. Weave the most relevant 1-2 statutes into the prose.'
      : '\nTONE DIRECTIVE: pick the register that matches the supplier\'s message — but always ground at least one UK statute or regulator citation in the prose, even on a holding/info-request reply.';

  const replyDirective = isReply
    ? '\n\nCRITICAL — REPLY MODE: This is a reply on an ongoing dispute. Open with "Further to your message of [date]" or similar. Reference what the supplier said. Then state the consumer\'s position with at least one UK statute/regulator citation grounded in the RELEVANT UK CONSUMER LAW block above. Never produce a plain-prose reply without citations.'
    : '';

  const threadContext = threadParts.join('\n') + toneLine + replyDirective;

  // 5. Call the shared engine. Same model, same JSON contract, same
  //    citation-guarantee post-flight as the initial complaint letter.
  const complaintInput: ComplaintInput = {
    companyName: input.providerName,
    issueDescription: input.issueSummary,
    desiredOutcome: input.desiredOutcome,
    feedback: input.userTweakBrief ?? undefined,
    previousLetter: input.lastOutboundLetter ?? undefined,
    letterType: input.issueType ?? undefined,
    threadContext,
    verifiedLegalRefs,
    voice: 'consumer_to_merchant',
  };

  const out = await generateComplaintLetter(complaintInput);

  // ---- POST-FLIGHT GUARDRAIL -----------------------------------------
  // Pre-flight only controls what goes INTO the prompt. The model can
  // still dredge a fabricated or stale UK statute out of training data.
  // Pure regex + substring, no I/O — same pass the web generator runs.
  let rogueCitations: string[] = [];
  if (out.letter && relevantRefs.length > 0) {
    const pf = postFlightSanitise(
      out.letter,
      (relevantRefs as RetrievedRef[]).map((r) => ({
        law_name: r.law_name ?? '',
        category: r.category ?? null,
      })),
    );
    if (pf.rogue.length > 0) {
      out.letter = pf.sanitised;
      rogueCitations = pf.rogue;
      guardrailWarnings.push(...pf.warnings);
      console.warn(
        `[guardrail] dispute-reply post-flight stripped/substituted ${pf.rogue.length} ` +
          `rogue citation(s): ${pf.rogue.join(', ')}`,
      );
      void supabase.from('business_log').insert({
        category: 'legal_intelligence',
        action: 'guardrail_postflight_sanitised',
        details: {
          user_id: input.userId ?? null,
          surface: input.surface,
          company: input.providerName,
          rogue: pf.rogue,
          warnings: pf.warnings,
        },
      });
      if (!guardrailFooterNote) {
        guardrailFooterNote =
          'Some statutory references were removed during compliance review — please verify before sending.';
      }
    }
  }

  // Single-line footer caveat, mirroring the web generator, so the user
  // sees the same "double-check this" signal on every surface.
  if (guardrailFooterNote && out.letter) {
    out.letter = `${out.letter}\n\n---\nNote: ${guardrailFooterNote}`;
  }

  return {
    ...out,
    categoriesUsed: categories,
    groundedRefCount: relevantRefs.length,
    groundingGap: relevantRefs.length === 0,
    guardrailWarnings,
    rogueCitations,
  };
}
