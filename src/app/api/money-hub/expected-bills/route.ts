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

/**
 * Fuzzy name match between a transaction and an expected bill.
 * Returns true if any of these hold:
 *   1. Normalised prefix overlap (original logic, 10-char cap)
 *   2. Any word ≥ 4 chars in billName appears in pmName (word-level check)
 *   3. pmName contains billName as a full substring (after normalisation)
 */
function fuzzyNameMatch(pmName: string, billName: string): boolean {
  if (!pmName || !billName) return false;

  const pmNorm  = normaliseBillName(pmName);
  const billNorm = normaliseBillName(billName);
  if (!pmNorm || !billNorm) return false;

  // Strategy 1: prefix overlap (capped at 10 chars)
  const minLen = Math.min(pmNorm.length, billNorm.length, 10);
  if (minLen >= 3) {
    if (
      pmNorm.includes(billNorm.substring(0, minLen)) ||
      billNorm.includes(pmNorm.substring(0, minLen))
    ) return true;
  }

  // Strategy 2: full substring either direction
  if (pmNorm.includes(billNorm) || billNorm.includes(pmNorm)) return true;

  // Strategy 3: word-level — all significant words (≥4 chars) from the bill
  // name must appear in the transaction name (handles "DD PARATUS AMC REF..." cases)
  const billWords = billNorm.split(/\s+/).filter(w => w.length >= 4);
  if (billWords.length > 0 && billWords.every(w => pmNorm.includes(w))) return true;

  // Strategy 4: first significant word of transaction matches first significant
  // word of bill (catches "STARLINK" matching "Starlink Services")
  const pmWords   = pmNorm.split(/\s+/).filter(w => w.length >= 4);
  if (pmWords.length > 0 && billWords.length > 0 && pmWords[0] === billWords[0]) return true;

  return false;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();
    const url = new URL(request.url);
    const monthParam = url.searchParams.get('month');

    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    let baseDate = new Date();

    if (monthParam) {
      const [yyyy, mm] = monthParam.split('-');
      year = parseInt(yyyy, 10);
      month = parseInt(mm, 10);
      baseDate = new Date(year, month - 1, 15);
    }

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

    // M6: Filter out self-transfers (inter-account transfers appearing as expected bills)
    const transferPatterns = [
      /\bto a\/c\b/i, /\bfrom a\/c\b/i, /\bpersonal transfer\b/i,
      /\bvia mobile\s*-?\s*pymt\b/i, /\bvia online\s*-?\s*pymt\b/i,
      /\bbetween accounts\b/i, /\binternal\b/i,
      /\b(airey|airprop|jpg operatio)\b/i, /\bjohn airey\b/i, /\bp a airey\b/i,
    ];
    bills = bills.filter((b: any) => {
      const name = (b.provider_name || '').toLowerCase();
      const key = (b.bill_key || '').toLowerCase();
      return !transferPatterns.some(p => p.test(name) || p.test(key));
    });

    // M7: Clean garbled provider names (strip bank reference suffixes)
    for (const bill of bills) {
      if (bill.provider_name) {
        bill.provider_name = bill.provider_name
          .replace(/\s+[A-Z]{2,}[\d\/]+[A-Z]*\d*$/i, '')
          .replace(/\s+\d{8,}.*$/, '')
          .trim();
      }
    }

    // Merge similar providers by normalised name
    const mergedMap = new Map<string, any>();
    for (const bill of bills) {
      const normKey = normaliseBillName(bill.provider_name);
      if (!normKey) continue;
      const existing = mergedMap.get(normKey);
      if (existing) {
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

    // Fetch all debits this month — include timestamp for date-window checks
    const startOfMonth = new Date(year, month - 1, 1).toISOString();
    // Extend end window by 5 days for late-posting bills
    const endOfWindow = new Date(year, month, 5, 23, 59, 59, 999).toISOString();

    const { data: currentMonthTxns } = await admin
      .from('bank_transactions')
      .select('merchant_name, description, amount, timestamp')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth)
      .lte('timestamp', endOfWindow);

    const paidTransactions = (currentMonthTxns || []).map(t => ({
      name: (t.merchant_name || t.description || '').substring(0, 60).trim().toLowerCase(),
      amount: Math.abs(parseFloat(String(t.amount)) || 0),
      day: new Date(t.timestamp).getDate(),
    }));

    // Fetch manual "mark as paid" overrides for this month
    const billMonth = `${year}-${String(month).padStart(2, '0')}`;
    const { data: manualOverrides } = await admin
      .from('bill_paid_overrides')
      .select('bill_key')
      .eq('user_id', user.id)
      .eq('bill_month', billMonth);

    const manuallyPaidKeys = new Set((manualOverrides || []).map((o: any) => o.bill_key));

    // Smart category detection for known provider names
    const PROVIDER_CATEGORIES: Array<{ pattern: RegExp; category: string }> = [
      { pattern: /\b(paratus|lendinvest|nationwide|halifax|santander.*mortgage|barclays.*mortgage|natwest.*mortgage|hsbc.*mortgage|virgin.*money|coventry|skipton|leeds|yorkshire|accord|kent reliance|godiva|platform.*home)\b/i, category: 'mortgage' },
      { pattern: /\b(santander.*loan|amigo|zopa|ratesetter|lending works|funding circle|hitachi.*capital|creation.*finance|motonovo|loqbox|drafty)\b/i, category: 'loans' },
      { pattern: /\b(council|borough|district|city.*of)\b/i, category: 'council_tax' },
      { pattern: /\b(british gas|edf|eon|octopus.*energy|bulb|sse|scottish.*power|ovo|shell.*energy|utilita|so.*energy|affect.*energy)\b/i, category: 'energy' },
      { pattern: /\b(thames.*water|severn.*trent|anglian|united.*utilities|wessex|southw|welsh.*water|dwr.*cymru|yorkshire.*water|northumbrian)\b/i, category: 'water' },
      { pattern: /\b(bt|virgin.*media|sky|talktalk|plusnet|hyperoptic|community.*fibre|zen.*internet|vodafone.*broadband|now.*broadband|starlink)\b/i, category: 'broadband' },
      { pattern: /\b(three|o2|ee|vodafone|giffgaff|tesco.*mobile|id.*mobile|smarty|lebara)\b/i, category: 'mobile' },
      { pattern: /\b(aviva|direct.*line|admiral|lv=?|axa|zurich|legal.*general|royal.*london|prudential|vitality|bupa|simply.*health)\b/i, category: 'insurance' },
      { pattern: /\b(netflix|spotify|disney|apple.*tv|amazon.*prime|now.*tv|dazn|crunchyroll|paramount|youtube.*premium)\b/i, category: 'streaming' },
      { pattern: /\b(puregym|the.*gym|david.*lloyd|nuffield|fitness.*first|anytime.*fitness|jd.*gym|better.*gym)\b/i, category: 'fitness' },
      { pattern: /\b(adobe|microsoft|google|dropbox|icloud|1password|notion|slack|zoom|canva|chatgpt|openai|patreon)\b/i, category: 'software' },
      { pattern: /\b(dvla|vehicle.*tax|road.*tax)\b/i, category: 'motoring' },
      { pattern: /\b(nursery|childcare|childminder|after.*school)\b/i, category: 'childcare' },
      { pattern: /\b(experian|equifax|clearscore|credit.*karma|checkmyfile)\b/i, category: 'credit_monitoring' },
      { pattern: /\b(charity|oxfam|red.*cross|cancer.*research|nspcc|rspca|unicef|wwf|amnesty)\b/i, category: 'charity' },
    ];

    function detectCategory(providerName: string): string {
      const name = (providerName || '').toLowerCase();
      for (const { pattern, category } of PROVIDER_CATEGORIES) {
        if (pattern.test(name)) return category;
      }
      return 'other';
    }

    // Transform to frontend format
    const enrichedBills = bills.map((bill: any) => {
      const category = bill.subscription_id
        ? (subCategories[bill.subscription_id] || detectCategory(bill.provider_name))
        : detectCategory(bill.provider_name);

      const billAmount = parseFloat(bill.expected_amount) || 0;
      const billingDay = bill.billing_day || 0;

      // Check manual override first
      if (manuallyPaidKeys.has(bill.bill_key)) {
        return buildBill(bill, category, billAmount, true, false);
      }

      // Match against transactions: name fuzzy-match + amount tolerance
      const paid = paidTransactions.some(pm => {
        const nameMatch = fuzzyNameMatch(pm.name, bill.provider_name);

        // Amount: within £1 absolute OR within 20% if name matches / within 5% otherwise
        let amountMatch = false;
        if (billAmount > 0 && pm.amount > 0) {
          const diff  = Math.abs(pm.amount - billAmount);
          const ratio = pm.amount / billAmount;
          amountMatch = diff <= 1.00 || (nameMatch ? ratio >= 0.80 && ratio <= 1.20 : ratio >= 0.95 && ratio <= 1.05);
        }

        // Date window: within 5 days after billing day (or anywhere in month if no billing day)
        let inWindow = true;
        if (billingDay > 0 && pm.day > 0) {
          inWindow = pm.day >= billingDay - 1 && pm.day <= billingDay + 5;
        }

        if (nameMatch && amountMatch) return true;
        // Amount-only match (obfuscated merchant) must be strict + in date window
        if (!nameMatch && amountMatch && billAmount > 5 && inWindow) return true;

        return false;
      });

      // Past due check
      let isPastDue = false;
      if (billingDay > 0 && !paid) {
        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const targetYearMonth  = `${year}-${String(month).padStart(2, '0')}`;
        if (targetYearMonth < currentYearMonth) {
          isPastDue = true;
        } else if (targetYearMonth === currentYearMonth) {
          isPastDue = billingDay < now.getDate();
        }
      }

      return buildBill(bill, category, billAmount, paid, isPastDue);
    });

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

function buildBill(bill: any, category: string, billAmount: number, paid: boolean, isPastDue: boolean) {
  return {
    name: bill.provider_name,
    expected_amount: billAmount,
    category,
    source: bill.is_subscription ? 'subscription' as const : 'recurring' as const,
    paid,
    past_due: isPastDue,
    expected_date: bill.expected_date,
    billing_day: bill.billing_day,
    occurrence_count: bill.occurrence_count,
    is_subscription: bill.is_subscription,
    subscription_id: bill.subscription_id,
    bill_key: bill.bill_key,
  };
}
