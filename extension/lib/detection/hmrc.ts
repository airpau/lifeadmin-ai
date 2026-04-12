/**
 * Detects HMRC and gov.uk correspondence.
 * High priority — tax deadlines and HMRC letters are time-sensitive.
 */

import type { GmailMessage } from '../gmail-api'

export interface HmrcSignal {
  detected: boolean
  noticeType?: string
  deadline?: string
  referenceNumber?: string
  amountDue?: number
  raw: string
}

const HMRC_PATTERNS: RegExp[] = [
  /hmrc\.gov\.uk/i,
  /HM\s+Revenue\s+(?:&|and)\s+Customs/i,
  /self[\s-]assessment\s+(?:tax\s+return|deadline|reminder)/i,
  /tax\s+(?:code\s+change|return\s+due|refund|rebate|underpayment|overpayment)/i,
  /national\s+insurance\s+(?:contribution|number|credit)/i,
  /paye\s+(?:notice|code|underpayment)/i,
  /tax\s+credit\s+(?:renewal|award\s+notice|overpayment)/i,
  /universal\s+credit\s+(?:payment|statement|notice)/i,
  /government\s+gateway/i,
  /child\s+benefit\s+(?:payment|change|notice)/i,
  /student\s+loan\s+(?:company|repayment|notice)/i,
  /dvla\.gov\.uk/i,
  /vehicle\s+(?:tax|excise\s+duty)\s+(?:due|reminder|renewal)/i,
  /council\s+tax\s+(?:bill|reminder|demand)/i,
]

const AMOUNT_PATTERN = /£(\d+(?:\.\d{2})?)/
const REF_PATTERN = /(?:UTR|reference|tax\s+ref(?:erence)?|case\s+number)[:\s#]+([A-Z0-9 \-]{6,20})/i

export function detectHmrcCorrespondence(
  email: Pick<GmailMessage, 'subject' | 'body' | 'snippet' | 'from'>
): HmrcSignal {
  const text = `${email.subject} ${email.body} ${email.snippet}`
  const detected = HMRC_PATTERNS.some(p => p.test(text))

  if (!detected) return { detected: false, raw: text }

  const amountMatch = text.match(AMOUNT_PATTERN)
  const refMatch = text.match(REF_PATTERN)
  const dateMatch = text.match(/(?:deadline|due\s+(?:date|by)|submit\s+by|pay\s+by)[:\s]+(\d{1,2}[\s/]\w+[\s/]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i)

  // Determine notice type
  let noticeType = 'HMRC correspondence'
  if (/self[\s-]assessment/i.test(text)) noticeType = 'Self Assessment reminder'
  else if (/tax\s+refund|tax\s+rebate/i.test(text)) noticeType = 'Tax refund'
  else if (/tax\s+code/i.test(text)) noticeType = 'Tax code change'
  else if (/council\s+tax/i.test(text)) noticeType = 'Council Tax'
  else if (/vehicle\s+tax|dvla/i.test(text)) noticeType = 'Vehicle Tax renewal'

  return {
    detected: true,
    noticeType,
    deadline: dateMatch?.[1],
    referenceNumber: refMatch?.[1]?.trim(),
    amountDue: amountMatch ? parseFloat(amountMatch[1]) : undefined,
    raw: text,
  }
}
