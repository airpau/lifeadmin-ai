import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

interface DetectedLiability {
  lender: string;
  lender_key: string;
  liability_type: 'loan' | 'credit_card' | 'car_finance' | 'overdraft' | 'other';
  monthly_payment: number;
  payment_count: number;
  first_payment: string;
  last_payment: string;
  total_paid: number;
  /** Rough estimate: null if we can't reliably estimate */
  estimated_balance: number | null;
  balance_explanation: string | null;
  already_tracked: boolean;
}

/**
 * GET /api/money-hub/detect-liabilities
 *
 * Scans loan-categorised transactions to find recurring debt payments
 * that aren't yet tracked in the Net Worth liabilities section.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();

    // Fetch all loan/credit card transactions (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [txnResult, existingLiabilities, dismissedResult] = await Promise.all([
      admin.from('bank_transactions')
        .select('merchant_name, description, amount, timestamp, user_category')
        .eq('user_id', user.id)
        .in('user_category', ['loans'])
        .lt('amount', 0)
        .gte('timestamp', twelveMonthsAgo.toISOString())
        .order('timestamp', { ascending: false }),
      admin.from('money_hub_liabilities')
        .select('liability_name, liability_type, monthly_payment')
        .eq('user_id', user.id),
      admin.from('dismissed_detected_liabilities')
        .select('lender_key')
        .eq('user_id', user.id),
    ]);

    const txns = txnResult.data || [];
    const existing = existingLiabilities.data || [];
    const existingNames = new Set(existing.map(l => (l.liability_name || '').toLowerCase()));
    const dismissedKeys = new Set((dismissedResult.data || []).map((d: any) => d.lender_key));

    // Group by normalised lender name
    const lenderMap = new Map<string, {
      merchant: string;
      payments: number[];
      dates: string[];
      descriptions: Set<string>;
    }>();

    for (const t of txns) {
      const merchant = t.merchant_name || cleanDescription(t.description || '');
      if (!merchant || merchant.length < 3) continue;

      const key = merchant.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (!lenderMap.has(key)) {
        lenderMap.set(key, { merchant, payments: [], dates: [], descriptions: new Set() });
      }
      const entry = lenderMap.get(key)!;
      entry.payments.push(Math.abs(parseFloat(String(t.amount))));
      entry.dates.push(t.timestamp);
      entry.descriptions.add(t.description || '');
    }

    // Build detected liabilities (only recurring — 2+ payments)
    const detected: DetectedLiability[] = [];

    for (const [key, entry] of lenderMap) {
      if (entry.payments.length < 2) continue;

      // Skip dismissed liabilities
      if (dismissedKeys.has(key)) continue;

      const avgPayment = entry.payments.reduce((s, p) => s + p, 0) / entry.payments.length;
      const totalPaid = entry.payments.reduce((s, p) => s + p, 0);
      const dates = entry.dates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
      const firstDate = dates[0].toISOString().split('T')[0];
      const lastDate = dates[dates.length - 1].toISOString().split('T')[0];

      // Determine type from name
      const nameLower = entry.merchant.toLowerCase();
      let liabilityType: DetectedLiability['liability_type'] = 'loan';
      if (nameLower.includes('credit') || nameLower.includes('card') || nameLower.includes('mbna') ||
          nameLower.includes('barclaycard') || nameLower.includes('mastercard')) {
        liabilityType = 'credit_card';
      } else if (nameLower.includes('auto') || nameLower.includes('car finance') || nameLower.includes('motor')) {
        liabilityType = 'car_finance';
      } else if (nameLower.includes('overdraft')) {
        liabilityType = 'overdraft';
      }

      // Check if already tracked
      const alreadyTracked = existingNames.has(entry.merchant.toLowerCase()) ||
        [...existingNames].some(n => n.includes(entry.merchant.toLowerCase().substring(0, 10)));

      // Rough balance estimate for fixed-term loans (not credit cards)
      let estimatedBalance: number | null = null;
      let balanceExplanation: string | null = null;
      if (liabilityType === 'loan' || liabilityType === 'car_finance') {
        const monthsOfData = entry.payments.length;
        if (monthsOfData >= 3) {
          // Rough estimate: average monthly payment × 24 months remaining
          estimatedBalance = Math.round(avgPayment * 24);
          balanceExplanation = `Rough estimate based on your average payment of £${avgPayment.toFixed(2)}/mo × 24 months. Please enter the actual balance if you know it.`;
        }
      }

      detected.push({
        lender: entry.merchant,
        lender_key: key,
        liability_type: liabilityType,
        monthly_payment: Math.round(avgPayment * 100) / 100,
        payment_count: entry.payments.length,
        first_payment: firstDate,
        last_payment: lastDate,
        total_paid: Math.round(totalPaid * 100) / 100,
        estimated_balance: estimatedBalance,
        balance_explanation: balanceExplanation,
        already_tracked: alreadyTracked,
      });
    }

    // Sort: untracked first, then by monthly payment descending
    detected.sort((a, b) => {
      if (a.already_tracked !== b.already_tracked) return a.already_tracked ? 1 : -1;
      return b.monthly_payment - a.monthly_payment;
    });

    return NextResponse.json({
      detected,
      summary: {
        total: detected.length,
        untracked: detected.filter(d => !d.already_tracked).length,
        monthlyDebtPayments: Math.round(detected.reduce((s, d) => s + d.monthly_payment, 0) * 100) / 100,
      },
    });
  } catch (err: any) {
    console.error('Detect liabilities error:', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

/** Strip reference numbers and dates from descriptions to get a clean lender name */
function cleanDescription(desc: string): string {
  return desc
    .replace(/FP \d{2}\/\d{2}\/\d{2}.*$/i, '')
    .replace(/TPP .*$/i, '')
    .replace(/\d{6,}/g, '')
    .replace(/[A-Z]\d{4,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 40);
}
