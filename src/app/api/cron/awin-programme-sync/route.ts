// src/app/api/cron/awin-programme-sync/route.ts
//
// Daily. Mirrors the Awin joined-programmes list into
// `affiliate_programmes`, which is the authority on whether a deal may
// be shown to a user.
//
// Why daily and not once: joining is an approval that an advertiser can
// withdraw, and a programme can suspend a publisher. Both happen
// silently from our side. The only symptom is that clicks stop paying,
// which nobody notices for a month.
//
// This exists because the catalogue had drifted completely away from
// reality — 30 merchant ids advertised, none of them joined. A synced
// table makes that drift impossible to reintroduce by hand.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getJoinedProgrammes } from '@/lib/deals/awin-api';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  // Admin cookie OR the cron bearer. The admin path exists so the
  // founder can open this URL in a browser to confirm AWIN_API_TOKEN is
  // set correctly, rather than waiting for 04:00 to find out.
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const supabase = getAdmin();
  const now = new Date().toISOString();

  let programmes;
  try {
    programmes = await getJoinedProgrammes();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[awin-programme-sync] fetch failed:', msg);
    if (/AWIN_API_TOKEN is not set/.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'AWIN_API_TOKEN missing',
          fix: 'Add AWIN_API_TOKEN to the Vercel project environment (Production, Preview and Development), then redeploy and open this URL again.',
        },
        { status: 500 },
      );
    }
    // Deliberately do NOT touch is_joined on failure. Marking everything
    // unjoined because Awin had a bad minute would empty the deals page.
    return NextResponse.json({ ok: false, reason: msg }, { status: 502 });
  }

  if (!Array.isArray(programmes) || programmes.length === 0) {
    // Same reasoning: an empty array is far more likely to be an API
    // change than a genuine "you have been removed from everything".
    console.error('[awin-programme-sync] Awin returned no joined programmes — not applying');
    return NextResponse.json({ ok: false, reason: 'empty_programme_list' }, { status: 502 });
  }

  const rows = programmes.map((p) => ({
    awin_advertiser_id: p.id,
    name: p.name,
    display_url: p.displayUrl ?? null,
    logo_url: p.logoUrl ?? null,
    primary_sector: p.primarySector ?? null,
    country_code: p.primaryRegion?.countryCode ?? null,
    currency_code: p.currencyCode ?? null,
    status: p.status ?? null,
    is_joined: true,
    // Awin's own canonical link. Stored so we stop hand-building the
    // one string where a typo is invisible: a wrong merchant id still
    // redirects and still sets a cookie, so it looks fine and simply
    // never pays.
    click_through_url: p.clickThroughUrl ?? null,
    valid_domains: (p.validDomains ?? []).map((d) => d.domain),
    last_synced_at: now,
    updated_at: now,
  }));

  const { error: upsertErr } = await supabase
    .from('affiliate_programmes')
    .upsert(rows, { onConflict: 'awin_advertiser_id' });

  if (upsertErr) {
    console.error('[awin-programme-sync] upsert failed:', upsertErr.message);
    return NextResponse.json({ ok: false, reason: upsertErr.message }, { status: 500 });
  }

  // Anything previously joined that is no longer in the feed has been
  // left or removed. Flagged rather than deleted, so the history of
  // what we were once partnered with survives, and so a deal row
  // pointing at it can explain itself.
  const currentIds = rows.map((r) => r.awin_advertiser_id);
  const { data: departed } = await supabase
    .from('affiliate_programmes')
    .update({ is_joined: false, last_synced_at: now, updated_at: now })
    .eq('is_joined', true)
    .not('awin_advertiser_id', 'in', `(${currentIds.join(',')})`)
    .select('awin_advertiser_id, name');

  if (departed && departed.length > 0) {
    console.warn(
      `[awin-programme-sync] no longer joined: ${departed
        .map((d) => `${d.name} (${d.awin_advertiser_id})`)
        .join(', ')} — their deals will stop being shown`,
    );
  }

  // Deals pointing at a programme we are not joined to. These are the
  // ones that redirect but cannot pay.
  const { data: orphaned } = await supabase
    .from('affiliate_deals')
    .select('id, provider, programme_id')
    .eq('is_active', true)
    .not('programme_id', 'in', `(${currentIds.join(',')})`);

  if (orphaned && orphaned.length > 0) {
    console.warn(
      `[awin-programme-sync] ${orphaned.length} active deal(s) reference a programme we have not joined: ` +
        `${[...new Set(orphaned.map((d) => d.provider))].join(', ')}`,
    );
  }

  console.log(
    `[awin-programme-sync] joined=${rows.length} departed=${departed?.length ?? 0} orphaned_deals=${orphaned?.length ?? 0}`,
  );

  return NextResponse.json({
    ok: true,
    joined: rows.length,
    programmes: rows.map((r) => ({ id: r.awin_advertiser_id, name: r.name })),
    departed: departed?.length ?? 0,
    orphaned_deals: orphaned?.length ?? 0,
    orphaned_providers: [...new Set((orphaned ?? []).map((d) => d.provider))],
  });
}
