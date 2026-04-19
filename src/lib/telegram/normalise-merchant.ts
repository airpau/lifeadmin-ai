/**
 * Canonical merchant name normalisation for Telegram alert keys.
 *
 * Used wherever a merchant name must be embedded in a Telegram callback_data
 * string or stored as a reference_key in notification_log /
 * user_notification_snoozes.  Every place that writes or reads such a key
 * must use this function so snooze/ack lookups always match.
 *
 * Algorithm:
 *   1. Lowercase
 *   2. Strip "PayPal *" prefix (common on bank statements)
 *   3. Strip legal suffixes: Ltd, Limited, PLC, LLP, Inc, Corp, co.uk
 *   4. Strip long digit runs (5+ chars — reference/account numbers)
 *   5. Drop everything that isn't a letter or space
 *   6. Collapse whitespace → single underscores
 *   7. Trim leading/trailing underscores
 *   8. Truncate to 48 chars (leaves room for "price_action:snooze:" prefix
 *      within Telegram's 64-byte callback_data limit)
 */
export function normaliseMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/paypal\s*\*/gi, '')
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk)\b/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}
