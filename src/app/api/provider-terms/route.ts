import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchProviderName } from '@/lib/provider-match';

// GET /api/provider-terms?provider=British+Gas — get provider terms by name
// GET /api/provider-terms?type=energy — get all by type
// GET /api/provider-terms — get all
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const provider = searchParams.get('provider');
  const type = searchParams.get('type');

  if (provider) {
    // Fuzzy match
    const matched = matchProviderName(provider);
    if (!matched) {
      return NextResponse.json(null);
    }
    const { data } = await supabase
      .from('provider_terms')
      .select('*')
      .eq('provider_name', matched)
      .eq('active', true)
      .maybeSingle();
    return NextResponse.json(data);
  }

  let query = supabase.from('provider_terms').select('*').eq('active', true);
  if (type) query = query.eq('provider_type', type);
  const { data } = await query.order('display_name');

  return NextResponse.json(data || []);
}
