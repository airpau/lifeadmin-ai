import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Normalise a provider name for deduplication (strip references, suffixes, PayPal prefix). */
function normaliseBillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/paypal\s*\*/gi, '')
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk)\b/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Use the DB function for deduplicated expected bills
    const { data: rawBills, error: rpcError } = await admin.rpc('get_expected_bills', {
      p_user_id: user.id,
      p_year: year,
      p_month: month,
    });

    if (rpcError) {
      console.error('get_expected_bills RPC error:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    // Filter: remove low-confidence (<2 occurrences) and daily charges (>30 occurrences)
    let bills = (rawBills || []).filter(
      (b: any) => b.occurrence_count >= 2 && b.occurrence_count <= 30
    );

    // Merge similar providers by normalised name (e.g. "COMMUNITYFIBRE LTD" + "Community Fibre")
    const mergedMap = new Map<string, any>();
    for (const bill of bills) {
      const normKey = normaliseBillName(bill.provider_name);
      if (!normKey) continue;
      const existing = mergedMap.get(normKey);
      if (existing) {
        // Prefer subscription over non-subscription, then higher occurrence_count
        if (bill.is_subscription && !existing.is_subscription) {
          mergedMap.set(normKey, bill);
        } else if (existing.is_subscription && !bill.is_subscription) {
          // keep existing
        } else if (bill.occurrence_count > existing.occurrence_count) {
          mergedMap.set(normKey, bill);
        }
      } else {
        mergedMap.set(normKey, bill);
      }
    }
    bills = Array.from(mergedMap.values());

    // Fetch subscription categories for enrichment
    const subIds = bills
      .filter((b: any) => b.subscription_id)
      .map((b: any) => b.subscription_id);

    const subCategories: Record<string, string> = {};
    if (subIds.length > 0) {
      const { data: subs } = await admin
        .from('subscriptions')
        .select('id, category')
        .in('id', subIds);
      for (const sub of subs || []) {
        subCategories[sub.id] = sub.category || 'other';
      }
    }

    // Check which bills have been paid this month
    const startOfMonth = new Date(year, month - 1, 1).toISOString();
    const { data: currentMonthTxns } = await admin
      .from('bank_transactions')
      .select('merchant_name, description, amount')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth);

    const paidMerchants = (currentMonthTxns || []).map(t =>
      (t.merchant_name || t.description || '').substring(0, 40).trim().toLowerCase()
    );

    // Transform to frontend format
    const enrichedBills = bills.map((bill: any) => {
      const category = bill.subscription_id
        ? (subCategories[bill.subscription_id] || 'other')
        : 'other';

      const billNameNorm = normaliseBillName(bill.provider_name);
      const paid = paidMerchants.some(pm => {
        const pmNorm = normaliseBillName(pm);
        if (!pmNorm || !billNameNorm) return false;
        return pmNorm.includes(billNameNorm.substring(0, 8)) ||
               billNameNorm.includes(pmNorm.substring(0, 8));
      });

      return {
        name: bill.provider_name,
        expected_amount: parseFloat(bill.expected_amount) || 0,
        category,
        source: bill.is_subscription ? 'subscription' as const : 'recurring' as const,
        paid,
        expected_date: bill.expected_date,
        billing_day: bill.billing_day,
        occurrence_count: bill.occurrence_count,
        is_subscription: bill.is_subscription,
        subscription_id: bill.subscription_id,
        bill_key: bill.bill_key,
      };
    });

    // Sort by billing day (when in the month the bill is expected)
    enrichedBills.sort((a: any, b: any) => a.billing_day - b.billing_day);

    const totalExpected = enrichedBills.reduce((s: number, b: any) => s + b.expected_amount, 0);

    return NextResponse.json({
      bills: enrichedBills,
      totalExpected: parseFloat(totalExpected.toFixed(2)),
    });
  } catch (err: any) {
    console.error('Expected bills error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
