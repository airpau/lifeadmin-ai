import { useState, useCallback } from 'react'
import type { GmailMessage } from '../../lib/gmail-api'
import { getFinancialEmails, searchEmails } from '../../lib/gmail-api'

export function useGmailEmails() {
  const [emails, setEmails] = useState<GmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchFinancial = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await getFinancialEmails()
      setEmails(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch emails')
    } finally {
      setLoading(false)
    }
  }, [])

  const search = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const { messages } = await searchEmails(query)
      setEmails(messages)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [])

  return { emails, loading, error, fetchFinancial, search }
}
