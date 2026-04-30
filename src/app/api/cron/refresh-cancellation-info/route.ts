import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  buildCancellationPrompt,
  detectUkCity,
  providerKey,
  researchCancellationForProvider,
} from '@/lib/cancellation-provider';

export const maxDuration = 300;

/**
 * Weekly refresh of provider_cancellation_info. Iterates over distinct
 * provider names from active subscriptions and either:
 *   - inserts new rows for providers we have not yet researched, or
 *   - re-verifies rows older than 30 days
 *
 * Branch-aware: re-uses the same prompt builder as the on-create helper, so
 * UK-locality providers always get branch-specific contacts.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  // Distinct provider names from active subscriptions
  const { data: subs, error: subErr } = await admin
    .from('subscriptions')
    .select('provider_name')
    .eq('status', 'active')
    .not('provider_name', 'is', null)
    .limit(2000);

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const providers: string[] = [];
  for (const row of subs || []) {
    const name = (row.provider_name || '').trim();
    if (!name) continue;
    const k = providerKey(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    providers.push(name);
  }

  // Fetch existing rows so we know which to skip / re-verify
  const { data: existingRows } = await admin
    .from('provider_cancellation_info')
    .select('provider_key, last_verified_at');
  const existing = new Map<string, string>(
    (existingRows || []).map((r: any) => [r.provider_key, r.last_verified_at])
  );

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let researched = 0;
  let refreshed = 0;
  let skipped = 0;

  for (const name of providers) {
    const key = providerKey(name);
    const lastVerified = existing.get(key);
    if (lastVerified && new Date(lastVerified).getTime() > thirtyDaysAgo) {
      skipped++;
      continue;
    }

    if (lastVerified) {
      // Re-verify: delete the row first so the helper re-inserts.
      await admin.from('provider_cancellation_info').delete().eq('provider_key', key);
      await researchCancellationForProvider(name, { dataSource: 'ai-cron-refresh' });
      refreshed++;
    } else {
      await researchCancellationForProvider(name, { dataSource: 'ai-cron-refresh' });
      researched++;
    }

    // Light pacing to avoid hammering Perplexity
    await new Promise((r) => setTimeout(r, 250));
  }

  return NextResponse.json({
    ok: true,
    total: providers.length,
    researched,
    refreshed,
    skipped,
    sampleBranchAware: providers
      .filter((p) => detectUkCity(p))
      .slice(0, 3)
      .map((p) => ({ provider: p, city: detectUkCity(p), prompt: buildCancellationPrompt(p).slice(0, 120) })),
  });
}
