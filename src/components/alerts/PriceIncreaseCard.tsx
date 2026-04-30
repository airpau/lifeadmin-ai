'use client';

import Link from 'next/link';
import { TrendingUp, FileText, ArrowRight, X } from 'lucide-react';
import { cleanMerchantName } from '@/lib/merchant-utils';

interface PriceAlert {
  id: string;
  merchant_name: string;
  merchant_normalized: string;
  old_amount: number;
  new_amount: number;
  increase_pct: number;
  annual_impact: number;
  old_date: string;
  new_date: string;
  status: string;
}

interface PriceIncreaseCardProps {
  alert: PriceAlert;
  onDismiss: (id: string) => void;
  onAction: (id: string) => void;
}

const ENERGY_KEYWORDS = ['energy', 'gas', 'electric', 'e.on', 'eon next', 'edf', 'octopus', 'ovo', 'british gas', 'scottish power', 'bulb', 'shell energy', 'utilita'];
const BROADBAND_MOBILE_KEYWORDS = ['broadband', 'virgin media', 'bt', 'sky', 'talktalk', 'plusnet', 'hyperoptic', 'vodafone', 'ee', 'three', 'o2', 'giffgaff', 'mobile'];

function getRegulationHint(merchantNormalized: string): string | null {
  const lower = merchantNormalized.toLowerCase();

  if (ENERGY_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'Under Ofgem rules, suppliers must give 30 days notice of price changes';
  }

  if (BROADBAND_MOBILE_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'Under Ofcom rules, mid-contract price rises may give you the right to exit penalty-free';
  }

  return null;
}

export default function PriceIncreaseCard({ alert, onDismiss, onAction }: PriceIncreaseCardProps) {
  const cleanName = cleanMerchantName(alert.merchant_name || alert.merchant_normalized);
  const regulationHint = getRegulationHint(cleanName);

  const complaintUrl = `/dashboard/complaints?new=1&company=${encodeURIComponent(cleanName)}&issue=${encodeURIComponent(`price increase from £${alert.old_amount.toFixed(2)} to £${alert.new_amount.toFixed(2)}`)}&alertId=${alert.id}`;

  const dealCategory = ENERGY_KEYWORDS.some(kw => cleanName.toLowerCase().includes(kw)) ? 'energy' :
                       BROADBAND_MOBILE_KEYWORDS.some(kw => cleanName.toLowerCase().includes(kw)) ? 'broadband' :
                       cleanName.toLowerCase().includes('card') ? 'credit' : 'all';

  return (
    <div className="card" style={{ borderColor: '#FCA5A5' }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 40,
              height: 40,
              background: 'var(--rose-wash)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--rose-deep)',
              flexShrink: 0,
            }}
          >
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {cleanName}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {new Date(alert.old_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              {' '}&rarr;{' '}
              {new Date(alert.new_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <span
          className="pill red"
          style={{ padding: '4px 10px', fontSize: 11, whiteSpace: 'nowrap' }}
        >
          +{alert.increase_pct}%
        </span>
      </div>

      {/* Price comparison */}
      <div className="flex items-center gap-3 mb-3">
        <div
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--divider)',
            borderRadius: 10,
            padding: '8px 14px',
            textAlign: 'center',
            flex: 1,
          }}
        >
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>Was</p>
          <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            &pound;{alert.old_amount.toFixed(2)}
          </p>
        </div>
        <ArrowRight className="h-4 w-4" style={{ color: 'var(--rose-deep)', flexShrink: 0 }} />
        <div
          style={{
            background: 'var(--rose-wash)',
            border: '1px solid #FCA5A5',
            borderRadius: 10,
            padding: '8px 14px',
            textAlign: 'center',
            flex: 1,
          }}
        >
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>Now</p>
          <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: 'var(--rose-deep)' }}>
            &pound;{alert.new_amount.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Annual impact */}
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 10px' }}>
        This costs you{' '}
        <span style={{ color: 'var(--orange-deep)', fontWeight: 700 }}>
          &pound;{alert.annual_impact.toFixed(2)} more per year
        </span>
      </p>

      {/* Regulation hint */}
      {regulationHint && (
        <div
          style={{
            background: 'var(--blue-wash)',
            border: '1px solid #BFDBFE',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: 'var(--blue-deep)' }}>{regulationHint}</p>
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingTop: 12,
          borderTop: '1px solid var(--divider-2)',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href={complaintUrl}
          onClick={() => onAction(alert.id)}
          className="cta-danger"
          style={{ fontSize: 12, padding: '7px 11px' }}
        >
          <FileText className="h-3 w-3" /> Start dispute
        </Link>
        <Link
          href={`/dashboard/deals?category=${dealCategory}`}
          className="cta-ghost"
          style={{ fontSize: 12, padding: '7px 11px' }}
        >
          <ArrowRight className="h-3 w-3" /> Find better deal
        </Link>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => onDismiss(alert.id)}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--text-3)',
            fontSize: 11.5,
            cursor: 'pointer',
            padding: '6px 8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <X className="h-3 w-3" /> Dismiss
        </button>
      </div>
    </div>
  );
}
