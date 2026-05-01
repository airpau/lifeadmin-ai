# Consumer dispute API review — 2026-05-01

Companion to `test/compliance-engine-e2e-and-consumer-api-review`.
Catalogues the consumer-facing dispute / complaint surface, gap-tests
freshness exposure vs B2B `/v1/disputes`, and recommends one path
forward.

## Consumer dispute API surface

All routes sit under `src/app/api/`, gated by Supabase session cookie.
None currently emits a typed `legal_basis_freshness`. None routes
through `loadFreshLegalRefs` on master (the gate ships in the in-flight
`feat/dispute-flows-freshness-gate` PR).

| Method | Path | Role | Returns | Freshness? | Via gate? |
|---|---|---|---|---|---|
| GET / POST | `/api/disputes` | List user disputes / create from form | dispute rows / new row | no | no |
| GET / PUT / DELETE | `/api/disputes/[id]` | Read / status / delete | dispute + correspondence | no | no |
| POST | `/api/disputes/from-email` | Email thread → dispute + draft | `{ dispute, draftLetter }` | no | indirect |
| POST | `/api/disputes/from-email/preview` | Same, no persistence | preview JSON | no | indirect |
| POST | `/api/disputes/save-letter` | Persist a generated letter | dispute row | no | no |
| POST | `/api/disputes/refine-letter` | Streaming refine | streamed text | no | no |
| POST | `/api/disputes/sync-emails`, `/api/disputes/[id]/sync-replies-now` | Pull replies | counts | n/a | n/a |
| POST | `/api/disputes/[id]/letter-sent` | Mark sent + start FCA clock | row | no | no |
| POST | `/api/disputes/[id]/outcome` | Tag won/partial/lost | row | n/a | n/a |
| GET / POST | `/api/disputes/[id]/correspondence` | Thread log | rows | n/a | n/a |
| POST / GET | `/api/disputes/[id]/agent-decision`, `/agent-decisions/latest` | Approve / fetch agent rec | row | n/a | n/a |
| GET | `/api/disputes/[id]/ai-overview` | LLM state summary | summary | n/a | n/a |
| POST | `/api/disputes/[id]/upload` | Attachment | row | n/a | n/a |
| POST | `/api/complaints/generate` | The B2C draft engine — calls `generateComplaintLetter` | `{ subject, letter, citations, taskId, rightsPills, pendingLegalUpdates }` | partial — `pendingLegalUpdates` flags refs awaiting founder approval, no per-ref `last_verified_at`/`is_stale` | yes (post-PR) |
| GET / POST | `/api/complaints/[id]/...` | Approve / fetch letter | letter + meta | no | no |
| GET | `/api/complaints/usage` | Plan-limit counter | `{ used, limit }` | n/a | n/a |
| POST | `/api/mcp/disputes` | MCP bridge for Paybacker Assistant (Pro) | dispute payload | no | indirect |

Shapes are ad-hoc per route. There is no consumer equivalent of
`DisputeResponse` (`src/lib/b2b/disputes.ts`) — each route returns
whatever the screen needs.

## Gap analysis vs B2B

B2B publishes (post-PR) `legal_basis_freshness: Array<{ ref_id,
last_verified_at, source, is_stale }>` so a CX agent's CRM can render
"verified 3 days ago" or block on a stale citation. Consumer returns
nothing analogous. The closest signal, `pendingLegalUpdates` from
`/api/complaints/generate`, only flags "founder approval queued" — no
per-ref `last_verified_at`, no `is_stale`, no source attribution.

The admin compliance page renders freshness signals (auto-corrected
amber tint, "What needs your attention"), but the consumer dispute UI
has no per-citation "verified" badge today. Once the gate is wired
into `generateComplaintLetter`, the engine has the data — but the API
doesn't pipe it to the client.

The bigger smell is shape mismatch. B2B is a contract under `/v2`-
discipline; consumer routes mutate freely. Adding the field to one
route doesn't help — the dashboard would have to special-case which
endpoint produced which dispute to find it.

## Recommendation: option (b) — separate citations lookup

**Add `GET /api/disputes/[id]/citations`** rather than fattening every
write route.

1. Consumer routes are shape-volatile. Four write paths (`generate`,
   `from-email`, `refine-letter`, `save-letter`) vs B2B's one — a
   single read endpoint is one surface to evolve.
2. Letters draft infrequently; dispute detail re-renders on every
   dashboard visit. Freshness should update when compliance-sync
   re-verifies a ref, without re-running the LLM.
3. `/api/complaints/generate` already runs ~120s worst case. Padding
   the hot path with structured freshness is the wrong place; a
   cached read endpoint is cheaper.
4. Mirrors the admin pattern: separate "draft action" from
   "compliance state".

Shape (additive, field names mirror B2B so the dashboard can share
types):

```ts
GET /api/disputes/[id]/citations
=> { citations: Array<{
       ref_id: string; law_name: string; section: string | null;
       source_url: string; last_verified_at: string;
       source: 'legislation.gov.uk' | 'gov.uk' | 'other';
       is_stale: boolean;
       was_auto_corrected?: boolean;
       pending_correction?: boolean;
     }> }
```

## Future-proofing for native iOS / Android (per `project_native_apps`)

Capacitor wrapper will hit the same Supabase session auth. The consumer
dispute routes are stable enough to expose **except**:

- `/api/disputes/refine-letter` streams text — Capacitor HTTP doesn't
  stream. Add a `?stream=false` non-streaming fallback before native
  ships.
- `/api/disputes/[id]/upload` uses multipart — needs Capacitor
  Filesystem + Http, not raw `FormData` fetch.
- `/api/disputes/from-email` depends on Gmail/Outlook OAuth via web
  redirects. Native needs `ASWebAuthenticationSession` (iOS) /
  Custom Tabs (Android) — API is fine; auth bootstrap isn't.
- Routes assume cookie auth; native should pin to Supabase access
  tokens via the JS client.
- Shape volatility is the real risk. Formalise a typed
  `ConsumerDisputeResponse` in `src/lib/consumer/disputes.ts`
  (mirroring `DisputeResponse`'s discipline) before native ships, so
  additive changes don't break older app builds. Cheaper than
  versioning routes as `/api/v1c/...`.

`/citations` is itself a clean candidate for the native badge UX —
small payload, cacheable, versionable independently of the engine.
