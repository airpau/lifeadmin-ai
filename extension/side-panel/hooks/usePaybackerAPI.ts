import { useState, useCallback } from 'react'
import type { EmailAlert, DisputeDraft, Deal } from '../../lib/paybacker-api'
import { scanEmails, draftDispute, getDealsForSupplier } from '../../lib/paybacker-api'
import type { EmailScanInput } from '../../lib/paybacker-api'

export function useEmailScan() {
  const [alerts, setAlerts] = useState<EmailAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async (emails: EmailScanInput[]) => {
    setLoading(true)
    setError(null)
    try {
      const results = await scanEmails(emails)
      setAlerts(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }, [])

  return { alerts, loading, error, scan }
}

export function useDisputeDraft() {
  const [draft, setDraft] = useState<DisputeDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (alertId: string) => {
    setLoading(true)
    setError(null)
    setDraft(null)
    try {
      const result = await draftDispute(alertId)
      setDraft(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft failed')
    } finally {
      setLoading(false)
    }
  }, [])

  return { draft, loading, error, generate }
}

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDeals = useCallback(async (domain: string, category?: string) => {
    setLoading(true)
    try {
      const results = await getDealsForSupplier(domain, category)
      setDeals(results)
    } catch {
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [])

  return { deals, loading, fetchDeals }
}
