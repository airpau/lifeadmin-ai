import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300; // 5 minutes — checking many sources

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * Monthly legal reference verification cron.
 * Schedule: 1st of each month at 6am — configured in vercel.json
 *
 * Two verification methods:
 * a) Statutes: Check legislation.gov.uk API for amendments
 * b) Regulator rules: Fetch source page + Claude Haiku comparison
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    errors: 0,
  };

  const issues: Array<{ id: string; law: string; issue: string }> = [];

  for (const ref of refs) {
    try {
      if (ref.source_type === 'statute') {
        // ============================================
        // STATUTE VERIFICATION via legislation.gov.uk
        // ============================================
        await verifyStatute(supabase, ref, results, issues);
      } else {
        // ============================================
        // REGULATOR VERIFICATION via Claude Haiku
        // ============================================
        await verifyRegulatorRule(supabase, ref, results, issues);
      }
      results.checked++;
    } catch (err) {
      console.error(`[verify-legal] Error checking ${ref.law_name}:`, err);
      results.errors++;
    }

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  // Log to business_log if any issues found
  if (issues.length > 0) {
    await supabase.from('business_log').insert({
      category: 'legal_verification',
      action: 'monthly_check',
      details: {
        summary: `Legal reference verification: ${results.needs_review} need review, ${results.updated} auto-updated out of ${results.total} references`,
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
        // Page doesn't load — flag for review
        await supabase
          .from('legal_references')
          .update({
            verification_status: 'needs_review',
            verification_notes: `Source URL returned ${pageRes.status} on ${new Date().toISOString()}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);
        results.needs_review++;
        issues.push({ id: ref.id, law: ref.law_name, issue: `Source URL returned ${pageRes.status}` });
      }
      return;
    }

    const xml = await res.text();

    // Check for amendment markers in the XML
    // legislation.gov.uk XML contains <ukm:UnappliedEffects> for pending amendments
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
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);
      results.needs_review++;
      issues.push({ id: ref.id, law: `${ref.law_name} ${ref.section || ''}`, issue: 'Possible repeal detected' });
    } else if (hasUnappliedEffects) {
      // There are pending amendments — flag but don't panic
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          verification_notes: `Unapplied amendments pending as of ${new Date().toISOString()}. Legislation still current.`,
          last_verified: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);
      results.current++;
    } else {
      // All good
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          last_verified: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);
      results.current++;
    }
  } catch (fetchErr: any) {
    // Network error — don't change status, just log
    console.error(`[verify-legal] Failed to fetch ${dataUrl}:`, fetchErr.message);
    results.errors++;
  }
}

// ============================================
// Verify a regulator rule via Claude Haiku
// ============================================
async function verifyRegulatorRule(
  supabase: any,
  ref: any,
  results: any,
  issues: any[]
) {
  // Fetch the current source page
  let pageContent = '';
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
      results.needs_review++;
      issues.push({ id: ref.id, law: ref.law_name, issue: `Source returned ${res.status}` });
      return;
    }

    const html = await res.text();
    // Extract text content (strip HTML tags, limit to ~4000 chars)
    pageContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  } catch (fetchErr: any) {
    console.error(`[verify-legal] Failed to fetch ${ref.source_url}:`, fetchErr.message);
    // Can't verify — leave status as-is
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

  // Send to Claude Haiku for comparison
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
{"changed": boolean, "changes": ["list of specific changes found"], "updated_summary": "updated summary if changed, or empty string if unchanged"}

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
      // Auto-update the reference
      const oldSummary = ref.summary;
      const newSummary = result.updated_summary || ref.summary;

      await supabase
        .from('legal_references')
        .update({
          summary: newSummary,
          verification_status: 'updated',
          last_verified: new Date().toISOString(),
          last_changed: new Date().toISOString(),
          verification_notes: `Auto-updated on ${new Date().toISOString()}. Changes: ${result.changes.join('; ')}. Previous summary: ${oldSummary}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);

      results.updated++;
      issues.push({
        id: ref.id,
        law: `${ref.law_name} ${ref.section || ''}`,
        issue: `Auto-updated: ${result.changes.join('; ')}`,
      });
    } else {
      // No changes detected
      await supabase
        .from('legal_references')
        .update({
          verification_status: 'current',
          last_verified: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ref.id);
      results.current++;
    }
  } catch (aiErr: any) {
    console.error(`[verify-legal] Claude Haiku error for ${ref.law_name}:`, aiErr.message);
    results.errors++;
  }
}
