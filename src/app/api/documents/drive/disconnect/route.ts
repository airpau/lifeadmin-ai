// POST /api/documents/drive/disconnect: forget the vault's Google Drive
// connection.
//
// Stored tokens are wiped and the row is marked disconnected. We do NOT
// call Google's revoke endpoint: revoking a token removes the whole
// grant for Paybacker's Google client, which would also cut off the
// user's Google Sheets export if it uses the same Google account. The
// user can remove access entirely at myaccount.google.com/permissions.
// Files already filed into their Drive stay there; they are the user's.

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';

export const runtime = 'nodejs';

export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { error } = await documentsAdmin()
    .from('drive_connections')
    .update({ status: 'disconnected', access_token: null, refresh_token: null, token_expiry: null })
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not disconnect Google Drive. Please try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
