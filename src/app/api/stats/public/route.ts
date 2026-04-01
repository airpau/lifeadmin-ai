import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 300; // Cache for 5 minutes

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const ZEROED = {
  lettersGenerated: 0,
  subscriptionsTracked: 0,
  usersJoined: 0,
  foundingSpots: 1000,
};

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(ZEROED);
  }

  const supabase = getAdmin();

  const [letters, subs, users] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('type', 'complaint_letter'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const usersJoined = users.count || 0;
  const foundingSpots = Math.max(0, 1000 - usersJoined);

  return NextResponse.json({
    lettersGenerated: letters.count || 0,
    subscriptionsTracked: subs.count || 0,
    usersJoined,
    foundingSpots,
  });
}
