'use client';

/**
 * PricingGrid — pricing cards with a monthly/annual toggle.
 *
 * Layout
 * ------
 * Row 1  Free · Essential · Pro       the single-person ladder
 * Row 2  Household · Ombudsman pack   more ways to buy
 *
 * Row 2 exists because both of its products are bought for a different
 * reason than row 1. Household is bought because more than one person in
 * the house needs Paybacker; the escalation pack is bought because one
 * dispute needs escalating. Neither is "a bigger Pro", so neither belongs
 * in the row-1 ladder where visitors read the cards as a straight upgrade
 * path.
 *
 * Prices are pinned to CLAUDE.md §PRICING and read from TIER_PRICE_GBP in
 * @/lib/tier-rank, which is the same table the Stripe webhook uses to
 * report sale amounts. Hardcoding them here is how the old version ended
 * up with a card saying one thing and analytics reporting another.
 *
 *   Essential £4.99/mo  · £44.99/yr
 *   Pro       £9.99/mo  · £94.99/yr
 *   Household £19.99/mo · £199.99/yr   (up to 4 people)
 *   Ombudsman escalation pack — £14.99 one-off, no subscription
 *
 * Savings are COMPUTED, not written down, so a price change cannot leave a
 * stale "saves £14.89" behind. The toggle badge says "save up to N%"
 * because the tiers do not save the same percentage: Essential is about
 * 25% off, Pro about 21%, Household about 17%.
 *
 * ---------------------------------------------------------------------
 * WHAT THE HOUSEHOLD CARD MAY AND MAY NOT CLAIM
 * ---------------------------------------------------------------------
 * MAY:  four seats, four separate logins, complete data isolation between
 *       members, one bill, about £5 a head at four people.
 * MAY NOT:
 *   - "Cheaper for a couple." It is not. £19.99 is a penny more than two
 *     Pro subscriptions (2 x £9.99 = £19.98). For two people the honest
 *     pitch is one bill and room to add two more, never a saving.
 *   - Priority queues, faster Watchdog polling, or included escalation
 *     packs. Household is entitlement-identical to Pro (see PLAN_LIMITS),
 *     and packs are £14.99 one-off on every plan including Free.
 *   - Any outcome, success rate or recovery promise.
 *
 * CTAs deliberately avoid any "14-day trial" language — per CLAUDE.md the
 * Pro trial was removed because it produced silent downgrades at expiry.
 *
 * NEXT_PUBLIC_HOUSEHOLD_PLAN_ENABLED is gone: the flag existed only
 * because there was no member-management UI to fill the seats. That UI now
 * ships at /dashboard/settings/household, so the card is unconditional.
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

export default function PricingGrid() {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const isYearly = cycle === 'yearly';

  // "Save up to N%" — computed from the best saving on offer so the badge
  // can never overstate. Essential is currently the winner at about 25%.
  const bestSaving = Math.max(
    saving('essential').savedPercent,
    saving('pro').savedPercent,
    saving('household').savedPercent,
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
          Row 2 — bought for a different reason than row 1. See the file
          header for what the Household card may and may not claim.
          --------------------------------------------------------------- */}
      <div className="recovery-band">
        <div className="recovery-band__head">
          <h3 className="recovery-band__title">More than one of you? Escalating a dispute?</h3>
          <p className="recovery-band__sub">
            Two things people ask us for that are not a bigger version of Pro:
            cover for everyone in the house, and a one-off pack for the dispute
            that needs escalating.
          </p>
        </div>

        <div className="pricing-grid pricing-grid--recovery">
          <div className="price-card price-card--recovery">
            <div className="tier">Household</div>
            <Price tier="household" isYearly={isYearly} />
            <AnnualLine tier="household" isYearly={isYearly} />
            <ul>
              <li>
                Everything in Pro, for up to <strong>4 people</strong>. Couples,
                families, flatmates, whoever shares the bills
              </li>
              <li>Each person gets their own login and their own account</li>
              <li>
                <strong>Nobody sees anyone else&rsquo;s money.</strong> Accounts,
                transactions, budgets and disputes stay completely private to
                each person
              </li>
              <li>One bill, one card, one renewal date</li>
              <li>
                {gbp(TIER_PRICE_GBP.household.monthly / 4)} each a month with four
                people. Start with two and add the others whenever you like
              </li>
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

          {/* Not a subscription. Rendered as a card so it sits in the same
              consideration set as a plan, because "pay once for this one
              dispute" is a real alternative to upgrading. */}
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
          can bundle the right evidence. The price is the same £14.99 on every
          plan including Free, and no plan includes them.
        </p>
      </div>
    </>
  );
}
