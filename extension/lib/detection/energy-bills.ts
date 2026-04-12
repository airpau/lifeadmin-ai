/**
 * Detects energy and broadband bill notifications.
 * Also catches tariff change notices from Ofgem-regulated suppliers.
 */

import type { GmailMessage } from '../gmail-api'

export interface EnergyBillSignal {
  detected: boolean
  supplier?: string
  utilityType?: 'energy' | 'gas' | 'electricity' | 'broadband' | 'water'
  billAmount?: number
  tariffChanging?: boolean
  newTariffName?: string
  effectiveDate?: string
  raw: string
}

const ENERGY_PATTERNS: RegExp[] = [
  /your\s+(?:energy|electricity|gas|broadband|water)\s+(?:bill|statement|invoice|usage)/i,
  /(?:bill|statement)\s+(?:is|has\s+been)\s+(?:ready|available|generated)/i,
  /your\s+(?:latest|monthly|quarterly|annual)\s+(?:energy|gas|electric|broadband)\s+(?:bill|usage|statement)/i,
  /tariff\s+(?:change|update|is\s+changing|is\s+ending)/i,
  /we['']?re\s+(?:moving|putting)\s+you\s+(?:to|onto)\s+(?:a\s+)?(?:new\s+)?tariff/i,
  /price\s+cap\s+(?:change|update|adjustment)/i,
  /smart\s+meter\s+(?:reading|data|update)/i,
  /your\s+(?:annual|monthly)\s+energy\s+statement/i,
]

const UTILITY_TYPES = ['electricity', 'electric', 'gas', 'energy', 'broadband', 'water'] as const
const AMOUNT_PATTERN = /£(\d+(?:\.\d{2})?)/

export function detectEnergyBill(
  email: Pick<GmailMessage, 'subject' | 'body' | 'snippet' | 'from'>
): EnergyBillSignal {
  const text = `${email.subject} ${email.body} ${email.snippet}`
  const detected = ENERGY_PATTERNS.some(p => p.test(text))

  if (!detected) return { detected: false, raw: text }

  const utilityMatch = UTILITY_TYPES.find(t => new RegExp(t, 'i').test(text))
  const utilityType = utilityMatch === 'electric' ? 'electricity'
    : utilityMatch === 'energy' ? 'energy'
    : utilityMatch as EnergyBillSignal['utilityType'] | undefined

  const amountMatch = text.match(AMOUNT_PATTERN)
  const supplierMatch = email.from.match(/^([^<@\n]+?)(?:\s*<|$)/)
  const tariffChanging = /tariff\s+(?:change|changing|update|ending)/i.test(text)

  const tariffMatch = text.match(/(?:new\s+tariff|moving\s+you\s+to)[:\s"']+([A-Za-z0-9 &]+?)(?:tariff)?(?:\.|,|")/i)

  return {
    detected: true,
    supplier: supplierMatch?.[1]?.trim(),
    utilityType,
    billAmount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
    tariffChanging,
    newTariffName: tariffMatch?.[1]?.trim(),
    raw: text,
  }
}
