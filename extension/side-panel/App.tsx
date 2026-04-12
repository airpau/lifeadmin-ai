import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import '../assets/globals.css'
import { EmailAlert } from './components/EmailAlert'
import { DisputeDrafter } from './components/DisputeDrafter'
import { DealsFinder } from './components/DealsFinder'
import { AskPaybacker } from './components/AskPaybacker'
import type { EmailAlert as EmailAlertType } from '../lib/paybacker-api'

type Tab = 'alerts' | 'dispute' | 'deals' | 'ask'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('alerts')
  const [alerts, setAlerts] = useState<EmailAlertType[]>([])
  const [selectedAlert, setSelectedAlert] = useState<EmailAlertType | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuthStatus()
    loadAlerts()
  }, [])

  async function checkAuthStatus() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' })
    setIsAuthenticated(response?.google ?? false)
    setLoading(false)
  }

  async function loadAlerts() {
    const result = await chrome.storage.local.get('paybacker_alerts')
    setAlerts((result.paybacker_alerts as EmailAlertType[]) ?? [])
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'alerts', label: 'Alerts', icon: '🔔' },
    { id: 'dispute', label: 'Dispute', icon: '✍️' },
    { id: 'deals', label: 'Deals', icon: '💰' },
    { id: 'ask', label: 'Ask', icon: '💬' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-navy">
        <div className="text-mint text-sm">Loading…</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuth={checkAuthStatus} />
  }

  return (
    <div className="flex flex-col min-h-screen bg-navy text-white font-sans">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-navy-light">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 rounded-full bg-mint flex items-center justify-center">
            <span className="text-navy text-xs font-bold">P</span>
          </div>
          <span className="font-semibold text-sm tracking-wide">Paybacker</span>
        </div>
        {alerts.filter(a => a.actionRequired).length > 0 && (
          <span className="bg-amber text-navy text-xs font-bold px-2 py-0.5 rounded-full">
            {alerts.filter(a => a.actionRequired).length}
          </span>
        )}
      </header>

      {/* Tab bar */}
      <nav className="flex border-b border-navy-light">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-mint border-b-2 border-mint bg-navy-light'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="block text-base leading-none mb-0.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'alerts' && (
          <div className="p-4 space-y-3">
            {alerts.length === 0 ? (
              <EmptyState
                icon="📭"
                title="No alerts yet"
                body="Paybacker will scan your emails and surface anything that needs attention."
              />
            ) : (
              alerts.map(alert => (
                <EmailAlert
                  key={alert.id}
                  alert={alert}
                  onDraft={() => {
                    setSelectedAlert(alert)
                    setActiveTab('dispute')
                  }}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'dispute' && (
          <DisputeDrafter
            alert={selectedAlert}
            onBack={() => setActiveTab('alerts')}
          />
        )}

        {activeTab === 'deals' && <DealsFinder />}

        {activeTab === 'ask' && <AskPaybacker />}
      </main>
    </div>
  )
}

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="font-semibold text-sm mb-1">{title}</div>
      <div className="text-gray-400 text-xs leading-relaxed">{body}</div>
    </div>
  )
}

function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleAuth() {
    setLoading(true)
    setError('')
    try {
      const { authenticateWithGoogle } = await import('../lib/auth')
      await authenticateWithGoogle()
      onAuth()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-navy px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-mint flex items-center justify-center mb-4">
        <span className="text-navy text-xl font-bold">P</span>
      </div>
      <h1 className="text-lg font-bold mb-1">Paybacker</h1>
      <p className="text-gray-400 text-xs mb-6 leading-relaxed">
        Connect your Gmail to let Paybacker detect price increases,<br />
        trial expiries and renewal notices automatically.
      </p>

      <button
        onClick={handleGoogleAuth}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-medium text-sm py-3 px-4 rounded-lg mb-3 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {loading ? 'Connecting…' : 'Connect Gmail'}
      </button>

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      <p className="text-gray-500 text-xs mt-4 leading-relaxed">
        Read-only access. Paybacker never sends emails on your behalf.
      </p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
