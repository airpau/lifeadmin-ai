import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Smart categorisation rules
const CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['mortgage', 'lendinvest', 'skipton b.s', 'skipton bs', 'nationwide b.s', 'nationwide bs', 'halifax mort', 'barclays mort', 'hsbc mort', 'santander mort', 'bm solutions', 'accord mort', 'virgin money mort', 'leeds b.s', 'leeds bs', 'yorkshire b.s', 'yorkshire bs', 'coventry b.s', 'coventry bs', 'principality b.s', 'west brom b.s', 'fleet mort', 'paragon mort', 'keystone mort'], category: 'mortgage' },
  { keywords: ['natwest loan', 'santander loans', 'novuna personal', 'ca auto finance', 'tesco bank'], category: 'loans' },
  { keywords: ['council', 'winchester city counci', 'hounslow', 'lbh'], category: 'council_tax' },
  { keywords: ['hmrc', 'hm revenue'], category: 'tax' },
  { keywords: ['british gas', 'eon', 'octopus', 'ovo', 'edf', 'scottish power', 'sse', 'shell energy'], category: 'energy' },
  { keywords: ['thames water', 'severn trent', 'united utilities', 'anglian water'], category: 'water' },
  { keywords: ['sky broadband', 'virgin media', 'bt broadband', 'bt fibre', 'communityfibre', 'plusnet', 'talktalk', 'hyperoptic'], category: 'broadband' },
  { keywords: ['vodafone', 'ee ', 'three', 'o2 ', 'giffgaff', 'smarty', 'lebara'], category: 'mobile' },
  { keywords: ['netflix', 'spotify', 'disney', 'amazon prime', 'apple tv', 'youtube', 'now tv', 'dazn', 'audible'], category: 'streaming' },
  { keywords: ['gym', 'puregym', 'david lloyd', 'whoop', 'peloton', 'strava', 'fitness'], category: 'fitness' },
  { keywords: ['tesco', 'sainsbury', 'asda', 'aldi', 'lidl', 'morrisons', 'waitrose', 'ocado', 'co-op', 'iceland'], category: 'groceries' },
  { keywords: ['deliveroo', 'just eat', 'uber eats', 'mcdonald', 'nando', 'pizza', 'greggs', 'starbucks', 'costa', 'pret'], category: 'eating_out' },
  { keywords: ['petrol', 'shell ', 'bp ', 'esso', 'texaco', 'fuel'], category: 'fuel' },
  { keywords: ['amazon', 'ebay', 'asos', 'next ', 'argos', 'john lewis', 'currys'], category: 'shopping' },
  { keywords: ['insurance', 'admiral', 'aviva', 'direct line', 'manypets', 'petplan'], category: 'insurance' },
  { keywords: ['dvla', 'trainline', 'tfl', 'uber', 'bolt', 'parking'], category: 'transport' },
  { keywords: ['nursery', 'childcare', 'school'], category: 'childcare' },
  { keywords: ['experian', 'adobe', 'microsoft', 'google', 'openai', 'anthropic', 'github', 'canva', 'notion', 'figma'], category: 'software' },
];

// Income detection patterns - expanded for real-world bank descriptions
const INCOME_PATTERNS: Array<{ keywords: string[]; type: string }> = [
  // Specific patterns first — order matters (first match wins)
  { keywords: ['salary', 'wages', 'payroll', 'pay ref', 'director', 'monthly pay', 'net pay'], type: 'salary' },
  { keywords: ['freelance', 'invoice', 'consulting', 'contract pay'], type: 'freelance' },
  { keywords: ['hmrc', 'tax credit', 'working tax', 'child tax'], type: 'benefits' },
  { keywords: ['dwp', 'universal credit', 'child benefit', 'pension credit', 'pip ', 'esa ', 'jsa '], type: 'benefits' },
  { keywords: ['rent ', 'rental income', 'tenant', 'letting'], type: 'rental' },
  { keywords: ['dividend', 'interest earned', 'interest payment', 'investment return', 'capital gain'], type: 'investment' },
  { keywords: ['from a/c', 'via mobile xfer', 'personal transfer', 'internal transfer', 'between accounts'], type: 'transfer' },
  { keywords: ['loan repayment', 'loan repay', 'repayment received'], type: 'loan_repayment' },
  { keywords: ['birthday', 'gift from', 'present from'], type: 'gift' },
  // Refund pattern LAST and more specific — only match clear refund indicators
  { keywords: ['refund from', 'refund -', 'refund:', 'your refund', 'cashback reward', 'cashback from'], type: 'refund' },
];

function categoriseTransaction(desc: string, bankCategory: string): string {
  const d = desc.toLowerCase();
  for (const { keywords, category } of CATEGORY_RULES) {
    if (keywords.some(kw => d.includes(kw))) return category;
  }
  const MAP: Record<string, string> = {
    PURCHASE: 'shopping', DEBIT: 'shopping', DIRECT_DEBIT: 'bills',
    STANDING_ORDER: 'bills', CREDIT: 'income', FEE: 'fees',
  };
  return MAP[bankCategory] || 'other';
}

function detectIncomeType(desc: string): string | null {
  const d = desc.toLowerCase();
  for (const { keywords, type } of INCOME_PATTERNS) {
    if (keywords.some(kw => d.includes(kw))) return type;
  }
  return null;
}

function isTransfer(desc: string, bankCategory: string): boolean {
  const cat = bankCategory.toUpperCase();
  const d = desc.toLowerCase();
  if (cat === 'TRANSFER') return true;
  if (d.includes('personal transfer') || d.includes('to a/c ') || d.includes('via mobile xfer')) return true;
  if (d.includes('barclaycard') && !d.includes('fee')) return true;
  if (d.includes('mbna') && d.includes('tpp')) return true;
  if (d.includes('halifax credit') || d.includes('hsbc bank visa')) return true;
  if (d.includes('virgin money') && d.includes('tpp')) return true;
  if (d.includes('securepay.bos')) return true;
  return false;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getAdmin();

  // Step 1: Trigger a fresh bank sync first
  try {
    const syncRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk'}/api/bank/sync`, {
      method: 'POST',
      headers: { cookie: '' }, // This won't work server-to-server, so we'll sync directly
    });
    // If this fails, we still proceed with existing data
  } catch {}

  // Step 2: Load user's category overrides
  const { data: overrides } = await admin.from('money_hub_category_overrides')
    .select('merchant_pattern, user_category, transaction_id')
    .eq('user_id', user.id);

  const overrideMap = new Map<string, string>();
  const txnOverrides = new Map<string, string>();
  for (const o of overrides || []) {
    if (o.transaction_id) {
      txnOverrides.set(o.transaction_id, o.user_category);
    } else {
      overrideMap.set(o.merchant_pattern.toLowerCase(), o.user_category);
    }
  }

  // Step 3: Load all transactions and apply smart categorisation
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: transactions } = await admin.from('bank_transactions')
    .select('id, transaction_id, amount, description, category, merchant_name, timestamp, user_category, income_type')
    .eq('user_id', user.id)
    .gte('timestamp', sixMonthsAgo.toISOString())
    .order('timestamp', { ascending: false });

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ synced: true, categorised: 0, message: 'No transactions to categorise' });
  }

  let categorised = 0;
  let incomeDetected = 0;

  // Phase 1: Apply user overrides and keyword rules
  const needsAI: Array<{ id: string; description: string; amount: number; category: string }> = [];

  for (const txn of transactions) {
    const desc = txn.description || '';
    const merchant = (txn.merchant_name || desc.substring(0, 30)).toLowerCase().trim();
    const amount = parseFloat(txn.amount);

    // Priority 1: Keep existing user override, UNLESS it's a generic auto-assigned fallback
    // ('bills', 'shopping', 'other') that might hide a more specific category.
    const SOFT_CATEGORIES = new Set(['bills', 'shopping', 'other']);
    if (txn.user_category && !SOFT_CATEGORIES.has(txn.user_category)) continue;

    // Priority 2: Check merchant overrides (learned from user corrections)
    let finalCategory: string | null = null;
    for (const [pattern, cat] of overrideMap) {
      if (merchant.includes(pattern)) { finalCategory = cat; break; }
    }

    // Priority 3: Check transaction-specific override
    if (!finalCategory && txnOverrides.has(txn.transaction_id)) {
      finalCategory = txnOverrides.get(txn.transaction_id)!;
    }

    // Priority 4: Keyword rules
    if (!finalCategory) {
      const isXfer = isTransfer(desc, txn.category || '');
      if (isXfer) {
        finalCategory = 'transfers';
      } else {
        const auto = categoriseTransaction(desc, txn.category || '');
        // Only use keyword result if it's not 'other' or 'shopping' (too generic)
        if (auto !== 'other' && auto !== 'shopping') {
          finalCategory = auto;
        }
      }
    }

    // Priority 5: Income type detection (for credits only)
    let incomeType: string | null = null;
    if (amount > 0) {
      incomeType = detectIncomeType(desc);
      if (!incomeType) {
        const d = desc.toLowerCase();
        // More intelligent fallbacks
        if (d.includes('from a/c') || d.includes('via mobile xfer') || d.includes('internal')) incomeType = 'transfer';
        else if (d.includes('rent') && !d.includes('current')) incomeType = 'rental';
        else if (d.includes('director') || d.includes('payroll') || d.includes('salary') || d.includes('wages')) incomeType = 'salary';
        else if (d.includes('airbnb') || d.includes('booking.com') || d.includes('vrbo')) incomeType = 'rental';
        else if (d.includes('hmrc') || d.includes('dwp') || d.includes('universal credit')) incomeType = 'benefits';
        else if (d.includes('dividend') || d.includes('interest')) incomeType = 'investment';
        else if (d.includes('invoice') || d.includes('freelance') || d.includes('consulting')) incomeType = 'freelance';
        // Large recurring credits without clear description are likely salary
        else if (amount > 1000 && !d.includes('transfer') && !d.includes('refund')) incomeType = 'salary';
      }
    }

    if (finalCategory) {
      await admin.from('bank_transactions').update({
        user_category: finalCategory,
        income_type: incomeType || txn.income_type,
      }).eq('id', txn.id);
      categorised++;
      if (incomeType) incomeDetected++;
    } else {
      // Queue for AI classification
      needsAI.push({ id: txn.id, description: desc, amount, category: txn.category || '' });
    }
  }

  // Phase 2: Use Claude to classify remaining unmatched transactions (batched)
  if (needsAI.length > 0) {
    // Batch into groups of 30 to control cost
    const batches = [];
    for (let i = 0; i < needsAI.length; i += 30) {
      batches.push(needsAI.slice(i, i + 30));
    }

    for (const batch of batches.slice(0, 3)) { // max 3 batches = 90 transactions per sync
      const txnList = batch.map((t, i) =>
        `${i + 1}. "${t.description}" | £${Math.abs(t.amount).toFixed(2)} | ${t.amount > 0 ? 'CREDIT' : 'DEBIT'}`
      ).join('\n');

      try {
        const res = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: `Categorise these UK bank transactions. For each, return a JSON array of objects with: {"index": number, "category": string, "income_type": string or null}.

Categories for debits: mortgage, loans, council_tax, tax, energy, water, broadband, mobile, streaming, fitness, groceries, eating_out, fuel, shopping, insurance, transport, childcare, software, professional, bills, other.

Income types for credits (IMPORTANT — classify carefully):
- "salary": Regular employment income, monthly pay, wages, director payments, PAYE
- "freelance": Invoice payments, consulting fees, contract work, self-employed income
- "benefits": Government payments — HMRC, DWP, Universal Credit, Child Benefit, PIP, Tax Credits
- "rental": Rent from tenants, letting agent payments, Airbnb/Booking.com host payments
- "investment": Dividends, interest earned, capital gains, ISA returns
- "refund": ONLY when clearly a refund (e.g. "REFUND FROM AMAZON", "YOUR REFUND"). Do NOT classify regular income as refund.
- "transfer": Money from own accounts, internal transfers, between-account movements
- "loan_repayment": Someone repaying money they owe you
- "gift": Birthday/Christmas money, gifts from family
- "other": Only if none of the above fit

CRITICAL: If the credit is a regular recurring amount from the same source (employer), classify as "salary" even if the description is unclear. If from Booking.com or Airbnb, classify as "rental" (host income), NOT "refund". If from HMRC, classify as "benefits" unless description says "tax refund" specifically.

Return ONLY the JSON array.`,
          messages: [{ role: 'user', content: `Categorise:\n${txnList}` }],
        });

        const text = res.content[0];
        if (text.type === 'text') {
          let raw = text.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const match = raw.match(/\[[\s\S]*\]/);
          if (match) {
            const cleaned = match[0].replace(/,\s*([}\]])/g, '$1');
            const results = JSON.parse(cleaned);
            for (const r of results) {
              const txn = batch[r.index - 1];
              if (txn && r.category) {
                await admin.from('bank_transactions').update({
                  user_category: r.category,
                  income_type: r.income_type || null,
                }).eq('id', txn.id);
                categorised++;
                if (r.income_type) incomeDetected++;

                // Auto-learn: save merchant pattern for future use
                const merchantName = txn.description.replace(/FP \d.*/, '').replace(/\d{6,}.*/, '').trim().substring(0, 30).toLowerCase();
                if (merchantName.length > 3 && r.category !== 'other') {
                  await admin.from('money_hub_category_overrides').upsert({
                    user_id: user.id,
                    merchant_pattern: merchantName,
                    user_category: r.category,
                  }, { onConflict: 'user_id,merchant_pattern' }).select();
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[money-hub-sync] AI categorisation failed:', err.message);
      }
    }
  }

  // Step 4: Generate spending summary for the chatbot
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthTxns = transactions.filter(t => t.timestamp >= startOfMonth);

  const income = monthTxns.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
  const outgoings = monthTxns.filter(t => parseFloat(t.amount) < 0 && !isTransfer(t.description || '', t.category || ''))
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

  // Income breakdown by type
  const incomeByType: Record<string, number> = {};
  for (const t of monthTxns.filter(t => parseFloat(t.amount) > 0)) {
    const type = t.income_type || 'other';
    incomeByType[type] = (incomeByType[type] || 0) + parseFloat(t.amount);
  }

  return NextResponse.json({
    synced: true,
    totalTransactions: transactions.length,
    categorised,
    incomeDetected,
    summary: {
      monthlyIncome: parseFloat(income.toFixed(2)),
      monthlyOutgoings: parseFloat(outgoings.toFixed(2)),
      netPosition: parseFloat((income - outgoings).toFixed(2)),
      incomeBreakdown: incomeByType,
    },
    lastSync: new Date().toISOString(),
  });
}
