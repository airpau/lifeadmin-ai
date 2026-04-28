# SCOPE — B2B helpers

Everything under `src/lib/b2b/` is shared infrastructure for the **B2B UK Consumer Rights API**. Read CLAUDE.md "Surface check" before editing.

## What lives here

- `auth.ts` — bearer-token authentication, monthly rate-limit enforcement, `logUsage` for audit
- `disputes.ts` — `/v1/disputes` request validation, `resolveDispute` that wraps the shared `generateComplaintLetter` engine, sector classification, regulator lookup, escalation routing
- `key-reveal.ts` — single-use plaintext key reveal via signed email link
- `password.ts`, `session.ts` — customer-portal auth primitives
- `audit.ts` — append-only audit trail for portal actions
- `stripe-webhook.ts` — Stripe `checkout.session.*` and subscription lifecycle handlers (idempotent on `checkout.session.completed`)

## Voice

When writing copy that surfaces in API responses, error messages, or customer-portal UI:

- **Engineering-buyer voice.** "Invalid JSON body" not "Oops, something went wrong".
- **Reference the contract.** Cite the field name, the section number, the docs URL.
- **No consumer empathy.** B2B customers want a stack trace, not reassurance.

## API contract rules (DisputeResponse + DisputeRequest)

The `DisputeResponse` shape in `disputes.ts` is a **public contract**. External customers parse it.

- Additive optional fields are fine.
- Renaming, removing, or changing the type of any existing field requires `/v2`.
- New `dispute_type` enum values are additive and safe.
- New `regulator` strings are additive and safe.

The `DisputeRequest` shape allows both legacy (`consumer_name`) and modern (`customer_name`) field names. Don't drop the legacy alias.

## Tier model

B2B uses its own tier in `b2b_api_keys.tier` (`starter` | `growth` | `enterprise`). Do not import `getEffectiveTier`, `canUseWhatsApp`, or `PLAN_LIMITS` from `src/lib/plan-limits.ts` — those are consumer-tier helpers and treating a B2B key like a consumer subscription will misroute.

## Shared engine

`generateComplaintLetter` from `src/lib/agents/complaints-agent.ts` is the **only** shared helper between consumer and B2B. Any change to its contract must keep both call-sites working. Run `grep -r "generateComplaintLetter" src/` before touching it.

## Stripe routing

B2B Stripe checkouts carry `metadata.product = 'b2b_api'`. The webhook in `stripe-webhook.ts` only processes events with that metadata. The consumer Stripe webhook (`src/app/api/webhooks/stripe/route.ts`) is separate.
