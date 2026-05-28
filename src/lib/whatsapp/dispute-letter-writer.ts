/**
 * Grounded dispute letter writer — WhatsApp Pocket Agent.
 *
 * The WhatsApp Pocket Agent runs the CONVERSATIONAL layer on Haiku for
 * speed + cost. Letter generation is too consequential to delegate to
 * the same model — every letter cites UK statute, is sent to a real
 * supplier, and may be referenced by FCA / Ombudsman / CISAS — so it
 * fires through a SEPARATE Anthropic call on Sonnet, with strictly
 * grounded inputs.
 *
 * This module is the bridge:
 *
 *   1. Resolve the dispute the user is asking us to act on.
 *   2. Pull every input the letter writer needs DIRECTLY from Supabase
 *      (profile, dispute row, prior letters, supplier replies). No
 *      inference from conversation context.
 *   3. Validate every critical field. Missing? Return the gap to the
 *      caller — never fire the letter call with a placeholder.
 *   4. Delegate the actual writing to `generateDisputeReply` in
 *      `src/lib/agents/dispute-reply-engine.ts`, which is the single
 *      source of truth for citation-grounded letters and already calls
 *      DISPUTE_MODEL (claude-sonnet-4-6) under the hood with the
 *      `legal_references` table pre-loaded.
 *   5. Build a structured confirmation summary (supplier / amount /
 *      letter # / FCA deadline / legislation summary) so the user can
 *      eyeball the grounding before approving the send.
 *
 * Architectural promise: NO field the letter writer sees comes from
 * the conversational layer's free-form text. Every value is fetched
 * from a real DB row in the helpers below. The user prompt is treated
 * as INTENT ("draft a firmer reply about EE") — never as fact.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateDisputeReply } from '@/lib/agents/dispute-reply-engine';

/** Critical fields the writer cannot proceed without. */
const REQUIRED_PROFILE_FIELDS = ['full_name'] as const;
const FCA_WEEKS = 8;

export interface DisputeGroundingContext {
  /** Supplier name as stored on the dispute row. */
  supplierName: string;
  /** Disputed amount in £. Null when never recorded. */
  amount: number | null;
  /** ISO date the disputed transaction happened. */
  transactionDate: string | null;
  /** Linked bank account name, if any. */
  accountName: string | null;
  /** The issue_summary field on the dispute row. */
  disputeReason: string;
  /** Issue type (energy_dispute / broadband_complaint / etc.). */
  issueType: string | null;
  /** Provider type (energy / broadband / finance / etc.). */
  providerType: string | null;
  /** Prior outbound letters (most recent last). */
  priorLetters: Array<{ sent_at: string | null; body: string }>;
  /** Inbound replies from the supplier (most recent last). */
  supplierReplies: Array<{ received_at: string | null; body: string }>;
  /** Legislation rows surfaced by the categoriser — full text included. */
  legislation: Array<{
    law_name: string;
    section: string | null;
    summary: string | null;
    source_url: string | null;
  }>;
  /** Customer's full name from profiles. */
  userFullName: string;
  /** Customer address — single line. Null when not on file. */
  userAddress: string | null;
  /** Customer postcode. */
  userPostcode: string | null;
  /** First-letter-sent timestamp, if any. Drives FCA 8-week clock. */
  firstLetterSentAt: string | null;
  /** Total dispute letters previously sent (so we can say "Letter #N"). */
  priorLetterCount: number;
  /** FCA 8-week deadline calculated from firstLetterSentAt. Null if not yet started. */
  fcaDeadline: string | null;
  /** Days remaining until the FCA deadline. Null if not yet started. */
  fcaDaysRemaining: number | null;
}

export interface MissingField {
  field: keyof DisputeGroundingContext | string;
  /** User-facing reason this field blocks the letter. */
  reason: string;
}

export interface GroundedLetterResult {
  ok: boolean;
  /** Populated when ok=true. */
  letter?: string;
  /** Structured confirmation block the agent sends before YES/NO. */
  confirmation?: string;
  /** Populated when ok=false — the missing critical fields. */
  missing?: MissingField[];
  /** The grounding payload that was used (or attempted). For debugging / audit. */
  grounding?: Partial<DisputeGroundingContext>;
  /** Raw dispute_id (so the YES-path executor knows which row to act on). */
  disputeId?: string;
}

export interface GroundedLetterInput {
  userId: string;
  /** Free-text supplier name from the user ("EE", "British Gas") — fuzzy-matched. */
  provider: string;
  /** Tone preference — passed through to the writer. */
  tone?: 'auto' | 'friendly' | 'balanced' | 'firm';
  /**
   * Optional free-text adjustment from the user ("make it firmer",
   * "add the £85 figure"). NEVER treated as fact — only as a styling
   * brief for the writer. The writer's grounding rules forbid
   * inventing figures even when the user mentions them; if the user
   * says "the £85 figure" and there's no £85 in the DB, the letter
   * will say [MISSING: amount_referenced_by_user].
   */
  userBrief?: string;
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Fuzzy-resolve the active dispute for this provider name. Mirrors the
 * dashboard/Telegram resolution rule — most-recently-updated OPEN dispute
 * wins, falls back to any matching dispute. Returns null if nothing
 * matches.
 */
async function resolveDispute(
  sb: SupabaseClient,
  userId: string,
  provider: string,
): Promise<{ id: string } | null> {
  const needle = provider.trim();
  if (!needle) return null;
  const { data: open } = await sb
    .from('disputes')
    .select('id, provider_name, status, updated_at')
    .eq('user_id', userId)
    .ilike('provider_name', `%${needle}%`)
    .in('status', ['open', 'awaiting_response', 'escalated'])
    .order('updated_at', { ascending: false })
    .limit(1);
  if (open && open.length > 0) return { id: open[0].id as string };
  const { data: any } = await sb
    .from('disputes')
    .select('id, provider_name, updated_at')
    .eq('user_id', userId)
    .ilike('provider_name', `%${needle}%`)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (any && any.length > 0) return { id: any[0].id as string };
  return null;
}

function categoriesForIssueType(issueType: string | null, providerType: string | null): string[] {
  const cats = new Set<string>();
  if (issueType) cats.add(issueType.toLowerCase());
  if (providerType) cats.add(providerType.toLowerCase());
  // Always include the broad general fallback so we surface CRA/FCA rules
  // even when the dispute is sparsely categorised.
  cats.add('general');
  return Array.from(cats);
}

/**
 * Build the grounding payload from real DB rows. Every field comes from a
 * documented source table — no inference, no conversation context.
 */
export async function buildGroundingContext(
  sb: SupabaseClient,
  userId: string,
  disputeId: string,
): Promise<DisputeGroundingContext | { error: string }> {
  const [{ data: dispute }, { data: profile }, { data: letters }, { data: replies }] =
    await Promise.all([
      sb
        .from('disputes')
        .select(
          'id, provider_name, provider_type, issue_type, issue_summary, disputed_amount, account_number, status, created_at',
        )
        .eq('id', disputeId)
        .eq('user_id', userId)
        .maybeSingle(),
      sb
        .from('profiles')
        .select('full_name, first_name, last_name, address, postcode, email')
        .eq('id', userId)
        .maybeSingle(),
      sb
        .from('correspondence')
        .select('entry_type, content, sent_at, created_at')
        .eq('dispute_id', disputeId)
        .eq('user_id', userId)
        .eq('entry_type', 'ai_letter')
        .order('created_at', { ascending: true }),
      sb
        .from('correspondence')
        .select('entry_type, content, sent_at, created_at')
        .eq('dispute_id', disputeId)
        .eq('user_id', userId)
        .in('entry_type', ['company_email', 'company_letter'])
        .order('created_at', { ascending: true }),
    ]);

  if (!dispute) {
    return { error: 'Dispute not found for this user.' };
  }

  // Optional — bank_connections / bank_accounts is a separate table that
  // may or may not have a clean link to a dispute. We look it up by
  // account_number if present; otherwise leave null. The letter writer
  // tolerates a null account name.
  let accountName: string | null = null;
  if (dispute.account_number) {
    const { data: bank } = await sb
      .from('bank_connections')
      .select('name, account_name')
      .eq('user_id', userId)
      .maybeSingle();
    accountName = bank?.account_name ?? bank?.name ?? null;
  }

  // Legislation — we don't try to be cleverer than the existing
  // dispute-reply-engine, which already pulls from legal_references with
  // category-driven retrieval. We do an INDEPENDENT preview read here so
  // the confirmation summary can show the user which statutes will be
  // cited BEFORE the writer runs. The writer itself will re-run the
  // retrieval; the previews must match by category.
  const categories = categoriesForIssueType(
    dispute.issue_type as string | null,
    dispute.provider_type as string | null,
  );
  const { data: rawRefs } = await sb
    .from('legal_references')
    .select('law_name, section, summary, source_url, verification_status, category')
    .in('category', categories)
    .in('verification_status', ['verified', 'needs_review'])
    .limit(8);
  const legislation = (rawRefs ?? []).map((r) => ({
    law_name: r.law_name as string,
    section: (r.section as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    source_url: (r.source_url as string | null) ?? null,
  }));

  const priorLetters = (letters ?? []).map((row) => ({
    sent_at: (row.sent_at as string | null) ?? (row.created_at as string | null) ?? null,
    body: String(row.content ?? ''),
  }));
  const supplierReplies = (replies ?? []).map((row) => ({
    received_at: (row.sent_at as string | null) ?? (row.created_at as string | null) ?? null,
    body: String(row.content ?? ''),
  }));

  // FCA clock — starts on the first ai_letter we sent to the supplier.
  // Once 8 weeks have elapsed the user can escalate to FOS / Ombudsman.
  let firstLetterSentAt: string | null = null;
  for (const l of priorLetters) {
    if (l.sent_at) {
      firstLetterSentAt = l.sent_at;
      break;
    }
  }
  let fcaDeadline: string | null = null;
  let fcaDaysRemaining: number | null = null;
  if (firstLetterSentAt) {
    const startMs = Date.parse(firstLetterSentAt);
    if (Number.isFinite(startMs)) {
      const deadlineMs = startMs + FCA_WEEKS * 7 * 24 * 60 * 60 * 1000;
      fcaDeadline = new Date(deadlineMs).toISOString();
      fcaDaysRemaining = Math.ceil((deadlineMs - Date.now()) / (24 * 60 * 60 * 1000));
    }
  }

  const fullName =
    (profile?.full_name as string | null) ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    '';

  return {
    supplierName: dispute.provider_name as string,
    amount: dispute.disputed_amount != null ? Number(dispute.disputed_amount) : null,
    transactionDate: (dispute.created_at as string | null) ?? null,
    accountName,
    disputeReason: (dispute.issue_summary as string) ?? '',
    issueType: (dispute.issue_type as string | null) ?? null,
    providerType: (dispute.provider_type as string | null) ?? null,
    priorLetters,
    supplierReplies,
    legislation,
    userFullName: fullName,
    userAddress: (profile?.address as string | null) ?? null,
    userPostcode: (profile?.postcode as string | null) ?? null,
    firstLetterSentAt,
    priorLetterCount: priorLetters.length,
    fcaDeadline,
    fcaDaysRemaining,
  };
}

/**
 * Walk the grounding payload and report any field that BLOCKS the letter.
 * Missing user name = block. Missing dispute reason = block. Everything
 * else can be expressed as [MISSING: …] in the letter body if the writer
 * needs to refer to it.
 */
export function detectMissingCriticalFields(
  ctx: DisputeGroundingContext,
): MissingField[] {
  const missing: MissingField[] = [];
  for (const f of REQUIRED_PROFILE_FIELDS) {
    if (f === 'full_name' && !ctx.userFullName) {
      missing.push({
        field: 'userFullName',
        reason:
          'Your full name is missing from your profile — supplier letters must be signed in your real name.',
      });
    }
  }
  if (!ctx.supplierName) {
    missing.push({
      field: 'supplierName',
      reason: 'The supplier on this dispute row is missing.',
    });
  }
  if (!ctx.disputeReason || ctx.disputeReason.trim().length < 5) {
    missing.push({
      field: 'disputeReason',
      reason:
        "The dispute doesn't have an issue summary on file — open the dispute on the website and add one before drafting.",
    });
  }
  return missing;
}

/**
 * Build the structured confirmation block the agent sends BEFORE the
 * user types YES to release the letter. Surfaces every fact the writer
 * was given, so the human can sanity-check grounding.
 */
export function buildConfirmationSummary(
  ctx: DisputeGroundingContext,
  letterPreviewSnippet?: string,
): string {
  const letterNumber = ctx.priorLetterCount + 1;
  const fcaLine = ctx.fcaDeadline
    ? `FCA 8-week clock: ${ctx.fcaDaysRemaining} days remaining (deadline ${new Date(
        ctx.fcaDeadline,
      ).toLocaleDateString('en-GB')}).`
    : 'FCA 8-week clock: starts when this letter is sent.';
  const amountLine =
    ctx.amount != null
      ? `Amount: £${ctx.amount.toFixed(2)}`
      : 'Amount: not recorded on dispute.';
  const legislationLines = ctx.legislation
    .slice(0, 3)
    .map(
      (l) =>
        `• ${l.law_name}${l.section ? `, ${l.section}` : ''}${
          l.summary ? ` — ${l.summary.slice(0, 90)}` : ''
        }`,
    );
  const legislationBlock = legislationLines.length
    ? `Cites:\n${legislationLines.join('\n')}`
    : 'Cites: (no relevant statute matched — letter will use general consumer-rights framing).';

  const preview = letterPreviewSnippet
    ? `\n\nLetter preview (first 200 chars):\n"${letterPreviewSnippet.slice(0, 200).replace(/\s+/g, ' ').trim()}…"`
    : '';

  return [
    `*${ctx.supplierName}* — letter #${letterNumber}`,
    amountLine,
    fcaLine,
    legislationBlock,
    preview,
    '',
    'Reply YES to send, NO to cancel, or describe changes ("make it firmer", "add the £85 figure").',
  ].join('\n');
}

/**
 * Main entry — orchestrate the grounded letter generation.
 *
 *   1. Resolve the dispute id from the user's free-text provider.
 *   2. Build the grounding context from real DB rows.
 *   3. Validate critical fields — bail with MISSING list if any are absent.
 *   4. Delegate to generateDisputeReply (which calls DISPUTE_MODEL =
 *      claude-sonnet-4-6 with the legal_references table grounded in).
 *   5. Return the letter + confirmation summary.
 *
 * Errors are returned as `{ ok: false, missing: [...] }` rather than
 * thrown so the conversational agent can present them inline.
 */
export async function generateGroundedDisputeLetter(
  input: GroundedLetterInput,
): Promise<GroundedLetterResult> {
  const sb = admin();
  const dispute = await resolveDispute(sb, input.userId, input.provider);
  if (!dispute) {
    return {
      ok: false,
      missing: [
        {
          field: 'dispute',
          reason: `I couldn't find a dispute against "${input.provider}" on your account. Open it on the website at paybacker.co.uk/dashboard/disputes first.`,
        },
      ],
    };
  }
  const ctx = await buildGroundingContext(sb, input.userId, dispute.id);
  if ('error' in ctx) {
    return {
      ok: false,
      missing: [{ field: 'dispute', reason: ctx.error }],
    };
  }
  const missing = detectMissingCriticalFields(ctx);
  if (missing.length > 0) {
    return { ok: false, missing, grounding: ctx, disputeId: dispute.id };
  }

  // Most-recent supplier reply (if any) is what we're replying TO.
  const latestReply = ctx.supplierReplies[ctx.supplierReplies.length - 1];
  const lastLetter = ctx.priorLetters[ctx.priorLetters.length - 1];

  // Engine call — this internally fires DISPUTE_MODEL (claude-sonnet-4-6)
  // with a strict, citation-grounded system prompt that pulls verified
  // rows from legal_references. The conversational AGENT_MODEL is NOT
  // used here.
  const result = await generateDisputeReply(sb, {
    providerName: ctx.supplierName,
    customerName: ctx.userFullName,
    customerAddress:
      [ctx.userAddress, ctx.userPostcode].filter(Boolean).join(', ') || null,
    issueSummary: ctx.disputeReason,
    desiredOutcome:
      input.userBrief?.trim()?.length
        ? input.userBrief
        : 'Full refund / remedy in line with UK consumer law.',
    issueType: ctx.issueType,
    providerType: ctx.providerType,
    supplierLatestMessage: latestReply?.body ?? null,
    lastOutboundLetter: lastLetter?.body ?? null,
    userTweakBrief: input.userBrief ?? null,
    tone: input.tone ?? 'auto',
    userId: input.userId,
    surface: 'whatsapp',
  });

  const confirmation = buildConfirmationSummary(ctx, result.letter);

  return {
    ok: true,
    letter: result.letter,
    confirmation,
    grounding: ctx,
    disputeId: dispute.id,
  };
}

/**
 * Render a MISSING-fields result as a single chat reply.
 */
export function renderMissingFieldsReply(missing: MissingField[]): string {
  if (missing.length === 1) {
    return `I can't draft this letter — ${missing[0].reason}`;
  }
  return [
    "I can't draft this letter yet — here's what's missing:",
    ...missing.map((m) => `• ${m.reason}`),
  ].join('\n');
}
