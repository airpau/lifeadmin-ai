/**
 * TypeScript interfaces matching Yapily API responses.
 * See https://docs.yapily.com for full API documentation.
 */

// ── Institution ──

export interface YapilyMediaItem {
  source: string;
  type: string;
}

export interface YapilyInstitution {
  id: string;
  name: string;
  fullName: string;
  countries: YapilyCountry[];
  media: YapilyMediaItem[];
  features: string[];
}

export interface YapilyCountry {
  countryCode2: string;
  displayName: string;
}

// ── Account ──

export interface YapilyAccountName {
  name: string;
}

export interface YapilyAccountIdentification {
  type: string; // e.g. 'SORT_CODE', 'ACCOUNT_NUMBER', 'IBAN'
  identification: string;
}

export interface YapilyAccount {
  id: string;
  type: string;
  currency: string;
  accountNames: YapilyAccountName[];
  accountIdentifications: YapilyAccountIdentification[];
  accountType?: string;
  usageType?: string;
  nickname?: string;
  balance?: number;
  institution?: {
    id: string;
    name?: string;
  };
}

// ── Transaction ──

export interface YapilyTransactionAmount {
  amount: number;
  currency: string;
}

export interface YapilyTransaction {
  id: string;
  date: string;
  bookingDateTime: string;
  amount: number;
  currency: string;
  transactionAmount: YapilyTransactionAmount;
  reference: string | null;
  description: string | null;
  status: string;
  transactionInformation: string[];
  merchantName: string | null;
}

// ── Consent ──

export interface YapilyConsent {
  id: string;
  status: string;
  institutionId: string;
  createdAt: string;
  expiresAt: string;
}

// ── API Response Wrappers ──

export interface YapilyApiResponse<T> {
  meta?: {
    tracingId?: string;
    count?: number;
    pagination?: {
      totalCount?: number;
      self?: { limit: number; offset: number };
      next?: { limit: number; offset: number };
    };
  };
  data: T;
}

export interface YapilyAuthResponse {
  meta?: { tracingId?: string };
  data: {
    id: string;
    applicationUserId: string;
    institutionId: string;
    status: string;
    createdAt: string;
    authorisationUrl: string;
    qrCodeUrl?: string;
  };
}

// ── Hosted Pages (Beta) ──
//
// Returned by POST /hosted/consent-requests. Distinct from the
// account-auth-requests path: Yapily renders the bank-picker, the
// post-consent page, and any QR/decoupled-auth flows itself, then
// redirects back to our redirectUrl with consentRequestId in the
// query string.
//
// hostedUrl is short-lived (10 min). consentRequestId is the durable
// handle we pass back to GET /hosted/consent-requests/{id} to read
// status + retrieve the consentToken.

export interface YapilyHostedConsentRequest {
  id: string;
  applicationUserId: string;
  institutionId?: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
  consentToken?: string;
  hostedUrl?: string;
  redirectUrl?: string;
}

export interface YapilyHostedConsentResponse {
  meta?: { tracingId?: string };
  data: YapilyHostedConsentRequest;
}

export interface YapilyErrorResponse {
  error: {
    code: number;
    status: string;
    message: string;
    tracingId?: string;
  };
}
