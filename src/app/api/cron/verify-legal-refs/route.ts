import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

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

  const { data: refs, error } = await supabase
    .from('legal_references')
    .select('*')
    .order('category');

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
  };

  const issues: Array<{ id: string; law: string; issue: string }> = [];

  for (const ref of refs) {
    try {
      if (ref.source_type === 'statute') {
        await verifyStatute(supabase, ref, results, issues);
      } else {
        await verifyRegulatorRule(supabase, ref, results, issues);
      }
      results.checked++;
    } catch (err) {
      console.error(`[verify-legal] Error checking ${ref.law_name}:`, err);
      results.errors++;
      // Log failed check
      await supabase.from('legal_audit_log').insert({
        legal_reference_id: ref.id,
        check_type: ref.source_type === 'statute' ? 'http_head' : 'ai_comparison',
        result: 'check_failed',
        details: err instanceof Error ? err.message : String(err),
      });
      // Confidence decay on failure
      const newConfidence = Math.max(0, (ref.confidence_score || 100) - 20);
      await supabase.from('legal_references').update({ confidence_score: newConfidence }).eq('id', ref.id);
    }

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

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
) {
  // legislation.gov.uk provides data feeds — check for amendment info
  // The /data.xml endpoint returns metadata including amendment dates
  const dataUrl = ref.source_url.replace(/\/$/, '') + '/data.xml';

  try {
    const res = await fetch(dataUrl, {
      headers: {
        'User-Agent': 'Paybacker-LegalVerifier/1.0 (hello@paybacker.co.uk)',
        'Accept': 'application/xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // If data.xml not available, try the main page
      const pageRes = await fetch(ref.source_url, {
        headers: { 'User-Agent': 'Paybacker-LegalVerifier/1.0 (hello@paybacker.co.uk)' },
        signal: AbortSignal.timeout(10000),
      });

      if (pageRes.ok) {
        // Page exists and loads — mark as current
        await supabase
          .from('legal_references')
          .update({
            verification_status: 'current',
            last_verified: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);
        results.current++;
      } else {
        // Page doesn't load — queue for review
        await supabase
          .from('legal_references')
          .update({
            verification_status: 'needs_review',
            verification_notes: `Source URL returned ${pageRes.status} on ${new Date().toISOString()}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        await supabase.from('legal_update_queue').insert({
          legal_reference_id: ref.id,
          change_type: 'content_update',
          source_url: ref.source_url,
          detected_change_summary: `Source URL returned HTTP ${pageRes.status} — page may have moved or been removed`,
          confidence: 'medium',
          status: 'pending',
        });

        results.needs_review++;
        issues.push({ id: ref.id, law: ref.law_name, issue: `Source URL returned ${pageRes.status}` });
      }
      return;
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
    } else {
      // All good — update hash if we didn't have one
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          last_verified: new Date().toISOString(),
          content_hash: newHash,
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
    }
  } catch (fetchErr: any) {
    // Network error — don't change status, just log
    console.error(`[verify-legal] Failed to fetch ${dataUrl}:`, fetchErr.message);
    results.errors++;
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
) {
  // Fetch the current source page
  let pageContent = '';
  let rawHtml = '';
  try {
    const res = await fetch(ref.source_url, {
      headers: { 'User-Agent': 'Paybacker-LegalVerifier/1.0 (hello@paybacker.co.uk)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'needs_review',
          verification_notes: `Source URL returned ${res.status} on ${new Date().toISOString()}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);

      await supabase.from('legal_update_queue').insert({
        legal_reference_id: ref.id,
        change_type: 'regulator_change',
        source_url: ref.source_url,
        detected_change_summary: `Source URL returned HTTP ${res.status} — regulator page may have changed`,
        confidence: 'medium',
        status: 'pending',
      });

      results.needs_review++;
      issues.push({ id: ref.id, law: ref.law_name, issue: `Source returned ${res.status}` });
      return;
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
    return;
  }

  if (!pageContent || pageContent.length < 50) {
    // Not enough content to compare
    results.current++;
    await supabase
      .from('legal_references')
      .update({ last_verified: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', ref.id);
    return;
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
    return;
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
      return;
    }

    let raw = content.text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      results.errors++;
      return;
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
      }
    } else {
      // No material changes detected — update hash and timestamp
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          last_verified: new Date().toISOString(),
          content_hash: newHash,
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
    }
  } catch (aiErr: any) {
    console.error(`[verify-legal] Claude Haiku error for ${ref.law_name}:`, aiErr.message);

    // Store the new hash even on AI error, so we don't re-trigger next time
    await supabase
      .from('legal_references')
      .update({ content_hash: newHash, last_verified: new Date().toISOString() })
      .eq('id', ref.id);

    results.errors++;
  }
}
