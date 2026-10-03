import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/legal-updates
 *
 * Lists the legal change review queue for the founder.
 *
 * legal_update_queue is RLS'd to service-role only, matching the other
 * compliance tables, so the admin page cannot read it with the browser
 * client. This route is the read path: founder-gated, service-key query.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await getAdmin()
    .from('legal_update_queue')
    .select(`
      *,
      legal_references (
        law_name,
        section,
        summary,
        category
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
