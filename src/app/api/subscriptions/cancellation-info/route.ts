import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { providerKey } from '@/lib/cancellation-provider';

/**
 * Reads cached, AI-researched cancellation details for a provider from the
 * `provider_cancellation_info` table. Used by the subscriptions row "How to
 * cancel" pill. Falls back to {info: null} if no row exists yet — the on-create
 * trigger / weekly cron is responsible for populating it.
 */
export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider');
  if (!provider) {
    return NextResponse.json({ error: 'provider param required' }, { status: 400 });
  }

  const admin = createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  const key = providerKey(provider);
  if (!key) return NextResponse.json({ info: null });

  const { data, error } = await admin
    .from('provider_cancellation_info')
    .select('provider_name, city, method, email, phone, url, tips, notice_period_days, last_verified_at, confidence, data_source')
    .eq('provider_key', key)
    .maybeSingle();

  if (error) {
    // Table may not exist yet in some environments — surface null rather than 500.
    return NextResponse.json({ info: null });
  }
  return NextResponse.json({ info: data || null });
}
