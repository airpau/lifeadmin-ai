import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Public marketing stat: total money recovered by users across resolved
// disputes. No auth (it feeds the homepage "Recovered by Paybacker users
// so far" counter) and no user-identifying data ever leaves this route:
// the only fields read are money_recovered amounts, summed server-side.
//
// Cached at the edge for 5 minutes (s-maxage) with a 10 minute
// stale-while-revalidate window, so the homepage never hammers the DB.

export const runtime = 'nodejs'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const admin = getAdmin()
    const { data, error } = await admin
      .from('disputes')
      .select('money_recovered')
      .in('status', ['resolved_won', 'resolved_partial'])

    if (error) throw error

    let total = 0
    for (const row of data ?? []) {
      const amount = Number(row.money_recovered ?? 0)
      if (Number.isFinite(amount) && amount > 0) total += amount
    }

    return NextResponse.json(
      { total_gbp: Math.round(total), wins: (data ?? []).length },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } }
    )
  } catch {
    // Marketing stat only — never surface an error to the homepage.
    return NextResponse.json({ total_gbp: 0, wins: 0 })
  }
}
