# SCOPE — B2B engineering-buyer surface

Everything under `src/app/for-business/` is the **B2B UK Consumer Rights API** marketing and customer-facing surface. Read CLAUDE.md "Surface check" before editing.

## Audience

UK fintechs, neobanks, BNPL, lenders, insurers, MGAs, energy/broadband/mobile retailers, flight-delay claims platforms, OTAs, CX automation vendors, AI agent builders. Engineering buyers, not consumers.

## Voice

- **Precise, evidence-led, no consumer empathy.** Talk request shape, response shape, latency, error contract, integration cost, throughput, idempotency, audit trail.
- **No "fight unfair bills" framing.** No household savings anecdotes. No "you've been overcharged" copy.
- **Examples must be business workflows.** A worked example is not just a consumer scenario as an input — it's the full integration story (inbound ticket → POST /v1/disputes → what the business does with the response → escalation path).

## What lives here

- `page.tsx` — marketing landing
- `docs/page.tsx` — API manual
- `coverage/page.tsx` — public statute index (server-rendered from `legal_references`)
- `thanks/page.tsx` — post-Stripe-checkout landing
- `WaitlistForm.tsx`, `BuyButtons.tsx` — components scoped to this surface
- `styles.css` — scoped under `.m-business-root`; do not let consumer Tailwind bleed in

## Linked B2B paths

- `src/lib/b2b/**` — B2B helpers (auth, disputes contract, key reveal, audit, Stripe webhook)
- `src/app/api/v1/**` — public API endpoints (`/disputes`, `/checkout`, `/free-pilot`, `/portal-*`)
- `src/app/dashboard/api-keys/**` — token-gated customer portal (passwordless email login)
- `src/app/dashboard/admin/b2b/**` — founder admin dashboard

## Decision criterion (founder-defined)

If `/for-business` produces 10+ qualified UK fintech / platform signups in 30 days post-launch (≈ 28 May 2026), green-light deeper B2B build. Otherwise this surface gets archived.

## Rules

1. Never link consumer dashboards from B2B surfaces.
2. Never copy consumer marketing copy into B2B surfaces.
3. Never call consumer-tier helpers (`canUseWhatsApp`, `getEffectiveTier`, `PLAN_LIMITS`) from B2B routes — B2B uses its own tier model in `b2b_api_keys.tier`.
4. The B2B response shape (`DisputeResponse`) is a public contract — additive optional fields only, no breaking changes without `/v2`.
