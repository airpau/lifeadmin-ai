/**
 * Plan-downgrade grace-period helpers.
 *
 * Flow:
 *   1. Stripe webhook (or manual tier change) detects tier drop.
 *   2. openDowngradeEvent() creates a plan_downgrade_events row with
 *      a 14-day grace_ends_at, snapshots current counts, and fires the
 *      initial "you have 14 days" notification.
 *   3. Daily cron calls processActiveEvents():
 *      - Sends T-7 and T-1 reminders for active events.
 *      - Archives overflow and marks 'auto_archived' when grace_ends_at < now.
 *      - Resolves to 'upgraded_back' if the user is back above the drop
 *        tier, or 'user_pruned' if they've already cleared the excess.
 *
 * Archive rules:
 *   - Bank / email connections: set archived_at. Sync cron ignores them.
 *     Transactions + past emails are retained so users don't lose data.
 *   - Account Spaces: delete extras. Default "Everything" stays; non-
 *     default Spaces created most-recently are removed first.
 *
 * "Correct number" = PLAN_LIMITS[to_tier].maxBanks / maxEmails / maxSpaces.
 * Oldest records (by connected_at / created_at) win.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAN_LIMITS, type PlanTier } from '@/lib/plan-limits';
import { sendNotification } from '@/lib/notifications/dispatch';

const GRACE_DAYS = 14;

const TIER_RANK: Record<PlanTier, number> = { free: 0, essential: 1, pro: 2 };

export function isDowngrade(from: PlanTier, to: PlanTier): boolean {
  return TIER_RANK[to] < TIER_RANK[from];
}

export interface GraceSnapshot {
  banks: number;
  emails: number;
  spaces: number;
  max_banks: number | null;
  max_emails: number | null;
  max_spaces: number | null;
}

async function countOverCap(
  supabase: SupabaseClient,
  userId: string,
  toTier: PlanTier,
): Promise<GraceSnapshot> {
  const limits = PLAN_LIMITS[toTier];
  const [banksRes, emailsRes, spacesRes] = await Promise.all([
    supabase.from('bank_connections').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'active').is('archived_at', null),
    supabase.from('email_connections').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'active').is('archived_at', null),
    supabase.from('account_spaces').select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);
  return {
    banks: banksRes.count ?? 0,
    emails: emailsRes.count ?? 0,
    spaces: spacesRes.count ?? 0,
    max_banks: limits.maxBanks,
    max_emails: limits.maxEmails,
    max_spaces: limits.maxSpaces,
  };
}

function isOver(count: number, limit: number | null): boolean {
  return limit !== null && count > limit;
}

/**
 * Called by the Stripe webhook (or admin tool) when a user's tier drops.
 * Idempotent: returns the existing active event if one already exists.
 */
export async function openDowngradeEvent(
  supabase: SupabaseClient,
  userId: string,
  fromTier: PlanTier,
  toTier: PlanTier,
): Promise<{ opened: boolean; eventId?: string; reason?: string }> {
  if (!isDowngrade(fromTier, toTier)) {
    return { opened: false, reason: 'not_a_downgrade' };
  }

  const { data: existing } = await supabase
    .from('plan_downgrade_events')
    .select('id')
    .eq('user_id', userId)
    .is('resolved_at', null)
    .maybeSingle();
  if (existing) return { opened: false, eventId: existing.id, reason: 'already_open' };

  const snapshot = await countOverCap(supabase, userId, toTier);
  const overBanks = isOver(snapshot.banks, snapshot.max_banks);
  const overEmails = isOver(snapshot.emails, snapshot.max_emails);
  const overSpaces = isOver(snapshot.spaces, snapshot.max_spaces);

  if (!overBanks && !overEmails && !overSpaces) {
    // User is within the new caps — no grace period needed.
    await supabase.from('plan_downgrade_events').insert({
      user_id: userId,
      from_tier: fromTier,
      to_tier: toTier,
      grace_ends_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolution: 'nothing_to_do',
      snapshot,
    });
    return { opened: false, reason: 'no_over_cap' };
  }

  const graceEndsAt = new Date(Date.now() + GRACE_DAYS * 86400_000);
  const { data, error } = await supabase
    .from('plan_downgrade_events')
    .insert({
      user_id: userId,
      from_tier: fromTier,
      to_tier: toTier,
      grace_ends_at: graceEndsAt.toISOString(),
      first_reminder_sent_at: new Date().toISOString(),
      snapshot,
    })
    .select('id')
    .single();
  if (error || !data) return { opened: false, reason: error?.message || 'insert_failed' };

  await sendInitialNotification(supabase, userId, fromTier, toTier, snapshot, graceEndsAt);
  return { opened: true, eventId: data.id };
}

function buildMessage(
  fromTier: PlanTier,
  toTier: PlanTier,
  snap: GraceSnapshot,
  graceEndsAt: Date,
): { subject: string; html: string; telegram: string; pushTitle: string; pushBody: string } {
  const reasons: string[] = [];
  if (isOver(snap.banks, snap.max_banks))   reasons.push(`${snap.banks} banks (${toTier} allows ${snap.max_banks})`);
  if (isOver(snap.emails, snap.max_emails)) reasons.push(`${snap.emails} email accounts (${toTier} allows ${snap.max_emails})`);
  if (isOver(snap.spaces, snap.max_spaces)) reasons.push(`${snap.spaces} Spaces (${toTier} allows ${snap.max_spaces})`);
  const date = graceEndsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const subject = `Your Paybacker plan has changed — action needed by ${date}`;
  const html = `
<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F9FAFB;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#FFF;border-radius:16px;padding:32px;border:1px solid #E5E7EB">
    <h1 style="color:#0B1220;font-size:22px;margin:0 0 16px">Your Paybacker plan changed to ${toTier}</h1>
    <p style="color:#334155;font-size:15px;line-height:1.55;margin:0 0 16px">
      Your subscription is now on the <strong>${toTier}</strong> plan. We noticed you have more connected accounts than the new tier allows:
    </p>
    <ul style="color:#334155;font-size:14px;line-height:1.6;padding-left:20px;margin:0 0 16px">
      ${reasons.map(r => `<li>${r}</li>`).join('')}
    </ul>
    <p style="color:#334155;font-size:15px;line-height:1.55;margin:0 0 20px">
      You have until <strong>${date}</strong> to pick which accounts to keep.
      If you do nothing, we\'ll keep your <strong>oldest-connected</strong> accounts active and archive the rest (transactions are preserved — sync just pauses).
    </p>
    <div style="display:flex;gap:12px;margin:16px 0 24px">
      <a href="https://paybacker.co.uk/pricing" style="background:#059669;color:#FFF;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:14px;display:inline-block">Upgrade to keep everything</a>
      <a href="https://paybacker.co.uk/dashboard/profile" style="background:#F1F5F9;color:#0B1220;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:14px;display:inline-block">Manage connections</a>
    </div>
    <p style="color:#94A3B8;font-size:12px;margin-top:24px">This alert repeats 7 days and 1 day before the deadline.</p>
  </div>
</body></html>`;
  const telegram = `⚠️ *Your Paybacker plan changed to ${toTier}*\n\n${reasons.map(r => `• ${r}`).join('\n')}\n\nYou have until *${date}* to pick which to keep — or we'll auto-archive the extras.\n\n[Upgrade](https://paybacker.co.uk/pricing) · [Manage connections](https://paybacker.co.uk/dashboard/profile)`;
  const pushTitle = `Action needed — extras auto-archive ${date}`;
  const pushBody = reasons.join(' · ');
  return { subject, html, telegram, pushTitle, pushBody };
}

async function sendInitialNotification(
  supabase: SupabaseClient,
  userId: string,
  fromTier: PlanTier,
  toTier: PlanTier,
  snap: GraceSnapshot,
  graceEndsAt: Date,
): Promise<void> {
  const m = buildMessage(fromTier, toTier, snap, graceEndsAt);
  await sendNotification(supabase, {
    userId,
    event: 'support_reply', // closest existing event — transactional service notice
    email: { subject: m.subject, html: m.html },
    telegram: { text: m.telegram },
    push: { title: m.pushTitle, body: m.pushBody },
    bypassQuietHours: true,
  });
}

/**
 * Archive the over-cap overflow. Keeps the OLDEST rows by connected_at
 * for banks, created_at for emails, and is_default + created_at for
 * Spaces. Returns the IDs that were archived so callers can log them.
 */
async function archiveOverflow(
  supabase: SupabaseClient,
  userId: string,
  toTier: PlanTier,
): Promise<{ bank_connection_ids: string[]; email_connection_ids: string[]; space_ids: string[] }> {
  const limits = PLAN_LIMITS[toTier];
  const archivedBanks: string[] = [];
  const archivedEmails: string[] = [];
  const deletedSpaces: string[] = [];

  if (limits.maxBanks !== null) {
    const { data: banks } = await supabase
      .from('bank_connections')
      .select('id, connected_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('archived_at', null)
      .order('connected_at', { ascending: true });
    const overflow = (banks ?? []).slice(limits.maxBanks);
    if (overflow.length > 0) {
      const ids = overflow.map((b) => b.id);
      await supabase
        .from('bank_connections')
        .update({ archived_at: new Date().toISOString(), archived_reason: 'plan_downgrade' })
        .in('id', ids);
      archivedBanks.push(...ids);
    }
  }

  if (limits.maxEmails !== null) {
    const { data: emails } = await supabase
      .from('email_connections')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    const overflow = (emails ?? []).slice(limits.maxEmails);
    if (overflow.length > 0) {
      const ids = overflow.map((e) => e.id);
      await supabase
        .from('email_connections')
        .update({ archived_at: new Date().toISOString(), archived_reason: 'plan_downgrade' })
        .in('id', ids);
      archivedEmails.push(...ids);
    }
  }

  if (limits.maxSpaces !== null) {
    // Default Space is protected; delete non-default extras starting
    // from the most-recently-created.
    const { data: spaces } = await supabase
      .from('account_spaces')
      .select('id, is_default, created_at')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    const kept = (spaces ?? []).slice(0, limits.maxSpaces);
    const overflow = (spaces ?? []).slice(limits.maxSpaces).filter((s) => !s.is_default);
    if (overflow.length > 0) {
      const ids = overflow.map((s) => s.id);
      await supabase.from('account_spaces').delete().in('id', ids);
      deletedSpaces.push(...ids);
    }
    void kept;
  }

  return {
    bank_connection_ids: archivedBanks,
    email_connection_ids: archivedEmails,
    space_ids: deletedSpaces,
  };
}

export async function processActiveEvents(supabase: SupabaseClient): Promise<{
  t_minus_7_sent: number;
  t_minus_1_sent: number;
  auto_archived: number;
  resolved_upgraded: number;
  resolved_pruned: number;
  errors: string[];
}> {
  const now = new Date();
  const sevenDaysMs = 7 * 86400_000;
  const oneDayMs = 86400_000;
  const errors: string[] = [];

  const { data: events } = await supabase
    .from('plan_downgrade_events')
    .select('*')
    .is('resolved_at', null);

  let t7 = 0;
  let t1 = 0;
  let auto = 0;
  let upgradeResolved = 0;
  let prunedResolved = 0;

  for (const ev of events ?? []) {
    try {
      const graceEnd = new Date(ev.grace_ends_at).getTime();
      const msUntilEnd = graceEnd - now.getTime();

      // Did the user upgrade back / manually prune below cap?
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', ev.user_id)
        .maybeSingle();
      const currentTier = (profile?.subscription_tier as PlanTier) ?? 'free';
      if (TIER_RANK[currentTier] >= TIER_RANK[ev.from_tier as PlanTier]) {
        await supabase
          .from('plan_downgrade_events')
          .update({ resolved_at: now.toISOString(), resolution: 'upgraded_back' })
          .eq('id', ev.id);
        upgradeResolved++;
        continue;
      }
      const snap = await countOverCap(supabase, ev.user_id, currentTier);
      if (!isOver(snap.banks, snap.max_banks) && !isOver(snap.emails, snap.max_emails) && !isOver(snap.spaces, snap.max_spaces)) {
        await supabase
          .from('plan_downgrade_events')
          .update({ resolved_at: now.toISOString(), resolution: 'user_pruned' })
          .eq('id', ev.id);
        prunedResolved++;
        continue;
      }

      // Time to archive?
      if (msUntilEnd <= 0) {
        const log = await archiveOverflow(supabase, ev.user_id, currentTier);
        await supabase
          .from('plan_downgrade_events')
          .update({
            resolved_at: now.toISOString(),
            resolution: 'auto_archived',
            archive_log: log,
          })
          .eq('id', ev.id);
        // One final notification telling them what happened
        const totalArchived = log.bank_connection_ids.length + log.email_connection_ids.length + log.space_ids.length;
        if (totalArchived > 0) {
          await sendNotification(supabase, {
            userId: ev.user_id,
            event: 'support_reply',
            email: {
              subject: 'Paybacker: extras have been archived',
              html: `<p>Your ${currentTier}-plan grace period ended. We kept your oldest-connected accounts active and archived ${totalArchived} extras. Transactions are preserved — sync is paused. Upgrade at paybacker.co.uk/pricing to re-activate.</p>`,
            },
            telegram: { text: `ℹ️ Your grace period ended. ${totalArchived} extras archived — transactions preserved. [Upgrade](https://paybacker.co.uk/pricing) to re-activate.` },
            push: { title: 'Paybacker: extras archived', body: `${totalArchived} accounts archived — transactions preserved` },
            bypassQuietHours: true,
          });
        }
        auto++;
        continue;
      }

      // T-1 reminder
      if (msUntilEnd <= oneDayMs && !ev.final_reminder_sent_at) {
        const m = buildMessage(ev.from_tier as PlanTier, currentTier, snap, new Date(ev.grace_ends_at));
        await sendNotification(supabase, {
          userId: ev.user_id,
          event: 'support_reply',
          email: { subject: `⏰ 1 day left — Paybacker extras will archive tomorrow`, html: m.html },
          telegram: { text: `⏰ *1 day left* — ${m.telegram}` },
          push: { title: `1 day left — extras archive tomorrow`, body: m.pushBody },
          bypassQuietHours: true,
        });
        await supabase.from('plan_downgrade_events')
          .update({ final_reminder_sent_at: now.toISOString() })
          .eq('id', ev.id);
        t1++;
        continue;
      }

      // T-7 reminder
      if (msUntilEnd <= sevenDaysMs && !ev.week_reminder_sent_at) {
        const m = buildMessage(ev.from_tier as PlanTier, currentTier, snap, new Date(ev.grace_ends_at));
        await sendNotification(supabase, {
          userId: ev.user_id,
          event: 'support_reply',
          email: { subject: `7 days left — Paybacker extras will archive soon`, html: m.html },
          telegram: { text: `⏳ *7 days left* — ${m.telegram}` },
          push: { title: `7 days until extras archive`, body: m.pushBody },
        });
        await supabase.from('plan_downgrade_events')
          .update({ week_reminder_sent_at: now.toISOString() })
          .eq('id', ev.id);
        t7++;
      }
    } catch (err) {
      errors.push(`event ${ev.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    t_minus_7_sent: t7,
    t_minus_1_sent: t1,
    auto_archived: auto,
    resolved_upgraded: upgradeResolved,
    resolved_pruned: prunedResolved,
    errors,
  };
}
