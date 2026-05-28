/**
 * Grounded dispute letter writer — WhatsApp Pocket Agent.
 *
 * The Pocket Agent's conversational layer runs on Haiku for speed + cost
 * (AGENT_MODEL). Letter generation runs separately on Sonnet
 * (DISPUTE_MODEL). The contract between them is non-negotiable:
 *
 *   THE SONNET CALL IS ONLY EVER FIRED WITH A FULLY-POPULATED
 *   GROUNDING CONTEXT. If anything is missing, we stop BEFORE the
 *   model call, ask the user a friendly question, and store the
 *   intent so we can resume after they answer.
 *
 * No `[MISSING: …]` placeholders in letter bodies. No "approximately"
 * in user-facing copy. No model-side gap-filling. Either we have every
 * required field (and the letter writes cleanly) or we have a
 * conversational, helpful question for the user.
 *
 * Pre-flight order:
 *
 *   1. Resolve the dispute the user is asking us to act on.
 *   2. Build `groundingContext` from real Supabase rows
 *      (profiles, disputes, correspondence, bank_connections,
 *      legal_references).
 *   3. Validate against `validateGroundingForLetter(ctx, { kind })`
 *      — `kind: 'initial'` requires supplierName, amount,
 *      transactionDate, userFullName. `kind: 'chase'` additionally
 *      requires at least one priorLetter on file.
 *   4. **Validation fails →** return `{ ok: false, friendlyMessage,
 *      awaitingField, writeTarget }` so the agent can ask the user
 *      in plain English AND queue a `pending_action` slot to auto-
 *      resume after they answer.
 *   5. **Validation passes →** call `generateDisputeReply` (Sonnet
 *      + legal_references-grounded). Build a structured confirmation
 *      summary and return the letter.
 *
 * Optional fields (`userAddress`, `userPostcode`, `accountName`) are
 * never validated. The letter writer's prompt omits them naturally
 * when absent — no surface to the user.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateDisputeReply } from '@/lib/agents/dispute-reply-engine';

const FCA_WEEKS = 8;

export type LetterKind = 'initial' | 'chase';

/** Fields that block letter generation when missing. */
export type RequiredField =
  | 'supplierName'
  | 'amount'
  | 'transactionDate'
  | 'userFullName'
  | 'priorLetters';

/**
 * Where the missing field gets persisted when the user answers. Used by
 * the conversational layer to pick the right write-back tool
 * (update_profile_field vs update_dispute_field) without a second
 * round of guesswork.
 */
export type WriteTarget =
  | { table: 'profiles'; field: 'full_name' | 'address' | 'phone' }
  | {
      table: 'disputes';
      field: 'disputed_amount' | 'transaction_date' | 'provider_name';
      dispute_id: string;
    }
  | { table: 'none' }; // nothing to persist (e.g. "send the initial letter first")

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
  /** Resolved dispute id — for write-back targeting. */
  disputeId: string;
}

export interface GroundingValidationOk {
  ok: true;
}

export interface GroundingValidationFail {
  ok: false;
  field: RequiredField;
  /** Plain-English message ready to send to the user verbatim. */
  friendlyMessage: string;
  /**
   * Where the user's answer should be persisted. The agent uses this to
   * pick update_profile_field vs update_dispute_field on the next turn.
   * `none` means there's nothing to write — the user just needs to do
   * something on the website / take a different action.
   */
  writeTarget: WriteTarget;
}

export type GroundingValidation =
  | GroundingValidationOk
  | GroundingValidationFail;

export interface GroundedLetterResult {
  ok: boolean;
  /** Populated when ok=true. */
  letter?: string;
  /** Structured confirmation block sent BEFORE the letter body. */
  confirmation?: string;
  /** Populated when ok=false — the first blocking validation failure. */
  validation?: GroundingValidationFail;
  /** Grounding payload used (when ok=true). */
  grounding?: DisputeGroundingContext;
  /** Resolved dispute id. Always populated when a dispute matched. */
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
   * "add the £85 figure"). The writer treats this as a STYLING brief
   * only — figures and dates the user mentions here are NOT used as
   * grounding; the gate above guarantees those came from the DB.
   */
  userBrief?: string;
  /**
   * Optional override — when the caller already knows whether this is
   * an initial complaint or a chase letter, pass it through to skip
   * the heuristic. Otherwise we infer from `priorLetterCount`.
   */
  kind?: LetterKind;
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Fuzzy-resolve the active dispute for this provider name. Returns
 * null when nothing matches — the caller surfaces that as a separate
 * friendly message ("I can't find a dispute against X — open it on
 * the website first.").
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
  const { data: anyMatch } = await sb
    .from('disputes')
    .select('id, provider_name, updated_at')
    .eq('user_id', userId)
    .ilike('provider_name', `%${needle}%`)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (anyMatch && anyMatch.length > 0) return { id: anyMatch[0].id as string };
  return null;
}

function categoriesForIssueType(
  issueType: string | null,
  providerType: string | null,
): string[] {
  const cats = new Set<string>();
  if (issueType) cats.add(issueType.toLowerCase());
  if (providerType) cats.add(providerType.toLowerCase());
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
          'id, provider_name, provider_type, issue_type, issue_summary, disputed_amount, transaction_date, account_number, status, created_at',
        )
        .eq('id', disputeId)
        .eq('user_id', userId)
        .maybeSingle(),
      sb
        .from('profiles')
        .select('full_name, first_name, last_name, address, postcode, email, phone')
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

  let accountName: string | null = null;
  if (dispute.account_number) {
    const { data: bank } = await sb
      .from('bank_connections')
      .select('name, account_name')
      .eq('user_id', userId)
      .maybeSingle();
    accountName =
      (bank as { account_name?: string | null; name?: string | null } | null)
        ?.account_name ??
      (bank as { account_name?: string | null; name?: string | null } | null)
        ?.name ??
      null;
  }

  const categories = categoriesForIssueType(
    dispute.issue_type as string | null,
    dispute.provider_type as string | null,
  );
  const { data: rawRefs } = await sb
    .from('legal_references')
    .select(
      'law_name, section, summary, source_url, verification_status, category',
    )
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
    sent_at:
      (row.sent_at as string | null) ??
      (row.created_at as string | null) ??
      null,
    body: String(row.content ?? ''),
  }));
  const supplierReplies = (replies ?? []).map((row) => ({
    received_at:
      (row.sent_at as string | null) ??
      (row.created_at as string | null) ??
      null,
    body: String(row.content ?? ''),
  }));

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
      fcaDaysRemaining = Math.ceil(
        (deadlineMs - Date.now()) / (24 * 60 * 60 * 1000),
      );
    }
  }

  const fullName =
    (profile?.full_name as string | null) ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    '';

  return {
    supplierName: dispute.provider_name as string,
    amount:
      dispute.disputed_amount != null
        ? Number(dispute.disputed_amount)
        : null,
    transactionDate: (dispute.transaction_date as string | null) ?? null,
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
    disputeId: dispute.id as string,
  };
}

/**
 * Pre-flight gate. Walks the required fields in order; returns the FIRST
 * failure as a friendly, conversational message ready to send to the
 * user. Only critical fields are checked here — optional fields
 * (address, postcode, account name) are deliberately not validated,
 * because the letter writer omits them gracefully when absent.
 *
 * The order matters: the cheapest fix (one-line text reply) is asked
 * for before the higher-friction fix (open the dashboard).
 */
export function validateGroundingForLetter(
  ctx: DisputeGroundingContext,
  opts: { kind: LetterKind },
): GroundingValidation {
  if (!ctx.supplierName || !ctx.supplierName.trim()) {
    return {
      ok: false,
      field: 'supplierName',
      friendlyMessage:
        "I've got the dispute open but the supplier name on it is blank. Open it on the website at paybacker.co.uk/dashboard/disputes and add the supplier, then come back to me.",
      writeTarget: {
        table: 'disputes',
        field: 'provider_name',
        dispute_id: ctx.disputeId,
      },
    };
  }

  if (!ctx.userFullName || !ctx.userFullName.trim()) {
    return {
      ok: false,
      field: 'userFullName',
      friendlyMessage:
        "To sign this letter properly I need your full name — what should I use? (I'll save it to your profile so I don't ask again.)",
      writeTarget: { table: 'profiles', field: 'full_name' },
    };
  }

  if (ctx.amount == null) {
    return {
      ok: false,
      field: 'amount',
      friendlyMessage: `How much is the disputed charge on ${ctx.supplierName}? Reply with the £ amount (e.g. "£142.30") and I'll add it to the dispute and draft the letter.`,
      writeTarget: {
        table: 'disputes',
        field: 'disputed_amount',
        dispute_id: ctx.disputeId,
      },
    };
  }

  if (!ctx.transactionDate) {
    return {
      ok: false,
      field: 'transactionDate',
      friendlyMessage: `What date was the £${ctx.amount.toFixed(2)} ${ctx.supplierName} charge? Check your Money Hub if you're not sure — DD/MM/YYYY is fine.`,
      writeTarget: {
        table: 'disputes',
        field: 'transaction_date',
        dispute_id: ctx.disputeId,
      },
    };
  }

  if (opts.kind === 'chase' && ctx.priorLetters.length === 0) {
    return {
      ok: false,
      field: 'priorLetters',
      friendlyMessage:
        "There's no first letter on file for this dispute yet — a chase doesn't make sense without one. Want me to draft the initial complaint instead? Reply YES and I'll do it now.",
      writeTarget: { table: 'none' },
    };
  }

  return { ok: true };
}

/**
 * Build the structured confirmation block. Surfaces every fact the
 * writer was given so the human can sanity-check grounding.
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
      : 'Amount: not recorded.';
  const dateLine = ctx.transactionDate
    ? `Charge date: ${new Date(ctx.transactionDate).toLocaleDateString('en-GB')}.`
    : '';
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
    dateLine,
    fcaLine,
    legislationBlock,
    preview,
    '',
    'Reply YES to send, NO to cancel, or describe changes ("make it firmer", "add the £85 figure").',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Main entry — orchestrate the grounded letter generation.
 *
 *   1. Resolve the dispute from the user's free-text provider.
 *   2. Build the grounding context.
 *   3. Run the pre-flight gate — bail with `friendlyMessage` if any
 *      required field is missing. Sonnet is NOT called.
 *   4. Otherwise, call generateDisputeReply (Sonnet + legal_references).
 *   5. Return letter + confirmation summary.
 *
 * Errors are returned as `{ ok: false, validation }` rather than
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
      validation: {
        ok: false,
        field: 'supplierName',
        friendlyMessage: `I couldn't find a dispute against "${input.provider}" on your account. Open it on the website at paybacker.co.uk/dashboard/disputes first, then come back to me.`,
        writeTarget: { table: 'none' },
      },
    };
  }
  const ctx = await buildGroundingContext(sb, input.userId, dispute.id);
  if ('error' in ctx) {
    return {
      ok: false,
      validation: {
        ok: false,
        field: 'supplierName',
        friendlyMessage: ctx.error,
        writeTarget: { table: 'none' },
      },
      disputeId: dispute.id,
    };
  }

  const kind: LetterKind =
    input.kind ?? (ctx.priorLetters.length === 0 ? 'initial' : 'chase');
  const validation = validateGroundingForLetter(ctx, { kind });
  if (!validation.ok) {
    return { ok: false, validation, grounding: ctx, disputeId: dispute.id };
  }

  // Most-recent supplier reply (if any) is what we're replying TO.
  const latestReply = ctx.supplierReplies[ctx.supplierReplies.length - 1];
  const lastLetter = ctx.priorLetters[ctx.priorLetters.length - 1];

  // Engine call — DISPUTE_MODEL (claude-sonnet-4-6) under the hood.
  // At this point every required field is populated; the engine's
  // prompt does NOT need a [MISSING] escape hatch.
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

  return {
    ok: true,
    letter: result.letter,
    confirmation: buildConfirmationSummary(ctx, result.letter),
    grounding: ctx,
    disputeId: dispute.id,
  };
}
