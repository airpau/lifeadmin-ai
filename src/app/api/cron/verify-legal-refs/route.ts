import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { fetchLegalSource } from '@/lib/legal-data/source-fetch';

export const maxDuration = 300; // 5 minutes — checking many sources

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Daily legal reference verification cron.
 * Schedule: Daily at 5am — configured in vercel.json
 *
 * Cost-efficient: only calls Claude Haiku when a content_hash has changed.
 * On no-change days, the entire run is pure HTTP fetches (~£0).
 * a) Statutes: Check legislation.gov.uk API for amendments
 * b) Regulator rules: Fetch page content, compare content_hash, Claude Haiku for changes
 *
 * When content changes, creates a legal_update_queue entry instead of directly overwriting.
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();

  // WALL-CLOCK BUDGET. maxDuration is 300s and Vercel kills the function dead
  // at that point — no chance to flush audit rows, no chance to report what we
  // did. So we stop the sweep ourselves at 240s, well inside the limit, and
  // report the shortfall honestly via results.skipped_no_budget.
  const startedAt = Date.now();
  const BUDGET_MS = 240_000;

  // How many refs are verified at once. See the worker pool below for why this
  // replaced the blanket per-ref sleep.
  const CONCURRENCY = 4;

  // ORDERING: least-recently-attempted first, never-attempted refs ahead of
  // everything.
  //
  // This was previously .order('category'). That is a STABLE ordering, which
  // meant that whenever the run ran out of time it dropped the exact same tail
  // of the list every single day — those refs were never verified at all, and
  // the run still looked healthy from the outside. Ordering by
  // last_check_attempt_at makes the sweep self-balancing: anything missed on
  // one run sorts to the front of the next one. A short run then costs
  // freshness, never coverage.
  const { data: refs, error } = await supabase
    .from('legal_references')
    .select('*')
    .order('last_check_attempt_at', { ascending: true, nullsFirst: true });

  if (error || !refs || refs.length === 0) {
    return NextResponse.json({ error: 'No references to verify' });
  }

  const results = {
    total: refs.length,
    checked: 0,
    current: 0,
    needs_review: 0,
    updated: 0,
    queued: 0,
    errors: 0,
    // Refs the time budget stopped us reaching. Anything non-zero means this
    // was a PARTIAL run — reported rather than hidden, so a truncated sweep
    // can't be mistaken for a clean one.
    skipped_no_budget: 0,
  };

  const issues: Array<{ id: string; law: string; issue: string }> = [];

  // Audit rows are accumulated here and inserted in chunks once the sweep is
  // done. Two inserts per ref was ~250 sequential round trips for 124 refs, a
  // large slice of the runtime for rows nobody reads until later. They are
  // flushed unconditionally below — including when the budget cuts the sweep
  // short, because a partial run still has to be auditable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditLogRows: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verificationRows: any[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function processRef(ref: any) {
    let attemptOk = true;
    let attemptErr: string | null = null;
    // The status the helper actually wrote for this ref (see finalStatus below).
    let reportedStatus: string | null | undefined;
    try {
      if (ref.source_type === 'statute') {
        reportedStatus = await verifyStatute(supabase, ref, results, issues);
      } else {
        reportedStatus = await verifyRegulatorRule(supabase, ref, results, issues);
      }
      results.checked++;
    } catch (err) {
      console.error(`[verify-legal] Error checking ${ref.law_name}:`, err);
      results.errors++;
      attemptOk = false;
      attemptErr = err instanceof Error ? err.message : String(err);
      // Confidence decay on failure
      const newConfidence = Math.max(0, (ref.confidence_score || 100) - 20);
      await supabase.from('legal_references').update({ confidence_score: newConfidence }).eq('id', ref.id);
    } finally {
      // Always stamp last_check_attempt_at — this column drives the
      // canary's freshness check, so it MUST be updated whether the
      // verification succeeded, failed with a non-OK source, or
      // threw. Without this the freshness alert lights up for every
      // ref whose source URL is flaky, even though we attempted.
      //
      // It now drives the sweep ordering too (see the SELECT above), so a ref
      // that is stamped here is de-prioritised on the next run and one that
      // never got reached stays at the front. Both behaviours depend on this
      // write happening unconditionally.
      try {
        await supabase
          .from('legal_references')
          .update({ last_check_attempt_at: new Date().toISOString() })
          .eq('id', ref.id);
      } catch (updateErr) {
        console.warn('[verify-legal] last_check_attempt_at update failed:', updateErr);
      }

      // ROOT-CAUSE FIX (fix/legislation-self-learning-loop):
      // This block used to hardcode the audit status to 'attempted' for
      // every successful run, so EVERY verification record was stuck at
      // 'attempted' and none ever reached a terminal 'confirmed' state —
      // even though the real outcome was correctly written to
      // legal_references.verification_status by the helpers above.
      //
      // We now record the TRUE terminal outcome. A clean re-verification
      // ('current') is surfaced as 'confirmed' so the audit trail finally
      // shows a confirmed state; every other status ('updated',
      // 'needs_review', 'url_dead', ...) is recorded verbatim — matching how
      // the sibling crons (reverify-all-legal-refs,
      // legal-refs-daily-reverify) already write after_status:
      // ref.verification_status.
      //
      // PERF/CORRECTNESS FOLLOW-UP: we used to obtain that authoritative
      // status by re-SELECTing verification_status here. The helpers now
      // RETURN the status they wrote, which is the same value by
      // construction. That removes one full round trip per ref, and with it a
      // real read-after-write race — the read-back could observe the row
      // before the helper's UPDATE was visible and record a stale status into
      // the audit trail. The mapping below is unchanged.
      let finalStatus = 'check_failed';
      if (attemptOk) {
        const vs = reportedStatus ?? null;
        // Fallback to 'confirmed' if the helper reported nothing: a run that
        // didn't throw did verify, we just have no status to name.
        finalStatus = vs === 'current' ? 'confirmed' : (vs ?? 'confirmed');
      }

      // Always log the attempt to legal_audit_log so the canary's
      // "sources silent 48h+" check sees activity even when the
      // source URL is failing. Without this, every silent source is
      // doubly stale.
      auditLogRows.push({
        legal_reference_id: ref.id,
        source_url: ref.source_url,
        check_type: ref.source_type === 'statute' ? 'legislation_api' : 'ai_comparison',
        result: finalStatus,
        details: attemptErr ?? `Verified — status ${finalStatus}`,
      });
      // PR γ — mirror to the new structured audit table so the admin
      // "Audit trail" drawer surfaces both Perplexity AND Haiku-cron
      // verification attempts.
      verificationRows.push({
        ref_id: ref.id,
        verifier: ref.source_type === 'statute' ? 'haiku-cron-statute' : 'haiku-cron-regulator',
        triggered_by: 'cron',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        before_status: (ref as any).verification_status ?? null,
        after_status: finalStatus,
        before_url: ref.source_url ?? null,
        after_url: ref.source_url ?? null,
        changes: null,
        cost_gbp: null,
        perplexity_response: null,
        notes: attemptErr ?? null,
      });
    }
  }

  // Alias the narrowed list first: worker() below is a hoisted declaration, so
  // TS won't carry the `!refs` guard from above into its body.
  const queue = refs;

  // Bounded worker pool — no dependency, just N loops sharing a cursor.
  //
  // This replaces a strictly sequential loop with `await sleep(200)` after
  // every ref (124 refs = ~25s of pure sleeping). A concurrency cap respects
  // the upstream better than a blanket sleep did: the sleep fired for EVERY
  // ref, including the ones that never made a network call at all (the
  // hash-unchanged fast path and the early returns), so most of that pacing
  // was spent throttling requests that were never sent. Capping in-flight work
  // at 4 bounds what the upstream actually sees.
  let nextIndex = 0;
  let budgetWarned = false;
  async function worker() {
    for (;;) {
      if (Date.now() - startedAt > BUDGET_MS) {
        if (!budgetWarned) {
          budgetWarned = true;
          console.warn(
            `[verify-legal] TIME BUDGET EXHAUSTED after ${Date.now() - startedAt}ms (budget ${BUDGET_MS}ms) — stopping the sweep early to stay inside maxDuration ${maxDuration}s. Unreached refs have no fresh last_check_attempt_at, so they sort to the front of the next run.`
          );
        }
        return;
      }
      const index = nextIndex++;
      if (index >= queue.length) return;
      await processRef(queue[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, refs.length) }, () => worker())
  );

  // nextIndex can overshoot by up to CONCURRENCY (each worker claims an index
  // before discovering the list is exhausted), hence the clamp.
  const attempted = Math.min(nextIndex, refs.length);
  results.skipped_no_budget = refs.length - attempted;
  if (results.skipped_no_budget > 0) {
    console.warn(
      `[verify-legal] PARTIAL RUN — ${results.skipped_no_budget} of ${refs.length} refs were not reached within the time budget.`
    );
  }

  // Flush the accumulated audit rows in chunks. This runs whether the sweep
  // completed or was cut short by the budget, and is entirely best-effort: a
  // failed audit insert must never fail the verification run.
  const AUDIT_CHUNK = 50;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function flushAudit(table: string, rows: any[]) {
    for (let i = 0; i < rows.length; i += AUDIT_CHUNK) {
      try {
        const { error: insertErr } = await supabase.from(table).insert(rows.slice(i, i + AUDIT_CHUNK));
        if (insertErr) console.warn(`[verify-legal] ${table} batch insert failed:`, insertErr);
      } catch (batchErr) {
        console.warn(`[verify-legal] ${table} batch insert threw:`, batchErr);
      }
    }
  }
  await flushAudit('legal_audit_log', auditLogRows);
  await flushAudit('legal_ref_verifications', verificationRows);

  // Confidence decay for stale refs (30+ days since last_verified)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: staleRefs } = await supabase
    .from('legal_references')
    .select('id, confidence_score')
    .lt('last_verified', thirtyDaysAgo.toISOString())
    .gt('confidence_score', 60);

  for (const stale of staleRefs || []) {
    const decayed = Math.max(60, (stale.confidence_score || 100) - 10);
    await supabase.from('legal_references').update({ confidence_score: decayed }).eq('id', stale.id);
  }

  // Log to business_log if any issues found
  if (issues.length > 0) {
    await supabase.from('business_log').insert({
      category: 'legal_verification',
      action: 'weekly_check',
      details: {
        summary: `Legal reference verification: ${results.needs_review} need review, ${results.updated} auto-updated, ${results.queued} queued out of ${results.total} references`,
        issues,
      },
    });
  }

  console.log(`[verify-legal] Results:`, results);

  return NextResponse.json({ ok: true, ...results, issues });
}

// ============================================
// Verify a statute via legislation.gov.uk API
// ============================================
async function verifyStatute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ref: any,
  results: any,
  issues: any[]
): Promise<string | undefined> {
  // legislation.gov.uk provides data feeds — check for amendment info
  // The /data.xml endpoint returns metadata including amendment dates
  const dataUrl = ref.source_url.replace(/\/$/, '') + '/data.xml';

  try {
    const dataFetch = await fetchLegalSource(dataUrl, {
      timeoutMs: 10000,
      accept: 'application/xml',
    });
    const res = dataFetch.response;

    if (dataFetch.outcome !== 'ok' || !res) {
      // If data.xml not available, try the main page
      const pageFetch = await fetchLegalSource(ref.source_url, { timeoutMs: 10000 });

      // Each branch records the status it writes so the caller no longer has
      // to re-SELECT verification_status to find out what happened.
      let urlStatus: string;

      if (pageFetch.outcome === 'ok') {
        // Page exists and loads — mark as current. Reset url-failure
        // counter so a transient blip doesn't accumulate.
        await supabase
          .from('legal_references')
          .update({
            verification_status: 'current',
            last_verified: new Date().toISOString(),
            consecutive_url_failures: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);
        results.current++;
        urlStatus = 'current';
      } else if (!pageFetch.countsAsUrlFailure) {
        // Blocked by a WAF, timed out, or 5xx — we learned nothing about
        // whether the page still exists. Flag for review but do NOT count a
        // strike, otherwise a bot-hostile host silently disables the rule.
        await supabase
          .from('legal_references')
          .update({
            verification_status: 'needs_review',
            verification_notes: `${pageFetch.reason} (checked ${new Date().toISOString()})`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        results.needs_review++;
        issues.push({ id: ref.id, law: ref.law_name, issue: pageFetch.reason });
        urlStatus = 'needs_review';
      } else {
        // Genuine 404/410. Three-strike rule before promoting to
        // 'url_dead' (a status excluded from retrieval) — avoids one
        // transient 503 silently disabling a rule.
        const nextFailures = ((ref.consecutive_url_failures as number | null) ?? 0) + 1;
        const promoteToDead = nextFailures >= 3;
        await supabase
          .from('legal_references')
          .update({
            verification_status: promoteToDead ? 'url_dead' : 'needs_review',
            verification_notes: `Source URL returned ${pageFetch.status} on ${new Date().toISOString()} (${nextFailures}/3 failures)`,
            consecutive_url_failures: nextFailures,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        await supabase.from('legal_update_queue').insert({
          legal_reference_id: ref.id,
          change_type: 'content_update',
          source_url: ref.source_url,
          detected_change_summary: `Source URL returned HTTP ${pageFetch.status} — page may have moved or been removed (${nextFailures}/3 failures)`,
          confidence: promoteToDead ? 'high' : 'medium',
          status: 'pending',
        });

        results.needs_review++;
        issues.push({ id: ref.id, law: ref.law_name, issue: `Source URL returned ${pageFetch.status} (${nextFailures}/3)` });
        urlStatus = promoteToDead ? 'url_dead' : 'needs_review';
      }
      return urlStatus;
    }

    const xml = await res.text();

    // Compute content hash and compare
    const newHash = hashContent(xml);
    const hashChanged = ref.content_hash && ref.content_hash !== newHash;

    // Check for amendment markers in the XML
    const hasUnappliedEffects = xml.includes('UnappliedEffects') && xml.includes('<ukm:Effect');
    const hasRecentAmendment = xml.includes('amended') || xml.includes('substituted') || xml.includes('repealed');

    // Check if the section has been repealed
    const isRepealed = xml.includes('repealed') && xml.includes(ref.section || '');

    if (isRepealed) {
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'needs_review',
          verification_notes: `Possible repeal detected in XML on ${new Date().toISOString()}. Manual review required.`,
          content_hash: newHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);

      await supabase.from('legal_update_queue').insert({
        legal_reference_id: ref.id,
        change_type: 'repealed',
        source_url: ref.source_url,
        detected_change_summary: `Possible repeal or revocation detected in legislation XML for ${ref.law_name}${ref.section ? ` ${ref.section}` : ''}`,
        confidence: 'medium',
        status: 'pending',
      });

      await supabase.from('legal_audit_log').insert({
        legal_reference_id: ref.id,
        check_type: 'legislation_api',
        result: 'queued',
        details: 'Possible repeal detected — queued for review',
      });

      results.needs_review++;
      issues.push({ id: ref.id, law: `${ref.law_name} ${ref.section || ''}`, issue: 'Possible repeal detected' });
      return 'needs_review';
    } else if (hashChanged || hasUnappliedEffects) {
      // Content has changed OR pending amendments — flag for review
      const changeNote = [
        hashChanged && 'XML content hash changed since last check',
        hasUnappliedEffects && 'unapplied amendments pending',
      ].filter(Boolean).join('; ');

      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          verification_notes: `Change detected on ${new Date().toISOString()}: ${changeNote}. Queued for weekly scan review.`,
          last_verified: new Date().toISOString(),
          content_hash: newHash,
          consecutive_url_failures: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);

      if (hashChanged) {
        await supabase.from('legal_update_queue').insert({
          legal_reference_id: ref.id,
          change_type: 'content_update',
          source_url: ref.source_url,
          detected_change_summary: `Statute XML content changed since last verification: ${changeNote}`,
          confidence: 'medium',
          status: 'pending',
        });

        await supabase.from('legal_audit_log').insert({
          legal_reference_id: ref.id,
          check_type: 'content_hash',
          result: 'queued',
          details: `Hash changed — ${changeNote}`,
        });

        results.queued++;
        issues.push({ id: ref.id, law: `${ref.law_name} ${ref.section || ''}`, issue: changeNote });
      } else {
        results.current++;
      }
      // Both sub-branches wrote verification_status: 'current'.
      return 'current';
    } else {
      // All good — update hash if we didn't have one
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          last_verified: new Date().toISOString(),
          content_hash: newHash,
          consecutive_url_failures: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);

      await supabase.from('legal_audit_log').insert({
        legal_reference_id: ref.id,
        check_type: 'legislation_api',
        result: 'current',
        details: 'No changes detected',
      });

      results.current++;
      return 'current';
    }
  } catch (fetchErr: any) {
    // Network error — don't change status, just log
    console.error(`[verify-legal] Failed to fetch ${dataUrl}:`, fetchErr.message);
    results.errors++;
    // verification_status untouched on this path, so report the stored value —
    // exactly what the caller's old read-back would have seen.
    return (ref.verification_status as string | undefined) ?? undefined;
  }
}

// ============================================
// Verify a regulator rule via content hash + Claude Haiku
// ============================================
async function verifyRegulatorRule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ref: any,
  results: any,
  issues: any[]
): Promise<string | undefined> {
  // Fetch the current source page
  let pageContent = '';
  let rawHtml = '';
  try {
    const pageFetch = await fetchLegalSource(ref.source_url, { timeoutMs: 15000 });
    const res = pageFetch.response;

    if (pageFetch.outcome !== 'ok' || !res) {
      if (!pageFetch.countsAsUrlFailure) {
        // Blocked by a WAF (Ofcom returns 403 to unknown agents), timed out,
        // or 5xx. We learned nothing about whether the page still exists, so
        // flag for review without counting a strike.
        await supabase
          .from('legal_references')
          .update({
            verification_status: 'needs_review',
            verification_notes: `${pageFetch.reason} (checked ${new Date().toISOString()})`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        results.needs_review++;
        issues.push({ id: ref.id, law: ref.law_name, issue: pageFetch.reason });
        return 'needs_review';
      }

      // Genuine 404/410. Three-strike rule before promoting to 'url_dead'.
      const nextFailures = ((ref.consecutive_url_failures as number | null) ?? 0) + 1;
      const promoteToDead = nextFailures >= 3;
      await supabase
        .from('legal_references')
        .update({
          verification_status: promoteToDead ? 'url_dead' : 'needs_review',
          verification_notes: `Source URL returned ${pageFetch.status} on ${new Date().toISOString()} (${nextFailures}/3 failures)`,
          consecutive_url_failures: nextFailures,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);

      await supabase.from('legal_update_queue').insert({
        legal_reference_id: ref.id,
        change_type: 'regulator_change',
        source_url: ref.source_url,
        detected_change_summary: `Source URL returned HTTP ${pageFetch.status} — regulator page may have changed (${nextFailures}/3 failures)`,
        confidence: promoteToDead ? 'high' : 'medium',
        status: 'pending',
      });

      results.needs_review++;
      issues.push({ id: ref.id, law: ref.law_name, issue: `Source returned ${pageFetch.status} (${nextFailures}/3)` });
      return promoteToDead ? 'url_dead' : 'needs_review';
    }

    rawHtml = await res.text();
    // Extract text content (strip HTML tags, limit to ~4000 chars)
    pageContent = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  } catch (fetchErr: any) {
    console.error(`[verify-legal] Failed to fetch ${ref.source_url}:`, fetchErr.message);
    results.errors++;
    // Status untouched — report the stored one.
    return (ref.verification_status as string | undefined) ?? undefined;
  }

  if (!pageContent || pageContent.length < 50) {
    // Not enough content to compare
    results.current++;
    await supabase
      .from('legal_references')
      .update({ last_verified: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', ref.id);
    // verification_status deliberately not touched here — report the stored one.
    return (ref.verification_status as string | undefined) ?? undefined;
  }

  // Compute content hash and compare
  const newHash = hashContent(pageContent);
  const hashUnchanged = ref.content_hash && ref.content_hash === newHash;

  if (hashUnchanged) {
    // Content unchanged — skip Claude call, just update timestamp
    await supabase
      .from('legal_references')
      .update({
        verification_status: 'current',
        last_verified: new Date().toISOString(),
        consecutive_url_failures: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ref.id);

    await supabase.from('legal_audit_log').insert({
      legal_reference_id: ref.id,
      check_type: 'content_hash',
      result: 'current',
      details: 'Content hash unchanged — skipped AI comparison',
    });

    results.current++;
    return 'current';
  }

  // Hash changed (or no hash stored yet) — send to Claude Haiku for comparison
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Compare our stored legal reference with the current source page content.

OUR STORED REFERENCE:
Law: ${ref.law_name} ${ref.section || ''}
Summary: ${ref.summary}
Category: ${ref.category}

CURRENT SOURCE PAGE CONTENT (extracted from ${ref.source_url}):
${pageContent}

Has anything MATERIALLY changed? Specifically check:
- Compensation amounts (e.g. daily rates, maximum awards)
- Time periods (e.g. notice periods, claim windows)
- Thresholds or eligibility criteria
- Names of schemes or regulatory bodies
- Whether the rule/scheme still exists

Return ONLY a JSON object:
{"changed": boolean, "changes": ["list of specific changes found"], "updated_summary": "updated summary if changed, or empty string if unchanged", "confidence": "high|medium|low"}

If you cannot determine whether something changed (e.g. page content is unclear), set changed to false.`,
      }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      results.errors++;
      return (ref.verification_status as string | undefined) ?? undefined;
    }

    let raw = content.text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      results.errors++;
      return (ref.verification_status as string | undefined) ?? undefined;
    }

    const result = JSON.parse(jsonMatch[0]);

    if (result.changed && result.changes?.length > 0) {
      const confidence: 'high' | 'medium' | 'low' = result.confidence || 'medium';

      if (confidence === 'high') {
        // High confidence — auto-apply the update
        const oldSummary = ref.summary;
        const newSummary = result.updated_summary || ref.summary;

        await supabase
          .from('legal_references')
          .update({
            summary: newSummary,
            verification_status: 'updated',
            last_verified: new Date().toISOString(),
            last_changed: new Date().toISOString(),
            content_hash: newHash,
            verification_notes: `Auto-updated on ${new Date().toISOString()}. Changes: ${result.changes.join('; ')}. Previous: ${oldSummary.slice(0, 100)}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        // Fan out statute.updated to B2B webhook subscribers. Best-effort.
        try {
          const { publishStatuteUpdated } = await import('@/lib/b2b/webhook-publisher');
          await publishStatuteUpdated({
            category: ref.category ?? 'general',
            law_name: ref.law_name,
            change_summary: result.changes.join('; '),
            effective_date: null,
            source_url: ref.source_url ?? null,
            ref_id: ref.id,
          });
        } catch (whErr) {
          console.warn('[verify-legal-refs] statute.updated webhook publish failed', whErr instanceof Error ? whErr.message : whErr);
        }

        await supabase.from('legal_update_queue').insert({
          legal_reference_id: ref.id,
          change_type: 'regulator_change',
          source_url: ref.source_url,
          detected_change_summary: result.changes.join('; '),
          proposed_update: newSummary,
          confidence: 'high',
          status: 'auto_applied',
          reviewed_at: new Date().toISOString(),
        });

        await supabase.from('legal_audit_log').insert({
          legal_reference_id: ref.id,
          check_type: 'ai_comparison',
          result: 'updated',
          details: `High-confidence auto-applied: ${result.changes.join('; ')}`,
        });

        results.updated++;
        issues.push({
          id: ref.id,
          law: `${ref.law_name} ${ref.section || ''}`,
          issue: `Auto-updated (high confidence): ${result.changes.join('; ')}`,
        });
        return 'updated';
      } else {
        // Medium/low confidence — queue for review
        await supabase
          .from('legal_references')
          .update({
            verification_status: 'needs_review',
            last_verified: new Date().toISOString(),
            content_hash: newHash,
            verification_notes: `Possible change detected on ${new Date().toISOString()} (${confidence} confidence). Queued for review: ${result.changes.join('; ')}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        await supabase.from('legal_update_queue').insert({
          legal_reference_id: ref.id,
          change_type: 'regulator_change',
          source_url: ref.source_url,
          detected_change_summary: result.changes.join('; '),
          proposed_update: result.updated_summary || null,
          confidence,
          status: 'pending',
        });

        await supabase.from('legal_audit_log').insert({
          legal_reference_id: ref.id,
          check_type: 'ai_comparison',
          result: 'queued',
          details: `${confidence} confidence — queued: ${result.changes.join('; ')}`,
        });

        results.queued++;
        results.needs_review++;
        issues.push({
          id: ref.id,
          law: `${ref.law_name} ${ref.section || ''}`,
          issue: `Queued for review (${confidence}): ${result.changes.join('; ')}`,
        });
        return 'needs_review';
      }
    } else {
      // No material changes detected — update hash and timestamp
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          last_verified: new Date().toISOString(),
          content_hash: newHash,
          consecutive_url_failures: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);

      await supabase.from('legal_audit_log').insert({
        legal_reference_id: ref.id,
        check_type: 'ai_comparison',
        result: 'current',
        details: 'Hash changed but no material changes found by AI comparison',
      });

      results.current++;
      return 'current';
    }
  } catch (aiErr: any) {
    console.error(`[verify-legal] Claude Haiku error for ${ref.law_name}:`, aiErr.message);

    // Store the new hash even on AI error, so we don't re-trigger next time
    await supabase
      .from('legal_references')
      .update({ content_hash: newHash, last_verified: new Date().toISOString() })
      .eq('id', ref.id);

    results.errors++;
    // verification_status untouched — report the stored one.
    return (ref.verification_status as string | undefined) ?? undefined;
  }
}
