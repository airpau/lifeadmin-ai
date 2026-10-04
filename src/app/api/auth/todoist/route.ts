// GET /api/auth/todoist: start the Todoist connect for document
// reminders. Essential and above. Signed state plus nonce cookie (stage
// one's oauth-state helper), verified in the callback.

import { NextResponse } from 'next/server';
import { isResponse, requireUser } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { createOAuthState, setOAuthNonceCookie } from '@/lib/oauth-state';
import { todoistAuthorizeUrl, todoistConfigured } from '@/lib/documents/todoist';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '');

  const ent = await getDocumentEntitlements(user.id);
  if (!ent.documentReminders) {
    return NextResponse.redirect(`${base}/dashboard/documents?todoist_error=${encodeURIComponent('upgrade')}`);
  }
  if (!todoistConfigured()) {
    return NextResponse.json({ error: 'Todoist reminders are not available yet.', detail: UPGRADE_COPY.reminders }, { status: 503 });
  }
  const signed = createOAuthState(user.id, 'todoist');
  if (!signed) return NextResponse.json({ error: 'Todoist connection is temporarily unavailable.' }, { status: 503 });

  return setOAuthNonceCookie(NextResponse.redirect(todoistAuthorizeUrl(signed.state)), 'todoist', signed.nonce);
}
