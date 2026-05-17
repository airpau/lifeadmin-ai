/**
 * Single source of truth for the test / QA email allow-list.
 *
 * Used by:
 *   - scripts/delete-test-accounts.ts — one-shot cleanup operation
 *   - src/app/api/cron/dispute-letter-followup — excluded from the
 *     14-day stall alert so we don't WhatsApp QA inboxes
 *   - any future "skip test accounts" filters
 *
 * Add new emails here when QA spins up a fresh test account; never
 * fork this list to a separate constant.
 */

/** Emails of accounts that exist for QA / E2E / sandbox testing only.
 *  All lowercase — callers must lowercase the candidate email before
 *  comparing.
 */
export const TEST_ACCOUNT_EMAILS: ReadonlySet<string> = new Set([
  'testaccount@gmail.com',
  'testtest@google.com',
  'test@testest.com',
  'uat_test_agent@example.com',
  'e2e_tester_442@example.com',
  'w5voxnfn8v@bwmyga.com',
  'casa-test@paybacker.co.uk',
  'salvus.testingff3@gmail.com',
  'sheva.tests.2026@outlook.com',
  'chautest@upworktest.com',
  'abcd@1234',
  'ab@123',
  'sdaf@sdaf.com',
  'googletest@paybacker.co.uk',
]);

/** Returns true when the email belongs to the test/QA allow-list. */
export function isTestAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_ACCOUNT_EMAILS.has(email.toLowerCase().trim());
}
