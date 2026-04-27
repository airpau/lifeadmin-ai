/**
 * Payment grace notifications.
 *
 * Critical billing messages — they bypass user channel prefs / quiet
 * hours / rate limits because losing access without warning would be
 * a worse UX than the buzz of an email + Telegram during a quiet
 * window. The user opted-in to billing notifications when they
 * created a paid subscription.
 *
 * Three send points:
 *   - sendPaymentFailedWarning(): on the first invoice.payment_failed
 *     webhook in the current grace window. Tells the user their card
 *     was declined and they have 7 days to update.
 *   - sendFinalGraceWarning(): T-3 days from grace_ends_at. The cron
 *     fires this once per profile (timestamp guarded).
 *   - sendDemotionConfirmation(): when the cron actually demotes a
 *     user. Tells them their tier has been switched to Free and
 *     points them at the path to upgrade again.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
const BILLING_PORTAL_URL = `${APP_URL}/dashboard/profile?section=subscription`;

interface ProfileLite {
  id: string;
  email?: string | null;
  first_name?: string | null;
  subscription_tier?: string | null;
  past_due_grace_ends_at?: string | null;
}

async function loadProfile(supabase: SupabaseClient, userId: string): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, first_name, subscription_tier, past_due_grace_ends_at')
    .eq('id', userId)
    .maybeSingle();
  return data as ProfileLite | null;
}

async function loadTelegramChatId(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('telegram_sessions')
    .select('telegram_chat_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return (data?.telegram_chat_id as number | undefined) ?? null;
}

function fmtDeadline(iso: string | null | undefined): string {
  if (!iso) return 'in 7 days';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

async function sendTelegram(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error('payment-grace: telegram send failed', e);
  }
}

export async function sendPaymentFailedWarning(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const profile = await loadProfile(supabase, userId);
  if (!profile?.email) return;
  const tier = (profile.subscription_tier || 'paid').toString();
  const tierLabel = tier === 'pro' ? 'Pro' : tier === 'essential' ? 'Essential' : tier;
  const deadline = fmtDeadline(profile.past_due_grace_ends_at);
  const greeting = profile.first_name ? `Hi ${profile.first_name},` : 'Hi,';

  const subject = `Action needed: your Paybacker ${tierLabel} payment was declined`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width:560px; margin:auto; color:#0f172a;">
      <p>${greeting}</p>
      <p>We tried to charge your card for your Paybacker ${tierLabel} subscription and it was declined.</p>
      <p>We'll keep retrying for the next few days, but if it still hasn't gone through by <strong>${deadline}</strong>, your account will switch to the Free tier. Your data won't be deleted — you'll just lose access to ${tierLabel} features (extra bank/email connections, ${tier === 'pro' ? 'unlimited letters, instant Telegram alerts' : 'unlimited letters, renewal reminders, full spending intelligence'}).</p>
      <p style="margin:24px 0;">
        <a href="${BILLING_PORTAL_URL}" style="background:#10b981; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">Update your card</a>
      </p>
      <p style="color:#64748b; font-size:13px;">Questions? Reply to this email and we'll help.</p>
      <p style="color:#64748b; font-size:13px;">— The Paybacker team</p>
    </div>
  `;

  try {
    await resend.emails.send({ from: FROM_EMAIL, to: profile.email, subject, html });
  } catch (e) {
    console.error('payment-grace: email send failed', e);
  }

  const chatId = await loadTelegramChatId(supabase, userId);
  if (chatId) {
    await sendTelegram(
      chatId,
      `⚠️ *Your Paybacker ${tierLabel} payment was declined*\n\n` +
      `We'll keep retrying. If it still hasn't gone through by *${deadline}*, your tier will switch to Free.\n\n` +
      `[Update your card](${BILLING_PORTAL_URL})`,
    );
  }
}

export async function sendFinalGraceWarning(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const profile = await loadProfile(supabase, userId);
  if (!profile?.email) return;
  const tier = (profile.subscription_tier || 'paid').toString();
  const tierLabel = tier === 'pro' ? 'Pro' : tier === 'essential' ? 'Essential' : tier;
  const deadline = fmtDeadline(profile.past_due_grace_ends_at);
  const greeting = profile.first_name ? `Hi ${profile.first_name},` : 'Hi,';

  const subject = `Final reminder: 3 days until your Paybacker ${tierLabel} downgrade`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width:560px; margin:auto; color:#0f172a;">
      <p>${greeting}</p>
      <p>Your card still hasn't gone through. On <strong>${deadline}</strong> we'll switch your account to the Free tier unless we can charge it before then.</p>
      <p>Your data stays — extra bank/email connections will be archived (not deleted), so if you reactivate later they'll come back.</p>
      <p style="margin:24px 0;">
        <a href="${BILLING_PORTAL_URL}" style="background:#10b981; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">Update your card now</a>
      </p>
      <p style="color:#64748b; font-size:13px;">— The Paybacker team</p>
    </div>
  `;

  try {
    await resend.emails.send({ from: FROM_EMAIL, to: profile.email, subject, html });
  } catch (e) {
    console.error('payment-grace: final email send failed', e);
  }

  const chatId = await loadTelegramChatId(supabase, userId);
  if (chatId) {
    await sendTelegram(
      chatId,
      `🔔 *3 days left to fix your Paybacker ${tierLabel} payment*\n\n` +
      `Your card still hasn't gone through. On *${deadline}* your tier will switch to Free.\n\n` +
      `Your data stays. Extra connections will be archived but not deleted.\n\n` +
      `[Update your card](${BILLING_PORTAL_URL})`,
    );
  }
}

export async function sendDemotionConfirmation(
  supabase: SupabaseClient,
  userId: string,
  fromTier: string,
): Promise<void> {
  const profile = await loadProfile(supabase, userId);
  if (!profile?.email) return;
  const fromLabel = fromTier === 'pro' ? 'Pro' : fromTier === 'essential' ? 'Essential' : fromTier;
  const greeting = profile.first_name ? `Hi ${profile.first_name},` : 'Hi,';

  const subject = `Your Paybacker account has switched to Free`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width:560px; margin:auto; color:#0f172a;">
      <p>${greeting}</p>
      <p>We weren't able to charge your card after several attempts, so your Paybacker ${fromLabel} subscription has ended and your account is now on the Free tier.</p>
      <p><strong>Your data is safe.</strong> Bank and email connections beyond the free limits have been archived — they're hidden from sync but will reappear if you upgrade again. Subscriptions, disputes, and complaint letters all stay.</p>
      <p style="margin:24px 0;">
        <a href="${APP_URL}/pricing" style="background:#10b981; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">Reactivate ${fromLabel}</a>
      </p>
      <p style="color:#64748b; font-size:13px;">Questions or want help? Just reply.</p>
      <p style="color:#64748b; font-size:13px;">— The Paybacker team</p>
    </div>
  `;

  try {
    await resend.emails.send({ from: FROM_EMAIL, to: profile.email, subject, html });
  } catch (e) {
    console.error('payment-grace: demotion email failed', e);
  }

  const chatId = await loadTelegramChatId(supabase, userId);
  if (chatId) {
    await sendTelegram(
      chatId,
      `Your Paybacker ${fromLabel} subscription has ended and your account is now on Free.\n\n` +
      `Your data is safe — extra connections are archived but will reappear if you upgrade again.\n\n` +
      `[Reactivate ${fromLabel}](${APP_URL}/pricing)`,
    );
  }
}
