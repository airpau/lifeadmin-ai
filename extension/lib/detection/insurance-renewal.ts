/**
 * Detects insurance renewal notices.
 * UK insurers must send renewal notices in advance (FCA ICOBS rules).
 */

import type { GmailMessage } from '../gmail-api'

export interface InsuranceRenewalSignal {
  detected: boolean
  insurer?: string
  renewalDate?: string
  newPremium?: number
  lastYearPremium?: number
  policyType?: string
  raw: string
}

const RENEWAL_PATTERNS: RegExp[] = [
  /(?:your\s+)?(?:insurance\s+)?renewal\s+(?:notice|reminder|date|is\s+due|coming\s+up)/i,
  /your\s+(?:car|home|contents|life|pet|travel|health|buildings?)\s+insurance\s+(?:is\s+)?(?:renewing|due\s+for\s+renewal)/i,
  /policy\s+(?:renewal|is\s+due\s+to\s+renew)/i,
  /auto(?:matic(?:ally)?)?[- ]renew(?:al|ing)/i,
  /your\s+(?:policy\s+)?cover(?:age)?\s+(?:renews?|expires?)\s+(?:on|in)/i,
  /renewal\s+(?:premium|price|quote)/i,
  /don['']t\s+pay\s+more\s+than\s+you\s+have\s+to/i,
]

const POLICY_TYPES = ['car', 'home', 'contents', 'buildings', 'life', 'pet', 'travel', 'health']
const AMOUNT_PATTERN = /£(\d+(?:\.\d{2})?)/g

export function detectInsuranceRenewal(
  email: Pick<GmailMessage, 'subject' | 'body' | 'snippet' | 'from'>
): InsuranceRenewalSignal {
  const text = `${email.subject} ${email.body} ${email.snippet}`
  const detected = RENEWAL_PATTERNS.some(p => p.test(text))

  if (!detected) return { detected: false, raw: text }

  const policyType = POLICY_TYPES.find(t => new RegExp(t, 'i').test(text))
  const amounts = [...text.matchAll(AMOUNT_PATTERN)].map(m => parseFloat(m[1]))
  const supplierMatch = email.from.match(/^([^<@\n]+?)(?:\s*<|$)/)
  const dateMatch = text.match(/(?:renew(?:al|s)\s+(?:on|date[:\s])|expires?\s+on)[:\s]+(\d{1,2}[\s/]\w+[\s/]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i)

  return {
    detected: true,
    insurer: supplierMatch?.[1]?.trim(),
    renewalDate: dateMatch?.[1],
    newPremium: amounts[0],
    lastYearPremium: amounts.length > 1 ? amounts[1] : undefined,
    policyType,
    raw: text,
  }
}
