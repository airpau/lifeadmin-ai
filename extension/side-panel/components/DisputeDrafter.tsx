import React, { useState, useEffect } from 'react'
import type { EmailAlert, DisputeDraft } from '../../lib/paybacker-api'
import { draftDispute, logAuditEvent, sendTelegramNotification } from '../../lib/paybacker-api'

interface Props {
  alert: EmailAlert | null
  onBack: () => void
}

export function DisputeDrafter({ alert, onBack }: Props) {
  const [draft, setDraft] = useState<DisputeDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (alert) {
      generateDraft(alert)
    }
  }, [alert])

  async function generateDraft(a: EmailAlert) {
    setLoading(true)
    setError('')
    setDraft(null)

    try {
      const result = await draftDispute(a.id)
      if (!result) throw new Error('Failed to generate draft')
      setDraft(result)

      // Log and notify
      await logAuditEvent('dispute_drafted', { alert_id: a.id, draft_id: result.draftId })
      await sendTelegramNotification(
        `Dispute draft created for ${a.supplier ?? a.title}\n\nSaved to Paybacker audit log.`,
        'dispute_drafted'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate draft')
    } finally {
      setLoading(false)
    }
  }

  async function copyToClipboard() {
    if (!draft) return
    await navigator.clipboard.writeText(draft.letter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!alert) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="text-4xl mb-3">✍️</div>
        <div className="font-semibold text-sm mb-1">Dispute Drafter</div>
        <div className="text-gray-400 text-xs">
          Select an alert from the Alerts tab to draft a dispute letter.
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-xs text-gray-400 hover:text-white mb-4 flex items-center gap-1">
        ← Back to alerts
      </button>

      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-1">Drafting dispute for</div>
        <div className="font-semibold text-sm">{alert.title}</div>
        {alert.supplier && <div className="text-xs text-gray-400">{alert.supplier}</div>}
      </div>

      {loading && (
        <div className="bg-navy-light rounded-lg p-4 text-center">
          <div className="text-mint text-sm mb-1">Generating letter…</div>
          <div className="text-xs text-gray-400">
            Using UK consumer rights knowledge to draft your dispute
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-xs text-red-400">
          {error}
          <button
            onClick={() => generateDraft(alert)}
            className="block mt-2 text-mint underline"
          >
            Try again
          </button>
        </div>
      )}

      {draft && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-mint">Draft letter ready</div>
            <button
              onClick={copyToClipboard}
              className="text-xs bg-navy-light hover:bg-navy-dark px-3 py-1 rounded border border-gray-700"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div className="bg-navy-light border border-gray-700 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-400 mb-1">Subject: {draft.subject}</div>
            <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {draft.letter}
            </div>
          </div>

          {draft.recipientEmail && (
            <div className="mt-2 text-xs text-gray-400">
              To: {draft.recipientEmail}
            </div>
          )}

          <div className="mt-3 text-xs text-gray-500 bg-navy-light rounded p-2">
            Saved to Paybacker audit log · Telegram notification sent
          </div>
        </div>
      )}
    </div>
  )
}
