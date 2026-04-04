import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { runAssessment } from '@/lib/overcharge-engine';

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/overcharge-assessments — List user's active assessments
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const { data, error } = await admin
    .from('overcharge_assessments')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('overcharge_score', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Calculate summary stats
  const totalSaving = (data || []).reduce(
    (sum, a) => sum + parseFloat(String(a.estimated_annual_saving || 0)), 0
  );
  const highScoreCount = (data || []).filter(a => a.overcharge_score >= 60).length;

  return NextResponse.json({
    assessments: data || [],
    summary: {
      total: (data || []).length,
      highScoreCount,
      totalEstimatedAnnualSaving: Math.round(totalSaving * 100) / 100,
    },
  });
}

/**
 * POST /api/overcharge-assessments — Trigger on-demand assessment
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const assessments = await runAssessment(user.id);

  const totalSaving = assessments.reduce((sum, a) => sum + a.estimatedAnnualSaving, 0);

  return NextResponse.json({
    assessments,
    summary: {
      total: assessments.length,
      highScoreCount: assessments.filter(a => a.overchargeScore >= 60).length,
      totalEstimatedAnnualSaving: Math.round(totalSaving * 100) / 100,
    },
  });
}

/**
 * PATCH /api/overcharge-assessments — Dismiss or action an assessment
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
  }

  if (!['dismissed', 'actioned'].includes(status)) {
    return NextResponse.json({ error: 'Status must be dismissed or actioned' }, { status: 400 });
  }

  const admin = getAdmin();
  const { data, error } = await admin
    .from('overcharge_assessments')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assessment: data });
}
