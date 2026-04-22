import { categoriseWithLearningSync } from '@/lib/learning-engine';
import { isExcludedIncomeType, normalizeIncomeTypeKey } from '@/lib/income-normalise';

const SOFT_SPENDING_CATEGORIES = new Set(['bills', 'shopping', 'other']);
const CREDIT_BANK_CATEGORIES = new Set(['CREDIT', 'INTEREST']);
const TRANSFER_BANK_CATEGORIES = new Set(['TRANSFER']);
const REAL_INCOME_TYPES = new Set([
  'salary',
  'freelance',
  'benefits',
  'rental',
  'investment',
  'refund',
  'loan_repayment',
  'gift',
  'other',
]);

const SPENDING_CATEGORY_ALIASES: Record<string, string> = {
  fee: 'fees',
  loan: 'loans',
  utility: 'energy',
  transport: 'travel',
  // Bank-provided "BILL_PAYMENT" raw category should collapse into 'bills'
  // so the spending breakdown doesn't show two separate rows.
  bill_payment: 'bills',
  billpayment: 'bills',
  'bill-payment': 'bills',
};

type OverrideMap = Map<string, string>;

export interface MoneyHubTransactionLike {
  id?: string | null;
  amount: string | number;
  category?: string | null;
  description?: string | null;
  merchant_name?: string | null;
  income_type?: string | null;
  user_category?: string | null;
  timestamp?: string | null;
}

export interface MoneyHubCategoryOverrideRow {
  merchant_pattern: string | null;
  transaction_id: string | null;
  user_category: string | null;
}

export interface ResolvedMoneyHubTransaction {
  amount: number;
  kind: 'income' | 'spending' | 'transfer' | 'other';
  spendingCategory: string | null;
  incomeType: string | null;
}

export function normalizeSpendingCategoryKey(value: any): string {
  if (typeof value !== 'string') value = String(value || '');
  const key = value.toLowerCase().trim();
  if (!key) return '';
  return SPENDING_CATEGORY_ALIASES[key] || key;
}

export function getMoneyHubMonthBounds(selectedMonth?: string | null, baseDate = new Date()) {
  let viewDate = new Date(baseDate);

  if (selectedMonth) {
    const [year, month] = selectedMonth.split('-').map(Number);
    if (year && month) {
      viewDate = new Date(year, month - 1, 15);
    }
  }

  const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

  return {
    viewDate,
    start,
    end,
    monthKey,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function isTransactionInMonth(
  timestamp: string | null | undefined,
  monthKey: string,
  startMs: number,
  endMs: number,
) {
  if (!timestamp) return false;
  if (timestamp.startsWith(monthKey)) return true;
  const ts = new Date(timestamp).getTime();
  return ts >= startMs && ts <= endMs;
}

export function buildMoneyHubOverrideMaps(rows: MoneyHubCategoryOverrideRow[] | null | undefined) {
  const transactionOverrides: OverrideMap = new Map();
  const merchantOverrides: Array<{ pattern: string; category: string }> = [];

  for (const row of rows || []) {
    const category = normalizeSpendingCategoryKey(row.user_category);
    if (!category) continue;

    if (row.transaction_id) {
      transactionOverrides.set(row.transaction_id, category);
      continue;
    }

    const pattern = normalizeOverridePattern(row.merchant_pattern);
    if (pattern) {
      merchantOverrides.push({ pattern, category });
    }
  }

  return { transactionOverrides, merchantOverrides };
}

export function findMatchingCategoryOverride(
  txn: MoneyHubTransactionLike,
  transactionOverrides: OverrideMap,
  merchantOverrides: Array<{ pattern: string; category: string }>,
) {
  if (txn.id && transactionOverrides.has(txn.id)) {
    return transactionOverrides.get(txn.id) || null;
  }

  const merchant = normalizeOverridePattern(txn.merchant_name);
  const description = normalizeOverridePattern(txn.description);
  const combined = `${merchant} ${description}`.trim();

  for (const override of merchantOverrides) {
    if (!override.pattern) continue;
    if (
      merchant.includes(override.pattern) ||
      description.includes(override.pattern) ||
      combined.includes(override.pattern)
    ) {
      return override.category;
    }
  }

  return null;
}

export function resolveMoneyHubTransaction(
  txn: MoneyHubTransactionLike,
  overrideCategory?: string | null,
): ResolvedMoneyHubTransaction {
  const amount = parseFloat(String(txn.amount)) || 0;
  const bankCategory = (txn.category || '').toUpperCase().trim();
  const storedCategory = normalizeSpendingCategoryKey(txn.user_category);
  const effectiveIncomeType = detectIncomeType(txn, amount);
  const resolvedOverride = normalizeSpendingCategoryKey(overrideCategory);
  const description = [txn.merchant_name, txn.description].filter(Boolean).join(' ');

  if (amount === 0) {
    return { amount, kind: 'other', spendingCategory: null, incomeType: effectiveIncomeType };
  }

  if (amount > 0) {
    // 1. Explicit transfer override, or heuristic says it's an internal transfer
    if (resolvedOverride === 'transfers' || isTransferLikeTransaction(txn, effectiveIncomeType)) {
      return { amount, kind: 'transfer', spendingCategory: 'transfers', incomeType: 'transfer' };
    }

    // 2. Strong income signals win over a stale storedCategory. This matters
    // because `txn.user_category` can carry a bank-side or migration label
    // that isn't a real user choice — previously a positive transaction
    // with any non-soft storedCategory was being bucketed as 'transfer'
    // and disappearing from the monthly income total (hence the sudden
    // drop in reported income).
    const hasRealIncomeType = !!effectiveIncomeType && !isExcludedIncomeType(effectiveIncomeType);
    const isStoredIncome = storedCategory === 'income' || resolvedOverride === 'income';
    const bankSuggestsIncome = CREDIT_BANK_CATEGORIES.has(bankCategory);

    if (isStoredIncome || hasRealIncomeType || bankSuggestsIncome) {
      return {
        amount,
        kind: 'income',
        spendingCategory: null,
        incomeType: hasRealIncomeType ? effectiveIncomeType : 'other',
      };
    }

    // 3. Explicit user override (from the overrides table) to a non-income
    //    category — honour the label but flag as 'other' so it stays out of
    //    both income and spending totals. It is NOT an internal transfer.
    if (resolvedOverride && resolvedOverride !== 'income') {
      return {
        amount,
        kind: 'other',
        spendingCategory: resolvedOverride,
        incomeType: null,
      };
    }

    // 4. Fallback income heuristic — catches salary/wage keywords the bank
    //    mislabelled.
    const fallbackIncomeType = detectFallbackIncomeType(description, bankCategory, amount);
    if (fallbackIncomeType) {
      return {
        amount,
        kind: 'income',
        spendingCategory: null,
        incomeType: fallbackIncomeType,
      };
    }

    // 5. Stored category from bank or migration — if it's confidently
    //    non-income/non-transfer/non-soft (e.g. 'groceries' on a refund)
    //    surface the label but keep it out of income totals. Still NOT a
    //    transfer.
    if (
      storedCategory &&
      storedCategory !== 'income' &&
      storedCategory !== 'transfers' &&
      !SOFT_SPENDING_CATEGORIES.has(storedCategory)
    ) {
      return {
        amount,
        kind: 'other',
        spendingCategory: storedCategory,
        incomeType: null,
      };
    }

    return { amount, kind: 'other', spendingCategory: storedCategory || null, incomeType: effectiveIncomeType };
  }

  if (isTransferLikeTransaction(txn, effectiveIncomeType)) {
    return { amount, kind: 'transfer', spendingCategory: 'transfers', incomeType: effectiveIncomeType || 'transfer' };
  }

  if (resolvedOverride) {
    return { amount, kind: 'spending', spendingCategory: resolvedOverride, incomeType: null };
  }

  if (storedCategory && storedCategory !== 'income' && storedCategory !== 'transfers' && !SOFT_SPENDING_CATEGORIES.has(storedCategory)) {
    return { amount, kind: 'spending', spendingCategory: storedCategory, incomeType: null };
  }

  const learnedCategory = normalizeSpendingCategoryKey(
    categoriseWithLearningSync(description, txn.category || '', amount)
  );

  if (learnedCategory && learnedCategory !== 'income' && learnedCategory !== 'transfers') {
    return { amount, kind: 'spending', spendingCategory: learnedCategory, incomeType: null };
  }

  if (storedCategory && storedCategory !== 'income' && storedCategory !== 'transfers') {
    return { amount, kind: 'spending', spendingCategory: storedCategory, incomeType: null };
  }

  const fallbackCategory = normalizeSpendingCategoryKey(txn.category) || detectFallbackSpendingCategory(description);
  return { amount, kind: 'spending', spendingCategory: fallbackCategory || 'other', incomeType: null };
}

export function applyInternalTransferHeuristic(txns: any[]) {
  const matchedAsTransfers = new Set<string>();
  
  // Terms that strongly imply this is an external payment/mortgage, not an internal hop
  const excludedTerms = /skipton|nationwide|mortgage|halifax|santander.*mortgage|barclays.*mortgage|coventry|leeds|yorkshire|accord|auto|car/i;
  // Terms that strongly imply a transfer
  const transferTerms = /tfr|transfer|to a\/c|from a\/c|fp |fps |via mobile/i;

  for (let i = 0; i < txns.length; i++) {
    const txnA = txns[i];
    if (matchedAsTransfers.has(txnA.id)) continue;
    
    const amtA = parseFloat(String(txnA.amount)) || 0;
    if (amtA === 0) continue;
    
    const descA = [txnA.merchant_name, txnA.description].join(' ').toLowerCase();
    if (excludedTerms.test(descA)) continue;

    const tsA = txnA.timestamp ? new Date(txnA.timestamp).getTime() : 0;
    if (!tsA) continue;
    const accA = txnA.account_id;

    for (let j = i + 1; j < txns.length; j++) {
      const txnB = txns[j];
      if (matchedAsTransfers.has(txnB.id)) continue;
      
      const amtB = parseFloat(String(txnB.amount)) || 0;
      
      // Exact opposite
      if (Math.abs(amtA + amtB) < 0.01) {
        const descB = [txnB.merchant_name, txnB.description].join(' ').toLowerCase();
        if (excludedTerms.test(descB)) continue;

        const tsB = txnB.timestamp ? new Date(txnB.timestamp).getTime() : 0;
        if (!tsB) continue;
        
        // within 3 days (259200000 ms)
        if (Math.abs(tsA - tsB) <= 3 * 24 * 60 * 60 * 1000) {          
          // To prevent accidental pairing of Salary + Car Purchase,
          // we enforce that either one description explicitly says transfer,
          // or the amount is fairly precise (not a flat round number < £500).
          // We remove the strict accA !== accB check because bank plugins sometimes log inbound/outbound on identical keys.
          const hasTransferKeyword = transferTerms.test(descA) || transferTerms.test(descB);
            
          // Allow if >= £500 (more likely to be related moving of funds) 
          // AND we have transfer keywords
          if (hasTransferKeyword || Math.abs(amtA) >= 500) {
              matchedAsTransfers.add(txnA.id);
              matchedAsTransfers.add(txnB.id);
              break; // found the pair for txnA
          }
        }
      }
    }
  }

  return matchedAsTransfers;
}

export function isTransferLikeTransaction(
  txn: Pick<MoneyHubTransactionLike, 'category' | 'description' | 'merchant_name' | 'income_type' | 'user_category'>,
  incomeType?: string | null,
) {
  const bankCategory = (txn.category || '').toUpperCase().trim();
  const description = [txn.merchant_name, txn.description].filter(Boolean).join(' ').toLowerCase();
  const storedCategory = normalizeSpendingCategoryKey(txn.user_category);
  const effectiveIncomeType = incomeType || normalizeIncomeTypeKey(txn.income_type);

  if (TRANSFER_BANK_CATEGORIES.has(bankCategory)) return true;
  if (storedCategory === 'transfers') return true;
  if (isExcludedIncomeType(effectiveIncomeType)) return true;

  return (
    description.includes('personal transfer') ||
    description.includes('internal transfer') ||
    description.includes('between accounts') ||
    description.includes('transfer from') ||
    description.includes('transfer to') ||
    description.includes('from a/c') ||
    description.includes('to a/c ') ||
    description.includes('via mobile xfer') ||
    description.includes('from savings') ||
    description.includes('from current account') ||
    description.includes('isa transfer') ||
    description.includes('savings transfer') ||
    description.includes('account transfer') ||
    description.startsWith('tfr ') ||
    description.startsWith('trf ') ||
    description.startsWith('fps ')
  );
}

function detectIncomeType(txn: MoneyHubTransactionLike, amount: number) {
  const storedIncomeType = normalizeIncomeTypeKey(txn.income_type);
  if (txn.income_type) return storedIncomeType;
  return detectFallbackIncomeType([txn.merchant_name, txn.description].filter(Boolean).join(' '), txn.category || '', amount);
}

function detectFallbackIncomeType(description: string, bankCategory: string, amount: number) {
  const d = ` ${description.toLowerCase()} `;
  const bankCategoryUpper = (bankCategory || '').toUpperCase().trim();

  if (
    d.includes('flexipay') ||
    d.includes('credit facility') ||
    d.includes('loan advance') ||
    d.includes('loan drawdown') ||
    d.includes('overdraft advance')
  ) {
    return 'credit_loan';
  }

  if (
    d.includes('from a/c') ||
    d.includes('to a/c ') ||
    d.includes('via mobile xfer') ||
    d.includes('personal transfer') ||
    d.includes('internal transfer') ||
    d.includes('between accounts') ||
    d.includes('transfer from') ||
    d.includes('transfer to') ||
    d.includes('from savings') ||
    d.includes('from current account') ||
    d.includes('isa transfer') ||
    d.includes('savings transfer')
  ) {
    return 'transfer';
  }

  if (d.includes('salary') || d.includes('wages') || d.includes('payroll') || d.includes('net pay') || d.includes('director')) {
    return 'salary';
  }

  if (d.includes('freelance') || d.includes('invoice') || d.includes('consulting') || d.includes('contract pay')) {
    return 'freelance';
  }

  if (
    d.includes('hmrc') ||
    d.includes('tax credit') ||
    d.includes('dwp') ||
    d.includes('universal credit') ||
    d.includes('child benefit') ||
    d.includes('pension credit') ||
    d.includes('pip ') ||
    d.includes('esa ') ||
    d.includes('jsa ')
  ) {
    return 'benefits';
  }

  if (
    d.includes(' rent ') ||
    d.startsWith('rent ') ||
    d.includes('rent received') ||
    d.includes('rent from') ||
    d.includes('rental income') ||
    d.includes('tenant payment') ||
    d.includes('letting income') ||
    d.includes('airbnb') ||
    d.includes('booking.com') ||
    d.includes('vrbo')
  ) {
    return 'rental';
  }

  if (
    d.includes('dividend') ||
    d.includes('interest earned') ||
    d.includes('interest payment') ||
    d.includes('investment return') ||
    d.includes('capital gain') ||
    bankCategoryUpper === 'INTEREST'
  ) {
    return 'investment';
  }

  if (
    d.includes('refund from') ||
    d.includes('refund -') ||
    d.includes('refund:') ||
    d.includes('your refund') ||
    d.includes('cashback reward') ||
    d.includes('cashback from')
  ) {
    return 'refund';
  }

  if (d.includes('loan repayment') || d.includes('loan repay') || d.includes('repayment received')) {
    return 'loan_repayment';
  }

  if (d.includes('birthday') || d.includes('gift from') || d.includes('present from')) {
    return 'gift';
  }

  if (amount > 1000 && CREDIT_BANK_CATEGORIES.has(bankCategoryUpper)) {
    return 'salary';
  }

  if (amount > 0 && CREDIT_BANK_CATEGORIES.has(bankCategoryUpper)) {
    return 'other';
  }

  return null;
}

function normalizeOverridePattern(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/^\d{4}\s+\d{1,2}[a-z]{3}\d{2}\s+/i, '')
    .replace(/^\d{1,2}[a-z]{3}\s+/i, '')
    .replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '')
    .replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCountableIncomeType(value: string | null | undefined) {
  const key = normalizeIncomeTypeKey(value);
  return REAL_INCOME_TYPES.has(key);
}

export function detectFallbackSpendingCategory(description: string): string | null {
  const d = ` ${description.toLowerCase()} `;

  if (/\b(skipton|nationwide|halifax|santander.*mortgage|barclays.*mortgage|natwest.*mortgage|hsbc.*mortgage|virgin.*money|coventry|leeds building|yorkshire building|accord|godiva|paratus|lendinvest|platform.*home|kent reliance)\b/.test(d)) return 'mortgage';
  if (/\b(santander.*loan|amigo|zopa|ratesetter|lending works|funding circle|hitachi.*capital|creation.*finance|motonovo|loqbox|drafty)\b/.test(d)) return 'loans';
  if (/\b(council|borough|district|city.*of)\b/.test(d) && /\btax\b/.test(d)) return 'council_tax';
  if (/\b(british gas|edf|e\.on|eon|octopus.*energy|bulb|sse|scottish.*power|ovo|shell.*energy|utilita|so.*energy|affect.*energy|pure planet|green energy)\b/.test(d)) return 'energy';
  if (/\b(thames.*water|severn.*trent|anglian|united.*utilities|wessex|south west water|welsh.*water|dwr.*cymru|yorkshire.*water|northumbrian)\b/.test(d)) return 'water';
  if (/\b(bt |virgin.*media|sky|talktalk|plusnet|hyperoptic|community.*fibre|zen internet|now.*broadband|starlink)\b/.test(d)) return 'broadband';
  if (/\b(three mobile|o2|ee mobile|vodafone|giffgaff|tesco.*mobile|id.*mobile|smarty|lebara)\b/.test(d)) return 'mobile';
  if (/\b(aviva|direct.*line|admiral|lv=?|axa|zurich|legal.*general|royal.*london|bupa|vitality|simply.*health|pet plan)\b/.test(d) && !d.includes('refund')) return 'insurance';
  if (/\b(netflix|spotify|disney\+?|apple.*tv|amazon.*prime|now.*tv|youtube.*premium|crunchyroll|paramount\+?|dazn)\b/.test(d)) return 'streaming';
  if (/\b(puregym|the.*gym|david.*lloyd|nuffield|fitness.*first|anytime fitness|jd.*gym|better.*gym)\b/.test(d)) return 'fitness';
  if (/\b(adobe|microsoft 365|google one|dropbox|icloud|1password|notion|slack|zoom|canva|chatgpt|openai|patreon)\b/.test(d)) return 'software';
  // Groceries — must come before eating_out (e.g. tesco can be food or petrol, but we treat all tesco as groceries)
  if (/\b(tesco|sainsbury|asda|morrisons|aldi|lidl|waitrose|co.?op|one stop|spar|nisa|budgens|farmfood|marks.*spencer food|m&s food|iceland food|iceland grocery|costco|amazon.*fresh|amazon grocery|ocado|deliveroo|uber.*eat|just.*eat|juste\s*at)\b/.test(d)) return 'groceries';
  // Eating out — after groceries check
  if (/\b(mcdonalds?|mcdonald|kfc|burger king|nandos|dominos?|greggs|costa coffee|starbucks|pret|wetherspoon|wagamama|itsu|pizza hut|yo.*sushi|yo sushi|frankie|harvester)\b/.test(d)) return 'eating_out';
  // Travel — petrol stations, rail, flights, parking, car hire, ride-hail
  if (/\b(shell|texaco|gulf petro|jet petro|moto service|welcome break|extra msa|mfg|forecourt|petrol|fuel station)\b/.test(d)) return 'travel';
  if (/\besso\b/.test(d) && !/shell.*energy/.test(d)) return 'travel';
  if (/\b(bp |bp petrol|bpme)\b/.test(d)) return 'travel';
  if (/\b(trainline|national rail|avanti|lner|gwr|crosscountry|tpe|northern rail|southern rail|southeastern|c2c|greater anglia|thameslink|eurostar|first.*capital connect)\b/.test(d)) return 'travel';
  if (/\b(ryanair|easyjet|british airways|ba\.com|jet2|wizz air|tui|flybe)\b/.test(d)) return 'travel';
  if (/\b(tfl|oyster|tube fare|bus fare)\b/.test(d)) return 'travel';
  if (/\b(ncp park|q.?park|parking.*charge|car park|justpark|ringgo|paybyphone|parkopedia)\b/.test(d)) return 'travel';
  if (/\b(enterprise rent|hertz|europcar|zipcar|sixt rent|avis rent)\b/.test(d)) return 'travel';
  if (/\b(santander cycle|cycle hire)\b/.test(d)) return 'travel';
  if (/\b(uber|bolt |lyft|free now|cabify)\b/.test(d) && !/uber.*eat/.test(d)) return 'travel';
  // Generic transport (older category — alias handles mapping to 'travel')
  if (/\b(stagecoach|arriva|first.*bus|national.*express)\b/.test(d)) return 'travel';
  if (/\b(dvla|vehicle.*tax|road.*tax)\b/.test(d)) return 'motoring';
  if (/\b(amazon|ebay|argos|john lewis|next|asos|boohoo|primark|tk maxx|boots|superdrug|currys|very\.co|studio retail)\b/.test(d)) return 'shopping';
  if (/\b(charity|oxfam|red.*cross|cancer.*research|nspcc|rspca|unicef|wwf|amnesty|british heart)\b/.test(d)) return 'charity';

  return null;
}
