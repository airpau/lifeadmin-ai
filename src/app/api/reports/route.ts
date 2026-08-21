import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ?id=<uuid> — return a single saved report (with its full data)
    // for the authed user. RLS plus the explicit user_id filter keep
    // this scoped to the owner.
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const { data: report, error } = await supabase
        .from('annual_reports')
        .select('id, report_type, year, month, created_at, data')
        .eq('user_id', user.id)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }
      return NextResponse.json({ report });
    }

    const { data: reports, error } = await supabase
      .from('annual_reports')
      .select('id, report_type, year, month, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reports: reports || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
