// POST /api/documents/todoist/disconnect: forget the Todoist connection.
// The token is revoked at Todoist (best effort) and wiped here. Tasks
// already created stay in the user's Todoist.

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { decryptToken } from '@/lib/email/token-crypto';
import { revokeTodoistToken } from '@/lib/documents/todoist';

export const runtime = 'nodejs';

export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const { data: conn } = await admin.from('todoist_connections').select('access_token').eq('user_id', user.id).maybeSingle();
  const token = decryptToken(conn?.access_token);
  if (token) await revokeTodoistToken(token);

  const { error } = await admin.from('todoist_connections').delete().eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not disconnect Todoist. Please try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
