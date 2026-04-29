// src/app/api/auth/google-sheets/route.ts
// Initiates Google OAuth flow with Sheets scope
// FCA note: This exports user's own bank data (held as AISP via TrueLayer) to their own
// Google account — user-consented data portability, no additional FCA registration required.

import { NextResponse } from 'next/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-sheets/callback`

export async function GET() {
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
