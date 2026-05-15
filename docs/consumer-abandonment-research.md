# Consumer abandonment nurture — research findings

Research for the B2C abandoned-cart / abandoned-checkout nurture CRM. B2B path is unaffected (founder-direct alerts remain).

## 1. Email sequence timing — the playbook

Top consumer-finance / SaaS / e-commerce companies converge on a **3–4 email** sequence over 7 days. Klaviyo's documented best practice (used by 100k+ brands) is:

| Email | Delay from abandonment | Purpose |
|-------|-----------------------|---------|
| 1 | 1–4 hours | Soft reminder. Highest open rate (40–50%). |
| 2 | 24 hours after #1 (~T+25h) | Value / proof. Address objections. |
| 3 | 48–72 hours after #2 (~T+72–96h) | First incentive (discount). |
| 4 (optional) | T+7 days | Final touch. Last call. |

Klaviyo's data show that continuing to email beyond ~72 hours generates more unsubscribes than conversions, so the 4th email is optional and should be light. Customer.io and Drip recommend the same shape.

For a SaaS-style monthly subscription (LifeAdmin / Paybacker), the "considered purchase" framing applies — so we lean toward the slower edge: **T+1h → T+24h → T+72h → T+7d**.

Source: [Klaviyo Help Center — abandoned cart flow](https://help.klaviyo.com/hc/en-us/articles/115002779411), [Shopify abandoned cart 2026](https://www.shopify.com/blog/abandoned-cart-emails), [Klaviyo Consulting best practices](https://klaviyoconsulting.com/abandoned-cart-best-practices-klaviyo/).

## 2. When does the discount fire?

Strong consensus across Klaviyo, Drip, Customer.io, Rejoiner: **never on email 1, ideally email 2 or 3**. Sending the discount on email 1 trains repeat customers to abandon-and-wait. The accepted pattern is:

- Email 1 = soft reminder, no discount
- Email 2 = value-led nudge ("here's why people pick Pro"), still no discount
- Email 3 = first concrete incentive (10% off, code expires in 7 days)
- Email 4 = final reminder the code is about to expire

Source: [Rejoiner abandoned-cart statistics & strategy](https://www.rejoiner.com/resources/abandoned-cart-email-statistics), [Customer.io 7 abandoned-cart examples](https://customer.io/blog/abandoned-app-emails/).

## 3. Plain-text vs HTML

Mixed evidence. Plain-text feels personal; HTML lifts CTR with a strong button. The Resend + B2B norm (and what we already do for `dispute-reminders.ts`) is **HTML with a plain-text fallback** — Resend supports both fields. We keep HTML simple (one column, one CTA, no marketing imagery), which combines the personal feel with a clickable CTA.

## 4. Subject lines

Patterns that consistently top open-rate league tables:

- **Personal + open question**: "Did you forget something, {name}?"
- **Curiosity / value**: "Quick thought on the Pro plan"
- **Time-bounded discount**: "10% off LifeAdmin — expires in 7 days"
- **Final / last-chance**: "Last call: your 10% code expires tomorrow"

Avoid clickbait, all-caps, and emoji-heavy subjects — Gmail's promotion-tab heuristics drop these.

## 5. UK PECR / GDPR — lawful basis

This is the load-bearing piece. The ICO's published position (March 2026 update post Data (Use and Access) Act):

- **Marketing email to a consumer** requires either (a) prior consent or (b) the **soft opt-in** under PECR reg. 22(3).
- The soft opt-in applies when **all** of these are true:
  1. The recipient's contact details were obtained "in the course of a sale or negotiations for the sale of a product or service" — clicking "Subscribe" on a pricing page or starting a Stripe Checkout clearly meets this bar.
  2. The marketing relates to **similar products or services** — emails about the same SaaS plan they tried to subscribe to, definitely.
  3. The recipient was given a **simple opt-out at the point of collection** and **in every subsequent email**.

That's a clean fit for cart-abandonment nurture, provided we (i) flag at the pricing-page email-capture point that we may follow up by email, (ii) include a one-click unsubscribe in every send, and (iii) honour unsubscribes within 28 days (we honour immediately).

Critically: legitimate-interest is **not on its own sufficient** for B2C marketing email under PECR — PECR overrides UK GDPR's lawful-basis menu for electronic marketing. So the framing in the design doc must say "soft opt-in (PECR reg. 22(3))" not "legitimate interest" for the marketing-flavoured emails. The first reminder (email 1) can lean transactional ("you started a checkout — here's how to finish"), but emails 2–4 are clearly marketing and rely on soft opt-in.

Source: [ICO — sending direct marketing: choosing your lawful basis](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/sending-direct-marketing-choosing-your-lawful-basis/), [ICO — electronic mail marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/), [Data Protection Network — UK email marketing rules](https://dpnetwork.org.uk/email-marketing-rules/).

## 6. Could we just use Stripe Recover instead?

Stripe Checkout's built-in `after_expiration.recovery` feature does fire a `checkout.session.expired` webhook with a `recovery_url` and supports a single recovery email per session, optionally with a promotion code. It's effectively a one-shot fallback, not a nurture sequence — no segmentation, no funnel stages, no admin dashboard, no second/third email cadence.

**Decision: use it as a data source (we already get `checkout.session.expired`), but the nurture sequence and CRM are ours.** That's also what every comparable SaaS with a real growth team does — Stripe Recover is too thin for serious lifecycle marketing.

Source: [Stripe Docs — recover abandoned carts](https://docs.stripe.com/payments/checkout/abandoned-carts), [Stripe — what is cart abandonment](https://stripe.com/resources/more/what-is-cart-abandonment).

## 7. Conversion benchmarks to anchor expectations

- Industry abandoned-cart email **recovery rate**: 8–12% of captured leads convert (Stripo, Rejoiner medians).
- SaaS opt-in trial → paid: ~18% (Pulseahead). For us, the relevant denominator is "captured abandonment leads", and a 6–10% recovery is realistic in year one.
- Email 1 typically drives ~50% of total recovered revenue in a 3-email sequence; email 3 (with discount) drives ~30%; email 2 drives the rest.
- Cost per send via Resend ≈ £0.0004. A 4-email nurture costs ~£0.0016 per lead — economics are trivial relative to the £4.99–£9.99 MRR at stake.

Source: [Stripo — abandoned cart email statistics 2026](https://stripo.email/blog/abandoned-cart-email-statistics-insights-and-key-metrics-for-boosting-conversions/), [Pulseahead — trial-to-paid SaaS benchmarks](https://www.pulseahead.com/blog/trial-to-paid-conversion-benchmarks-in-saas).

## 8. Open questions (resolved in design doc)

1. Sequence: T+1h → T+24h → T+72h → T+7d. Daily cron at 10:00 UTC inspects each lead's age + email_count.
2. Discount fires on email 3, expires 7 days later (Stripe coupon `redeem_by`).
3. HTML with plain-text alternative (Resend dual-field).
4. Subject lines per the patterns above — picked four below.
5. PECR soft opt-in (reg. 22(3)) — not pure legitimate-interest.
6. Stripe Recover used as a webhook input only; we own the sequence + CRM.

## Sources

- [Klaviyo Help — abandoned cart flow](https://help.klaviyo.com/hc/en-us/articles/115002779411)
- [Klaviyo Consulting — best practices](https://klaviyoconsulting.com/abandoned-cart-best-practices-klaviyo/)
- [Shopify — abandoned cart emails 2026](https://www.shopify.com/blog/abandoned-cart-emails)
- [Customer.io — 7 abandoned cart email examples](https://customer.io/blog/abandoned-app-emails/)
- [Rejoiner — statistics & strategy](https://www.rejoiner.com/resources/abandoned-cart-email-statistics)
- [Stripo — abandoned cart email statistics 2026](https://stripo.email/blog/abandoned-cart-email-statistics-insights-and-key-metrics-for-boosting-conversions/)
- [Pulseahead — trial-to-paid conversion benchmarks](https://www.pulseahead.com/blog/trial-to-paid-conversion-benchmarks-in-saas)
- [Stripe Docs — recover abandoned carts](https://docs.stripe.com/payments/checkout/abandoned-carts)
- [Stripe — what is cart abandonment](https://stripe.com/resources/more/what-is-cart-abandonment)
- [ICO — choosing your lawful basis (direct marketing)](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/sending-direct-marketing-choosing-your-lawful-basis/)
- [ICO — electronic mail marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/)
- [Data Protection Network — UK email marketing rules](https://dpnetwork.org.uk/email-marketing-rules/)
