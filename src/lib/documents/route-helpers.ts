/**
 * Small helpers for the /api/documents routes: the logged-in user, a
 * service-role client, and the app's base URL.
 */

import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export function documentsAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
}

export async function requireUser(): Promise<{ id: string; email: string | null } | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  return { id: user.id, email: user.email ?? null };
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '');
}

/** 403 with an upgrade prompt the dashboard shows as is. */
export function upgradeRequired(message: string, minimumPlan: 'essential' | 'pro') {
  return NextResponse.json({ error: message, upgradeRequired: true, minimumPlan, upgradeUrl: '/pricing' }, { status: 403 });
}
