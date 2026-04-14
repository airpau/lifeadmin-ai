/**
 * Gmail API client for Paybacker extension.
 * Uses gmail.readonly scope — read-only access to email metadata and bodies.
 * Authentication is handled via lib/auth.ts (PKCE + chrome.identity).
 */

import { getValidTokens } from './auth'

const GMAIL_BASE = 'https://www.googleapis.com/gmail/v1/users/me'

export interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  body: string
  snippet: string
  labels: string[]
}

export interface GmailSearchResult {
  messages: GmailMessage[]
  nextPageToken?: string
}

async function gmailFetch(path: string, params?: Record<string, string>): Promise<Response> {
  const tokens = await getValidTokens('google')
  if (!tokens) throw new Error('Not authenticated with Google')

  const url = new URL(`${GMAIL_BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
}

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    return atob(base64)
  }
}

function extractBody(payload: GmailApiPayload): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data)
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data)
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }
  return ''
}

interface GmailApiPayload {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailApiPayload[]
  headers?: Array<{ name: string; value: string }>
}

interface GmailApiMessage {
  id: string
  threadId: string
  snippet: string
  labelIds?: string[]
  payload?: GmailApiPayload
}

/**
 * Fetch recent emails matching a Gmail search query.
 * q format: https://support.google.com/mail/answer/7190
 */
export async function searchEmails(
  query: string,
  maxResults = 20
): Promise<GmailSearchResult> {
  const listRes = await gmailFetch('/messages', {
    q: query,
    maxResults: String(maxResults),
  })

  if (!listRes.ok) {
    throw new Error(`Gmail list failed: ${listRes.status}`)
  }

  const listData = await listRes.json() as {
    messages?: Array<{ id: string; threadId: string }>
    nextPageToken?: string
  }

  if (!listData.messages?.length) {
    return { messages: [] }
  }

  // Fetch message details in parallel (batched to avoid rate limits)
  const messages = await Promise.all(
    listData.messages.slice(0, maxResults).map(async ({ id, threadId }) => {
      const msgRes = await gmailFetch(`/messages/${id}`, { format: 'full' })
      if (!msgRes.ok) return null
      const msg = await msgRes.json() as GmailApiMessage

      const headers = msg.payload?.headers ?? []
      const getHeader = (name: string) =>
        headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

      return {
        id,
        threadId,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        date: getHeader('Date'),
        body: msg.payload ? extractBody(msg.payload) : '',
        snippet: msg.snippet ?? '',
        labels: msg.labelIds ?? [],
      } satisfies GmailMessage
    })
  )

  return {
    messages: messages.filter((m): m is GmailMessage => m !== null),
    nextPageToken: listData.nextPageToken,
  }
}

/**
 * Fetch the most recent emails from inbox.
 * Used for periodic background scanning.
 */
export async function getRecentInboxEmails(maxResults = 50): Promise<GmailMessage[]> {
  const result = await searchEmails('in:inbox newer_than:7d', maxResults)
  return result.messages
}

/**
 * Fetch emails likely to be financial/subscription related.
 * Broad query to capture all detection categories.
 */
export async function getFinancialEmails(maxResults = 30): Promise<GmailMessage[]> {
  const query = [
    'subject:(price increase OR renewal OR subscription OR trial OR insurance OR energy OR broadband OR direct debit OR HMRC OR tax)',
    'newer_than:30d',
  ].join(' ')

  const result = await searchEmails(query, maxResults)
  return result.messages
}
