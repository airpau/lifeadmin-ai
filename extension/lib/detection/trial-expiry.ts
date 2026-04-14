/**
 * Detects free trial expiry emails — typically 3-7 days before charge.
 * Patterns: "trial ends", "trial expires", "your trial period", etc.
 */

import type { GmailMessage } from '../gmail-api'

export interface TrialExpirySignal {
  detected: boolean
  supplier?: string
  daysUntilCharge?: number
  amount?: number
  raw: string
}

const TRIAL_PATTERNS: RegExp[] = [
  /your\s+(free\s+)?trial\s+(ends?|expires?|is\s+ending|is\s+about\s+to\s+end)/i,
  /trial\s+period\s+(ends?|expires?|concludes?)/i,
  /after\s+your\s+trial/i,
  /(?:trial\s+)?subscription\s+starts?\s+(?:on|in|at)/i,
  /you['']ll\s+be\s+charged\s+(?:after|when|on)/i,
  /free\s+trial\s+(?:is\s+)?(?:expiring|ending|concluding)/i,
  /your\s+\d+[- ]day\s+(?:free\s+)?trial/i,
  /cancel\s+(?:before|by|anytime\s+before)\s+to\s+avoid/i,
  /avoid\s+being\s+charged/i,
]

const AMOUNT_PATTERN = /(?:£|GBP\s*)(\d+(?:\.\d{2})?)/

const DAYS_PATTERN = /(\d+)\s+day/i

export function detectTrialExpiry(email: Pick<GmailMessage, 'subject' | 'body' | 'snippet' | 'from'>): TrialExpirySignal {
  const text = `${email.subject} ${email.body} ${email.snippet}`.toLowerCase()
  const rawText = `${email.subject} ${email.body} ${email.snippet}`

  const detected = TRIAL_PATTERNS.some(p => p.test(text))

  if (!detected) return { detected: false, raw: rawText }

  const amountMatch = rawText.match(AMOUNT_PATTERN)
  const daysMatch = rawText.match(DAYS_PATTERN)

  // Extract supplier from From header (e.g. "Netflix <no-reply@netflix.com>" → "Netflix")
  const supplierMatch = email.from.match(/^([^<@\n]+?)(?:\s*<|$)/)
  const supplier = supplierMatch?.[1]?.trim()

  return {
    detected: true,
    supplier,
    daysUntilCharge: daysMatch ? parseInt(daysMatch[1], 10) : undefined,
    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
    raw: rawText,
  }
}
