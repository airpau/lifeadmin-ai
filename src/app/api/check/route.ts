/**
 * POST /api/check — public, unauthenticated case check.
 *
 * Powers the /check funnel: a visitor picks a category, describes what
 * happened, and gets back a case strength assessment, the verified UK
 * law that applies, the escalation route, and a complete draft letter.
 * No account, no email, nothing stored.
 *
 * Safety posture for an unauthenticated route
 * -------------------------------------------
 *  - NO language model is called. Citations are retrieved from
 *    `legal_references` and the letter is composed deterministically in
 *    `src/lib/check/preview-letter.ts`. There is no per-request AI spend
 *    to abuse and no generative step that could hallucinate a statute.
 *  - IP rate limited to 8 requests per minute via the existing
 *    `checkIpRateLimit` sliding window, which hashes the IP before
 *    storing it.
 *  - Request body capped at 8 KB, description capped at 1200 characters,
 *    every other field individually capped and validated against the
 *    fixed taxonomy.
 *  - Nothing the visitor types is persisted. The only telemetry is an
 *    anonymous PostHog event carrying the category and the score band.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit';
import { getCheckCategory, CONTACT_STAGES, type ContactStage } from '@/lib/check/categories';
import { getVerifiedCitations } from '@/lib/check/citations';
import { calculateCaseStrength } from '@/lib/check/case-strength';
import { composePreviewLetter, buildNextSteps, sanitiseUserText } from '@/lib/check/preview-letter';
import { captureServer } from '@/lib/posthog-server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_DESCRIPTION = 1200;
const MIN_DESCRIPTION = 10;

const VALID_STAGES = new Set<string>(CONTACT_STAGES.map((s) => s.id));

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  // ---- Rate limit -------------------------------------------------------
  const ip = getClientIp(request);
  const limit = await checkIpRateLimit(ip, '/api/check', 8);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'You have run a lot of checks in the last minute. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)),
          'X-RateLimit-Limit': '8',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(limit.resetAt.getTime() / 1000)),
        },
      },
    );
  }

  // ---- Body size guard --------------------------------------------------
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return bad('Could not read the request.');
  }
  if (raw.length > MAX_BODY_BYTES) {
    return bad('That is more detail than this free check accepts. Please shorten your description.', 413);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return bad('Could not read the request.');
  }

  // ---- Validation -------------------------------------------------------
  const category = getCheckCategory(typeof body.categoryId === 'string' ? body.categoryId : null);
  if (!category) return bad('Pick one of the listed categories.');

  const description = sanitiseUserText(
    typeof body.description === 'string' ? body.description : '',
    MAX_DESCRIPTION,
  );
  if (description.length < MIN_DESCRIPTION) {
    return bad('Tell us a little more about what happened, at least a sentence.');
  }

  const providerName = sanitiseUserText(
    typeof body.providerName === 'string' ? body.providerName : '',
    120,
  );
  const accountRef = sanitiseUserText(typeof body.accountRef === 'string' ? body.accountRef : '', 60);
  const desiredOutcome = sanitiseUserText(
    typeof body.desiredOutcome === 'string' ? body.desiredOutcome : '',
    240,
  );

  let amountGbp: number | null = null;
  const rawAmount = body.amountGbp;
  if (typeof rawAmount === 'number' || (typeof rawAmount === 'string' && rawAmount.trim() !== '')) {
    const parsed = Number(String(rawAmount).replace(/[£,\s]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 1_000_000) amountGbp = parsed;
  }

  let incidentDate = '';
  if (typeof body.incidentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.incidentDate)) {
    const d = new Date(body.incidentDate);
    if (!Number.isNaN(d.getTime())) incidentDate = body.incidentDate;
  }

  const validEvidence = new Set(category.evidence.map((e) => e.id));
  const evidenceIds = Array.isArray(body.evidenceIds)
    ? (body.evidenceIds as unknown[])
        .filter((x): x is string => typeof x === 'string' && validEvidence.has(x))
        .slice(0, 10)
    : [];

  const contactStage: ContactStage =
    typeof body.contactStage === 'string' && VALID_STAGES.has(body.contactStage)
      ? (body.contactStage as ContactStage)
      : 'not_yet';

  // ---- Retrieve verified law -------------------------------------------
  const { citations, droppedNonAuthority } = await getVerifiedCitations(category, description, 5);

  // ---- Score ------------------------------------------------------------
  const strength = calculateCaseStrength({
    category,
    verifiedCitationCount: citations.length,
    providerName,
    amountGbp,
    incidentDate,
    evidenceIds,
    contactStage,
    descriptionLength: description.length,
  });

  // ---- Compose the letter ----------------------------------------------
  const evidenceLabels = category.evidence
    .filter((e) => evidenceIds.includes(e.id))
    .map((e) => e.label);

  const letter = composePreviewLetter({
    category,
    providerName,
    description,
    desiredOutcome,
    amountGbp,
    accountRef,
    incidentDate,
    contactStage,
    evidenceLabels,
    citations,
  });

  const nextSteps = buildNextSteps(category, contactStage, citations);

  // ---- Anonymous telemetry ---------------------------------------------
  // Category and band only. None of the visitor's own text leaves here.
  captureServer('public_case_check', `anon_check:${category.id}`, {
    category: category.id,
    band: strength.band,
    score: strength.score,
    citation_count: citations.length,
    has_amount: amountGbp != null,
    has_date: Boolean(incidentDate),
    evidence_count: evidenceIds.length,
    contact_stage: contactStage,
  });

  return NextResponse.json(
    {
      category: {
        id: category.id,
        label: category.label,
        regulator: category.regulator,
        ombudsman: category.ombudsman,
        ombudsmanUrl: category.ombudsmanUrl,
        eightWeekClock: category.eightWeekClock,
        limitLabel: category.primaryLimitLabel,
      },
      strength,
      citations,
      sourcing: {
        droppedNonAuthority,
        method: 'retrieved_from_verified_store',
      },
      nextSteps,
      letter: letter.text,
      citedRefIds: letter.citedRefIds,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-RateLimit-Limit': '8',
        'X-RateLimit-Remaining': String(limit.remaining),
      },
    },
  );
}
