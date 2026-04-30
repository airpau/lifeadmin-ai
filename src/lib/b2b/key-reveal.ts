/**
 * One-time-link key delivery.
 *
 * Instead of emailing the plaintext API key directly, we email a
 * single-use link that reveals it once. After the customer clicks,
 * the plaintext is wiped from the token row and the token is marked
 * used. Forwarded / archived emails can't be replayed.
 *
 * Trade-off vs direct email: one extra click for the customer.
 * Worth it for security posture and for the conversation when a
 * prospect asks "do you email plaintext keys?" — answer is no.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Create a single-use reveal link for a freshly-minted plaintext key.
 * Token expires in 24h — long enough that a customer who archived the
 * email overnight can still recover, short enough to limit blast radius.
 *
 * Returns the absolute URL to email.
 */
export async function createKeyRevealLink(
  plaintext: string,
  email: string,
): Promise<string> {
  const supabase = getAdmin();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('b2b_portal_tokens').insert({
    email: email.toLowerCase(),
    token_hash: tokenHash,
    payload: plaintext,
    purpose: 'reveal_key',
    expires_at: expiresAt,
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';
  return `${baseUrl}/dashboard/api-keys/reveal?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email.toLowerCase())}`;
}
