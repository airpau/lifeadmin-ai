import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import {
  fetchStatuteByUri,
  hashLegislationDoc,
  isLegislationGovUkUrl,
} from '@/lib/legal-data/legislation-gov-uk';
import {
  decideLegislationStatus,
  detectRepeal,
  itemLabel,
  type LegislationStatus,
} from '@/lib/legal-data/legislation-intelligence';

export const maxDuration = 300; // 5 minutes — many legislation.gov.uk fetches

/**
 * Weekly legislation self-learning loop. Schedule: Sunday 08:00 UTC
 * (configured in vercel.json as `/api/cron/legislation-reverify`).
 *
 * For each tracked legislation_items row (one per Act/section/SI cited in
 * dispute letters):
 *   1. Fetch the canonical Akoma-Ntoso XML from legislation.gov.uk.
 *   2. Hash the canonical body and compare to the stored fingerprint.
 *   3. Advance the lifecycle: pending -> confirmed | amended | needs_review
 *      | failed (see legislation-intelligence.ts for the rules).
 *   4. On a detected change, append a legislation_change_log row (old/new
 *      text, source URL, affected dispute count) and flag the linked
 *      legal_reference for founder review — WITHOUT mutating any protected
 *      canonical field (compliance principle).
 *   5. Self-heal: 3 consecutive fetch failures escalate to the founder via
 *      Telegram instead of retrying silently forever.
 *   6. Report: a weekly Telegram digest (X verified / Y updated / Z need
 *      review) plus an immediate alert for each material change.
 *
 * Cursor / batching: items are processed stalest-first
 * (last_verified_at ASC NULLS FIRST). A `limit` (default 200, override via
 * ?limit=) caps work per run, so if the catalogue ever outgrows a single
 * 5-minute window the next run continues where this one left off. With the
 * current ~90 statutes a single run is a full pass.
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 200, 500));

  const { data: items, error } = await supabase
    .from('legislation_items')
    .select('*')
    .order('last_verified_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, message: 'No legislation_items to verify', total: 0 });
  }

  const results = {
    total: items.length,
    confirmed: 0,
    amended: 0,
    needs_review: 0,
    failed: 0,
    changes_logged: 0,
    escalations: 0,
  };

  // Material changes + escalations collected for the founder alert.
  const materialAlerts: Array<{ label: string; reason: string; affected: number; url: string }> = [];

  const nowIso = new Date().toISOString();

  for (const item of items) {
    try {
      const reachable = isLegislationGovUkUrl(item.source_url);
      const doc = reachable
        ? await fetchStatuteByUri(item.source_url, { timeoutMs: 12000 }).catch(() => null)
        : null;

      const newHash = doc ? await hashLegislationDoc(doc) : null;
      const fetchFailed = newHash === null;
      const nextFailures = fetchFailed ? (item.consecutive_failures ?? 0) + 1 : 0;

      const decision = decideLegislationStatus({
        priorHash: item.content_hash ?? null,
        newHash,
        hasUnappliedEffects: doc?.hasUnappliedEffects ?? false,
        repealDetected: doc ? detectRepeal(doc) : false,
        consecutiveFailures: nextFailures,
      });

      // --- Persist the item state ---------------------------------------
      const update: Record<string, unknown> = {
        status: decision.status,
        last_attempt_at: nowIso,
        consecutive_failures: nextFailures,
        notes: decision.reason,
        updated_at: nowIso,
      };
      // last_verified_at only advances when a verification actually COMPLETED
      // (i.e. we fetched the canonical text). A pure fetch failure must NOT
      // bump it, or the stalest-first cursor would skip a persistently-dead
      // source.
      if (!fetchFailed) {
        update.last_verified_at = nowIso;
        update.content_hash = newHash;
        update.last_amended = doc?.lastAmended ?? item.last_amended ?? null;
        update.unapplied_effects = doc?.hasUnappliedEffects ?? false;
        // Snapshot the canonical body (capped) so the change log can diff.
        update.current_text = (doc?.sectionText || doc?.title || '').slice(0, 8000);
      }
      if (decision.escalate && !item.escalated_at) {
        update.escalated_at = nowIso;
      }

      await supabase.from('legislation_items').update(update).eq('id', item.id);

      // --- Tally ---------------------------------------------------------
      tally(results, decision.status);
      if (decision.escalate) results.escalations++;

      // --- Log the change + flag the citation for review ----------------
      if (decision.isChange && decision.changeType) {
        const affected = await countAffectedDisputes(supabase, item.legal_reference_id);

        await supabase.from('legislation_change_log').insert({
          legislation_item_id: item.id,
          act_name: item.act_name,
          section: item.section,
          change_type: decision.changeType,
          old_text: item.current_text ?? null,
          new_text: (update.current_text as string | undefined) ?? null,
          old_hash: item.content_hash ?? null,
          new_hash: newHash,
          source_url: item.source_url,
          affected_dispute_count: affected,
          material: decision.material,
          telegram_sent: false,
          notes: decision.reason,
        });
        results.changes_logged++;

        // Flag the linked citation for founder review using REVIEW FLAGS
        // ONLY — never the protected canonical fields (law_name, source_url,
        // source_type, verification_status -> trusted). Demotion/flagging is
        // safe; promotion requires founder approval via legal_ref_corrections.
        if (decision.material && item.legal_reference_id) {
          await supabase
            .from('legal_references')
            .update({
              pending_review: true,
              is_stale: true,
              unapplied_effects: decision.changeType === 'unapplied_effects' ? true : undefined,
              verification_notes: `[legislation-reverify ${nowIso}] ${decision.reason} — see legislation_change_log`,
              updated_at: nowIso,
            })
            .eq('id', item.legal_reference_id);
        }

        if (decision.material) {
          materialAlerts.push({
            label: itemLabel(item),
            reason: decision.reason,
            affected,
            url: item.source_url,
          });
        }
      }
    } catch (err) {
      console.error('[legislation-reverify] item failed', item.id, err instanceof Error ? err.message : err);
      results.failed++;
    }
    // Be polite to legislation.gov.uk.
    await new Promise((r) => setTimeout(r, 150));
  }

  await sendFounderDigest(supabase, results, materialAlerts);

  // Mark the alerted change rows as sent.
  if (materialAlerts.length > 0) {
    await supabase
      .from('legislation_change_log')
      .update({ telegram_sent: true })
      .eq('material', true)
      .eq('telegram_sent', false);
  }

  // Audit trail.
  try {
    await supabase.from('business_log').insert({
      category: 'legislation_intelligence',
      action: 'weekly_reverify',
      details: { ...results, material_changes: materialAlerts.length },
    });
  } catch {
    /* best-effort */
  }

  console.log('[legislation-reverify] Results:', results);
  return NextResponse.json({ ok: true, ...results });
}

// ---------------------------------------------------------------------------

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function tally(results: { confirmed: number; amended: number; needs_review: number; failed: number }, status: LegislationStatus) {
  if (status === 'confirmed') results.confirmed++;
  else if (status === 'amended') results.amended++;
  else if (status === 'needs_review') results.needs_review++;
  else if (status === 'failed') results.failed++;
}

/**
 * How many dispute / complaint letters cite this legal reference. Drives the
 * "what's affected" line in the founder alert. Best-effort: legal_ref_usages
 * is the canonical artefact-citation ledger.
 */
async function countAffectedDisputes(
  supabase: SupabaseClient,
  legalReferenceId: string | null,
): Promise<number> {
  if (!legalReferenceId) return 0;
  const { count } = await supabase
    .from('legal_ref_usages')
    .select('id', { count: 'exact', head: true })
    .eq('ref_id', legalReferenceId)
    .in('artefact_kind', ['dispute_letter', 'b2b_dispute', 'complaint_letter']);
  return count ?? 0;
}

/**
 * Weekly digest + immediate material-change alerts to the founder's Telegram.
 * Uses the same env-var pattern (TELEGRAM_BOT_TOKEN + TELEGRAM_FOUNDER_CHAT_ID)
 * as the other legal crons (citation-canary, legal-coverage-alert).
 */
async function sendFounderDigest(
  _supabase: SupabaseClient,
  results: typeof RESULTS_SHAPE,
  materialAlerts: Array<{ label: string; reason: string; affected: number; url: string }>,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[legislation-reverify] Telegram not configured — skipping digest');
    return;
  }

  const lines: string[] = [
    '⚖️ *Weekly legislation check*',
    '',
    `✅ ${results.confirmed} verified current`,
    `🔄 ${results.amended} updated/amended`,
    `⚠️ ${results.needs_review} need manual review`,
  ];
  if (results.failed > 0) lines.push(`❌ ${results.failed} fetch failures (will retry)`);
  if (results.escalations > 0) lines.push(`🚨 ${results.escalations} escalated after repeated failures`);

  if (materialAlerts.length > 0) {
    lines.push('', `*${materialAlerts.length} item${materialAlerts.length === 1 ? '' : 's'} changed materially:*`);
    for (const a of materialAlerts.slice(0, 10)) {
      const affected = a.affected > 0 ? ` — affects ${a.affected} letter${a.affected === 1 ? '' : 's'}` : '';
      lines.push(`• *${a.label}*: ${a.reason}${affected}`);
    }
    if (materialAlerts.length > 10) lines.push(`…and ${materialAlerts.length - 10} more`);
    lines.push('', 'Review at /dashboard/admin/legal-refs');
  } else {
    lines.push('', 'No material changes. Nothing needs your attention.');
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.warn('[legislation-reverify] Telegram send failed', e instanceof Error ? e.message : e);
  }
}

// Type anchor for the digest signature.
const RESULTS_SHAPE = {
  total: 0,
  confirmed: 0,
  amended: 0,
  needs_review: 0,
  failed: 0,
  changes_logged: 0,
  escalations: 0,
};
