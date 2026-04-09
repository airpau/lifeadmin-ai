/**
 * Meta Conversions API (server-side)
 * Sends events directly to Meta's servers for better ad attribution.
 * Works alongside the client-side Meta Pixel for deduplication.
 *
 * Events are deduplicated by event_id - both Pixel and CAPI send
 * the same event_id so Meta counts it once.
 */

import { cookies } from 'next/headers';

const PIXEL_ID = '722806327584909';
const API_VERSION = 'v25.0';

function hasMarketingConsent(): boolean {
  try {
    const cookieStore = cookies();
    const consentCookie = (cookieStore as any).get?.('pb_consent');
    if (!consentCookie?.value) return false;
    const prefs = JSON.parse(decodeURIComponent(consentCookie.value));
    return prefs.marketing === true;
  } catch {
    return false;
  }
}

interface MetaEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: 'website';
  user_data: {
    em?: string[];    // SHA256 hashed email
    ph?: string[];    // SHA256 hashed phone
    fn?: string[];    // SHA256 hashed first name
    ln?: string[];    // SHA256 hashed last name
    ct?: string[];    // SHA256 hashed city
    st?: string[];    // SHA256 hashed state
    zp?: string[];    // SHA256 hashed zip
    country?: string[]; // SHA256 hashed country code
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;     // fbclid cookie
    fbp?: string;     // fb browser pixel cookie
    external_id?: string[];
  };
  custom_data?: Record<string, any>;
  event_source_url?: string;
}

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sendMetaEvent(params: {
  eventName: string;
  eventId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  ip?: string;
  userAgent?: string;
  fbclid?: string;
  userId?: string;
  url?: string;
  customData?: Record<string, any>;
}): Promise<{ ok: boolean; error?: string }> {
  if (!hasMarketingConsent()) return { ok: false, error: 'No marketing consent' };

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) return { ok: false, error: 'META_ACCESS_TOKEN not set' };

  // Hash PII for privacy
  const userData: MetaEvent['user_data'] = {
    client_ip_address: params.ip,
    client_user_agent: params.userAgent,
    fbc: params.fbclid ? `fb.1.${Date.now()}.${params.fbclid}` : undefined,
  };

  if (params.email) userData.em = [await sha256(params.email)];
  if (params.phone) userData.ph = [await sha256(params.phone)];
  if (params.firstName) userData.fn = [await sha256(params.firstName)];
  if (params.lastName) userData.ln = [await sha256(params.lastName)];
  if (params.userId) userData.external_id = [await sha256(params.userId)];
  userData.country = [await sha256('gb')]; // UK users

  const event: MetaEvent = {
    event_name: params.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: params.eventId,
    action_source: 'website',
    user_data: userData,
    event_source_url: params.url || 'https://paybacker.co.uk',
    custom_data: params.customData,
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [event],
          test_event_code: undefined, // Set to test code during testing
        }),
      }
    );

    const result = await res.json();
    if (result.error) {
      console.error('[meta-capi]', result.error.message);
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('[meta-capi]', err.message);
    return { ok: false, error: err.message };
  }
}

// Convenience functions for common events
export async function trackSignup(params: {
  email: string;
  userId: string;
  firstName?: string;
  ip?: string;
  userAgent?: string;
  fbclid?: string;
}) {
  return sendMetaEvent({
    eventName: 'Lead',
    eventId: `signup_${params.userId}`,
    ...params,
    url: 'https://paybacker.co.uk/auth/signup',
  });
}

export async function trackSubscription(params: {
  email: string;
  userId: string;
  tier: string;
  value: number;
  ip?: string;
  userAgent?: string;
  fbclid?: string;
}) {
  return sendMetaEvent({
    eventName: 'Purchase',
    eventId: `sub_${params.userId}_${Date.now()}`,
    email: params.email,
    userId: params.userId,
    ip: params.ip,
    userAgent: params.userAgent,
    fbclid: params.fbclid,
    url: 'https://paybacker.co.uk/pricing',
    customData: {
      currency: 'GBP',
      value: params.value,
      content_name: `${params.tier} subscription`,
    },
  });
}

export async function trackLetterGenerated(params: {
  userId: string;
  email?: string;
  provider?: string;
}) {
  return sendMetaEvent({
    eventName: 'CompleteRegistration',
    eventId: `letter_${params.userId}_${Date.now()}`,
    email: params.email,
    userId: params.userId,
    url: 'https://paybacker.co.uk/dashboard/complaints',
    customData: {
      content_name: 'complaint_letter',
      content_category: params.provider,
    },
  });
}
