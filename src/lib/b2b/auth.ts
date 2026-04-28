/**
 * Bearer-token auth for the /v1/* B2B API surface.
 *
 * Key format: `pbk_<8-prefix>_<32-hex-secret>`. The prefix is stored
 * plain so the admin UI can identify which key a customer is using;
 * the full token is hashed and only the hash sits in b2b_api_keys.
 *
 * Hash uses Node's built-in SHA-256 — adequate for what's effectively
 * a 32-byte random secret. We don't need bcrypt's slow work factor
 * here because the input is already high-entropy.
 *
 * Rate limit: per-key per-calendar-month, counted live from
 * b2b_api_usage. Cheap on the hot path because the index is keyed
 * (key_id, created_at DESC).
 */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export interface AuthedKey {
  id: string;
  name: string;
  tier: 'starter' | 'growth' | 'enterprise';
  monthlyLimit: number;
  monthlyUsed: number;
  ownerEmail: string | null;
  waitlistId: string | null;
}

export interface AuthResult {
  ok: boolean;
  key?: AuthedKey;
  error?: string;
  status?: number;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function hashKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * Mint a new key. Returns both the plaintext (shown once) and the
 * stored prefix. Caller is responsible for inserting into b2b_api_keys
 * with the returned hash.
 */
export function generateKey(): { plaintext: string; prefix: string; hash: string } {
  const prefix = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  const secret = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  const plaintext = `pbk_${prefix}_${secret}`;
  return { plaintext, prefix, hash: hashKey(plaintext) };
}

/**
 * Validate an Authorization header. Returns the authed key on success
 * or { ok: false, error, status } on failure. Status mirrors what the
 * caller should send back to the client.
 */
export async function authenticate(authHeader: string | null): Promise<AuthResult> {
  if (!authHeader) {
    return { ok: false, error: 'Missing Authorization header. Expected `Authorization: Bearer pbk_...`.', status: 401 };
  }
  const m = authHeader.match(/^Bearer\s+(pbk_[a-f0-9]{8}_[a-f0-9]{32})$/);
  if (!m) {
    return { ok: false, error: 'Authorization header format invalid.', status: 401 };
  }
  const plaintext = m[1];
  const prefix = plaintext.slice(4, 12);
  const hash = hashKey(plaintext);

  const supabase = getAdmin();
  const { data: keyRow, error } = await supabase
    .from('b2b_api_keys')
    .select('id, name, tier, monthly_limit, owner_email, waitlist_id, key_hash, revoked_at')
    .eq('key_prefix', prefix)
    .maybeSingle();

  if (error || !keyRow) {
    return { ok: false, error: 'Invalid API key.', status: 401 };
  }
  if (keyRow.revoked_at) {
    return { ok: false, error: 'API key has been revoked.', status: 401 };
  }
  // Constant-time compare protects against any theoretical prefix-
  // probing timing side channel (the prefix lookup itself is in DB).
  const stored = Buffer.from(keyRow.key_hash, 'hex');
  const presented = Buffer.from(hash, 'hex');
  if (stored.length !== presented.length || !crypto.timingSafeEqual(stored, presented)) {
    return { ok: false, error: 'Invalid API key.', status: 401 };
  }

  // Live count of usage this calendar month.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('b2b_api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('key_id', keyRow.id)
    .gte('created_at', monthStart.toISOString());
  const monthlyUsed = count ?? 0;

  if (monthlyUsed >= keyRow.monthly_limit) {
    return {
      ok: false,
      error: `Monthly call limit reached (${keyRow.monthly_limit} on tier "${keyRow.tier}"). Upgrade or wait until the 1st.`,
      status: 429,
    };
  }

  // Bump last_used_at fire-and-forget — it's ok if this races.
  void supabase
    .from('b2b_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id);

  return {
    ok: true,
    key: {
      id: keyRow.id,
      name: keyRow.name,
      tier: keyRow.tier as AuthedKey['tier'],
      monthlyLimit: keyRow.monthly_limit,
      monthlyUsed,
      ownerEmail: keyRow.owner_email,
      waitlistId: keyRow.waitlist_id,
    },
  };
}

export async function logUsage(
  keyId: string,
  endpoint: string,
  statusCode: number,
  latencyMs: number,
  extra: { scenario_kind?: string | null; error_code?: string | null } = {},
): Promise<void> {
  try {
    const supabase = getAdmin();
    await supabase.from('b2b_api_usage').insert({
      key_id: keyId,
      endpoint,
      status_code: statusCode,
      latency_ms: latencyMs,
      scenario_kind: extra.scenario_kind ?? null,
      error_code: extra.error_code ?? null,
    });
  } catch (e: any) {
    console.error('[b2b/auth] logUsage failed', e?.message);
  }
}
