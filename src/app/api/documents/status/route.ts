// GET /api/documents/status: what the Documents page needs to draw
// itself. The user's plan entitlements, this month's quota, whether
// Drive and Todoist are connected, how many inboxes are connected, and
// the Google Picker browser configuration.
//
// The Picker developer key is a BROWSER key by Google's design (the
// Picker runs in the page). It must be restricted in Google Cloud to the
// Picker API and to paybacker.co.uk referrers; it grants no access to
// any user data on its own. It is not a server secret.

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { documentQuota, getDocumentEntitlements } from '@/lib/documents/plan';
import { driveConnectionStatus } from '@/lib/documents/drive';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const ent = await getDocumentEntitlements(user.id);
  const [quota, drive, todoist, inboxes] = await Promise.all([
    documentQuota(admin, user.id, ent),
    driveConnectionStatus(admin, user.id),
    admin.from('todoist_connections').select('status').eq('user_id', user.id).maybeSingle(),
    admin
      .from('email_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('auth_method', 'oauth')
      .eq('status', 'active')
      .is('archived_at', null),
  ]);

  const pickerApiKey = process.env.GOOGLE_PICKER_API_KEY || '';
  const pickerAppId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER || '';

  return NextResponse.json(
    {
      tier: ent.tier,
      entitlements: ent,
      quota,
      inboxesConnected: inboxes.count ?? 0,
      drive,
      todoist: { connected: todoist.data?.status === 'active', configured: !!process.env.TODOIST_CLIENT_ID },
      picker: {
        configured: !!(pickerApiKey && pickerAppId),
        apiKey: pickerApiKey,
        appId: pickerAppId,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
