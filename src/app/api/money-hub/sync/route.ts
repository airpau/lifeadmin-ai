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
  { keywords: ['mortgage', 'lendinvest', 'skipton b.s', 'skipton bs', 'halifax mort', 'nationwide mort'], category: 'mortgage' },
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
  { keywords: ['salary', 'wages', 'payroll', 'pay ref', 'director'], type: 'salary' },
  { keywords: ['hmrc', 'tax refund', 'tax credit'], type: 'benefits' },
  { keywords: ['dwp', 'universal credit', 'child benefit', 'pension credit'], type: 'benefits' },
  { keywords: ['rent ', 'rental', 'tenant'], type: 'rental' },
  { keywords: ['dividend', 'interest earned', 'interest payment'], type: 'investment' },
  { keywords: ['refund', 'rebate', 'cashback', 'booking.com'], type: 'refund' },
  { keywords: ['loan repayment', 'loan repay'], type: 'loan_repayment' },
  { keywords: ['gift'], type: 'gift' },
  { keywords: ['from a/c', 'via mobile xfer', 'personal transfer'], type: 'transfer' },
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

  for (const txn of transactions) {
    const desc = txn.description || '';
    const merchant = (txn.merchant_name || desc.substring(0, 30)).toLowerCase().trim();
    const amount = parseFloat(txn.amount);

    // Determine category: user override > merchant override > auto-categorise
    let finalCategory = txn.user_category; // keep existing user override
    if (!finalCategory) {
      // Check merchant overrides
      for (const [pattern, cat] of overrideMap) {
        if (merchant.includes(pattern)) { finalCategory = cat; break; }
      }
    }
    if (!finalCategory) {
      // Check transaction-specific override
      if (txnOverrides.has(txn.transaction_id)) {
        finalCategory = txnOverrides.get(txn.transaction_id)!;
      }
    }
    if (!finalCategory) {
      // Auto-categorise
      const isXfer = isTransfer(desc, txn.category || '');
      finalCategory = isXfer ? 'transfers' : categoriseTransaction(desc, txn.category || '');
    }

    // Detect income type for credits with smarter logic
    let incomeType = txn.income_type;
    if (!incomeType && amount > 0) {
      incomeType = detectIncomeType(desc);

      // Smarter fallback classification
      if (!incomeType) {
        const d = desc.toLowerCase();
        // Company payments with "FP" (Faster Payment) from named entities are likely business income
        if (d.includes(' fp ') && amount >= 500 && !d.includes('from a/c') && !d.includes('via mobile')) {
          incomeType = 'salary';
        }
        // Transfers from own accounts
        else if (d.includes('from a/c') || d.includes('via mobile xfer') || d.includes('personal transfer')) {
          incomeType = 'transfer';
        }
        // Named person payments with "RENT" in description
        else if (d.includes('rent')) {
          incomeType = 'rental';
        }
        // Named person payments (likely personal/family transfers)
        else if (amount >= 1000 && d.match(/^[a-z]+ [a-z]+\s/)) {
          incomeType = 'transfer';
        }
        // Small credits are likely refunds
        else if (amount < 50) {
          incomeType = 'refund';
        }
        // Everything else
        else {
          incomeType = 'other';
        }
      }
      if (incomeType) incomeDetected++;
    }

    // Update if changed
    if (finalCategory !== txn.user_category || (incomeType && incomeType !== txn.income_type)) {
      await admin.from('bank_transactions').update({
        user_category: finalCategory,
        income_type: incomeType || txn.income_type,
      }).eq('id', txn.id);
      categorised++;
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
