import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/awin/postback
 * Called by Awin when a user completes a deal switch via an affiliate link.
 * Always returns 200 to prevent Awin retries.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const transactionId = searchParams.get('transaction_id') || searchParams.get('transactionId') || '';
  const orderRef = searchParams.get('order_ref') || searchParams.get('orderRef') || '';
  const commission = searchParams.get('commission') || '0';
  const status = searchParams.get('status') || 'pending';

  // Optional: validate shared secret
  const secret = searchParams.get('secret') || request.headers.get('x-awin-secret');
  const expectedSecret = process.env.AWIN_POSTBACK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    console.error(`[awin-postback] Invalid secret. Got: ${secret}`);
    // Still return 200 to prevent retries
    return NextResponse.json({ ok: false, reason: 'invalid_secret' });
  }

  if (!transactionId) {
    console.error('[awin-postback] Missing transaction_id');
    return NextResponse.json({ ok: false, reason: 'missing_transaction_id' });
  }

  const supabase = getAdmin();

  // Extract user_id from order_ref (format: userId or deal-userId-timestamp)
  let userId = orderRef;
  if (orderRef.includes('-')) {
    // Try to extract UUID from order ref
    const uuidMatch = orderRef.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) userId = uuidMatch[0];
  }

  // Log the transaction
  const commissionPence = Math.round(parseFloat(commission) * 100);
  const { error: insertErr } = await supabase.from('awin_transactions').insert({
    user_id: userId || null,
    transaction_id: transactionId,
    commission_pence: commissionPence,
    status,
  });
  if (insertErr) console.error('[awin-postback] Insert failed:', insertErr.message);

  console.log(`[awin-postback] Received: txn=${transactionId} ref=${orderRef} commission=${commission} status=${status} userId=${userId}`);

  // If confirmed, award points
  if (status === 'confirmed' && userId) {
    // Verify user exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      try {
        const { awardPoints } = await import('@/lib/loyalty');
        await awardPoints(userId, 'deal_switched', {
          transaction_id: transactionId,
          commission_pence: commissionPence,
        });

        // Mark as points awarded
        await supabase.from('awin_transactions')
          .update({ points_awarded: true })
          .eq('transaction_id', transactionId);

        console.log(`[awin-postback] Awarded 50 points to ${userId} for deal switch`);
      } catch (err: any) {
        console.error(`[awin-postback] Failed to award points: ${err.message}`);
      }
    } else {
      console.error(`[awin-postback] User not found: ${userId}`);
    }
  }

  // Always return 200 to prevent Awin retries
  return NextResponse.json({ ok: true });
}
