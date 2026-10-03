// GET /api/auth/google-drive: connect Google Drive for the documents
// vault. Every plan (Drive import works on Free, one file at a time).
//
// Scope: drive.file ONLY (plus userinfo.email to label the connection).
// drive.file is a non-sensitive scope: the app can only see files the
// user picks in Google Picker or files the app itself creates (the
// Paybacker folder). No restricted or sensitive Drive scope is asked for.
//
// Redirect URI to register in Google Cloud: <app>/api/auth/google-drive/callback

import { NextResponse } from 'next/server';
import { isResponse, requireUser } from '@/lib/documents/route-helpers';
import { createOAuthState, setOAuthNonceCookie } from '@/lib/oauth-state';
import { DRIVE_FILE_SCOPE } from '@/lib/documents/drive';

export const runtime = 'nodejs';

function googleDriveRedirectUri(): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '')}/api/auth/google-drive/callback`;
}

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Google Drive connection is not available yet.' }, { status: 503 });
  }

  const signed = createOAuthState(user.id, 'google_drive');
  if (!signed) return NextResponse.json({ error: 'Google Drive connection is temporarily unavailable.' }, { status: 503 });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', googleDriveRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', [DRIVE_FILE_SCOPE, 'https://www.googleapis.com/auth/userinfo.email'].join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', signed.state);

  return setOAuthNonceCookie(NextResponse.redirect(url.toString()), 'google_drive', signed.nonce);
}
