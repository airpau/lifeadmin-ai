/**
 * Detects subscription/service price increase notifications.
 */

import type { GmailMessage } from '../gmail-api'

export interface PriceIncreaseSignal {
  detected: boolean
  supplier?: string
  oldPrice?: number
  newPrice?: number
  effectiveDate?: string
  raw: string
}

const PRICE_INCREASE_PATTERNS: RegExp[] = [
  /price\s+(?:is\s+)?(?:going\s+up|increasing|rising|changing)/i,
  /(?:your\s+)?(?:monthly|annual|yearly|quarterly)\s+price\s+will\s+(?:be\s+)?(?:increasing|rising|changing|going\s+up)/i,
  /we['']?re\s+(?:increasing|raising|changing)\s+(?:our\s+|your\s+)?prices?/i,
  /price\s+change\s+(?:notice|notification|update)/i,
  /new\s+price\s+(?:from|starting|effective)/i,
  /rate\s+(?:increase|change)\s+(?:notice|notification)/i,
  /cost\s+(?:of\s+your\s+subscription\s+)?(?:is\s+)?(?:going\s+up|increasing)/i,
  /important\s+(?:update|notice)\s+(?:about\s+)?(?:your\s+)?(?:pricing|subscription\s+cost)/i,
]

const AMOUNT_PATTERN = /£(\d+(?:\.\d{2})?)/g

export function detectPriceIncrease(
  email: Pick<GmailMessage, 'subject' | 'body' | 'snippet' | 'from'>
): PriceIncreaseSignal {
  const text = `${email.subject} ${email.body} ${email.snippet}`
  const detected = PRICE_INCREASE_PATTERNS.some(p => p.test(text))

  if (!detected) return { detected: false, raw: text }

  const amounts = [...text.matchAll(AMOUNT_PATTERN)].map(m => parseFloat(m[1]))
  const supplierMatch = email.from.match(/^([^<@\n]+?)(?:\s*<|$)/)

  // Heuristic: smaller amount is old price, larger is new price
  const [oldPrice, newPrice] = amounts.length >= 2
    ? [Math.min(...amounts), Math.max(...amounts)]
    : [undefined, amounts[0]]

  // Look for "from DD Month YYYY" or "on DD/MM/YYYY"
  const dateMatch = text.match(/(?:from|effective|starting|on)\s+(\d{1,2}[\s/]\w+[\s/]\d{4}|\w+\s+\d{4})/i)

  return {
    detected: true,
    supplier: supplierMatch?.[1]?.trim(),
    oldPrice,
    newPrice,
    effectiveDate: dateMatch?.[1],
    raw: text,
  }
}
