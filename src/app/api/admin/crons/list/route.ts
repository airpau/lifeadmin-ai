// src/app/api/admin/crons/list/route.ts
//
// Admin-only: returns every cron declared in vercel.json plus a
// last-run summary from business_log. Powers the /dashboard/admin/crons
// page so the founder can see at a glance which jobs are firing and
// when each one last ran.
//
// Auth: signed-in admin (ADMIN_EMAIL). Runtime: nodejs for fs access to
// vercel.json.

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

interface VercelCron {
  path: string;
  schedule: string;
}

interface VercelConfig {
  crons?: VercelCron[];
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Load the cron inventory from vercel.json.
  let crons: VercelCron[] = [];
  try {
    const raw = await readFile(path.join(process.cwd(), 'vercel.json'), 'utf-8');
    const parsed = JSON.parse(raw) as VercelConfig;
    crons = parsed.crons ?? [];
  } catch (err) {
    console.error('[admin/crons/list] failed to read vercel.json:', err);
    return NextResponse.json({ crons: [], error: 'Could not read vercel.json' }, { status: 500 });
  }

  // Join with the most recent business_log row for each cron so the UI
  // can show "last run at" + "last result" without a second round trip.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Pull the last 500 cron_run rows and collapse in memory. Faster than
  // 43 × DISTINCT ON queries and keeps the SQL boring.
  const { data: recentRuns } = await admin
    .from('business_log')
    .select('title, content, severity, created_at')
    .eq('category', 'cron_run')
    .order('created_at', { ascending: false })
    .limit(500);

  const lastByPath = new Map<string, { at: string; severity: string; summary: string }>();
  for (const row of recentRuns ?? []) {
    const title = row.title ?? '';
    // `title` format set by /api/admin/crons/run: "cron_run /api/cron/<name>"
    const match = title.match(/^cron_run\s+(.+)$/);
    const cronPath = match ? match[1] : title;
    if (!lastByPath.has(cronPath)) {
      lastByPath.set(cronPath, {
        at: row.created_at,
        severity: row.severity ?? 'info',
        summary: (row.content ?? '').slice(0, 240),
      });
    }
  }

  const rows = crons.map((c) => ({
    path: c.path,
    schedule: c.schedule,
    lastRun: lastByPath.get(c.path) ?? null,
  }));

  return NextResponse.json({ crons: rows });
}
