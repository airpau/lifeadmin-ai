/**
 * Native shell bridge — Capacitor plugin wrappers.
 *
 * The Paybacker mobile apps are Capacitor wrappers around paybacker.co.uk.
 * When the same web pages render inside the iOS or Android shell, this
 * module exposes typed wrappers around the native plugins (StoreKit 2 on
 * iOS, Google Play Billing on Android).
 *
 * On the desktop or mobile web (paybacker.co.uk in a browser),
 * `isNativeShell()` returns false and the IAP helpers throw — callers must
 * fall back to the Stripe checkout flow.
 */

// Capacitor's global. We avoid a hard import on `@capacitor/core` so the
// web bundle doesn't have to ship Capacitor — the native shell injects the
// global before any web code runs.
type CapGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => 'ios' | 'android' | 'web';
  Plugins?: Record<string, unknown>;
  registerPlugin?: <T = unknown>(name: string) => T;
};

declare global {
  interface Window {
    Capacitor?: CapGlobal;
  }
}

export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return window.Capacitor?.getPlatform?.() ?? 'web';
}

// ──────────────────────────────────────────────────────────────────────
// IAP plugin types
// ──────────────────────────────────────────────────────────────────────

export type IapProductId =
  | 'paybacker.essential.monthly'
  | 'paybacker.essential.annual'
  | 'paybacker.pro.monthly'
  | 'paybacker.pro.annual';

export type IapProduct = {
  id: IapProductId;
  displayName: string;
  description: string;
  price: string;            // raw decimal as string, e.g. "9.99"
  displayPrice: string;     // localized, e.g. "£9.99"
  currencyCode: string;     // "GBP"
  period: string;           // "1_month", "1_year"
  type: string;
};

export type IapPurchaseResult =
  | {
      state: 'success';
      productId: IapProductId;
      originalTransactionId: string;
      transactionId: string;
      jws: string;
    }
  | {
      state: 'pending_server_verify';
      productId: IapProductId;
      originalTransactionId: string;
      error: string;
    }
  | { state: 'pending' }
  | { state: 'cancelled' };

export type IapEntitlement = {
  productId: IapProductId;
  originalTransactionId: string;
  purchaseDate: number;
  expiresAt: number | null;
  isUpgraded: boolean;
};

export type IapPlugin = {
  getProducts(opts?: { productIds?: IapProductId[] }): Promise<{ products: IapProduct[] }>;
  purchase(opts: { productId: IapProductId }): Promise<IapPurchaseResult>;
  restorePurchases(): Promise<{
    restored: Array<{
      productId: IapProductId;
      originalTransactionId: string;
      expiresAt: number | null;
      jws: string;
    }>;
  }>;
  openManageSubscriptions(): Promise<void>;
  getEntitlements(): Promise<{ entitlements: IapEntitlement[] }>;
};

let cachedPlugin: IapPlugin | null = null;

/**
 * Returns the native IAP plugin, or null if not running inside the native
 * shell. Callers must check for null and fall back to the web Stripe flow.
 */
export function getIapPlugin(): IapPlugin | null {
  if (cachedPlugin) return cachedPlugin;
  if (!isNativeShell()) return null;
  if (typeof window === 'undefined') return null;

  // iOS: ObjC macro registration auto-exposes Capacitor.Plugins.PaybackerIAP
  // Android: Java/Kotlin annotation-based registration does the same
  const fromGlobal = window.Capacitor?.Plugins?.['PaybackerIAP'] as IapPlugin | undefined;
  if (fromGlobal) {
    cachedPlugin = fromGlobal;
    return cachedPlugin;
  }

  // Fallback: dynamic registerPlugin() if the global wasn't pre-mounted
  const reg = window.Capacitor?.registerPlugin;
  if (reg) {
    cachedPlugin = reg<IapPlugin>('PaybackerIAP');
    return cachedPlugin;
  }

  return null;
}
