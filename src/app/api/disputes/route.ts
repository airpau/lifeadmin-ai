import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/disputes — list all disputes for the user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: disputes, error } = await supabase
    .from('disputes')
    .select(`
      *,
      correspondence(id, entry_type, title, summary, entry_date, created_at),
      tasks(id, status, created_at)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch disputes:', error);
    return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 });
  }

  // Add letter count and last activity date
  const enriched = (disputes || []).map((d: any) => ({
    ...d,
    letter_count: d.correspondence?.filter((c: any) => c.entry_type === 'ai_letter').length || 0,
    message_count: d.correspondence?.length || 0,
    last_activity: d.correspondence?.length > 0
      ? d.correspondence.sort((a: any, b: any) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())[0].entry_date
      : d.created_at,
  }));

  return NextResponse.json(enriched);
}

// POST /api/disputes — create a new dispute
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (!body.provider_name || !body.issue_type || !body.issue_summary) {
    return NextResponse.json({ error: 'Missing required fields: provider_name, issue_type, issue_summary' }, { status: 400 });
  }

  // Normalise provider name: trim whitespace, title-case known providers
  const rawName = body.provider_name.trim();
  const PROVIDER_NAMES: Record<string, string> = {
    'eon': 'E.ON', 'e.on': 'E.ON', 'british gas': 'British Gas',
    'virgin media': 'Virgin Media', 'onestream': 'OneStream',
    'lendinvest': 'LendInvest', 'sky': 'Sky', 'bt': 'BT',
    'vodafone': 'Vodafone', 'ee': 'EE', 'three': 'Three',
    'o2': 'O2', 'talktalk': 'TalkTalk', 'plusnet': 'Plusnet',
    'octopus energy': 'Octopus Energy', 'ovo': 'OVO Energy',
    'edf': 'EDF Energy', 'scottish power': 'Scottish Power',
    'hmrc': 'HMRC', 'dvla': 'DVLA', 'nhs': 'NHS',
  };
  const normalisedName = PROVIDER_NAMES[rawName.toLowerCase()] || rawName;

  // Auto-detect provider_type from issue_type and provider name
  function detectProviderType(issueType: string, name: string): string {
    const n = name.toLowerCase();
    if (issueType === 'energy_dispute' || /british gas|eon|e\.on|octopus|ovo|edf|scottish power|sse|shell energy|bulb/i.test(n)) return 'energy';
    if (issueType === 'broadband_complaint' || /sky|virgin media|bt|onestream|talktalk|plusnet|vodafone|ee|three|o2/i.test(n)) return 'broadband';
    if (issueType === 'flight_compensation') return 'travel';
    if (issueType === 'parking_appeal') return 'parking';
    if (issueType === 'debt_dispute' || /lendinvest|lowell|cabot|debt/i.test(n)) return 'finance';
    if (issueType === 'hmrc_tax_rebate') return 'government';
    if (issueType === 'council_tax_band') return 'government';
    if (issueType === 'dvla_vehicle') return 'government';
    if (issueType === 'nhs_complaint') return 'nhs';
    return 'general';
  }

  const providerType = body.provider_type || detectProviderType(body.issue_type, normalisedName);

  // Dedup: check if same user + same provider has an open dispute within 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 1000).toISOString();
  const { data: recentDup } = await supabase
    .from('disputes')
    .select('id, issue_summary')
    .eq('user_id', user.id)
    .eq('provider_name', normalisedName)
    .eq('status', 'open')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentDup) {
    // Return existing dispute instead of creating near-duplicate
    const { data: existing } = await supabase.from('disputes').select().eq('id', recentDup.id).single();
    return NextResponse.json(existing, { status: 200 });
  }

  const { data: dispute, error } = await supabase
    .from('disputes')
    .insert({
      user_id: user.id,
      provider_name: normalisedName,
      provider_type: providerType,
      account_number: body.account_number || null,
      issue_type: body.issue_type,
      issue_summary: body.issue_summary,
      desired_outcome: body.desired_outcome || null,
      disputed_amount: body.disputed_amount ? parseFloat(body.disputed_amount) : null,
      status: 'open',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create dispute:', error);
    return NextResponse.json({ error: 'Failed to create dispute' }, { status: 500 });
  }

  // If this dispute originated from a price increase alert, update the alert status
  if (body.alert_id) {
    await supabase
      .from('price_increase_alerts')
      .update({ status: 'in_progress' })
      .eq('id', body.alert_id)
      .eq('user_id', user.id);
  }

  return NextResponse.json(dispute, { status: 201 });
}
