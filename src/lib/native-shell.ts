/**
 * Native shell bridge — detects whether the React app is running inside
 * the paybacker-mobile Capacitor WebView, and provides a typed window
 * surface for invoking native StoreKit 2 / Play Billing actions.
 *
 * The native shell injects `window.PaybackerNative` on app boot via a
 * Capacitor WebViewClient script. If that surface exists, we're in the
 * iOS or Android app; otherwise we're on the web at paybacker.co.uk.
 *
 * Why this matters for IAP: Apple's anti-steering rules (Guideline 3.1.1)
 * forbid showing "Subscribe on paybacker.co.uk for £4.99" buttons inside
 * the iOS app. We MUST render Apple IAP buttons there. Without this
 * detection the app shell would render the web upgrade UI and Apple
 * would reject the build.
 */

'use client';

export type NativePlatform = 'ios' | 'android';

export interface PaybackerNativeBridge {
  platform: NativePlatform;
  appVersion?: string;

  startPurchase?: (productId: string) => Promise<NativePurchaseResult>;
  restorePurchases?: () => Promise<NativePurchaseResult[]>;
  openManageSubscriptions?: () => void;
}

export type NativePurchaseResult =
  | { ok: true; productId: string; transactionId: string; tier: string }
  | { ok: false; error: 'cancelled' | 'pending' | 'failed'; message?: string };

declare global {
  interface Window {
    PaybackerNative?: PaybackerNativeBridge;
  }
}

export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.PaybackerNative;
}

export function getNativePlatform(): NativePlatform | null {
  if (typeof window === 'undefined') return null;
  return window.PaybackerNative?.platform ?? null;
}

export function nativeBridge(): PaybackerNativeBridge {
  if (typeof window === 'undefined' || !window.PaybackerNative) {
    throw new Error('PaybackerNative bridge not available — not in native shell');
  }
  return window.PaybackerNative;
}
