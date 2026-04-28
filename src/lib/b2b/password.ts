/**
 * Password helper for the B2B portal.
 *
 * bcrypt at cost 10 — same balance every modern auth library uses
 * (~50ms per hash on the Vercel runtime). Verifies via timing-safe
 * compare in bcrypt's own internals.
 */

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 10);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export function passwordPolicyError(p: string): string | null {
  if (typeof p !== 'string' || p.length < 12) return 'Password must be at least 12 characters.';
  if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p)) {
    return 'Password must include upper, lower, and a number.';
  }
  return null;
}

/**
 * Returns true if this email has any portal access path — owns a key
 * or is a member. Used to gate password sign-in so only legitimate
 * customers can set/use passwords.
 */
export async function emailHasPortalAccess(email: string): Promise<boolean> {
  const supabase = getAdmin();
  const lower = email.toLowerCase();
  const { data: ownerKey } = await supabase
    .from('b2b_api_keys').select('id').eq('owner_email', lower).limit(1).maybeSingle();
  if (ownerKey) return true;
  const { data: member } = await supabase
    .from('b2b_members').select('id').eq('member_email', lower).limit(1).maybeSingle();
  return !!member;
}
