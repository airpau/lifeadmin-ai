'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MarkNav } from '@/app/blog/_shared';
import '../../(marketing)/styles.css';
import '../auth.css';

/**
 * /auth/accept-terms — server-side consent gate landing page.
 *
 * The middleware (src/middleware.ts → updateSession) redirects any
 * authenticated user without `terms_accepted_at` in user_metadata
 * here before they can reach /dashboard or /onboarding.
 *
 * Two paths through this page:
 *
 *   1. FRESH OAuth signup — handleGoogleSignup on /auth/signup stashed
 *      `{ terms_accepted_at, marketing_opt_in, created_at }` into
 *      sessionStorage before the OAuth redirect. We auto-drain it on
 *      mount, write to user_metadata, and bounce straight to `next`.
 *      The user never sees this page.
 *
 *   2. MANUAL consent — legacy accounts with no `terms_accepted_at`,
 *      users whose sessionStorage drain failed / expired, or anyone
 *      who reached /dashboard with a bypassed client-side gate. They
 *      see the consent form and must tick the box to proceed.
 *
 * Payload freshness rules mirror the dashboard-layout drain:
 *   - payload.created_at must be within 15 min (else treat as stale)
 *   - user.created_at must be within 15 min (else don't apply a
 *     stashed blob — it belongs to someone else's abandoned signup)
 */

const CONSENT_TTL_MS = 15 * 60 * 1000;

export default function AcceptTermsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const rawNext = searchParams.get('next');
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/dashboard';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState('');

  // Mount: check auth, then either auto-drain sessionStorage consent
  // (fresh OAuth signup) or fall through to the manual form.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/auth/login?redirect=${encodeURIComponent(next)}`);
        return;
      }

      // Already accepted somehow (e.g. race with another tab). Skip the
      // form and send them on their way — middleware will re-check.
      if (user.user_metadata?.terms_accepted_at) {
        router.replace(next);
        return;
      }

      // Try to auto-drain sessionStorage pending consent for the fresh
      // OAuth signup path. Matches the dashboard-layout guardrails so
      // the two entry points can't disagree.
      try {
        const raw = sessionStorage.getItem('pb_pending_consent');
        if (raw) {
          const pending = JSON.parse(raw) as {
            terms_accepted_at?: string;
            marketing_opt_in?: boolean;
            created_at?: number;
          };
          const now = Date.now();
          const isFreshPayload =
            typeof pending?.created_at === 'number' &&
            now - pending.created_at < CONSENT_TTL_MS;
          const userCreatedMs = user.created_at ? Date.parse(user.created_at) : NaN;
          const isFreshUser =
            Number.isFinite(userCreatedMs) && now - userCreatedMs < CONSENT_TTL_MS;

          if (!isFreshPayload) {
            sessionStorage.removeItem('pb_pending_consent');
          } else if (isFreshUser && pending.terms_accepted_at) {
            const { error: updateError } = await supabase.auth.updateUser({
              data: {
                terms_accepted_at: pending.terms_accepted_at,
                marketing_opt_in: !!pending.marketing_opt_in,
              },
            });
            if (!updateError && !cancelled) {
              sessionStorage.removeItem('pb_pending_consent');
              router.replace(next);
              return;
            }
            // If updateError fires, fall through to the manual form —
            // at least the user can still finish consenting.
          }
          // Non-fresh user with a pending blob: leave the blob alone
          // (TTL will expire it) and show the manual form so the user
          // records their own consent instead.
        }
      } catch {
        sessionStorage.removeItem('pb_pending_consent');
      }

      if (!cancelled) setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [next, router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!termsAccepted) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          terms_accepted_at: new Date().toISOString(),
          marketing_opt_in: marketingOptIn,
        },
      });
      if (updateError) throw updateError;
      // Also clear any pending OAuth blob that may still be in the tab
      // (e.g. when the gate was entered from /onboarding, which never
      // hits the dashboard-layout drain). Without this, a stale blob
      // could auto-drain onto a different account later in the same
      // 15-min window. Belt-and-braces with the auto-drain branch above.
      try {
        sessionStorage.removeItem('pb_pending_consent');
      } catch {
        /* storage unavailable — nothing to clean up */
      }
      router.replace(next);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to record your acceptance. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="m-land-root">
      <MarkNav />
      <main className="auth-shell">
        <div className="auth-wrap">
          <Link href="/" className="auth-brand">
            <span className="pay">Pay</span>
            <span className="backer">backer</span>
          </Link>

          <div className="auth-head">
            <h1>One quick thing</h1>
            <p>
              We need your acceptance of our Terms &amp; Privacy Policy before
              you can use Paybacker.
            </p>
          </div>

          <div className="auth-card">
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: 0 }}>
                Checking your account…
              </p>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="consent" style={{ marginTop: 0 }}>
                  <label className="consent__row">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    <span>
                      I agree to the{' '}
                      <Link href="/terms-of-service">Terms of Service</Link>
                      {' '}and{' '}
                      <Link href="/privacy-policy">Privacy Policy</Link>.
                    </span>
                  </label>
                  <label className="consent__row consent__row--optional">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                    />
                    <span>
                      Send me the Paybacker newsletter — savings tips and
                      product updates (optional, unsubscribe anytime).
                    </span>
                  </label>
                </div>

                {error && <div className="form-error">{error}</div>}

                <button
                  type="submit"
                  disabled={submitting || !termsAccepted}
                  className="auth-submit"
                >
                  {submitting ? 'Saving…' : 'Continue'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
