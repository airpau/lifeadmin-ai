'use client';

/**
 * PricingGrid — pricing cards with a monthly/annual toggle.
 *
 * Layout
 * ------
 * Row 1  Free · Essential · Pro          the tracking-and-letters ladder
 * Row 2  Dispute Pro · Ombudsman pack    the recovery ladder
 *        (· Household, when enabled)
 *
 * The split is the whole point of the repositioning. Willingness to pay
 * for a dispute anchors to the recovery amount (£100 to £520 a case), not
 * to a budgeting app, so a flat £9.99 for unlimited access leaves money on
 * the table. But the tracking-only audience must keep seeing the low
 * headline price, which is why Free/Essential/Pro stay untouched at the
 * top and the higher-value products sit in a clearly separate band below.
 *
 * Prices are pinned to CLAUDE.md §PRICING and read from TIER_PRICE_GBP in
 * @/lib/tier-rank, which is the same table the Stripe webhook uses to
 * report sale amounts. Hardcoding them here is how the old version ended
 * up with a card saying one thing and analytics reporting another.
 *
 *   Essential   £4.99/mo  · £44.99/yr
 *   Pro         £9.99/mo  · £94.99/yr
 *   Household   £14.99/mo · £149.99/yr
 *   Dispute Pro £19.99/mo · £199.99/yr
 *   Ombudsman escalation pack — £14.99 one-off, no subscription
 *
 * Savings are COMPUTED, not written down, so a price change cannot leave a
 * stale "saves £14.89" behind. The toggle badge says "save up to 25%"
 * because the tiers do not save the same percentage: Essential is about
 * 25% off, Pro about 21%, Household and Dispute Pro about 17%.
 *
 * CTAs deliberately avoid any "14-day trial" language — per CLAUDE.md the
 * Pro trial was removed because it produced silent downgrades at expiry.
 *
 * The Household card is gated behind NEXT_PUBLIC_HOUSEHOLD_PLAN_ENABLED
 * because there is no member-management UI yet. See src/lib/household.ts.
 */

import { useState } from 'react';
import PricingCTA from './PricingCTA';
import { TIER_PRICE_GBP, ESCALATION_PACK_PRICE_GBP, type PlanTier } from '@/lib/tier-rank';

type Cycle = 'monthly' | 'yearly';

const money = (n: number) => `£${n.toFixed(2)}`;

/** Round to the nearest pound when the pennies are .00, else keep them. */
function gbp(n: number): string {
  return money(n).replace(/\.00$/, '');
}

interface Saving {
  yearly: string;
  monthly: string;
  savedAmount: string;
  savedPercent: number;
}

/**
 * Annual saving for a tier, derived rather than transcribed.
 * `saved = monthly * 12 - yearly`, `percent = saved / (monthly * 12)`.
 */
function saving(tier: Exclude<PlanTier, 'free'>): Saving {
  const { monthly, yearly } = TIER_PRICE_GBP[tier];
  const fullYear = monthly * 12;
  const saved = fullYear - yearly;
  return {
    yearly: money(yearly),
    monthly: money(monthly),
    savedAmount: money(saved),
    savedPercent: Math.round((saved / fullYear) * 100),
  };
}

/**
 * The annual line under each price. Shown on BOTH views deliberately:
 * hiding the annual price behind the toggle meant most visitors never saw
 * it, which is the thing this repositioning is trying to fix.
 */
function AnnualLine({ tier, isYearly }: { tier: Exclude<PlanTier, 'free'>; isYearly: boolean }) {
  const s = saving(tier);
  return (
    <div className="founding">
      {isYearly
        ? `Billed once · saves ${s.savedAmount} · about ${s.savedPercent}% off`
        : `or ${s.yearly} a year · saves ${s.savedAmount} · about ${s.savedPercent}% off`}
    </div>
  );
}

function Price({ tier, isYearly }: { tier: Exclude<PlanTier, 'free'>; isYearly: boolean }) {
  const s = saving(tier);
  return (
    <div className="price">
      {isYearly ? s.yearly : s.monthly}
      <span className="per">{isYearly ? '/year' : '/month'}</span>
    </div>
  );
}

const HOUSEHOLD_ENABLED = process.env.NEXT_PUBLIC_HOUSEHOLD_PLAN_ENABLED === 'true';

export default function PricingGrid() {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const isYearly = cycle === 'yearly';

  // "Save up to N%" — computed from the best saving on offer so the badge
  // can never overstate. Essential is currently the winner at about 25%.
  const bestSaving = Math.max(
    saving('essential').savedPercent,
    saving('pro').savedPercent,
    saving('household').savedPercent,
    saving('dispute_pro').savedPercent,
  );

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
            Yearly <span className="billing-toggle__save">save up to {bestSaving}%</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------
          Row 1 — the tracking-and-letters ladder. Unchanged pricing.
          --------------------------------------------------------------- */}
      <div className="pricing-grid">
        <div className="price-card">
          <div className="tier">Free</div>
          <div className="price">
            £0<span className="per">/forever</span>
          </div>
          <div className="founding" style={{ visibility: 'hidden' }}>—</div>
          <ul>
            <li>3 AI dispute letters / month</li>
            <li>2 bank accounts · daily auto-sync</li>
            <li>Manual subscription tracker</li>
            <li>Public deals marketplace</li>
            <li>Telegram Pocket Agent + AI chatbot</li>
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
          <Price tier="essential" isYearly={isYearly} />
          <AnnualLine tier="essential" isYearly={isYearly} />
          <ul>
            <li>Unlimited AI dispute letters</li>
            <li>Bank sync — 3 accounts</li>
            <li>Email inbox scan — 3 accounts</li>
            <li>Pocket Agent in Telegram</li>
            <li>Renewal reminders &amp; price-increase alerts</li>
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
          <Price tier="pro" isYearly={isYearly} />
          <AnnualLine tier="pro" isYearly={isYearly} />
          <ul>
            <li>Everything in Essential</li>
            <li>Unlimited bank &amp; email connections</li>
            <li><strong>Unlimited Spaces</strong> — group personal, business and joint accounts separately in Money Hub</li>
            <li><strong>Pocket Agent on WhatsApp</strong> — instant alerts &amp; replies</li>
            <li>Daily morning brief &amp; weekly recovery digest</li>
            <li>Watchdog checks your inbox every 30 minutes</li>
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

      {/* ---------------------------------------------------------------
          Row 2 — the recovery band. Priced against what a win is worth,
          not against a budgeting app.
          --------------------------------------------------------------- */}
      <div className="recovery-band">
        <div className="recovery-band__head">
          <h3 className="recovery-band__title">Actively chasing money back?</h3>
          <p className="recovery-band__sub">
            A single upheld dispute is typically worth £100 to £520. These are
            priced against that, not against a subscription tracker.
          </p>
        </div>

        <div className={`pricing-grid pricing-grid--recovery${HOUSEHOLD_ENABLED ? ' is-three-up' : ''}`}>
          {HOUSEHOLD_ENABLED && (
            <div className="price-card price-card--recovery">
              <div className="tier">Household</div>
              <Price tier="household" isYearly={isYearly} />
              <AnnualLine tier="household" isYearly={isYearly} />
              <ul>
                <li>Everything in Pro, for up to <strong>4 people</strong></li>
                <li>Each member gets their own login</li>
                <li>
                  <strong>Nobody sees anyone else&rsquo;s money.</strong> Accounts,
                  transactions, budgets and disputes stay completely private to
                  each member
                </li>
                <li>One bill, one card, one renewal date</li>
                <li>Works out at {gbp(TIER_PRICE_GBP.household.monthly / 4)} per person a month</li>
              </ul>
              <PricingCTA
                plan="household"
                billingCycle={cycle}
                className="btn btn-ghost cta"
                style={{ justifyContent: 'center' }}
              >
                Start Household →
              </PricingCTA>
            </div>
          )}

          {/* Not a subscription. Rendered as a card so it sits in the same
              consideration set as Dispute Pro, which is the actual choice
              a mid-dispute user is making: pay once now, or subscribe. */}
          <div className="price-card price-card--oneoff">
            <div className="tier">Ombudsman escalation pack</div>
            <div className="price">
              {gbp(ESCALATION_PACK_PRICE_GBP)}<span className="per">one-off</span>
            </div>
            <div className="founding">No subscription · available on every plan</div>
            <ul>
              <li>We work out which ombudsman covers your dispute, and whether you are eligible yet</li>
              <li>A referral letter drafted for that body, citing the law your case turns on</li>
              <li>Your whole correspondence thread bundled as numbered exhibits</li>
              <li>The eight-week clock and the referral window tracked for you</li>
              <li>Buy it for one dispute, when you need it</li>
            </ul>
            <a
              className="btn btn-ghost cta"
              style={{ justifyContent: 'center' }}
              href="/dashboard/disputes"
            >
              Buy from your dispute →
            </a>
          </div>
        </div>

        <p className="recovery-band__foot">
          Escalation packs are sold from inside the dispute they apply to, so we
          can bundle the right evidence. Free and Essential members can buy one
          without upgrading.
        </p>
      </div>
    </>
  );
}
