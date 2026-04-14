/**
 * Gmail content script.
 * Detects when the user is on the Gmail web app and notifies the background
 * service worker to trigger an email scan.
 *
 * Note: We do NOT scrape DOM for email content — we use the Gmail API instead.
 * This script only signals presence on Gmail and optionally adds the
 * "Ask Paybacker" floating button.
 */

(function initGmailScript() {
  if (window.__paybackerGmailInit) return
  window.__paybackerGmailInit = true

  // Notify background to trigger scan
  chrome.runtime.sendMessage({
    type: 'GMAIL_PAGE_DETECTED',
    url: window.location.href,
  })

  // Inject floating "Ask Paybacker" button
  injectAskButton()

  // Watch for Gmail's SPA navigation (Gmail updates URL via History API)
  let lastUrl = window.location.href
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      chrome.runtime.sendMessage({
        type: 'GMAIL_PAGE_DETECTED',
        url: window.location.href,
      })
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
})()

function injectAskButton(): void {
  if (document.getElementById('paybacker-ask-btn')) return

  const btn = document.createElement('button')
  btn.id = 'paybacker-ask-btn'
  btn.title = 'Ask Paybacker'
  btn.setAttribute('aria-label', 'Open Paybacker assistant')
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
    transition: 'all 0.2s ease',
  })

  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#1a2d4a'
    btn.style.transform = 'translateY(-2px)'
  })

  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#0a1628'
    btn.style.transform = 'translateY(0)'
  })

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'OPEN_SIDE_PANEL',
      tabId: -1, // background will resolve current tab
    })
  })

  document.body.appendChild(btn)
}

declare global {
  interface Window {
    __paybackerGmailInit?: boolean
  }
}
