export type ConsentCategory = 'analytics' | 'marketing' | 'functional';

export interface ConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  timestamp: string;
}

const COOKIE_NAME = 'pb_consent';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export function getConsent(): ConsentPreferences | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function setConsent(prefs: Omit<ConsentPreferences, 'timestamp'>): void {
  const value: ConsentPreferences = { ...prefs, timestamp: new Date().toISOString() };
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}

export function hasConsentBeenGiven(): boolean {
  return getConsent() !== null;
}

export function hasConsent(category: ConsentCategory): boolean {
  const prefs = getConsent();
  return prefs?.[category] === true;
}

export function acceptAll(): void {
  setConsent({ analytics: true, marketing: true, functional: true });
}

export function rejectAll(): void {
  setConsent({ analytics: false, marketing: false, functional: false });
}
