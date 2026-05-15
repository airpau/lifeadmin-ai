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
  // Some Yapily institutions return positive amounts for BOTH credits and
  // debits, with the direction encoded here (HSBC Business in particular).
  // When present, treat as authoritative over the sign of `amount`.
  creditDebitIndicator?: 'CREDIT' | 'DEBIT' | string | null;
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
// Schema source: Yapily OpenAPI 12.3.4 — verified against
// docs.yapily.com/api-reference/hosted-consent-pages on 29 Apr 2026.
// Distinct from the /account-auth-requests path: Yapily renders the
// bank-picker, the post-consent page, and any QR/decoupled-auth flows
// itself, then redirects back to our redirectUrl with consentRequestId
// in the query string.
//
// Two important nuances baked into the type:
//
//   1. POST /hosted/consent-requests creates the request. Its response
//      contains consentRequestId + hostedUrl but does NOT contain
//      consentId or consentToken — those don't exist until the user
//      completes the flow and a Consent is created at the bank side.
//      So consentId and consentToken are optional on this type.
//
//   2. GET /hosted/consent-requests/{consentRequestId} returns the
//      same envelope but, once status is AUTHORIZED, also surfaces
//      consentId (the underlying /account-auth-requests/{id} handle
//      used by renew + delete) and consentToken (the credential we
//      attach to data calls). The callback uses the GET to extract
//      both before persisting the connection.
//
// hostedUrl is short-lived (~10 minutes per Migle's call notes).

export interface YapilyHostedInstitutionIdentifiers {
  institutionId?: string;
  institutionCountryCode: string;
}

export interface YapilyHostedUserSettings {
  language?: string;
  location?: string;
}

export interface YapilyHostedAccountRequestDetails {
  featureScope?: string[];
  transactionFrom?: string;
  transactionTo?: string;
  expiresAt?: string;
}

export interface YapilyHostedConsentRequest {
  consentRequestId: string;
  userId?: string;
  applicationUserId?: string;
  applicationId?: string;
  institutionIdentifiers?: YapilyHostedInstitutionIdentifiers;
  userSettings?: YapilyHostedUserSettings;
  redirectUrl?: string;
  accountRequestDetails?: YapilyHostedAccountRequestDetails;
  hostedUrl?: string;
  createdAt?: string;
  authorisationExpiresAt?: string;
  // GET-only fields, present once the user completes the journey:
  status?: string;
  consentId?: string;
  consentToken?: string;
  phases?: Array<{ phaseName: string; phaseCreatedAt: string }>;
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
