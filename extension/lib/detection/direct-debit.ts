/**
 * Detects Direct Debit advance notice emails.
 * UK Bacs rules require 10 working days advance notice of first/changed DD.
 * Key phrase from Bacs mandate: "advance notice"
 */

import type { GmailMessage } from '../gmail-api'

export interface DirectDebitSignal {
  detected: boolean
  company?: string
  amount?: number
  collectionDate?: string
  referenceNumber?: string
  raw: string
}

const DD_PATTERNS: RegExp[] = [
  /direct\s+debit\s+(?:advance\s+)?notice/i,
  /advance\s+notice\s+of\s+(?:a\s+)?direct\s+debit/i,
  /direct\s+debit\s+(?:will\s+be\s+)?(?:collected|taken|debited)/i,
  /payment\s+(?:will\s+be\s+)?collected\s+(?:by\s+direct\s+debit|via\s+direct\s+debit)/i,
  /standing\s+order\s+(?:notice|change)/i,
  /bacs\s+(?:direct\s+debit|payment)/i,
  /mandate\s+(?:reference|number)/i,
  /your\s+(?:first\s+)?direct\s+debit\s+(?:instruction|payment)/i,
]

const AMOUNT_PATTERN = /£(\d+(?:\.\d{2})?)/
const REF_PATTERN = /(?:reference|ref|mandate)[:\s#]+([A-Z0-9\-]{6,20})/i

export function detectDirectDebitNotice(
  email: Pick<GmailMessage, 'subject' | 'body' | 'snippet' | 'from'>
): DirectDebitSignal {
  const text = `${email.subject} ${email.body} ${email.snippet}`
  const detected = DD_PATTERNS.some(p => p.test(text))

  if (!detected) return { detected: false, raw: text }

  const amountMatch = text.match(AMOUNT_PATTERN)
  const refMatch = text.match(REF_PATTERN)
  const supplierMatch = email.from.match(/^([^<@\n]+?)(?:\s*<|$)/)
  const dateMatch = text.match(/(?:on|dated?|collection\s+date)[:\s]+(\d{1,2}[\s/]\w+[\s/]\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i)

  return {
    detected: true,
    company: supplierMatch?.[1]?.trim(),
    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
    collectionDate: dateMatch?.[1],
    referenceNumber: refMatch?.[1],
    raw: text,
  }
}
