/**
 * GET /api/cron/legal-refs-amendments-sweep
 *
 * Daily 03:15 UTC. For every `legal_references` row whose `source_url`
 * is on legislation.gov.uk:
 *   1. Fetch the canonical Akoma-Ntoso XML.
 *   2. Compute SHA-256 of the normalised section body.
 *   3. Compare to stored `source_xml_hash`.
 *      - First-ever check (hash NULL): seed the hash, mark
 *        last_freshness_check_at, no proposal.
 *      - Hash unchanged: refresh last_freshness_check_at only.
 *      - Hash changed: insert a PROPOSED `legal_ref_corrections` row
 *        with the new title/section text, set canonical
 *        `is_stale=true`. The founder approves before any canonical
 *        write happens — this cron is propose-only.
 *      - `<ukm:UnappliedEffects>` present: set `unapplied_effects=true`
 *        on the canonical row so the admin UI flags it.
 *
 * Caps: 100 refs per run. Concurrency cap: 5 in-flight fetches.
 *
 * COMPLIANCE PRINCIPLE (non-negotiable): this cron NEVER mutates a
 * canonical citation field directly to a non-pending value. The
 * `is_stale` and `unapplied_effects` columns are observational flags.
 * `source_xml_hash` is a fingerprint, not a citation field. Real text
 * changes always flow through `legal_ref_corrections`.
 *
 * Auth: matches the existing legal-refs cron pattern — accepts
 * `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  fetchStatuteByUri,
  hashLegislationDoc,
  type LegislationDoc,
} from '@/lib/legal-data/legislation-gov-uk';
import {
  fetchContent,
  hashGovUkContentDoc,
  type GovUkContent,
} from '@/lib/legal-data/gov-uk-content';
import {
  pickCanonicalSource,
  type CanonicalSourceKind,
} from '@/lib/legal-data/source-router';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const HARD_CAP = 100;
const CONCURRENCY = 5;

function getAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
}

interface LegalRefRow {
  id: string;
  law_name: string;
  section: string | null;
  source_url: string;
  source_type: string | null;
  category: string;
  verification_status: string | null;
  source_xml_hash: string | null;
  last_freshness_check_at: string | null;
  is_stale: boolean | null;
  unapplied_effects: boolean | null;
}

interface SweepCounts {
  scanned: number;
  unchanged: number;
  hashed_first_time: number;
  drift_queued: number;
  unapplied_effects_flagged: number;
  fetch_failed: number;
  errors: number;
}

/**
 * Process one legal-ref row. Returns a partial counts delta the caller
 * adds to the run total. Never throws — failures are recorded as
 * `errors`/`fetch_failed` and the row is left in its current state
 * for the next run.
 */
async function processRef(
  admin: ReturnType<typeof getAdmin>,
  ref: LegalRefRow,
): Promise<Partial<SweepCounts>> {
  const nowIso = new Date().toISOString();

  let doc: LegislationDoc | null = null;
  try {
    doc = await fetchStatuteByUri(ref.source_url, { timeoutMs: 8_000 });
  } catch {
    doc = null;
  }
  if (!doc) {
    return { fetch_failed: 1 };
  }

  let newHash: string;
  try {
    newHash = await hashLegislationDoc(doc);
  } catch {
    return { errors: 1 };
  }

  // First-ever fingerprint — seed without proposing a correction. We
  // can't tell if anything's changed without a baseline.
  if (!ref.source_xml_hash) {
    await admin
      .from('legal_references')
      .update({
        source_xml_hash: newHash,
        last_freshness_check_at: nowIso,
        unapplied_effects: !!doc.hasUnappliedEffects,
      })
      .eq('id', ref.id);
    return {
      hashed_first_time: 1,
      unapplied_effects_flagged: doc.hasUnappliedEffects ? 1 : 0,
    };
  }

  // No drift — just refresh the freshness check + the unapplied-effects
  // flag (which can flip independently of section text changes).
  if (newHash === ref.source_xml_hash) {
    await admin
      .from('legal_references')
      .update({
        last_freshness_check_at: nowIso,
        unapplied_effects: !!doc.hasUnappliedEffects,
      })
      .eq('id', ref.id);
    return {
      unchanged: 1,
      unapplied_effects_flagged: doc.hasUnappliedEffects ? 1 : 0,
    };
  }

  // Drift detected — propose a correction with the new canonical body.
  // We never overwrite canonical fields directly; the founder approves
  // through the existing `legal_ref_corrections` flow.
  const proposedTitle = doc.title || ref.law_name;
  const proposedUrl = doc.sourceUrl.replace(/\/data\.xml$/, '');

  const reasoningParts = [
    `Section text on legislation.gov.uk has changed since last sweep.`,
    `Old hash: ${ref.source_xml_hash.slice(0, 12)}…`,
    `New hash: ${newHash.slice(0, 12)}…`,
    doc.lastAmended ? `Last amended: ${doc.lastAmended}.` : null,
    doc.hasUnappliedEffects
      ? `Note: <ukm:UnappliedEffects> present — pending change not yet incorporated.`
      : null,
    'Source: legislation.gov.uk (Crown Copyright, OGL v3.0).',
  ]
    .filter(Boolean)
    .join(' ');

  const { data: insertedRows, error: insErr } = await admin
    .from('legal_ref_corrections')
    .insert({
      ref_id: ref.id,
      proposer: 'legislation-gov-uk-amendments-sweep',
      before_law_name: ref.law_name,
      before_source_url: ref.source_url,
      before_status: ref.verification_status,
      proposed_law_name:
        proposedTitle.trim().toLowerCase() === ref.law_name.trim().toLowerCase()
          ? null
          : proposedTitle,
      proposed_source_url:
        proposedUrl.replace(/\/$/, '').toLowerCase() ===
        (ref.source_url || '').replace(/\/$/, '').toLowerCase()
          ? null
          : proposedUrl,
      proposed_status: 'updated',
      superseded_by: null,
      reasoning: reasoningParts,
      raw_response: {
        section_text_excerpt: (doc.sectionText || '').slice(0, 4000),
        last_amended: doc.lastAmended,
        in_force_on: doc.inForceOn,
        has_unapplied_effects: doc.hasUnappliedEffects,
        source_url: doc.sourceUrl,
      },
      confidence: 'high',
      cost_gbp: 0,
      status: 'pending',
      source_xml_hash: newHash,
      source_host: 'legislation.gov.uk',
    })
    .select('id')
    .limit(1);

  if (insErr) {
    return { errors: 1 };
  }

  // Only AFTER a successful insert do we mark prior pending
  // corrections superseded. If the insert had failed transiently we
  // would have left the existing actionable proposal in place. (Codex
  // P2 #426.) Best-effort — supersede failure doesn't roll back the
  // new proposal; the queue just briefly shows two for this ref.
  const newCorrectionId = insertedRows?.[0]?.id ?? null;
  if (newCorrectionId) {
    await admin
      .from('legal_ref_corrections')
      .update({
        status: 'superseded_by_newer',
        reviewed_at: nowIso,
        reviewed_by: 'amendments-sweep-new-proposal',
      })
      .eq('ref_id', ref.id)
      .eq('status', 'pending')
      .neq('id', newCorrectionId);
  }

  // Flag the canonical row as stale so the admin UI surfaces a
  // warning. Canonical citation fields stay untouched.
  await admin
    .from('legal_references')
    .update({
      is_stale: true,
      unapplied_effects: !!doc.hasUnappliedEffects,
      last_freshness_check_at: nowIso,
    })
    .eq('id', ref.id);

  // Audit row for the verifications timeline.
  void admin.from('legal_ref_verifications').insert({
    ref_id: ref.id,
    verifier: 'legislation-gov-uk-amendments-sweep',
    triggered_by: 'cron',
    before_status: ref.verification_status,
    after_status: 'pending-correction-queued',
    before_url: ref.source_url,
    after_url: proposedUrl,
    changes: {
      queued_correction: true,
      correction_id: insertedRows?.[0]?.id ?? null,
      old_hash: ref.source_xml_hash,
      new_hash: newHash,
      has_unapplied_effects: doc.hasUnappliedEffects,
    },
    cost_gbp: 0,
    notes: reasoningParts,
  });

  return {
    drift_queued: 1,
    unapplied_effects_flagged: doc.hasUnappliedEffects ? 1 : 0,
  };
}

/**
 * Phase 5: gov.uk content (CMA cases / regulator pubs) drift detector.
 * Same shape as `processRef` but uses gov-uk-content's typed fetcher
 * + hash function. Drift queues a `legal_ref_corrections` row exactly
 * like the legislation.gov.uk path; the founder approves before any
 * canonical write.
 */
async function processGovUkContentRef(
  admin: ReturnType<typeof getAdmin>,
  ref: LegalRefRow,
): Promise<Partial<SweepCounts>> {
  const nowIso = new Date().toISOString();

  let doc: GovUkContent | null = null;
  try {
    doc = await fetchContent(ref.source_url);
  } catch {
    doc = null;
  }
  if (!doc) {
    return { fetch_failed: 1 };
  }

  let newHash: string;
  try {
    newHash = await hashGovUkContentDoc(doc);
  } catch {
    return { errors: 1 };
  }

  if (!ref.source_xml_hash) {
    await admin
      .from('legal_references')
      .update({
        source_xml_hash: newHash,
        last_freshness_check_at: nowIso,
      })
      .eq('id', ref.id);
    return { hashed_first_time: 1 };
  }

  if (newHash === ref.source_xml_hash) {
    await admin
      .from('legal_references')
      .update({ last_freshness_check_at: nowIso })
      .eq('id', ref.id);
    return { unchanged: 1 };
  }

  // Drift detected — propose a correction.
  const proposedTitle = doc.title || ref.law_name;
  const proposedUrl = doc.web_url;

  const reasoningParts = [
    `gov.uk content has changed since last sweep (document_type='${doc.document_type}').`,
    `Old hash: ${ref.source_xml_hash.slice(0, 12)}…`,
    `New hash: ${newHash.slice(0, 12)}…`,
    doc.public_updated_at ? `Last updated: ${doc.public_updated_at}.` : null,
    'Source: gov.uk (Crown Copyright, OGL v3.0).',
  ]
    .filter(Boolean)
    .join(' ');

  const { data: insertedRows, error: insErr } = await admin
    .from('legal_ref_corrections')
    .insert({
      ref_id: ref.id,
      proposer: 'gov-uk-content-amendments-sweep',
      before_law_name: ref.law_name,
      before_source_url: ref.source_url,
      before_status: ref.verification_status,
      proposed_law_name:
        proposedTitle.trim().toLowerCase() === ref.law_name.trim().toLowerCase()
          ? null
          : proposedTitle,
      proposed_source_url:
        proposedUrl.replace(/\/$/, '').toLowerCase() ===
        (ref.source_url || '').replace(/\/$/, '').toLowerCase()
          ? null
          : proposedUrl,
      proposed_status: 'updated',
      superseded_by: null,
      reasoning: reasoningParts,
      raw_response: {
        body_excerpt: (doc.body || '').slice(0, 4000),
        public_updated_at: doc.public_updated_at,
        first_published_at: doc.first_published_at,
        document_type: doc.document_type,
        web_url: doc.web_url,
      },
      confidence: 'high',
      cost_gbp: 0,
      status: 'pending',
      source_xml_hash: newHash,
      source_host: 'gov-uk-content',
    })
    .select('id')
    .limit(1);

  if (insErr) {
    return { errors: 1 };
  }

  const newCorrectionId = insertedRows?.[0]?.id ?? null;
  if (newCorrectionId) {
    await admin
      .from('legal_ref_corrections')
      .update({
        status: 'superseded_by_newer',
        reviewed_at: nowIso,
        reviewed_by: 'amendments-sweep-new-proposal',
      })
      .eq('ref_id', ref.id)
      .eq('status', 'pending')
      .neq('id', newCorrectionId);
  }

  await admin
    .from('legal_references')
    .update({
      is_stale: true,
      last_freshness_check_at: nowIso,
    })
    .eq('id', ref.id);

  void admin.from('legal_ref_verifications').insert({
    ref_id: ref.id,
    verifier: 'gov-uk-content-amendments-sweep',
    triggered_by: 'cron',
    before_status: ref.verification_status,
    after_status: 'pending-correction-queued',
    before_url: ref.source_url,
    after_url: proposedUrl,
    changes: {
      queued_correction: true,
      correction_id: insertedRows?.[0]?.id ?? null,
      old_hash: ref.source_xml_hash,
      new_hash: newHash,
    },
    cost_gbp: 0,
    notes: reasoningParts,
  });

  return { drift_queued: 1 };
}

/**
 * Pool runner — caps concurrency to N. Returns when every task settles.
 * Used to keep the legislation.gov.uk fetch fan-out polite (≤5 in-flight)
 * while still finishing 100 rows in a reasonable cron window.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i += 1) {
    runners.push(
      (async () => {
        while (cursor < items.length) {
          const idx = cursor;
          cursor += 1;
          const it = items[idx];
          if (it === undefined) break;
          await worker(it);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // Phase 5: bucket by canonical source. Sweep legislation.gov.uk
  // (existing) AND gov-uk-content refs (new). Skip find-case-law here
  // — case law is published, not amended, so the weekly reverify cron
  // is enough.
  const { data, error } = await admin
    .from('legal_references')
    .select(
      'id, law_name, section, source_url, source_type, category, verification_status, source_xml_hash, last_freshness_check_at, is_stale, unapplied_effects',
    )
    .order('last_freshness_check_at', { ascending: true, nullsFirst: true })
    .limit(HARD_CAP);

  if (error) {
    return NextResponse.json(
      { error: 'fetch refs failed', detail: error.message },
      { status: 500 },
    );
  }

  const allRefs = (data || []) as LegalRefRow[];
  const legQueue: LegalRefRow[] = [];
  const govQueue: LegalRefRow[] = [];
  for (const r of allRefs) {
    const kind: CanonicalSourceKind = pickCanonicalSource(r.source_url);
    if (kind === 'legislation') legQueue.push(r);
    else if (kind === 'gov-uk-content') govQueue.push(r);
    // find-case-law + perplexity refs deliberately skipped here.
  }

  const counts: SweepCounts = {
    scanned: 0,
    unchanged: 0,
    hashed_first_time: 0,
    drift_queued: 0,
    unapplied_effects_flagged: 0,
    fetch_failed: 0,
    errors: 0,
  };

  const tally = (delta: Partial<SweepCounts>) => {
    for (const k of Object.keys(delta) as Array<keyof SweepCounts>) {
      counts[k] += delta[k] ?? 0;
    }
  };

  await runWithConcurrency(legQueue, CONCURRENCY, async (ref) => {
    counts.scanned += 1;
    try {
      tally(await processRef(admin, ref));
    } catch (err) {
      counts.errors += 1;
      console.warn(
        '[amendments-sweep] processRef threw',
        ref.id,
        (err as Error)?.message,
      );
    }
  });

  await runWithConcurrency(govQueue, CONCURRENCY, async (ref) => {
    counts.scanned += 1;
    try {
      tally(await processGovUkContentRef(admin, ref));
    } catch (err) {
      counts.errors += 1;
      console.warn(
        '[amendments-sweep] processGovUkContentRef threw',
        ref.id,
        (err as Error)?.message,
      );
    }
  });

  return NextResponse.json({
    ok: true,
    queue: legQueue.length + govQueue.length,
    queue_breakdown: {
      legislation: legQueue.length,
      'gov-uk-content': govQueue.length,
    },
    counts,
  });
}
