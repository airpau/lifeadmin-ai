/**
 * PKCE OAuth flow for Paybacker Extension
 * Connects to /api/auth/extension on paybacker.co.uk
 *
 * Uses chrome.identity for Google OAuth (gmail.readonly scope)
 * Uses PKCE for Microsoft Graph (mail.read scope)
 *
 * TODO (backend): Create /api/auth/extension endpoint in lifeadmin-ai that:
 *   - Accepts: { provider: 'google' | 'microsoft', code: string, code_verifier: string }
 *   - Returns: { access_token: string, refresh_token: string, expires_at: number, user_id: string }
 *   - Stores refresh token in Supabase against user_id
 */

const PAYBACKER_API_URL = import.meta.env.VITE_PAYBACKER_API_URL ?? 'https://www.paybacker.co.uk'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '__GOOGLE_OAUTH_CLIENT_ID__'
const MICROSOFT_CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID ?? ''
const MICROSOFT_TENANT_ID = import.meta.env.VITE_MICROSOFT_TENANT_ID ?? 'common'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  provider: 'google' | 'microsoft'
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// ── Google OAuth via chrome.identity ─────────────────────────────────────────

/**
 * Initiates Google OAuth using chrome.identity.launchWebAuthFlow with PKCE.
 * The Chrome App OAuth client type does not require a client secret.
 */
export async function authenticateWithGoogle(): Promise<AuthTokens> {
  const codeVerifier = await generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const redirectUri = chrome.identity.getRedirectURL('oauth2')
  const state = crypto.randomUUID()

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly email profile')
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  })

  if (!responseUrl) throw new Error('OAuth cancelled or failed')

  const params = new URL(responseUrl).searchParams
  const code = params.get('code')
  const returnedState = params.get('state')

  if (!code) throw new Error('No authorisation code returned')
  if (returnedState !== state) throw new Error('OAuth state mismatch — possible CSRF')

  // Exchange code for tokens via Paybacker backend
  // TODO (backend): Implement POST /api/auth/extension
  const response = await fetch(`${PAYBACKER_API_URL}/api/auth/extension`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'google',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(`Auth exchange failed: ${response.status}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token: string
    expires_at: number
    user_id: string
  }

  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    userId: data.user_id,
    provider: 'google',
  }

  await chrome.storage.local.set({ paybacker_auth: tokens })
  return tokens
}

// ── Microsoft OAuth via PKCE ──────────────────────────────────────────────────

export async function authenticateWithMicrosoft(): Promise<AuthTokens> {
  const codeVerifier = await generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const redirectUri = chrome.identity.getRedirectURL('microsoft')
  const state = crypto.randomUUID()

  const authUrl = new URL(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`
  )
  authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://graph.microsoft.com/Mail.Read offline_access email profile openid')
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  })

  if (!responseUrl) throw new Error('OAuth cancelled or failed')

  const params = new URL(responseUrl).searchParams
  const code = params.get('code')
  const returnedState = params.get('state')

  if (!code) throw new Error('No authorisation code returned')
  if (returnedState !== state) throw new Error('OAuth state mismatch — possible CSRF')

  // TODO (backend): Implement POST /api/auth/extension for Microsoft provider
  const response = await fetch(`${PAYBACKER_API_URL}/api/auth/extension`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'microsoft',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(`Auth exchange failed: ${response.status}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token: string
    expires_at: number
    user_id: string
  }

  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    userId: data.user_id,
    provider: 'microsoft',
  }

  await chrome.storage.local.set({ paybacker_auth_microsoft: tokens })
  return tokens
}

// ── Token management ──────────────────────────────────────────────────────────

export async function getStoredTokens(provider: 'google' | 'microsoft' = 'google'): Promise<AuthTokens | null> {
  const key = provider === 'google' ? 'paybacker_auth' : 'paybacker_auth_microsoft'
  const result = await chrome.storage.local.get(key)
  return (result[key] as AuthTokens) ?? null
}

export async function refreshTokens(provider: 'google' | 'microsoft' = 'google'): Promise<AuthTokens | null> {
  const tokens = await getStoredTokens(provider)
  if (!tokens) return null

  // TODO (backend): Implement POST /api/auth/extension/refresh
  // Request: { refresh_token: string, provider: string }
  // Response: { access_token: string, expires_at: number }
  const response = await fetch(`${PAYBACKER_API_URL}/api/auth/extension/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: tokens.refreshToken,
      provider,
    }),
  })

  if (!response.ok) return null

  const data = await response.json() as { access_token: string; expires_at: number }
  const updated: AuthTokens = { ...tokens, accessToken: data.access_token, expiresAt: data.expires_at }

  const key = provider === 'google' ? 'paybacker_auth' : 'paybacker_auth_microsoft'
  await chrome.storage.local.set({ [key]: updated })
  return updated
}

export async function isTokenExpired(tokens: AuthTokens): Promise<boolean> {
  return Date.now() >= tokens.expiresAt - 60_000 // refresh 1 min early
}

export async function getValidTokens(provider: 'google' | 'microsoft' = 'google'): Promise<AuthTokens | null> {
  const tokens = await getStoredTokens(provider)
  if (!tokens) return null
  if (await isTokenExpired(tokens)) return await refreshTokens(provider)
  return tokens
}

export async function signOut(provider: 'google' | 'microsoft' = 'google'): Promise<void> {
  const key = provider === 'google' ? 'paybacker_auth' : 'paybacker_auth_microsoft'
  await chrome.storage.local.remove(key)
}
