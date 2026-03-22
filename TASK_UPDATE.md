# TASK UPDATE — Homepage Strategy & Plan Positioning

## Flight Delay Compensation (£520 Stat)

**DECISION: Keep on homepage BUT reposition**

Current text: "Maximum flight delay compensation under UK261"
New text: "Up to £520 for flight delays (EU261/UK261 rights)"

**Implementation:**
- Add flight delay as a detectable inbox scanner opportunity
- Create complaint letter template for flight delays (existing system can handle)
- Add logic to detect flight delay emails (keywords: "flight delayed", "EU261", "compensation", airline names)
- Route to complaint generator with flight-specific context

**Do NOT build dedicated flight UI yet** — use existing complaint flow with enhanced context.

---

## Inbox Scanning on Free Plan

**DECISION: Keep Essential+ only (do NOT add to Free)**

**Rationale:**
- Inbox scanning is the KEY upsell trigger — users see value when they find hidden subscriptions
- Giving it free devalues Essential tier (£9.99/mo)
- Free tier = "try before you buy" with manual complaints
- Essential = automation and discovery

**Alternative considered:** 1 scan/month on Free — REJECTED. Too generous.

---

## Service Positioning Update

Update homepage messaging:

| Tier | Old | New |
|------|-----|-----|
| **Free** | "Start free" | "Try Paybacker with 3 complaint letters. See what we can do." |
| **Essential** | "Unlimited complaints" | "Let Paybacker scan your inbox, find subscriptions, and cancel them automatically" |
| **Pro** | "Open Banking" | "Full financial picture with Open Banking + spending insights" |

Focus on the **transformation** not the features.

---

## Next Actions

1. **Homepage copy update** — Reposition £520 stat, update tier descriptions
2. **Inbox scanner** — Add flight delay detection patterns
3. **Complaint templates** — Add flight delay/EU261 specific template
4. **Plan gating confirmation** — Ensure inbox scanning is Essential+ only

---

## Questions for Paul

1. Should the flight delay complaint template ask for specific fields (flight number, delay duration, booking ref)?
2. Any other "hidden" consumer rights to highlight on homepage (e.g., Section 75 claims, council tax banding)?
3. Keep the "£312 average wasted on subscriptions" stat? This is strong.

Priority: Homepage copy first, then inbox scanner logic.
