/**
 * Canonical provider-key derivation for subscriptions.
 *
 * The same stripped alphanumeric lowercase key is used by:
 *   - `subscriptions.recurring_group`           (migration 20260422020000)
 *   - `get_subscription_total` RPC's join key   (migration 20260422010000/020000)
 *   - All write paths that INSERT into subscriptions
 *   - Match against `bank_transactions.recurring_group` (stripped on the fly)
 *
 * Keeping a single function means "London Borough of Hounslow",
 * "london-borough-of-hounslow", and "London Borough Of Hounslow (Parking)"
 * all produce the same key, so the partial unique index
 * `(user_id, recurring_group)` catches duplicates regardless of which
 * writer inserted first.
 *
 * Returns null when the resulting key is empty (all-punctuation or missing
 * provider name) so callers can leave the column NULL and skip the unique
 * constraint — matches the `WHERE recurring_group IS NOT NULL` partial
 * index predicate.
 */
export function deriveRecurringGroup(providerName: string | null | undefined): string | null {
  if (!providerName) return null;
  const key = providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return key.length > 0 ? key : null;
}
