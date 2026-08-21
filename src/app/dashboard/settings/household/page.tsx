'use client';

/**
 * /dashboard/settings/household — owner-side seat management.
 *
 * This page is the reason the Household plan was hidden for five days.
 * `/api/household` has been complete and safe since 2026-08-16, but an
 * owner had no way to reach it, so we were not willing to sell seats a
 * customer could not fill. This is that missing surface.
 *
 * ==================== ENTITLEMENT ONLY, NEVER DATA ====================
 * Everything rendered here comes from `/api/household`, which returns
 * email + role + status + timestamps for each seat and nothing else. There
 * is no financial field in the payload and no "view as member" control,
 * because a household shares ONE thing: the answer to "what tier am I on".
 * Every user-data table is `user_id`-scoped with `auth.uid() = user_id`
 * RLS, so members are structurally isolated tenants. If you ever find
 * yourself adding a household-scoped read of anyone's money to this page,
 * stop — that is a new design conversation, not an extension of this file.
 * See the header of src/lib/household.ts.
 *
 * Four states, all handled:
 *   1. Loading.
 *   2. Not on a Household plan (`role: null`) — explain what it is and
 *      link to /pricing. No management controls.
 *   3. Owner (`role: 'owner'`) — seat counter, member list, invite,
 *      revoke a pending invite, remove an active member.
 *   4. Member (`role: 'member'`) — who owns the plan they are on, and
 *      the privacy statement. Deliberately no controls: a member cannot
 *      invite, cannot remove anyone, and cannot see the other seats.
 *
 * Copy rules (same as /pricing and the homepage strip):
 *   - Seats are the differentiator. Nothing else is claimed.
 *   - "Couples, families, flatmates" — two people sharing is the likeliest
 *     purchase, so the copy must not read as family-only.
 *   - Never imply a member's data is visible to the owner.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface MemberRow {
  id: string;
  invited_email: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active' | 'removed';
  invited_at: string | null;
  accepted_at: string | null;
}

interface HouseholdState {
  role: 'owner' | 'member' | null;
  household: { id: string; status: string; seats: number; seats_used: number } | null;
  members?: MemberRow[];
  seat?: { id: string; household_id: string; role: string; status: string; accepted_at: string | null } | null;
  owner_email?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The privacy statement. Rendered on the owner view AND the member view,
 * because both sides need to believe it: the owner is about to invite
 * their partner, and the member is about to connect their bank on someone
 * else's subscription. It is a plain statement of how the schema works,
 * not a marketing line — see src/lib/household.ts.
 */
function PrivacyNote() {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
        <div className="text-sm">
          <p className="font-semibold text-emerald-900">Everyone&rsquo;s money stays private</p>
          <p className="mt-1 leading-relaxed text-emerald-800">
            Each person on the plan has their own separate Paybacker account.
            Nobody can see anyone else&rsquo;s bank accounts, transactions,
            budgets, subscriptions or disputes, and that includes whoever pays
            the bill. The only thing shared is the subscription itself.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HouseholdSettingsPage() {
  const [state, setState] = useState<HouseholdState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/household', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your plan.');
      setState(data as HouseholdState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your plan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setNotice(null);
    setInviting(true);
    try {
      const res = await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send the invite.');
      setInviteEmail('');
      setNotice(`Invite sent to ${email}. It expires in 14 days.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setInviting(false);
    }
  };

  /**
   * Revoke a pending invite or remove an active member. Both go through
   * the same `remove` action — the API scopes it to this household and
   * refuses to remove the owner's own seat, so there is nothing to guard
   * here beyond confirming intent.
   */
  const removeMember = async (member: MemberRow) => {
    const pending = member.status === 'invited';
    const confirmed = window.confirm(
      pending
        ? `Cancel the invite to ${member.invited_email}? The link in their email will stop working.`
        : `Remove ${member.invited_email} from your plan?\n\nTheir Paybacker account and all of their own data stay exactly as they are. They just drop back to the Free plan, and you can invite them again later.`,
    );
    if (!confirmed) return;

    setError(null);
    setNotice(null);
    setBusyMemberId(member.id);
    try {
      const res = await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', memberId: member.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update that seat.');
      setNotice(pending ? 'Invite cancelled.' : `${member.invited_email} has been removed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that seat.');
    } finally {
      setBusyMemberId(null);
    }
  };

  // ---------------------------------------------------------------- shell
  const Header = (
    <>
      <Link
        href="/dashboard/profile"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to your account
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-slate-900 md:text-3xl">Household plan</h1>
    </>
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // ------------------------------------------------------- state 2: no plan
  if (!state || state.role === null) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {Header}
        <p className="mb-6 text-sm text-slate-500">
          One subscription that covers up to four people in your home.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10">
              <Users className="h-5 w-5 text-sky-600" />
            </span>
            <div>
              <p className="font-semibold text-slate-900">You&rsquo;re not on a Household plan</p>
              <p className="text-sm text-slate-500">Nothing to manage here yet.</p>
            </div>
          </div>

          <p className="mb-4 text-sm leading-relaxed text-slate-600">
            Household covers up to four people for one price. Couples, families,
            flatmates, whoever shares the bills. Each person signs in to their
            own separate Paybacker account with everything Pro includes, and you
            get one bill, one card and one renewal date.
          </p>

          <ul className="mb-5 space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
              Up to 4 people, added and removed from this page whenever you like
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
              Everything in Pro for each person, on their own private login
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
              One bill, one card, one renewal date
            </li>
          </ul>

          <div className="mb-5">
            <PrivacyNote />
          </div>

          <Link
            href="/pricing"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
          >
            See Household pricing
          </Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------- state 4: member
  if (state.role === 'member') {
    const joined = formatDate(state.seat?.accepted_at ?? null);
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {Header}
        <p className="mb-6 text-sm text-slate-500">
          You have a seat on someone else&rsquo;s Household plan.
        </p>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="h-5 w-5 text-emerald-600" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Your seat is active</p>
              <p className="truncate text-sm text-slate-500">
                {state.owner_email
                  ? <>Paid for by <span className="font-medium text-slate-700">{state.owner_email}</span></>
                  : 'Paid for by the plan owner'}
                {joined ? ` · joined ${joined}` : ''}
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-slate-600">
            You get everything Pro includes at no cost to you: unlimited AI
            dispute letters, unlimited bank and email connections, the Money
            Hub, export and the Pocket Agent on WhatsApp and Telegram.
          </p>

          {/* No controls, deliberately. Only the owner manages seats — a
              member inviting or removing people on someone else's bill
              would be the wrong side of the payment relationship. */}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <span>
              Seats are managed by whoever pays for the plan. To leave it, or if
              you&rsquo;d rather have your own subscription, ask them to remove
              you and your account will drop back to the Free plan with all of
              your own data intact.
            </span>
          </div>
        </div>

        <PrivacyNote />
      </div>
    );
  }

  // -------------------------------------------------------- state 3: owner
  const household = state.household!;
  const members = state.members ?? [];
  const used = household.seats_used ?? members.length;
  const seats = household.seats;
  const free = Math.max(0, seats - used);
  const full = free === 0;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      {Header}
      <p className="mb-6 text-sm text-slate-500">
        Add up to {seats} people in total, including you. Everyone gets their own
        private Paybacker account.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>
      )}
      {household.status === 'past_due' && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your payment is being retried. Everyone keeps their access while that
          happens. You can update your card from{' '}
          <Link href="/dashboard/settings/billing" className="font-semibold underline">billing settings</Link>.
        </div>
      )}

      {/* ---- Seat counter ---- */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10">
              <Users className="h-5 w-5 text-sky-600" />
            </span>
            <div>
              <p className="text-lg font-bold text-slate-900">{used} of {seats} seats used</p>
              <p className="text-sm text-slate-500">
                {full
                  ? 'Every seat is taken. Remove someone to free one up.'
                  : `${free} seat${free === 1 ? '' : 's'} left to give away.`}
              </p>
            </div>
          </div>
        </div>

        {/* Simple segmented bar — one block per seat, filled left to right. */}
        <div className="flex gap-1.5" role="img" aria-label={`${used} of ${seats} seats used`}>
          {Array.from({ length: seats }).map((_, i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full ${i < used ? 'bg-sky-500' : 'bg-slate-200'}`}
            />
          ))}
        </div>
      </div>

      {/* ---- Members ---- */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="mb-4 text-base font-bold text-slate-900">People on your plan</h2>

        <ul className="space-y-3">
          {members.map((m) => {
            const pending = m.status === 'invited';
            const when = pending ? formatDate(m.invited_at) : formatDate(m.accepted_at);
            const busy = busyMemberId === m.id;
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{m.invited_email}</span>
                    {m.role === 'owner' ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        You · pays the bill
                      </span>
                    ) : pending ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        Invited
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {m.role === 'owner'
                      ? 'Plan owner'
                      : pending
                        ? when ? `Invited ${when} · waiting for them to accept` : 'Waiting for them to accept'
                        : when ? `Joined ${when}` : 'Joined'}
                  </p>
                </div>

                {/* The owner's own seat has no action: removing it would
                    strip their entitlement while still billing them. The
                    API refuses it too, so this is belt and braces. */}
                {m.role !== 'owner' && (
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 sm:w-auto"
                  >
                    {busy
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : pending ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    {pending ? 'Cancel invite' : 'Remove'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* ---- Invite ---- */}
        <form onSubmit={invite} className="mt-5 border-t border-slate-100 pt-5">
          <label htmlFor="household-invite-email" className="mb-2 block text-sm font-semibold text-slate-900">
            Invite someone
          </label>
          <p className="mb-3 text-sm text-slate-500">
            We&rsquo;ll email them a link to claim their seat. They&rsquo;ll need
            to accept it with this exact address, so a forwarded invite
            can&rsquo;t seat someone you didn&rsquo;t choose.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="household-invite-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="partner@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={full || inviting}
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
              />
            </div>
            <button
              type="submit"
              disabled={full || inviting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {full && (
            <p className="mt-2 text-xs text-slate-500">
              All {seats} seats are taken. Remove someone above to invite another person.
            </p>
          )}
        </form>
      </div>

      <PrivacyNote />

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Removing someone never touches their account or their data. They simply
        drop back to the Free plan and keep everything they have added. To change
        or cancel the subscription itself, go to{' '}
        <Link href="/dashboard/settings/billing" className="font-medium underline">billing settings</Link>.
      </p>
    </div>
  );
}
