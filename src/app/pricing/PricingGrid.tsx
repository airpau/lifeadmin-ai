'use client';

/**
 * PricingGrid — client-side pricing cards with a monthly/annual toggle.
 *
 * Replaces the three inline <div className="price-card"> blocks on page.tsx.
 * Annual price IDs are already wired into PricingCTA (billingCycle='yearly'),
 * so the toggle only needs to drive (a) displayed price + cadence label and
 * (b) the billingCycle prop passed to PricingCTA.
 *
 * Pricing copy pinned to CLAUDE.md §PRICING:
 *   - Essential £4.99/mo · £44.99/year (saves £14.89)
 *   - Pro       £9.99/mo · £94.99/year (saves £24.89)
 * CTAs deliberately avoid any "14-day trial" language — per CLAUDE.md the
 * Pro trial was removed because it produced silent downgrades at expiry.
 */

import { useState } from 'react';
import PricingCTA from './PricingCTA';

type Cycle = 'monthly' | 'yearly';

export default function PricingGrid() {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const isYearly = cycle === 'yearly';

  return (
    <>
      <div className="billing-toggle-wrap">
        <div className="billing-toggle" role="radiogroup" aria-label="Billing period">
          <button
            type="button"
            role="radio"
            aria-checked={!isYearly}
            className={`billing-toggle__opt ${!isYearly ? 'is-active' : ''}`}
            onClick={() => setCycle('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isYearly}
            className={`billing-toggle__opt ${isYearly ? 'is-active' : ''}`}
            onClick={() => setCycle('yearly')}
          >
            Yearly <span className="billing-toggle__save">save ~25%</span>
          </button>
        </div>
      </div>

      <div className="pricing-grid">
        <div className="price-card">
          <div className="tier">Free</div>
          <div className="price">
            £0<span className="per">/forever</span>
          </div>
          <div className="founding" style={{ visibility: 'hidden' }}>—</div>
          <ul>
            <li>3 AI dispute letters / month</li>
            <li>Manual subscription tracker</li>
            <li>Public deals marketplace</li>
          </ul>
          <PricingCTA
            plan="free"
            className="btn btn-ghost cta"
            style={{ justifyContent: 'center' }}
          >
            Start free →
          </PricingCTA>
        </div>

        <div className="price-card featured">
          <span className="ribbon">Most popular</span>
          <div className="tier">Essential</div>
          <div className="price">
            {isYearly ? '£44.99' : '£4.99'}
            <span className="per">{isYearly ? '/year' : '/month'}</span>
          </div>
          <div className="founding">
            {isYearly ? 'Saves £14.89 vs monthly' : 'Founding member · locked-in forever'}
          </div>
          <ul>
            <li>Unlimited AI dispute letters</li>
            <li>Bank sync — 2 accounts</li>
            <li>Email inbox scan</li>
            <li>Pocket Agent in Telegram</li>
          </ul>
          <PricingCTA
            plan="essential"
            billingCycle={cycle}
            className="btn btn-mint cta"
            style={{ justifyContent: 'center' }}
          >
            Start Essential →
          </PricingCTA>
        </div>

        <div className="price-card">
          <div className="tier">Pro</div>
          <div className="price">
            {isYearly ? '£94.99' : '£9.99'}
            <span className="per">{isYearly ? '/year' : '/month'}</span>
          </div>
          <div className="founding">
            {isYearly ? 'Saves £24.89 vs monthly' : 'Founding member · locked-in forever'}
          </div>
          <ul>
            <li>Everything in Essential</li>
            <li>Unlimited bank &amp; email connections</li>
            <li>Deal alerts on bill changes</li>
            <li>Priority human review on complex disputes</li>
          </ul>
          <PricingCTA
            plan="pro"
            billingCycle={cycle}
            className="btn btn-ghost cta"
            style={{ justifyContent: 'center' }}
          >
            Start Pro →
          </PricingCTA>
        </div>
      </div>
    </>
  );
}
