// src/app/api/auth/google-sheets/callback/route.ts
// Handles OAuth callback: exchanges code for tokens, creates the Google Sheet,
// does initial full historical export, saves connection to Supabase.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-sheets/callback`
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/money-hub?sheets_error=access_denied`
    )
  }

  // 1. Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    console.error('Google Sheets OAuth error:', tokens)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/money-hub?sheets_error=token_failed`
    )
  }

  // 2. Get user email from Google
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userInfo = await userInfoRes.json()

  // 3. Get Supabase user from session cookie
  // We use service role to look up user by google email match in profiles
  // In production: prefer reading the Supabase session cookie directly
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Attempt to read user from auth cookie
  const cookieHeader = req.headers.get('cookie') ?? ''
  const supabaseUserClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { cookie: cookieHeader } },
  })
  const { data: { user } } = await supabaseUserClient.auth.getUser()

  if (!user) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?sheets_error=not_logged_in`
    )
  }

  // 4. Get user's name for sheet title
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.first_name || profile?.full_name || userInfo.email

  // 5. Create Google Sheet
  const sheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: `Paybacker — ${displayName}` },
      sheets: [{ properties: { title: 'Summary' } }], // placeholder; accounts added by export
    }),
  })
  const sheet = await sheetRes.json()

  if (!sheet.spreadsheetId) {
    console.error('Sheet creation failed:', sheet)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/money-hub?sheets_error=sheet_create_failed`
    )
  }

  // 6. Save connection to Supabase
  const tokenExpiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  await supabase.from('google_sheets_connections').upsert({
    user_id: user.id,
    email: userInfo.email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry: tokenExpiry,
    spreadsheet_id: sheet.spreadsheetId,
    spreadsheet_url: sheet.spreadsheetUrl,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  // 7. Trigger initial full export (fire and forget — sheet will populate in background)
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/google-sheets/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_API_KEY ?? '',
    },
    body: JSON.stringify({ user_id: user.id, full_export: true }),
  }).catch(console.error)

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/money-hub?sheets_connected=true`
  )
}
