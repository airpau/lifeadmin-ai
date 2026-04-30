/**
 * Cheap regex pre-filter for email scan candidates.
 *
 * Before sending an email snippet through Claude, we test subject+snippet
 * for any of these terms. Emails that match nothing are dropped — they're
 * very unlikely to be financial. This is a stacking optimisation on top of
 * the inbox query filters.
 *
 * Case-insensitive.
 */
const PREFILTER_TERMS = [
  'subscription',
  'renewal',
  'payment',
  'direct debit',
  '£',
  'invoice',
  'membership',
  'charge',
  'plan',
  'tier',
  'auto-renew',
  'recurring',
  'bill',
];

const PREFILTER_REGEX = new RegExp(
  PREFILTER_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

export function isLikelyFinancialEmail(subject: string, snippet: string): boolean {
  const haystack = `${subject || ''}\n${snippet || ''}`;
  return PREFILTER_REGEX.test(haystack);
}

/**
 * Build the cache key used by `email_scan_cache.cache_key`.
 * sha256(sender_email + '|' + lower(subject)).
 */
export async function buildCacheKey(senderEmail: string, subject: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256')
    .update(`${(senderEmail || '').toLowerCase().trim()}|${(subject || '').toLowerCase().trim()}`)
    .digest('hex');
}
