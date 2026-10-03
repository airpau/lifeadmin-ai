/**
 * Error thrown by refreshAccessToken (Gmail) and refreshMicrosoftToken
 * (Outlook). It is a plain Error subclass, so every existing caller that
 * only reads `.message` keeps working, but new callers can tell a
 * permanent failure (the user revoked access or the grant expired, so a
 * reconnect is required) from a transient one (network blip, 5xx, our
 * own client misconfiguration), and only mark a connection
 * `needs_reauth` for the former.
 */

const PERMANENT_OAUTH_ERRORS = new Set([
  'invalid_grant',
  'access_denied',
  'interaction_required',
  'consent_required',
  'login_required',
]);

export class OAuthRefreshError extends Error {
  readonly status: number;
  readonly oauthError: string;
  readonly permanent: boolean;

  constructor(message: string, status: number, oauthError: string) {
    super(message);
    this.name = 'OAuthRefreshError';
    this.status = status;
    this.oauthError = oauthError;
    this.permanent = (status === 400 || status === 401) && PERMANENT_OAUTH_ERRORS.has(oauthError);
  }
}

export function isPermanentRefreshFailure(err: unknown): boolean {
  return err instanceof OAuthRefreshError && err.permanent;
}
