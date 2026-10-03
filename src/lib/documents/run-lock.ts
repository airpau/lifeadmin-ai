/**
 * Per-user single-flight lock for documents runs (Find my documents,
 * Drive import, the daily cron), so two runs for one user never overlap
 * and classify the same file twice.
 *
 * Backed by document_run_lock_acquire / document_run_lock_release
 * (migration 20261003120300). Acquire is one atomic statement; a lock
 * whose TTL has passed is taken over, so a crashed run cannot block a
 * user for longer than its TTL.
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export type RunLockResult = { ok: true; holder: string } | { ok: false; reason: 'busy' | 'unavailable' };

export async function acquireDocumentRunLock(admin: Admin, userId: string, ttlSeconds: number, label: string): Promise<RunLockResult> {
  const holder = `${label}:${randomUUID()}`;
  const { data, error } = await admin.rpc('document_run_lock_acquire', {
    p_user_id: userId,
    p_holder: holder,
    p_ttl_seconds: Math.max(1, Math.round(ttlSeconds)),
  });
  if (error) {
    // Fail closed: without the lock we cannot promise a single run.
    console.error('[documents.run-lock] acquire failed:', error.message);
    return { ok: false, reason: 'unavailable' };
  }
  return data === true ? { ok: true, holder } : { ok: false, reason: 'busy' };
}

export async function releaseDocumentRunLock(admin: Admin, userId: string, holder: string): Promise<void> {
  try {
    await admin.rpc('document_run_lock_release', { p_user_id: userId, p_holder: holder });
  } catch {
    // The TTL frees it anyway.
  }
}

export const RUN_BUSY_MESSAGE = 'We are already looking through your documents. Give it a minute, then refresh the page.';
