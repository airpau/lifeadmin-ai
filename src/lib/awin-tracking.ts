/**
 * Awin Advertiser Conversion Tracking
 *
 * Fires conversion pixels when users sign up or convert to paid plans.
 * The Awin master tag (dwin1.com script) must be installed in the site layout.
 *
 * Commission structure:
 * - Free signup: £1 (commission group 1)
 * - Essential conversion (£4.99/mo): £2, 20% of first month (commission group 2)
 * - Pro conversion (£9.99/mo): £4, 20% of first month (commission group 3)
 */

// Commission group IDs (set these in Awin dashboard to match)
export const AWIN_COMMISSION_GROUPS = {
  FREE_SIGNUP: 'DEFAULT',    // Group for free signups
  ESSENTIAL: 'essential',     // Group for Essential plan conversions
  PRO: 'pro',                // Group for Pro plan conversions
};

export const AWIN_COMMISSION_AMOUNTS = {
  FREE_SIGNUP: 1.00,
  ESSENTIAL: 2.00,
  PRO: 4.00,
};

/**
 * Build Awin conversion tracking image pixel URL.
 * This is rendered as an img tag on the confirmation/thank you page.
 */
export function buildAwinConversionPixel(params: {
  advertiserId: string;
  orderRef: string;       // unique reference (user ID or Stripe session ID)
  amount: number;         // commission amount
  commissionGroup: string;
  currency?: string;
  voucher?: string;       // influencer coupon code if used
}): string {
  const { advertiserId, orderRef, amount, commissionGroup, currency = 'GBP', voucher } = params;

  let url = `https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=${advertiserId}` +
    `&amount=${amount.toFixed(2)}&cr=${currency}` +
    `&ref=${encodeURIComponent(orderRef)}` +
    `&parts=${commissionGroup}:${amount.toFixed(2)}` +
    `&vc=${encodeURIComponent(voucher || '')}` +
    `&ch=aw`;

  return url;
}

/**
 * Fire Awin conversion via the AWIN.Tracking.Sale object (JavaScript method).
 * This is the preferred method when the Awin master tag is loaded.
 * Call this from client-side code on signup success or payment success pages.
 */
export function getAwinSaleScript(params: {
  orderRef: string;
  amount: number;
  commissionGroup: string;
  currency?: string;
  voucher?: string;
}): string {
  const { orderRef, amount, commissionGroup, currency = 'GBP', voucher } = params;

  return `
    if (typeof AWIN !== 'undefined' && AWIN.Tracking) {
      AWIN.Tracking.Sale = {};
      AWIN.Tracking.Sale.amount = '${amount.toFixed(2)}';
      AWIN.Tracking.Sale.currency = '${currency}';
      AWIN.Tracking.Sale.orderRef = '${orderRef}';
      AWIN.Tracking.Sale.parts = '${commissionGroup}:${amount.toFixed(2)}';
      AWIN.Tracking.Sale.voucher = '${voucher || ''}';
      AWIN.Tracking.Sale.test = '0';
      AWIN.Tracking.run();
    }
  `.trim();
}
