'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import TrialBanner from '@/components/TrialBanner';
import DashboardShell, { type UserSummary } from '@/components/dashboard/DashboardShell';
import './shell-v2.css';
import './dashboard.css';

type Tier = 'free' | 'essential' | 'pro';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<Tier>('free');
  const [isTrial, setIsTrial] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUserEmail(user.email || null);
      setAuthChecked(true);

      // OAuth signup path leaves Terms/marketing consent in sessionStorage
      // (the signup page can't write to user_metadata before the OAuth
      // redirect). Drain it here for Google-signup users. Guardrails:
      //   1. sessionStorage is tab-scoped — can't leak to other users
      //      who later sign in from the same browser profile.
      //   2. The payload carries `created_at`; we reject > 15 min old
      //      blobs as stale (e.g. abandoned OAuth flows).
      //   3. The CURRENT user must themselves be newly created
      //      (auth.users.created_at within 15 min). This prevents the
      //      same-tab hand-off a legacy account would need to inherit
      //      someone else's abandoned consent blob.
      //   4. The key is only removed AFTER a confirmed write (or when
      //      it's stale / already applied) — transient network errors
      //      leave the blob in place so a retry can still recover it.
      const CONSENT_TTL_MS = 15 * 60 * 1000;
      try {
        const raw = sessionStorage.getItem('pb_pending_consent');
        if (raw && !user.user_metadata?.terms_accepted_at) {
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
          } else if (!isFreshUser) {
            // Don't apply a stashed consent blob to a pre-existing user
            // — the pending blob belongs to an abandoned OAuth signup.
            // Leave the blob in place; it'll expire on TTL above.
          } else if (pending.terms_accepted_at) {
            const { error: updateError } = await supabase.auth.updateUser({
              data: {
                terms_accepted_at: pending.terms_accepted_at,
                marketing_opt_in: !!pending.marketing_opt_in,
              },
            });
            if (!updateError) {
              sessionStorage.removeItem('pb_pending_consent');
            }
            // If updateError (transient 5xx, network), keep the blob so
            // the next dashboard hit can retry.
          }
        } else if (raw && user.user_metadata?.terms_accepted_at) {
          // User already has consent recorded — safe to clear.
          sessionStorage.removeItem('pb_pending_consent');
        }
      } catch {
        // JSON.parse error → payload is corrupt, safe to remove.
        sessionStorage.removeItem('pb_pending_consent');
      }

      const { data } = await supabase
        .from('profiles')
        .select('first_name, full_name, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at')
        .eq('id', user.id)
        .single();
      const name =
        data?.first_name ||
        user.user_metadata?.first_name ||
        user.user_metadata?.full_name?.split(' ')[0] ||
        null;
      setFirstName(name);
      const profileTier: Tier = (data?.subscription_tier as Tier) || 'free';
      setUserTier(profileTier);

      let isFoundingTrial = false;
      if (
        data?.subscription_status === 'trialing' &&
        !data?.stripe_subscription_id &&
        data?.subscription_tier !== 'free'
      ) {
        isFoundingTrial = true;
        const trialEnd = data?.trial_ends_at ? new Date(data.trial_ends_at) : null;
        if (trialEnd) {
          const days = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (days > 0) {
            setIsTrial(true);
            setTrialDaysLeft(days);
          } else {
            setTrialExpired(true);
            setUserTier('free');
            isFoundingTrial = false;
          }
        } else {
          setIsTrial(true);
        }
      }

      try {
        const syncRes = await fetch('/api/stripe/sync', { method: 'POST' });
        const syncData = await syncRes.json();
        if (syncData.tier && syncData.tier !== 'free') {
          setUserTier(syncData.tier);
        } else if (syncData.tier === 'free' && syncData.synced && !isFoundingTrial) {
          setUserTier('free');
        }
      } catch {
        // Stripe sync failed — keep profile tier
      }
    };
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  if (!authChecked) {
    return (
      <div className="shell-v2">
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2
            aria-label="Loading"
            style={{ width: 28, height: 28, animation: 'spin 1s linear infinite' }}
          />
        </div>
      </div>
    );
  }

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const isAdmin = !!userEmail && adminEmails.includes(userEmail);

  const user: UserSummary = {
    firstName,
    email: userEmail,
    tier: userTier,
    isTrial,
    trialDaysLeft,
  };

  const topBanner =
    isTrial || trialExpired ? (
      <TrialBanner daysLeft={trialDaysLeft} trialExpired={trialExpired} />
    ) : null;

  return (
    <DashboardShell
      user={user}
      isAdmin={isAdmin}
      onSignOut={handleSignOut}
      topBanner={topBanner}
    >
      {children}
    </DashboardShell>
  );
}
