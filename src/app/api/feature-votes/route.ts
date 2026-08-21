import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Feature voting: public, lightweight, abuse-resistant enough for a marketing widget.
// Votes are deduped server-side on (feature_key, voter_hash) where voter_hash is a
// salted hash of IP + user agent, or the authed user id when present.

export const runtime = 'nodejs'

// Keys must match VOTE_OPTIONS in src/app/preview/homepage/page.tsx.
// 'household' is retired from the homepage list (the feature shipped) but is
// kept accepted here so historic rows and any cached client still resolve.
const FEATURE_KEYS = new Set([
  'native_app',
  'sms_agent',
  'household',
  'landlord_disputes',
  'autopilot',
  'insurance',
])

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getCounts() {
  const admin = getAdmin()
  const { data } = await admin.from('feature_votes').select('feature_key')
  const counts: Record<string, number> = {}
  for (const key of FEATURE_KEYS) counts[key] = 0
  for (const row of data ?? []) {
    counts[row.feature_key] = (counts[row.feature_key] ?? 0) + 1
  }
  return counts
}

function voterHash(req: NextRequest, userId: string | null): string {
  if (userId) return `user:${userId}`
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const ua = req.headers.get('user-agent') || ''
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 16) || 'pb'
  return createHash('sha256').update(`${salt}:${ip}:${ua}`).digest('hex')
}

export async function GET() {
  try {
    const counts = await getCounts()
    return NextResponse.json({ counts })
  } catch {
    return NextResponse.json({ counts: {} }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const feature = typeof body?.feature === 'string' ? body.feature : ''
    if (!FEATURE_KEYS.has(feature)) {
      return NextResponse.json({ error: 'Unknown feature' }, { status: 400 })
    }

    // Attach the user id when logged in (optional).
    let userId: string | null = null
    try {
      const supabase = await createServerClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      userId = user?.id ?? null
    } catch {
      // anonymous vote is fine
    }

    const admin = getAdmin()
    const { error } = await admin.from('feature_votes').insert({
      feature_key: feature,
      voter_hash: voterHash(req, userId),
      user_id: userId,
    })

    // 23505 = unique violation: already voted. Treat as success.
    if (error && error.code !== '23505') {
      return NextResponse.json({ error: 'Vote failed' }, { status: 500 })
    }

    const counts = await getCounts()
    return NextResponse.json({ ok: true, counts })
  } catch {
    return NextResponse.json({ error: 'Vote failed' }, { status: 500 })
  }
}
