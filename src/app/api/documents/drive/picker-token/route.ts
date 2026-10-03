// GET /api/documents/drive/picker-token: a short-lived Google access
// token for the user's OWN drive.file grant, for Google Picker in the
// browser. Picker needs an OAuth token client side by design.
//
// Safety:
//  - the token only ever comes from drive_connections (the vault's own
//    connect, drive.file plus userinfo.email, no include_granted_scopes),
//    never from the Sheets or Gmail connections
//  - before it is returned, Google's tokeninfo endpoint is asked what
//    the token can do; anything beyond drive.file, userinfo.email and
//    openid, or a token for another OAuth client, is refused and the
//    connection is marked for reconnecting
//  - the refresh token never leaves the server

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { checkBrowserSafeDriveToken, getDriveAccess } from '@/lib/documents/drive';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const apiKey = process.env.GOOGLE_PICKER_API_KEY || '';
  const appId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER || '';
  if (!apiKey || !appId) {
    return NextResponse.json({ error: 'Google Drive import is not available yet.' }, { status: 503 });
  }

  const admin = documentsAdmin();
  const r = await getDriveAccess(admin, user.id);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.reason === 'unavailable' ? 'Google Drive is not responding. Please try again.' : 'Connect Google Drive first.', needsDrive: r.reason !== 'unavailable', connectUrl: '/api/auth/google-drive' },
      { status: r.reason === 'unavailable' ? 503 : 400 },
    );
  }

  const check = await checkBrowserSafeDriveToken(r.access.accessToken);
  if (check === 'unverified') {
    return NextResponse.json({ error: 'Google Drive is not responding. Please try again.' }, { status: 503 });
  }
  if (check === 'unsafe') {
    console.error(`[documents.picker-token] refused a Drive token with unexpected scopes for user ${user.id.slice(0, 8)}`);
    if (r.access.connectionId) {
      await admin
        .from('drive_connections')
        .update({ status: 'needs_reauth', access_token: null, token_expiry: null, last_error: 'Token carried unexpected scopes' })
        .eq('id', r.access.connectionId);
    }
    return NextResponse.json(
      { error: 'Please reconnect Google Drive.', needsDrive: true, connectUrl: '/api/auth/google-drive' },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { accessToken: r.access.accessToken, apiKey, appId },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
