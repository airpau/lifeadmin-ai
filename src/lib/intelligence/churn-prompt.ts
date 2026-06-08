/**
 * Phase 3 — churn-reason capture helper.
 *
 * Fires immediately after `customer.subscription.deleted` is processed.
 * Sends the user one short email (always) AND a Telegram/WhatsApp
 * one-tap reason prompt (when an active Pocket Agent session exists).
 *
 * The reply lands at /api/churn-reason, which attaches the chosen
 * reason as the outcome of the most recent churn_prompted event for
 * this user. Reasons follow the spec: price / feature / competitor /
 * other.
 *
 * Never throws — all sends are fire-and-forget. The Stripe webhook must
 * not fail because of a churn prompt; the downgrade already happened
 * and the user-facing email is best-effort.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';

const REASON_BUTTONS = [
  { label: 'Too expensive', reason: 'price' },
  { label: 'Missing feature', reason: 'feature' },
  { label: 'Switched to another tool', reason: 'competitor' },
  { label: 'Other / not using it', reason: 'other' },
];

export async function dispatchChurnPrompt(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, first_name, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) return;

    const name = (profile.first_name as string) || (profile.full_name as string)?.split(' ')[0] || 'there';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://paybacker.co.uk';

    // Build one-click email — each link captures the reason and shows a
    // thank-you page. Token = userId (we only need to attribute to the
    // most-recent churn_prompted event for this user, so no need for a
    // signed token; the worst case is a stranger writing a noisy
    // churn_recorded row, which doesn't hurt anything).
    const lines = REASON_BUTTONS.map(
      (b) =>
        `<li><a href="${baseUrl}/api/churn-reason?user=${userId}&reason=${b.reason}">${b.label}</a></li>`,
    ).join('');

    const html = `
      <p>Hi ${name},</p>
      <p>We saw you cancelled your Paybacker subscription. No drama — but if you can spare 5 seconds, the answer to "why?" really helps us improve.</p>
      <p>Tap one:</p>
      <ul>${lines}</ul>
      <p>Either way, thanks for trying us.<br/>— Paul</p>
    `;

    if (process.env.RESEND_API_KEY && profile.email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Paul at Paybacker <hello@paybacker.co.uk>',
          to: profile.email,
          subject: 'Quick favour — why did you cancel?',
          html,
          replyTo: 'hello@paybacker.co.uk',
        }),
      });
    }

    // Pocket Agent ping via unified dispatcher — Telegram gets rich
    // text, WhatsApp uses the existing in-window text fallback (no
    // template needed for outbound chat). Users opt-in is checked
    // inside sendNotification; non-opted-in users only get the email.
    const text =
      `Sorry to see you go, ${name}. One quick favour — why did you cancel? ` +
      `Reply with one word: PRICE, FEATURE, COMPETITOR, or OTHER. ` +
      `It really helps us improve.`;
    await sendNotification(supabase, {
      userId,
      event: 'churn_prompted',
      telegram: { text },
    }).catch(() => undefined);
  } catch (err) {
    console.warn('[churn-prompt] dispatch failed (non-fatal):', err);
  }
}
