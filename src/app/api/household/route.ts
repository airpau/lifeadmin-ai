/**
 * Household seat management.
 *
 *   GET    /api/household                      current state for the caller
 *   POST   /api/household { action: 'invite', email }
 *   POST   /api/household { action: 'remove', memberId }
 *   POST   /api/household { action: 'accept', token }
 *
 * ==================== ENTITLEMENT ONLY, NEVER DATA ====================
 * Nothing in this file can widen a data query. A household shares one
 * thing: the answer to "what tier am I on". Every user-data table is
 * `user_id`-scoped with `auth.uid() = user_id` RLS and every server route
 * additionally filters `.eq('user_id', …)`, so members are already
 * structurally isolated tenants. There is deliberately no "view as member"
 * capability here, and the GET response for an owner returns only email +
 * status + role for each seat, never any financial field.
 *
 * The owner-side UI lives at /dashboard/settings/household and is the only
 * consumer of this route. It was the missing piece that kept the Household
 * plan hidden; both are live as of 2026-08-21.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import {
  getOwnedHousehold,
  countOccupiedSeats,
  mintInviteToken,
  hashInviteToken,
  HOUSEHOLD_INVITE_TTL_HOURS,
} from '@/lib/household';
import { sendPaybackerEmail } from '@/lib/email/send';
import { paragraph, card } from '@/lib/email/PaybackerEmailLayout';
import { getEffectiveTier } from '@/lib/plan-limits';

export const runtime = 'nodejs';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function db() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = db();
  const owned = await getOwnedHousehold(admin, user.id);

  if (owned) {
    // Owner view: seats, but only the fields needed to manage them.
    // Deliberately no join to profiles beyond the invited email.
    const { data: members } = await admin
      .from('household_members')
      .select('id, invited_email, role, status, invited_at, accepted_at')
      .eq('household_id', owned.id)
      .neq('status', 'removed')
      .order('role', { ascending: true })
      .order('invited_at', { ascending: true });

    return NextResponse.json({
      role: 'owner',
      household: {
        id: owned.id,
        status: owned.status,
        seats: owned.seats,
        seats_used: (members ?? []).length,
      },
      members: members ?? [],
    });
  }

  // Member view: their own seat only. The RLS policy on
  // household_members enforces this even without the explicit filter.
  const { data: seat } = await admin
    .from('household_members')
    .select('id, household_id, role, status, accepted_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  const tier = await getEffectiveTier(user.id);

  // A member is told exactly ONE thing about the rest of the household:
  // who is paying. They already know — that person invited them by email —
  // and without it the settings page can only say "someone". Deliberately
  // no seat count, no other members, no financial field of any kind.
  let ownerEmail: string | null = null;
  if (seat) {
    const { data: owner } = await admin
      .from('household_members')
      .select('invited_email')
      .eq('household_id', seat.household_id)
      .eq('role', 'owner')
      .maybeSingle();
    ownerEmail = (owner?.invited_email as string | undefined) ?? null;
  }

  return NextResponse.json({
    role: seat ? 'member' : null,
    household: null,
    seat: seat ?? null,
    owner_email: ownerEmail,
    tier,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { action?: string; email?: string; memberId?: string; token?: string };
  try { body = await request.json(); } catch { body = {}; }

  const admin = db();

  // ---------------------------------------------------------------------
  // accept — the invitee binds their auth user to the seat.
  //
  // This is the only action that does NOT require ownership: the caller
  // proves entitlement with the invite token instead. The token is
  // compared by SHA-256 hash; the plaintext is never stored.
  // ---------------------------------------------------------------------
  if (body.action === 'accept') {
    const token = (body.token ?? '').trim();
    if (!token) return NextResponse.json({ error: 'Invite token required' }, { status: 400 });

    const { data: seat } = await admin
      .from('household_members')
      .select('id, household_id, invited_email, status, invite_expires_at')
      .eq('invite_token_hash', hashInviteToken(token))
      .maybeSingle();

    if (!seat || seat.status !== 'invited') {
      return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 400 });
    }
    if (seat.invite_expires_at && new Date(seat.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired. Ask the plan owner to resend it.' }, { status: 400 });
    }

    // The invite is addressed to a specific email. Requiring the accepting
    // account to match stops a forwarded invite granting a seat to someone
    // the owner did not choose.
    const callerEmail = (user.email ?? '').toLowerCase();
    if (callerEmail !== (seat.invited_email as string).toLowerCase()) {
      return NextResponse.json(
        { error: `This invite was sent to ${seat.invited_email}. Sign in with that address to accept it.` },
        { status: 403 },
      );
    }

    // The plan must still be live.
    const { data: plan } = await admin
      .from('household_plans')
      .select('id, status')
      .eq('id', seat.household_id)
      .maybeSingle();
    if (!plan || plan.status === 'canceled') {
      return NextResponse.json({ error: 'That household plan is no longer active.' }, { status: 400 });
    }

    const { error } = await admin
      .from('household_members')
      .update({
        user_id: user.id,
        status: 'active',
        accepted_at: new Date().toISOString(),
        // Single-use: burn the token on acceptance.
        invite_token_hash: null,
        invite_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', seat.id)
      .eq('status', 'invited');

    if (error) {
      // The partial unique index household_members_active_user_uniq fires
      // here if this person already holds an active seat elsewhere.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'You already have a seat on another household plan. Leave that one first.' },
          { status: 409 },
        );
      }
      console.error('[household] accept failed:', error.message);
      return NextResponse.json({ error: 'Could not accept the invite.' }, { status: 500 });
    }

    return NextResponse.json({ accepted: true });
  }

  // ---------------------------------------------------------------------
  // Everything below requires the caller to OWN a household.
  // ---------------------------------------------------------------------
  const owned = await getOwnedHousehold(admin, user.id);
  if (!owned) {
    return NextResponse.json(
      { error: 'You do not have a Household plan.', upgradeUrl: '/upgrade?plan=household&cycle=monthly' },
      { status: 403 },
    );
  }
  if (owned.status === 'canceled') {
    return NextResponse.json({ error: 'Your Household plan is not active.' }, { status: 403 });
  }

  if (body.action === 'invite') {
    const email = (body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const used = await countOccupiedSeats(admin, owned.id);
    if (used >= owned.seats) {
      return NextResponse.json(
        { error: `All ${owned.seats} seats are taken. Remove a member first.` },
        { status: 409 },
      );
    }

    const { token, tokenHash, expiresAt } = mintInviteToken();

    // Upsert so re-inviting the same address reissues the token rather
    // than failing on household_members_email_uniq.
    const { error } = await admin
      .from('household_members')
      .upsert(
        {
          household_id: owned.id,
          invited_email: email,
          role: 'member',
          status: 'invited',
          invite_token_hash: tokenHash,
          invite_expires_at: expiresAt,
          invited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'household_id,invited_email' },
      );

    if (error) {
      console.error('[household] invite failed:', error.message);
      return NextResponse.json({ error: 'Could not send the invite.' }, { status: 500 });
    }

    const acceptUrl = `${SITE}/household/join?token=${encodeURIComponent(token)}`;

    try {
      await sendPaybackerEmail({
        to: email,
        subject: 'You have been added to a Paybacker Household plan',
        preheader: 'Accept your seat to unlock the full Paybacker toolkit.',
        heading: 'Your seat is ready',
        intro: 'Someone has added you to their Paybacker Household plan. Accepting gives you the full toolkit at no cost to you.',
        body: [
          card(
            paragraph(
              'Unlimited AI dispute letters, unlimited bank and email connections, '
              + 'the Money Hub, and the Pocket Agent on WhatsApp and Telegram.',
            ),
            { eyebrow: 'What you get' },
          ),
          card(
            paragraph(
              'Your account is completely separate. Nobody else on the plan can see your '
              + 'accounts, transactions, budgets or disputes, and you cannot see theirs. '
              + 'The only thing shared is the bill.',
            ),
            { eyebrow: 'Your money stays private' },
          ),
          paragraph(`This link expires in ${Math.round(HOUSEHOLD_INVITE_TTL_HOURS / 24)} days and can only be used once.`),
        ].join(''),
        cta: { label: 'Accept your seat', href: acceptUrl },
      });
    } catch (e) {
      // The seat row is written either way. A failed email is recoverable
      // by re-inviting; losing the seat row would not be.
      console.error('[household] invite email failed:', e);
    }

    return NextResponse.json({ invited: true, email, seatsRemaining: owned.seats - used - 1 });
  }

  if (body.action === 'remove') {
    const memberId = (body.memberId ?? '').trim();
    if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

    // Scoped to this household, and the owner's own seat is not removable
    // (they would lose their own entitlement while still being billed).
    const { data: seat } = await admin
      .from('household_members')
      .select('id, role')
      .eq('id', memberId)
      .eq('household_id', owned.id)
      .maybeSingle();

    if (!seat) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (seat.role === 'owner') {
      return NextResponse.json(
        { error: 'You cannot remove yourself. Cancel the plan from billing settings instead.' },
        { status: 400 },
      );
    }

    // Clearing user_id alongside the status keeps the partial unique index
    // household_members_active_user_uniq free, so a removed member can
    // join a different household later.
    const { error } = await admin
      .from('household_members')
      .update({
        status: 'removed',
        user_id: null,
        removed_at: new Date().toISOString(),
        invite_token_hash: null,
        invite_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .eq('household_id', owned.id);

    if (error) {
      console.error('[household] remove failed:', error.message);
      return NextResponse.json({ error: 'Could not remove that member.' }, { status: 500 });
    }

    // The removed member's entitlement disappears on their next tier read.
    // No profile write is needed, and none is done.
    return NextResponse.json({ removed: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
