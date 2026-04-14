/**
 * Supplier sites content script.
 * Detects when user is on a known UK supplier website and signals the
 * background service worker to prepare deals data for the side panel.
 */

import { getSupplierByDomain, isKnownSupplier } from '../lib/supplier-registry'

(function initSupplierScript() {
  if (window.__paybackerSupplierInit) return
  window.__paybackerSupplierInit = true

  const domain = window.location.hostname.replace(/^www\./, '')

  if (!isKnownSupplier(domain)) return

  const supplier = getSupplierByDomain(domain)
  if (!supplier?.dealsAvailable) return

  chrome.runtime.sendMessage({
    type: 'SUPPLIER_PAGE_DETECTED',
    domain,
    tabId: -1,
  })

  // Inject a subtle banner prompting user to check deals
  injectDealsBanner(supplier.name, supplier.category)
})()

function injectDealsBanner(supplierName: string, category: string): void {
  if (document.getElementById('paybacker-deals-banner')) return

  const banner = document.createElement('div')
  banner.id = 'paybacker-deals-banner'
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="font-size:20px;">&#x1F4A1;</div>
      <div>
        <div style="font-weight:600;font-size:14px;color:#0a1628;">
          Paybacker found better ${category} deals
        </div>
        <div style="font-size:12px;color:#4b5563;margin-top:2px;">
          See how much you could save vs ${supplierName}
        </div>
      </div>
      <button id="paybacker-deals-btn" style="
        margin-left:auto;
        padding:8px 16px;
        background:#0a1628;
        color:#34d399;
        border:none;
        border-radius:6px;
        cursor:pointer;
        font-size:13px;
        font-weight:600;
        white-space:nowrap;
      ">View deals &#x2192;</button>
      <button id="paybacker-deals-close" style="
        background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:4px;
      " aria-label="Dismiss">&#xD7;</button>
    </div>
  `

  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '999999',
    background: '#f0fdf4',
    borderBottom: '2px solid #34d399',
    padding: '12px 20px',
    fontFamily: 'Inter, system-ui, sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  })

  document.body.style.marginTop = '60px'
  document.body.prepend(banner)

  document.getElementById('paybacker-deals-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', tabId: -1 })
  })

  document.getElementById('paybacker-deals-close')?.addEventListener('click', () => {
    banner.remove()
    document.body.style.marginTop = ''
  })
}

declare global {
  interface Window {
    __paybackerSupplierInit?: boolean
  }
}
