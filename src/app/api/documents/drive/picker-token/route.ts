// GET /api/documents/drive/picker-token: a short-lived Google access
// token for the user's OWN drive.file grant, for Google Picker in the
// browser. Picker needs an OAuth token client side by design. The token
// can only reach files the user picks or files Paybacker created, and it
// expires within the hour. The refresh token never leaves the server.

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getDriveAccess } from '@/lib/documents/drive';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const apiKey = process.env.GOOGLE_PICKER_API_KEY || '';
  const appId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER || '';
  if (!apiKey || !appId) {
    return NextResponse.json({ error: 'Google Drive import is not available yet.' }, { status: 503 });
  }

  const r = await getDriveAccess(documentsAdmin(), user.id);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.reason === 'unavailable' ? 'Google Drive is not responding. Please try again.' : 'Connect Google Drive first.', needsDrive: r.reason !== 'unavailable', connectUrl: '/api/auth/google-drive' },
      { status: r.reason === 'unavailable' ? 503 : 400 },
    );
  }
  return NextResponse.json(
    { accessToken: r.access.accessToken, apiKey, appId },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
