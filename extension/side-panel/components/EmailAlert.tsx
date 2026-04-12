import React from 'react'
import type { EmailAlert as EmailAlertType } from '../../lib/paybacker-api'

const CATEGORY_CONFIG = {
  trial_expiry: { label: 'Trial Expiry', colour: 'text-amber', bg: 'bg-amber/10', icon: '⏰' },
  price_increase: { label: 'Price Increase', colour: 'text-red-400', bg: 'bg-red-400/10', icon: '📈' },
  insurance_renewal: { label: 'Insurance Renewal', colour: 'text-blue-400', bg: 'bg-blue-400/10', icon: '🛡️' },
  direct_debit_notice: { label: 'Direct Debit', colour: 'text-purple-400', bg: 'bg-purple-400/10', icon: '🏦' },
  energy_bill: { label: 'Energy Bill', colour: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: '⚡' },
  hmrc: { label: 'HMRC', colour: 'text-red-500', bg: 'bg-red-500/10', icon: '🏛️' },
  dispute_response: { label: 'Dispute Response', colour: 'text-mint', bg: 'bg-mint/10', icon: '📨' },
  cancellation_confirmation: { label: 'Cancellation', colour: 'text-gray-400', bg: 'bg-gray-400/10', icon: '✅' },
} as const

const SEVERITY_COLOURS = {
  high: 'border-red-500/40',
  medium: 'border-amber/40',
  low: 'border-gray-700',
}

interface Props {
  alert: EmailAlertType
  onDraft: () => void
}

export function EmailAlert({ alert, onDraft }: Props) {
  const config = CATEGORY_CONFIG[alert.category]

  return (
    <div className={`rounded-lg border ${SEVERITY_COLOURS[alert.severity]} bg-navy-light p-3`}>
      <div className="flex items-start gap-2">
        <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.bg} flex items-center justify-center text-sm`}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-semibold ${config.colour}`}>{config.label}</span>
            {alert.actionRequired && (
              <span className="text-xs bg-amber/20 text-amber px-1.5 py-0.5 rounded font-medium">
                Action needed
              </span>
            )}
          </div>
          <div className="text-sm font-medium truncate">{alert.title}</div>
          <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{alert.summary}</div>

          {(alert.amount || alert.dueDate || alert.supplier) && (
            <div className="flex gap-3 mt-2 text-xs text-gray-400">
              {alert.supplier && <span>🏢 {alert.supplier}</span>}
              {alert.amount && <span>💷 £{alert.amount.toFixed(2)}</span>}
              {alert.dueDate && <span>📅 {alert.dueDate}</span>}
            </div>
          )}
        </div>
      </div>

      {alert.actionRequired && (
        <button
          onClick={onDraft}
          className="mt-3 w-full py-2 bg-mint text-navy text-xs font-semibold rounded-md hover:bg-mint/90 transition-colors"
        >
          Draft dispute letter →
        </button>
      )}
    </div>
  )
}
