import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import '../assets/globals.css'
import type { EmailAlert } from '../lib/paybacker-api'

function Popup() {
  const [alerts, setAlerts] = useState<EmailAlert[]>([])
  const [authStatus, setAuthStatus] = useState<{ google: boolean; microsoft: boolean } | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }).then(setAuthStatus)
    chrome.storage.local.get('paybacker_alerts').then(result => {
      setAlerts((result.paybacker_alerts as EmailAlert[]) ?? [])
    })
  }, [])

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id })
      window.close()
    }
  }

  async function triggerScan() {
    setScanning(true)
    await chrome.runtime.sendMessage({ type: 'RUN_SCAN' })
    const result = await chrome.storage.local.get('paybacker_alerts')
    setAlerts((result.paybacker_alerts as EmailAlert[]) ?? [])
    setScanning(false)
  }

  const actionableAlerts = alerts.filter(a => a.actionRequired)

  return (
    <div className="bg-navy text-white font-sans p-4 min-h-24">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-mint flex items-center justify-center">
          <span className="text-navy text-sm font-bold">P</span>
        </div>
        <div>
          <div className="font-semibold text-sm">Paybacker</div>
          <div className="text-xs text-gray-400">Money-saving assistant</div>
        </div>
      </div>

      {/* Auth status */}
      {authStatus && (
        <div className="flex gap-2 mb-4">
          <StatusPill label="Gmail" connected={authStatus.google} />
          <StatusPill label="Outlook" connected={authStatus.microsoft} />
        </div>
      )}

      {/* Alert summary */}
      {actionableAlerts.length > 0 ? (
        <div className="bg-amber/10 border border-amber/30 rounded-lg p-3 mb-4">
          <div className="text-amber text-sm font-semibold">
            {actionableAlerts.length} alert{actionableAlerts.length !== 1 ? 's' : ''} need attention
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {actionableAlerts.map(a => a.title).slice(0, 2).join(' · ')}
            {actionableAlerts.length > 2 && ` · +${actionableAlerts.length - 2} more`}
          </div>
        </div>
      ) : (
        <div className="bg-mint/10 border border-mint/20 rounded-lg p-3 mb-4 text-xs text-gray-400">
          {alerts.length === 0 ? 'No emails scanned yet.' : 'All clear — no actions needed.'}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={openSidePanel}
          className="flex-1 bg-mint text-navy font-semibold text-sm py-2 rounded-lg hover:bg-mint/90 transition-colors"
        >
          Open panel
        </button>
        <button
          onClick={triggerScan}
          disabled={scanning || !authStatus?.google}
          className="px-3 py-2 bg-navy-light border border-gray-700 rounded-lg text-xs text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          title="Scan emails now"
        >
          {scanning ? '…' : '↻'}
        </button>
      </div>
    </div>
  )
}

function StatusPill({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
      connected
        ? 'border-mint/30 bg-mint/10 text-mint'
        : 'border-gray-700 bg-navy-light text-gray-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-mint' : 'bg-gray-600'}`} />
      {label}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />)
