import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';
import { sendNotification } from '@/lib/notifications/dispatch';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Government and fixed-obligation payments that never warrant a price dispute.
// Normalized merchant names containing any of these terms are skipped.
// Note: council_tax and business_rates are also excluded at the detector level
// (EXCLUDED_FROM_PRICE_DETECTION in price-increase-detector.ts). These GOV_BLOCKLIST_TERMS
// act as a belt-and-suspenders guard for any edge case where normalization varies.
const GOV_BLOCKLIST_TERMS = [
  'hmrc', 'hm revenue', 'hm customs',
  'council tax', 'council_tax', 'government gateway',
  'dvla', 'driver vehicle',
  'nhs ', 'nhs dental', 'nhs prescription',
  'tv licence', 'tv license', 'bbc tv',
  'student loan', 'student loans company',
  'child maintenance',
  'universal credit', 'housing benefit',
];

function isGovPayment(merchantNormalized: string): boolean {
  const lower = merchantNormalized.toLowerCase();
  return GOV_BLOCKLIST_TERMS.some(term => lower.includes(term));
}

/**
 * Send a Telegram message with optional inline keyboard directly to a chat.
 * Bypasses the sendNotification dispatcher so we can include reply_markup.
 */
async function sendTelegramWithButtons(
  chatId: number,
  text: string,
  inlineKeyboard: Array<Array<{ text: string; callback_data: string }>>,
): Promise<boolean> {
  const token = process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Daily price increase detection cron.
 * Schedule: Daily at 8am (after bank sync at 3am) -- configured in vercel.json
 *
 * For each user with an active bank connection:
 * 1. Run detectPriceIncreases to find recurring payments that went up
 * 2. Skip government/fixed-obligation payments (HMRC, council tax, etc.)
 * 3. Check for duplicates — skip if active OR dismissed alert already exists
 * 4. Insert new alerts into price_increase_alerts, capturing the row IDs
 * 5. Send Telegram with inline dismiss buttons (one per alert)
 * 6. Send push notification
 * (Email is handled by morning-digest at 9am UTC)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Get all users with active bank connections
  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('user_id')
    .eq('status', 'active')
    .is('archived_at', null);

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({ message: 'No active bank connections', alerts_created: 0 });
  }

  // Deduplicate user IDs
  const userIds = [...new Set(connections.map(c => c.user_id))];

  let totalAlertsCreated = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const increases = await detectPriceIncreases(userId);
      if (increases.length === 0) continue;

      // Get existing active OR dismissed alerts — don't re-alert on dismissed merchants.
      // Previously only checked status='active', which caused dismissed alerts to be
      // re-inserted as new active rows on every cron run.
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized')
        .eq('user_id', userId)
        .in('status', ['active', 'dismissed']);

      const existingMerchants = new Set(
        (existingAlerts || []).map(a => a.merchant_normalized)
      );

      // Collect new increases with their DB row IDs for Telegram dismiss buttons
      const newAlerts: Array<{ id: string; merchantNormalized: string; oldAmount: number; newAmount: number; increasePct: number }> = [];

      for (const increase of increases) {
        // Skip government / fixed-obligation payments at cron level (belt-and-suspenders;
        // the detector also excludes council_tax/business_rates/tax categories)
        if (isGovPayment(increase.merchantNormalized)) continue;
        // Skip if active or dismissed alert already exists for this merchant
        if (existingMerchants.has(increase.merchantNormalized)) continue;

        // Insert and capture the row ID for Telegram dismiss buttons
        const { data: inserted, error: insertError } = await supabase
          .from('price_increase_alerts')
          .insert({
            user_id: userId,
            merchant_name: increase.merchantName,
            merchant_normalized: increase.merchantNormalized,
            old_amount: increase.oldAmount,
            new_amount: increase.newAmount,
            increase_pct: increase.increasePct,
            annual_impact: increase.annualImpact,
            old_date: increase.oldDate,
            new_date: increase.newDate,
            status: 'active',
          })
          .select('id')
          .single();

        if (insertError || !inserted) {
          errors.push(`Insert failed for ${userId}/${increase.merchantNormalized}: ${insertError?.message}`);
          continue;
        }

        totalAlertsCreated++;
        newAlerts.push({
          id: inserted.id,
          merchantNormalized: increase.merchantNormalized,
          oldAmount: increase.oldAmount,
          newAmount: increase.newAmount,
          increasePct: increase.increasePct,
        });
      }

      if (newAlerts.length === 0) continue;

      // ── Telegram: send with inline dismiss buttons ─────────────────────────
      // Bypasses the generic sendNotification dispatcher so we can attach
      // reply_markup. One button row per alert so users dismiss from the message
      // without opening the app.
      const { data: session } = await supabase
        .from('telegram_sessions')
        .select('telegram_chat_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (session?.telegram_chat_id) {
        const headline = newAlerts.length === 1
          ? `💸 *${newAlerts[0].merchantNormalized}* went up £${(newAlerts[0].newAmount - newAlerts[0].oldAmount).toFixed(2)} \\(+${newAlerts[0].increasePct}%\\)`
          : `💸 *${newAlerts.length} price increases detected*`;

        const lines = newAlerts
          .map(a => `• ${a.merchantNormalized}: £${a.oldAmount.toFixed(2)} → £${a.newAmount.toFixed(2)} (+${a.increasePct}%)`)
          .join('\n');

        const text = `${headline}\n\n${lines}\n\nYour morning digest email has the full breakdown and complaint letter links.`;

        // One dismiss button per alert
        const inlineKeyboard = newAlerts.map(a => ([{
          text: `✕ Dismiss ${a.merchantNormalized}`,
          callback_data: `dismiss_pia_${a.id}`,
        }]));

        await sendTelegramWithButtons(session.telegram_chat_id, text, inlineKeyboard);
      }

      // ── Push notification (no buttons on push) ─────────────────────────────
      const pushBody = newAlerts.length === 1
        ? `${newAlerts[0].merchantNormalized} went up ${newAlerts[0].increasePct}%`
        : `${newAlerts.length} price increases detected on your bills`;

      await sendNotification(supabase, {
        userId,
        event: 'price_increase',
        push: { title: 'Price hike detected', body: pushBody },
      });
    } catch (err) {
      errors.push(`Error processing user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    users_checked: userIds.length,
    alerts_created: totalAlertsCreated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
