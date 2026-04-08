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
        // Strip patterns like "LLAIR0012/0001/BIS26VIA" or long alphanumeric suffixes
        bill.provider_name = bill.provider_name
          .replace(/\s+[A-Z]{2,}[\d\/]+[A-Z]*\d*$/i, '')
          .replace(/\s+\d{8,}.*$/, '')
          .trim();
      }
    }

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
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
    
    const { data: currentMonthTxns } = await admin
      .from('bank_transactions')
      .select('merchant_name, description, amount')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth)
      .lte('timestamp', endOfMonth);

    const paidMerchants = (currentMonthTxns || []).map(t => ({
      name: (t.merchant_name || t.description || '').substring(0, 40).trim().toLowerCase(),
      amount: Math.abs(parseFloat(String(t.amount)) || 0),
    }));

    // Smart category detection for known provider names
    const PROVIDER_CATEGORIES: Array<{ pattern: RegExp; category: string }> = [
      // Mortgages / property
      { pattern: /\b(paratus|lendinvest|nationwide|halifax|santander.*mortgage|barclays.*mortgage|natwest.*mortgage|hsbc.*mortgage|virgin.*money|coventry|skipton|leeds|yorkshire|accord|kent reliance|godiva)\b/i, category: 'mortgage' },
      // Loans
      { pattern: /\b(santander.*loan|amigo|zopa|ratesetter|lending works|funding circle|hitachi.*capital|creation.*finance|motonovo)\b/i, category: 'loans' },
      // Council tax
      { pattern: /\b(council|borough|district|city.*of)\b/i, category: 'council_tax' },
      // Energy
      { pattern: /\b(british gas|edf|eon|octopus.*energy|bulb|sse|scottish.*power|ovo|shell.*energy|utilita|so.*energy|affect.*energy)\b/i, category: 'energy' },
      // Water
      { pattern: /\b(thames.*water|severn.*trent|anglian|united.*utilities|wessex|southw|welsh.*water|dwr.*cymru|yorkshire.*water|northumbrian)\b/i, category: 'water' },
      // Broadband / TV
      { pattern: /\b(bt|virgin.*media|sky|talktalk|plusnet|hyperoptic|community.*fibre|zen.*internet|vodafone.*broadband|now.*broadband|starlink)\b/i, category: 'broadband' },
      // Mobile
      { pattern: /\b(three|o2|ee|vodafone|giffgaff|tesco.*mobile|id.*mobile|smarty|lebara)\b/i, category: 'mobile' },
      // Insurance
      { pattern: /\b(aviva|direct.*line|admiral|lv=?|axa|zurich|legal.*general|royal.*london|prudential|vitality|bupa|simply.*health)\b/i, category: 'insurance' },
      // Streaming
      { pattern: /\b(netflix|spotify|disney|apple.*tv|amazon.*prime|now.*tv|dazn|crunchyroll|paramount|youtube.*premium)\b/i, category: 'streaming' },
      // Fitness
      { pattern: /\b(puregym|the.*gym|david.*lloyd|nuffield|fitness.*first|anytime.*fitness|jd.*gym|better.*gym)\b/i, category: 'fitness' },
      // Software / subscriptions
      { pattern: /\b(adobe|microsoft|google|dropbox|icloud|1password|notion|slack|zoom|canva|chatgpt|openai|patreon)\b/i, category: 'software' },
      // DVLA / vehicle
      { pattern: /\b(dvla|vehicle.*tax|road.*tax)\b/i, category: 'motoring' },
      // Childcare
      { pattern: /\b(nursery|childcare|childminder|after.*school)\b/i, category: 'childcare' },
      // Credit monitoring
      { pattern: /\b(experian|equifax|clearscore|credit.*karma|checkmyfile)\b/i, category: 'credit_monitoring' },
      // Charity
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
      // Use subscription category if linked, otherwise auto-detect from provider name
      const category = bill.subscription_id
        ? (subCategories[bill.subscription_id] || detectCategory(bill.provider_name))
        : detectCategory(bill.provider_name);

      const billNameNorm = normaliseBillName(bill.provider_name);

      // Check if this bill has been paid this month by matching transactions
      const billAmount = parseFloat(bill.expected_amount) || 0;
      const expectedDate = bill.billing_day || 15;
      
      const paid = paidMerchants.some(pm => {
        const pmNorm = normaliseBillName(pm.name);
        if (!pmNorm && !billNameNorm) return false;
        
        let nameMatch = false;
        if (pmNorm && billNameNorm) {
            const minLen = Math.min(pmNorm.length, billNameNorm.length, 10);
            nameMatch = pmNorm.includes(billNameNorm.substring(0, minLen)) ||
                        billNameNorm.includes(pmNorm.substring(0, minLen));
        }

        // Amount match: within 5% tolerance (bills can vary slightly month-to-month, or exactly match loans)
        let amountMatch = false;
        if (billAmount > 0 && pm.amount > 0) {
          const ratio = pm.amount / billAmount;
          amountMatch = ratio >= 0.95 && ratio <= 1.05;
        }

        // If the name strictly matches, and amount is broadly okay (~20%) -> Paid
        if (nameMatch) {
            if (billAmount > 0 && pm.amount > 0) {
                const ratio = pm.amount / billAmount;
                if (ratio >= 0.8 && ratio <= 1.2) return true;
            } else {
                return true;
            }
        }
        
        // If the name completely obfuscated (doesn't match), BUT the amount is a near-exact match (<5% variance) 
        // AND it occurred roughly around the expected billing day (timestamp handling would be ideal here 
        // but we assume if a 5% strict absolute value hit in the same calendar month bounds it is the bill).
        if (!nameMatch && amountMatch && billAmount > 0) {
            return true;
        }

        return false;
      });

      // Check if billing day has passed (in relation to baseDate vs today)
      let isPastDue = false;
      const billingDay = bill.billing_day || 0;
      
      if (billingDay > 0 && !paid) {
        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const targetYearMonth = `${year}-${String(month).padStart(2, '0')}`;
        
        if (targetYearMonth < currentYearMonth) {
          isPastDue = true; // In the past, it definitely passed.
        } else if (targetYearMonth === currentYearMonth) {
          isPastDue = billingDay < now.getDate();
        }
      }

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
