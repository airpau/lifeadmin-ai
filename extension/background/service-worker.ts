/**
 * Paybacker Extension — Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - OAuth token management
 * - Periodic email scanning (every 2 hours via chrome.alarms)
 * - Message routing between content scripts and side panel
 * - Badge updates to show alert count
 */

import { getValidTokens, getStoredTokens } from '../lib/auth'
import { getFinancialEmails } from '../lib/gmail-api'
import { scanEmails } from '../lib/paybacker-api'
import type { EmailAlert, EmailScanInput } from '../lib/paybacker-api'

// ── Constants ─────────────────────────────────────────────────────────────────

const SCAN_ALARM = 'paybacker-email-scan'
const SCAN_INTERVAL_MINUTES = 120 // 2 hours

// ── Install / startup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.alarms.create(SCAN_ALARM, {
      delayInMinutes: 1, // first scan 1 minute after install
      periodInMinutes: SCAN_INTERVAL_MINUTES,
    })
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  }
})

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(SCAN_ALARM, alarm => {
    if (!alarm) {
      chrome.alarms.create(SCAN_ALARM, { periodInMinutes: SCAN_INTERVAL_MINUTES })
    }
  })
})

// ── Periodic scanning ─────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== SCAN_ALARM) return
  await runEmailScan()
})

async function runEmailScan(): Promise<void> {
  const tokens = await getStoredTokens('google')
  if (!tokens) {
    console.log('[Paybacker] Skipping scan — not authenticated')
    return
  }

  try {
    console.log('[Paybacker] Starting email scan…')
    const emails = await getFinancialEmails(30)

    const inputs: EmailScanInput[] = emails.map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      date: e.date,
      body: e.body,
      snippet: e.snippet,
      source: 'gmail',
    }))

    const alerts = await scanEmails(inputs)

    // Store alerts in local storage
    const existing = await getStoredAlerts()
    const merged = mergeAlerts(existing, alerts)
    await chrome.storage.local.set({ paybacker_alerts: merged })

    // Update badge
    const actionableCount = merged.filter(a => a.actionRequired).length
    if (actionableCount > 0) {
      chrome.action.setBadgeText({ text: String(actionableCount) })
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }) // amber
    } else {
      chrome.action.setBadgeText({ text: '' })
    }

    console.log(`[Paybacker] Scan complete — ${alerts.length} alerts found`)
  } catch (err) {
    console.error('[Paybacker] Email scan failed:', err)
  }
}

async function getStoredAlerts(): Promise<EmailAlert[]> {
  const result = await chrome.storage.local.get('paybacker_alerts')
  return (result.paybacker_alerts as EmailAlert[]) ?? []
}

function mergeAlerts(existing: EmailAlert[], fresh: EmailAlert[]): EmailAlert[] {
  const existingIds = new Set(existing.map(a => a.emailId))
  const newAlerts = fresh.filter(a => !existingIds.has(a.emailId))
  // Keep alerts from the last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const pruned = existing.filter(a => new Date(a.detectedAt).getTime() > cutoff)
  return [...pruned, ...newAlerts]
}

// ── Message handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    console.error('[Paybacker] Message handler error:', err)
    sendResponse({ error: String(err) })
  })
  return true // keep channel open for async response
})

type BackgroundMessage =
  | { type: 'GET_ALERTS' }
  | { type: 'RUN_SCAN' }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'OPEN_SIDE_PANEL'; tabId: number }
  | { type: 'GMAIL_PAGE_DETECTED'; url: string }
  | { type: 'SUPPLIER_PAGE_DETECTED'; domain: string; tabId: number }

async function handleMessage(message: BackgroundMessage): Promise<unknown> {
  switch (message.type) {
    case 'GET_ALERTS':
      return getStoredAlerts()

    case 'RUN_SCAN':
      await runEmailScan()
      return { success: true }

    case 'GET_AUTH_STATUS': {
      const google = await getStoredTokens('google')
      const microsoft = await getStoredTokens('microsoft')
      return {
        google: !!google,
        microsoft: !!microsoft,
        googleExpired: google ? Date.now() >= google.expiresAt : false,
      }
    }

    case 'OPEN_SIDE_PANEL':
      await chrome.sidePanel.open({ tabId: message.tabId })
      return { success: true }

    case 'GMAIL_PAGE_DETECTED':
      // Trigger a scan when user opens Gmail
      await runEmailScan()
      return { success: true }

    case 'SUPPLIER_PAGE_DETECTED':
      // Notify side panel that user is on a supplier page
      await chrome.storage.local.set({
        paybacker_current_supplier_domain: message.domain,
      })
      return { success: true }

    default:
      return { error: 'Unknown message type' }
  }
}

// ── Side panel behaviour ──────────────────────────────────────────────────────

// Open side panel when extension icon is clicked (set during onInstalled above)
// chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

// Suppress unused import warning — getValidTokens is used indirectly
void getValidTokens
