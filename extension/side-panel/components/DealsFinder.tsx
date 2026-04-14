import React, { useState, useEffect } from 'react'
import type { Deal } from '../../lib/paybacker-api'
import { getDealsForSupplier, logAuditEvent } from '../../lib/paybacker-api'

export function DealsFinder() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [supplierDomain, setSupplierDomain] = useState<string | null>(null)

  useEffect(() => {
    loadDeals()

    // Listen for supplier domain changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.paybacker_current_supplier_domain) {
        const domain = changes.paybacker_current_supplier_domain.newValue as string | null
        setSupplierDomain(domain)
        if (domain) fetchDealsForDomain(domain)
      }
    })
  }, [])

  async function loadDeals() {
    const result = await chrome.storage.local.get('paybacker_current_supplier_domain')
    const domain = result.paybacker_current_supplier_domain as string | undefined
    setSupplierDomain(domain ?? null)

    if (domain) {
      await fetchDealsForDomain(domain)
    } else {
      setLoading(false)
    }
  }

  async function fetchDealsForDomain(domain: string) {
    setLoading(true)
    try {
      const results = await getDealsForSupplier(domain)
      setDeals(results)
    } catch {
      setDeals([])
    } finally {
      setLoading(false)
    }
  }

  async function handleDealClick(deal: Deal) {
    await logAuditEvent('deal_clicked', { deal_id: deal.id, provider: deal.provider })
    window.open(deal.affiliateUrl, '_blank', 'noopener')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-mint text-sm">Finding deals…</div>
      </div>
    )
  }

  if (!supplierDomain) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="text-4xl mb-3">💰</div>
        <div className="font-semibold text-sm mb-1">Deals & Switching</div>
        <div className="text-gray-400 text-xs leading-relaxed">
          Visit a supplier website (energy, broadband, insurance, mobile) and
          Paybacker will automatically find you better deals.
        </div>
        <div className="mt-4 text-xs text-gray-500">
          Try visiting: britishgas.co.uk, sky.com, aviva.com…
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="text-xs text-gray-400">Deals vs</div>
        <div className="font-semibold text-sm">{supplierDomain}</div>
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-xs">
          No better deals found right now. Check back soon.
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map(deal => (
            <div key={deal.id} className="bg-navy-light border border-gray-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{deal.provider}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{deal.title}</div>
                  {deal.description && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">{deal.description}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-mint font-bold text-sm">
                    Save £{deal.annualSaving.toFixed(0)}/yr
                  </div>
                  {deal.validUntil && (
                    <div className="text-xs text-gray-500">Until {deal.validUntil}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDealClick(deal)}
                className="mt-3 w-full py-2 bg-mint text-navy text-xs font-semibold rounded-md hover:bg-mint/90 transition-colors"
              >
                Switch to {deal.provider} →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
