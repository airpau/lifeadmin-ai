/**
 * Format a number as GBP currency string WITH the £ symbol.
 * e.g. formatGBP(1234.5) => "£1,234.50"
 * Use this directly: {formatGBP(amount)} — do NOT prepend £
 */
export function formatGBP(amount: number): string {
  if (amount < 0) {
    return '-£' + Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '£' + amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a number as a plain comma-separated value WITHOUT the £ symbol.
 * e.g. fmtNum(1234.5) => "1,234.50"
 * Use when you already have £ in the template: £{fmtNum(amount)}
 */
export function fmtNum(amount: number): string {
  return Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
