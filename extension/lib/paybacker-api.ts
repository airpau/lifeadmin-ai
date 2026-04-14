/**
 * Paybacker backend API client.
 * All /api/extension/* endpoints are TODO — stubs below show expected shapes.
 *
 * TODO (backend — lifeadmin-ai): Create the following Next.js API routes:
 *
 * POST /api/extension/email-scan
 *   Request:  { emails: EmailScanInput[], user_id: string }
 *   Response: { alerts: EmailAlert[], scan_id: string }
 *
 * POST /api/extension/draft-dispute
 *   Request:  { alert_id: string, user_id: string, template?: string }
 *   Response: { draft_id: string, letter: string, subject: string }
 *
 * POST /api/extension/audit-log
 *   Request:  { action: AuditAction, payload: unknown, user_id: string }
 *   Response: { log_id: string }
 *
 * POST /api/extension/telegram-notify
 *   Request:  { message: string, user_id: string, alert_type?: string }
 *   Response: { message_id: number }
 *
 * POST /api/auth/extension
 *   Request:  { provider: 'google'|'microsoft', code: string, code_verifier: string, redirect_uri: string }
 *   Response: { access_token: string, refresh_token: string, expires_at: number, user_id: string }
 *
 * POST /api/auth/extension/refresh
 *   Request:  { refresh_token: string, provider: string }
 *   Response: { access_token: string, expires_at: number }
 *
 * GET /api/extension/deals?supplier_domain=...&category=...
 *   Response: { deals: Deal[] }
 *
 * POST /api/extension/ask
 *   Request:  { question: string, user_id: string, context?: string }
 *   Response: { answer: string, sources: string[], related_transactions: Transaction[] }
 */

import { getValidTokens } from './auth'

const PAYBACKER_API_URL = import.meta.env.VITE_PAYBACKER_API_URL ?? 'https://www.paybacker.co.uk'

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailCategory =
  | 'trial_expiry'
  | 'price_increase'
  | 'insurance_renewal'
  | 'direct_debit_notice'
  | 'energy_bill'
  | 'hmrc'
  | 'dispute_response'
  | 'cancellation_confirmation'

export interface EmailAlert {
  id: string
  category: EmailCategory
  severity: 'high' | 'medium' | 'low'
  title: string
  summary: string
  supplier?: string
  amount?: number
  dueDate?: string
  emailId: string
  detectedAt: string
  actionRequired: boolean
}

export interface EmailScanInput {
  id: string
  subject: string
  from: string
  date: string
  body: string
  snippet: string
  source: 'gmail' | 'outlook'
}

export interface DisputeDraft {
  draftId: string
  letter: string
  subject: string
  recipientEmail?: string
  savedAt: string
}

export interface Deal {
  id: string
  provider: string
  category: 'energy' | 'broadband' | 'insurance' | 'mobile' | 'other'
  title: string
  description: string
  annualSaving: number
  currentUserPaying?: number
  affiliateUrl: string
  validUntil?: string
}

export type AuditAction =
  | 'email_scan'
  | 'alert_dismissed'
  | 'dispute_drafted'
  | 'dispute_sent'
  | 'deal_clicked'
  | 'question_asked'
  | 'auth_completed'

// ── API client ────────────────────────────────────────────────────────────────

async function paybackerFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const tokens = await getValidTokens('google')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Extension-Version': chrome.runtime.getManifest().version,
  }

  if (tokens) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`
    headers['X-User-Id'] = tokens.userId
  }

  return fetch(`${PAYBACKER_API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
  })
}

/**
 * Send scanned emails to Paybacker for AI analysis.
 * Returns detected alerts with category, severity and recommended actions.
 *
 * TODO (backend): Implement POST /api/extension/email-scan
 * - Use AI to classify emails into EmailCategory types
 * - Pull relevant transactions from Supabase for context
 * - Return actionable alerts with supplier, amount, due date where available
 */
export async function scanEmails(
  emails: EmailScanInput[]
): Promise<EmailAlert[]> {
  const res = await paybackerFetch('/api/extension/email-scan', {
    method: 'POST',
    body: JSON.stringify({ emails }),
  })

  if (!res.ok) {
    console.error('[Paybacker] email-scan failed:', res.status)
    return []
  }

  const data = await res.json() as { alerts: EmailAlert[] }
  return data.alerts
}

/**
 * Generate a UK consumer rights dispute letter for the given alert.
 *
 * TODO (backend): Implement POST /api/extension/draft-dispute
 * - Use Claude to draft a professional dispute letter
 * - Incorporate UK consumer rights: Consumer Rights Act 2015,
 *   Direct Debit Guarantee, FCA complaint rules
 * - Pull full transaction history for the supplier from Supabase
 * - Save draft to Supabase dispute_drafts table with audit trail
 */
export async function draftDispute(alertId: string): Promise<DisputeDraft | null> {
  const res = await paybackerFetch('/api/extension/draft-dispute', {
    method: 'POST',
    body: JSON.stringify({ alert_id: alertId }),
  })

  if (!res.ok) {
    console.error('[Paybacker] draft-dispute failed:', res.status)
    return null
  }

  return res.json() as Promise<DisputeDraft>
}

/**
 * Log an extension action to Paybacker's audit log.
 *
 * TODO (backend): Implement POST /api/extension/audit-log
 * - Insert into Supabase extension_audit_log table
 * - Table schema: (id, user_id, action, payload jsonb, created_at)
 */
export async function logAuditEvent(
  action: AuditAction,
  payload: unknown
): Promise<void> {
  try {
    await paybackerFetch('/api/extension/audit-log', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    })
  } catch (e) {
    console.warn('[Paybacker] audit-log failed silently:', e)
  }
}

/**
 * Send a Telegram notification when the extension takes an action.
 *
 * TODO (backend): Implement POST /api/extension/telegram-notify
 * - Use the existing Telegram bot token from environment
 * - Look up the user's telegram_chat_id from Supabase profiles table
 * - Send via Telegram Bot API: https://api.telegram.org/bot{token}/sendMessage
 */
export async function sendTelegramNotification(
  message: string,
  alertType?: string
): Promise<void> {
  try {
    await paybackerFetch('/api/extension/telegram-notify', {
      method: 'POST',
      body: JSON.stringify({ message, alert_type: alertType }),
    })
  } catch (e) {
    console.warn('[Paybacker] telegram-notify failed silently:', e)
  }
}

/**
 * Fetch available deals for the current supplier domain.
 *
 * TODO (backend): Implement GET /api/extension/deals
 * - Check supplier_domain against deals catalogue in Supabase
 * - Return deals sorted by annual_saving desc
 * - Include affiliate tracking URLs
 */
export async function getDealsForSupplier(
  supplierDomain: string,
  category?: string
): Promise<Deal[]> {
  const params = new URLSearchParams({ supplier_domain: supplierDomain })
  if (category) params.set('category', category)

  const res = await paybackerFetch(`/api/extension/deals?${params}`)

  if (!res.ok) return []

  const data = await res.json() as { deals: Deal[] }
  return data.deals
}

/**
 * Ask Paybacker a natural language question with full financial context.
 *
 * TODO (backend): Implement POST /api/extension/ask
 * - Use Claude with RAG over Supabase transactions + email history
 * - Return specific answer with source transactions cited
 */
export async function askPaybacker(question: string, pageContext?: string): Promise<{
  answer: string
  sources: string[]
}> {
  const res = await paybackerFetch('/api/extension/ask', {
    method: 'POST',
    body: JSON.stringify({ question, context: pageContext }),
  })

  if (!res.ok) {
    return {
      answer: 'Sorry, I could not connect to Paybacker right now. Please try again later.',
      sources: [],
    }
  }

  return res.json() as Promise<{ answer: string; sources: string[] }>
}
