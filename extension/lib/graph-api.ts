/**
 * Microsoft Graph API client for Paybacker extension (Outlook integration).
 * Scope: Mail.Read
 * Auth: PKCE via lib/auth.ts
 */

import { getValidTokens } from './auth'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me'

export interface OutlookMessage {
  id: string
  subject: string
  from: string
  date: string
  body: string
  snippet: string
  isRead: boolean
}

async function graphFetch(path: string, params?: Record<string, string>): Promise<Response> {
  const tokens = await getValidTokens('microsoft')
  if (!tokens) throw new Error('Not authenticated with Microsoft')

  const url = new URL(`${GRAPH_BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  return fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
  })
}

interface GraphMessage {
  id: string
  subject: string
  from: { emailAddress: { name: string; address: string } }
  receivedDateTime: string
  bodyPreview: string
  body: { content: string; contentType: string }
  isRead: boolean
}

export async function getOutlookEmails(
  filter?: string,
  top = 30
): Promise<OutlookMessage[]> {
  const params: Record<string, string> = {
    $top: String(top),
    $select: 'id,subject,from,receivedDateTime,bodyPreview,body,isRead',
    $orderby: 'receivedDateTime desc',
  }

  if (filter) params['$filter'] = filter

  const res = await graphFetch('/messages', params)
  if (!res.ok) throw new Error(`Graph API failed: ${res.status}`)

  const data = await res.json() as { value: GraphMessage[] }

  return data.value.map(msg => ({
    id: msg.id,
    subject: msg.subject ?? '',
    from: `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`,
    date: msg.receivedDateTime,
    body: msg.body.contentType === 'html'
      ? msg.body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : msg.body.content,
    snippet: msg.bodyPreview ?? '',
    isRead: msg.isRead,
  }))
}

export async function getRecentOutlookFinancialEmails(): Promise<OutlookMessage[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const filter = `receivedDateTime ge ${sevenDaysAgo}`
  return getOutlookEmails(filter, 50)
}
