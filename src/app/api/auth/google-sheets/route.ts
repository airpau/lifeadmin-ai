// src/app/api/auth/google-sheets/route.ts
// Initiates Google OAuth flow with Sheets scope
// FCA note: This exports user's own bank data (held as AISP via TrueLayer) to their own
// Google account — user-consented data portability, no additional FCA registration required.
//
// Pro-only per the tier matrix in src/lib/plan-limits.ts. Free + Essential
// users get 403 here so they can't even start the OAuth dance — matches the
// page-level lock at /dashboard/export and the existing tier checks on
// /api/export/csv and /api/export/xlsx.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveTier } from '@/lib/plan-limits'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-sheets/callback`

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tier = await getEffectiveTier(user.id)
  if (tier !== 'pro') {
    return NextResponse.json(
      { error: 'Google Sheets export is available on the Pro plan.', upgradeRequired: true },
      { status: 403 },
    )
  }

  const scopes = [
    'https://www.googleapis.com/auth/drive.file', // only files this app creates — narrower than 'spreadsheets', easier to verify
    'https://www.googleapis.com/auth/userinfo.email',
  ]

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scopes.join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent') // force refresh_token
  authUrl.searchParams.set('include_granted_scopes', 'true')

  return NextResponse.redirect(authUrl.toString())
}
