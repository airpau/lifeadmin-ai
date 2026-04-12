/**
 * Outlook Web content script.
 * Same pattern as gmail.ts — signals presence and injects Ask Paybacker button.
 * Outlook email data is fetched via Microsoft Graph API, not DOM scraping.
 */

(function initOutlookScript() {
  if (window.__paybackerOutlookInit) return
  window.__paybackerOutlookInit = true

  chrome.runtime.sendMessage({
    type: 'GMAIL_PAGE_DETECTED', // reusing same message type for both
    url: window.location.href,
  })

  injectAskButton()

  // Outlook SPA navigation listener
  window.addEventListener('popstate', () => {
    chrome.runtime.sendMessage({ type: 'GMAIL_PAGE_DETECTED', url: window.location.href })
  })
})()

function injectAskButton(): void {
  if (document.getElementById('paybacker-ask-btn-outlook')) return

  const btn = document.createElement('button')
  btn.id = 'paybacker-ask-btn-outlook'
  btn.title = 'Ask Paybacker'
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span>Paybacker</span>
  `

  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#0a1628',
    color: '#34d399',
    border: '1px solid #34d399',
    borderRadius: '24px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'Inter, system-ui, sans-serif',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  })

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', tabId: -1 })
  })

  document.body.appendChild(btn)
}

declare global {
  interface Window {
    __paybackerOutlookInit?: boolean
  }
}
