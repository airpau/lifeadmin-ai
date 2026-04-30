/**
 * POST /api/admin/legal-refs/recover-url-dead
 *
 * Founder-gated endpoint that lifts the `scripts/recover-url-dead.ts`
 * core logic into the admin dashboard. Probes every legal_references row
 * with `verification_status='url_dead'` using both the default fetcher UA
 * and a real-browser UA (some publishers — ofcom.org.uk, orr.gov.uk —
 * 403 default fetchers but 200 a normal browser).
 *
 * Body: { queue?: boolean }
 *   - queue=false (default): probe-only, returns counts.
 *   - queue=true: also INSERT pending rows in legal_ref_corrections so
 *     a founder can approve via the existing review queue.
 *
 * Returns: { probed, still_dead, now_resolves, redirected_to_authority,
 *            queued, errors }
 *
 * No DB mutation of legal_references at any point — corrections only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function getAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
}

async function authorise(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const allow = getAdminEmails();
    if (!user?.email || !allow.includes(user.email.toLowerCase())) {
      return { ok: false };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function probe(url: string, ua: string | null): Promise<{
  status: number | 'fetch_error';
  final_url: string | null;
}> {
  const headers: Record<string, string> = ua ? { 'User-Agent': ua } : {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { status: res.status, final_url: res.url };
  } catch {
    return { status: 'fetch_error', final_url: null };
  }
}

interface Row {
  id: string;
  law_name: string;
  source_url: string;
  category: string;
  verification_status: string;
}

export async function POST(request: NextRequest) {
  const auth = await authorise();
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { queue?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const queue = body.queue === true;

  const admin = getAdmin();
  const { data, error } = await admin
    .from('legal_references')
    .select('id, law_name, source_url, category, verification_status')
    .eq('verification_status', 'url_dead')
    .order('category', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as Row[];

  const summary = {
    probed: 0,
    still_dead: 0,
    now_resolves: 0,
    redirected_to_authority: 0,
    queued: 0,
    errors: [] as string[],
  };

  for (const row of rows) {
    summary.probed++;
    // eslint-disable-next-line no-await-in-loop
    const def = await probe(row.source_url, null);
    // eslint-disable-next-line no-await-in-loop
    const ua = await probe(row.source_url, BROWSER_UA);

    let category: 'still_dead' | 'now_resolves' | 'redirected_to_authority' = 'still_dead';
    let finalUrl: string | null = null;

    const ok2xx = typeof ua.status === 'number' && ua.status >= 200 && ua.status < 300;
    const ok3xx = typeof ua.status === 'number' && ua.status >= 300 && ua.status < 400 && ua.final_url;

    if (ok2xx || ok3xx) {
      finalUrl = ua.final_url ?? row.source_url;
      const redirected = !!finalUrl && finalUrl !== row.source_url;
      if (redirected) {
        const auth = checkUkLegalAuthority(finalUrl);
        if (auth.reason === 'authority' || auth.reason === 'secondary') {
          category = 'redirected_to_authority';
        } else {
          category = 'now_resolves';
        }
      } else {
        category = 'now_resolves';
      }
    }

    if (category === 'still_dead') summary.still_dead++;
    else if (category === 'now_resolves') summary.now_resolves++;
    else summary.redirected_to_authority++;

    if (queue && category !== 'still_dead' && finalUrl) {
      const proposed_source_url = finalUrl !== row.source_url ? finalUrl : null;
      const reasoning =
        'Server-side probe found a working URL after the original returned ' +
        `4xx/5xx (default UA=${def.status}, browser UA=${ua.status}). ` +
        'Verify the destination still cites the same law before approving.';

      // eslint-disable-next-line no-await-in-loop
      const { error: insErr } = await admin.from('legal_ref_corrections').insert({
        ref_id: row.id,
        proposer: 'url-dead-recovery-2026-04-30',
        before_law_name: row.law_name,
        before_source_url: row.source_url,
        before_status: 'url_dead',
        proposed_law_name: null,
        proposed_source_url,
        proposed_status: null,
        reasoning,
        confidence: 'medium',
        status: 'pending',
      });
      if (insErr) {
        summary.errors.push(`${row.id}: ${insErr.message}`);
      } else {
        summary.queued++;
      }
    }

    // Polite throttle.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }

  return NextResponse.json({ ok: true, ...summary });
}
