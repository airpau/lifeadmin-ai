// GET /api/auth/todoist/callback: finish the Todoist connect. Verifies
// the signed state against the nonce cookie and the logged-in user,
// exchanges the code, and stores the token encrypted (token-crypto).

import { NextRequest, NextResponse } from 'next/server';
import { clearOAuthNonceCookie, readOAuthNonceCookie, verifyOAuthState } from '@/lib/oauth-state';
import { encryptToken } from '@/lib/email/token-crypto';
import { exchangeTodoistCode, TODOIST_SCOPE } from '@/lib/documents/todoist';
import { documentsAdmin } from '@/lib/documents/route-helpers';
import { createClient } from '@/lib/supabase/server';
import { getDocumentEntitlements } from '@/lib/documents/plan';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '');
  const back = (q: string) => clearOAuthNonceCookie(NextResponse.redirect(`${base}/dashboard/documents?${q}`), 'todoist');

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (req.nextUrl.searchParams.get('error') || !code) return back('todoist_error=access_denied');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return clearOAuthNonceCookie(NextResponse.redirect(`${base}/auth/login?redirect=/dashboard/documents`), 'todoist');
  }

  const check = verifyOAuthState(state, {
    purpose: 'todoist',
    nonceCookie: readOAuthNonceCookie(req, 'todoist'),
    sessionUserId: user.id,
  });
  if (!check.ok) {
    console.error('[todoist callback] rejected state:', check.reason);
    return back('todoist_error=invalid_state');
  }

  const ent = await getDocumentEntitlements(user.id);
  if (!ent.documentReminders) return back('todoist_error=upgrade');

  try {
    const tokens = await exchangeTodoistCode(code);
    const { error } = await documentsAdmin()
      .from('todoist_connections')
      .upsert(
        {
          user_id: user.id,
          access_token: encryptToken(tokens.access_token),
          scope: TODOIST_SCOPE,
          status: 'active',
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('[todoist callback] failed:', err instanceof Error ? err.message : err);
    return back('todoist_error=token_failed');
  }
  return back('todoist_connected=1');
}
