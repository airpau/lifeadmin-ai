/**
 * One-shot script: delete test / QA Supabase auth users.
 *
 * Reads the test email list from src/lib/test-accounts.ts (single
 * source of truth). For each email it:
 *   1. Looks up the auth user by paginating /auth/v1/admin/users
 *   2. Calls auth.admin.deleteUser(id) — cascades to profiles + all
 *      related rows via the standard ON DELETE CASCADE chain
 *
 * Run locally with the prod service role key:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   npx tsx scripts/delete-test-accounts.ts
 *
 * Add --dry-run to preview without deleting.
 *
 * Safety:
 *   - The allow-list is hard-coded in src/lib/test-accounts.ts; this
 *     script will never delete an email that isn't in that set.
 *   - Each delete is logged with the auth user id so the action is
 *     auditable from the script's stdout.
 */

import { createClient } from '@supabase/supabase-js';
import { TEST_ACCOUNT_EMAILS } from '@/lib/test-accounts';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface AuthUser {
  id: string;
  email?: string | null;
  created_at: string;
}

async function findUserByEmail(email: string): Promise<AuthUser | null> {
  // The admin listUsers endpoint paginates at 1k/page. The full user
  // table at Paybacker is well under that today, but page just in case.
  const perPage = 1000;
  let page = 1;
  const target = email.toLowerCase().trim();
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').toLowerCase().trim() === target);
    if (match) return match as AuthUser;
    if (users.length < perPage) return null;
    page++;
  }
}

async function main() {
  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Deleting ${TEST_ACCOUNT_EMAILS.size} test accounts from Supabase auth...\n`,
  );

  const results: Array<{ email: string; status: 'deleted' | 'not_found' | 'error'; id?: string; error?: string }> = [];

  for (const email of TEST_ACCOUNT_EMAILS) {
    try {
      const user = await findUserByEmail(email);
      if (!user) {
        console.log(`  • ${email} — not found (skip)`);
        results.push({ email, status: 'not_found' });
        continue;
      }
      if (dryRun) {
        console.log(`  • ${email} — would delete auth user ${user.id} (created ${user.created_at})`);
        results.push({ email, status: 'deleted', id: user.id });
        continue;
      }
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) {
        console.error(`  ✗ ${email} — delete failed: ${error.message}`);
        results.push({ email, status: 'error', id: user.id, error: error.message });
        continue;
      }
      console.log(`  ✓ ${email} — deleted auth user ${user.id}`);
      results.push({ email, status: 'deleted', id: user.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${email} — exception: ${msg}`);
      results.push({ email, status: 'error', error: msg });
    }
  }

  const deleted = results.filter((r) => r.status === 'deleted').length;
  const notFound = results.filter((r) => r.status === 'not_found').length;
  const errored = results.filter((r) => r.status === 'error').length;

  console.log(
    `\n${dryRun ? '[DRY RUN] ' : ''}Summary: ${deleted} deleted, ${notFound} not found, ${errored} errors.`,
  );

  if (errored > 0) process.exit(2);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
