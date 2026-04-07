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

export function normalizeSpendingCategoryKey(value: string | null | undefined): string {
  const key = (value || '').toLowerCase().trim();
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
    if (isTransferLikeTransaction(txn, effectiveIncomeType)) {
      return { amount, kind: 'transfer', spendingCategory: 'transfers', incomeType: 'transfer' };
    }

    const hasRealIncomeType = !!effectiveIncomeType && !isExcludedIncomeType(effectiveIncomeType);
    const isStoredIncome = storedCategory === 'income';
    const bankSuggestsIncome = CREDIT_BANK_CATEGORIES.has(bankCategory);

    if (isStoredIncome || hasRealIncomeType || bankSuggestsIncome) {
      return {
        amount,
        kind: 'income',
        spendingCategory: null,
        incomeType: hasRealIncomeType ? effectiveIncomeType : 'other',
      };
    }

    const fallbackIncomeType = detectFallbackIncomeType(description, bankCategory, amount);
    if (fallbackIncomeType) {
      return {
        amount,
        kind: 'income',
        spendingCategory: null,
        incomeType: fallbackIncomeType,
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

  const fallbackCategory = normalizeSpendingCategoryKey(txn.category);
  return { amount, kind: 'spending', spendingCategory: fallbackCategory || 'other', incomeType: null };
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
