/**
 * Share modal trigger logic.
 * Controls when to prompt users to share savings wins on social media.
 */

/** Returns true if the saving amount is large enough to warrant a share prompt. */
export function shouldShowShareModal(
  type: 'complaint' | 'cancellation' | 'deal',
  amount: number
): boolean {
  if (type === 'complaint') return amount > 10;
  // cancellation and deal both use the 24 threshold
  return amount > 24;
}

const SESSION_KEY = 'paybacker_shared_this_session';

/** Returns true if the user has already shared during this browser session. */
export function hasSharedThisSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

/** Mark the current session as having shared (prevents repeat prompts). */
export function markShared(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, 'true');
}
