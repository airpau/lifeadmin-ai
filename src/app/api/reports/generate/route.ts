import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/get-user-plan';
import {
  generateAnnualReportData,
  generateOnDemandReportData,
} from '@/lib/report-generator';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, year } = await req.json();

    if (!type || !['annual', 'on_demand', 'summary'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "annual", "on_demand", or "summary".' },
        { status: 400 }
      );
    }

    // Pro users only
    const plan = await getUserPlan(user.id);
    if (plan.tier !== 'pro') {
      return NextResponse.json(
        { error: 'Financial reports are available on the Pro plan.' },
        { status: 403 }
      );
    }

    // Quick Summary / On-demand — same enriched data, not saved to DB
    if (type === 'on_demand' || type === 'summary') {
      const data = await generateOnDemandReportData(user.id);
      return NextResponse.json({ type: 'on_demand', data });
    }

    // Annual report — generate + save to DB
    const reportYear = year || new Date().getFullYear();
    const data = await generateAnnualReportData(user.id, reportYear);

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await admin.from('annual_reports').insert({
      user_id: user.id,
      report_type: 'annual',
      year: reportYear,
      data,
    });

    return NextResponse.json({ type: 'annual', data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Report generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
