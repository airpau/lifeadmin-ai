import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Normalise a name for fuzzy matching: lowercase, strip noise words and numbers.
 */
function normName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/paypal\s*\*/gi, '')
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk|group|uk|gb)\b/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True if two provider/merchant names are a fuzzy match.
 * Uses bidirectional partial-prefix matching on normalised forms.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;

  // Exact match after normalisation
  if (na === nb) return true;

  // One contains the other (handles "Community Fibre" ↔ "COMMUNITYFIBRE")
  if (na.includes(nb) || nb.includes(na)) return true;

  // Prefix match: first N chars of each (N = shortest, min 5)
  const minLen = Math.min(na.length, nb.length);
  if (minLen >= 5 && na.substring(0, minLen) === nb.substring(0, minLen)) return true;

  // Partial token match: any token ≥5 chars in common
  const tokensA = na.split(' ').filter(t => t.length >= 5);
  const tokensB = new Set(nb.split(' ').filter(t => t.length >= 5));
  if (tokensA.some(t => tokensB.has(t))) return true;

  return false;
}

export type FacBankStatus = 'bank_matched' | 'not_in_bank' | 'due_soon' | 'overdue';

export interface FacItem {
  id: string;
  provider_name: string;
  amount: number;
  billing_cycle: string | null;
  category: string | null;
  status: string;
  next_billing_date: string | null;
  source: string | null;
  needs_review: boolean;
  notes: string | null;
  bankStatus: FacBankStatus;
  matchedTxn: {
    merchant_name: string;
    amount: number;
    timestamp: string;
  } | null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [{ data: subs }, { data: txns }] = await Promise.all([
      admin
        .from('subscriptions')
        .select('id, provider_name, amount, billing_cycle, category, status, next_billing_date, source, needs_review, notes')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('dismissed_at', null)
        .order('provider_name', { ascending: true }),
      admin
        .from('bank_transactions')
        .select('merchant_name, description, amount, timestamp')
        .eq('user_id', user.id)
        .gte('timestamp', ninetyDaysAgo)
        .lt('amount', 0),  // spending only (negative = money out)
    ]);

    const transactions = (txns || []).map((t: any) => ({
      merchant_name: (t.merchant_name || t.description || '').trim(),
      amount: Math.abs(parseFloat(String(t.amount)) || 0),
      timestamp: t.timestamp,
    }));

    const items: FacItem[] = (subs || []).map((sub: any) => {
      const subAmount = parseFloat(String(sub.amount)) || 0;

      // Find best-matching bank transaction
      const matchedTxn = transactions.find(t => {
        const nameOk = fuzzyMatch(sub.provider_name, t.merchant_name);
        // Amount tolerance: within £5 OR within 10% (for variable bills)
        const amountOk = subAmount === 0 || Math.abs(t.amount - subAmount) <= 5 || (subAmount > 0 && Math.abs(t.amount - subAmount) / subAmount <= 0.1);
        return nameOk && amountOk;
      }) || null;

      const nextDate = sub.next_billing_date as string | null;

      let bankStatus: FacBankStatus;
      if (matchedTxn) {
        bankStatus = 'bank_matched';
      } else if (nextDate && nextDate < today) {
        bankStatus = 'overdue';
      } else if (nextDate && nextDate <= sevenDaysFromNow) {
        bankStatus = 'due_soon';
      } else {
        bankStatus = 'not_in_bank';
      }

      return {
        id: sub.id,
        provider_name: sub.provider_name,
        amount: subAmount,
        billing_cycle: sub.billing_cycle,
        category: sub.category,
        status: sub.status,
        next_billing_date: nextDate,
        source: sub.source || null,
        needs_review: sub.needs_review || false,
        notes: sub.notes || null,
        bankStatus,
        matchedTxn: matchedTxn ? {
          merchant_name: matchedTxn.merchant_name,
          amount: matchedTxn.amount,
          timestamp: matchedTxn.timestamp,
        } : null,
      };
    });

    // Sort: actionable first (overdue, due_soon, not_in_bank), then bank_matched
    const priority: Record<FacBankStatus, number> = {
      overdue: 0,
      due_soon: 1,
      not_in_bank: 2,
      bank_matched: 3,
    };
    items.sort((a, b) => priority[a.bankStatus] - priority[b.bankStatus] || a.provider_name.localeCompare(b.provider_name));

    const counts = {
      overdue: items.filter(i => i.bankStatus === 'overdue').length,
      due_soon: items.filter(i => i.bankStatus === 'due_soon').length,
      not_in_bank: items.filter(i => i.bankStatus === 'not_in_bank').length,
      bank_matched: items.filter(i => i.bankStatus === 'bank_matched').length,
    };

    return NextResponse.json({ items, counts });
  } catch (err: any) {
    console.error('FAC error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
