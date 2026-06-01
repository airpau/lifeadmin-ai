# Closed-Loop Architecture for Paybacker

> Every meaningful action the system takes must be measurable. Every measurement must feed a learning step. Every learning step must shape future actions. The AI is the layer that decides — and the layer that consults the ledger before deciding.

Status: **proposal**, 2026-05-29. Written by Claude in conversation with Paul. No code shipped from this document yet.

---

## 1. Executive summary

Paybacker today has **three robust closed loops**, **three half-built loops** (signal captured, application not yet wired), and **at least nine open loops** where the system fires off actions and never measures whether they worked. The roadmap below proposes:

1. A unified `intelligence_events` ledger — one row per consequential action, one update per observed outcome.
2. A small set of per-domain aggregator crons that roll events into precision/recall stats.
3. A thin "intelligence layer" SDK that every decision point — alert dispatcher, letter generator, deal recommender, AI agent prompt builder — calls before firing, to check the historical performance of similar actions.
4. A founder-facing admin dashboard tile per loop, showing what's working, what isn't, and what's auto-improving.

Estimated effort: 1 week to ship Phase 1 (one loop end-to-end + the foundation), 4 weeks to reach Phase 4 (every open loop closed). No new infrastructure beyond Supabase + the existing Vercel crons. No new external services.

---

## 2. Current state — the map

### 2.1 Robust closed loops (working today)

| Loop | Action | Measurement | Learning step | Application |
|---|---|---|---|---|
| **Merchant categorisation** | Bank sync categorises a txn | User recategorises in dashboard / chat → `merchant_rules.confidence++` | `/api/cron/apply-learned-rules` daily 02:00 UTC | High-confidence rules retro-applied to every uncategorised txn |
| **Dispute outcome intelligence** | `generateComplaintLetter` cites a set of legal refs | User logs dispute outcome (won/partial/lost + £ recovered) → `dispute_outcome_events` | `/api/cron/compute-dispute-intelligence` daily 02:00 UTC → `dispute_intelligence_stats` | `ComplaintInput.historicalSteer` reads merchant-x-legal_ref win rates and surfaces them to Sonnet before drafting |
| **Compliance citation verification** | Sonnet cites a UK statute URL | Perplexity + Haiku verify URL liveness / redirects / amendments | `/api/cron/compliance-sync` daily 03:00 UTC chains: recover-url-dead → audit-authority → discover → enrich → auto-apply low-risk → email punch-list | Engine ingests corrected URLs; founder reviews medium/high-risk via `/dashboard/admin/legal-refs` |

These three are the template. Every future loop should look structurally like one of these.

### 2.2 Half-built loops (signal captured, no automatic application)

| Loop | What exists | What's missing |
|---|---|---|
| **Chatbot gap detection** | `chatbot_question_log` rows; `analyze-chatbot-gaps` cron | Gap analysis writes to `product_features` for human review. No prompt update path. |
| **Agent self-learning** | Tables: `agent_goals`, `agent_predictions`, `agent_feedback_events`, `agent_run_audit` (Mar 2026) | Need to audit whether anything actually writes to or reads from these. Likely aspirational. |
| **Provider intelligence** | `provider_intelligence` table | Used by complaint engine for provider context but no feedback path from outcome → table refinement. |

Action: audit each in Phase 0. Either wire them through or drop the dead tables.

### 2.3 Open loops (gaps the proposal addresses)

| # | Action path | What's missing |
|---|---|---|
| 1 | WhatsApp/Telegram alert dispatch | Engagement (reply keyword) not aggregated per template → can't silence noisy types |
| 2 | Email scan finding emission | No conversion-to-action rate per finding kind |
| 3 | AI chat reply | No 👍/👎 capture → no prompt-tuning signal |
| 4 | Subscription cancellation draft | We don't verify next-billing-date passed without a charge |
| 5 | Onboarding funnel | PostHog tracks steps; nothing reads + tunes copy/CTAs |
| 6 | Bank-sync detection thresholds | Static thresholds; dismissal rate could tune them per merchant |
| 7 | Stripe churn | Cancel webhook caught; no "why" capture or product-decision feed |
| 8 | Affiliate switch conversion | Awin clicks captured, conversion rate not fed back to recommendation ranking |
| 9 | Letter recipient engagement | Sent via user; we never measure response time / outcome downstream |

---

## 3. The proposed architecture

### 3.1 One unified ledger

```sql
-- Strictly additive — every other table stays as-is.
CREATE TABLE IF NOT EXISTS intelligence_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who & when
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  actor           text NOT NULL CHECK (actor IN ('system','user','ai')),
  emitted_at      timestamptz NOT NULL DEFAULT now(),

  -- What
  action_kind     text NOT NULL,
  -- Examples: 'alert_sent', 'letter_drafted', 'cancellation_drafted',
  -- 'scan_finding_emitted', 'deal_recommended', 'chat_reply_sent',
  -- 'dispute_letter_sent', 'detection_fired'

  subject_kind    text,
  subject_id      text,
  -- The thing being acted on, with enough info to find it later.
  -- E.g. ('subscription', 'uuid-of-sub'), ('dispute','uuid'),
  -- ('alert_template', 'paybacker_alert_price_increase').

  -- Prediction (what we expected when we fired the action)
  predicted       jsonb,
  -- E.g. { "expected_win_rate": 0.62, "model": "claude-sonnet-4-6",
  -- "selected_legal_refs": ["CCA s.75", "Ofcom GC 9"] }

  -- Outcome (what actually happened — NULL until measured)
  outcome_kind    text,
  -- 'action_taken' | 'dismissed' | 'ignored' | 'won' | 'lost' |
  -- 'no_response' | 'churned' | 'switched' | 'cancelled'
  outcome         jsonb,
  measured_at     timestamptz,

  -- Free-form context, never load-bearing
  metadata        jsonb
);
CREATE INDEX ON intelligence_events (action_kind, emitted_at DESC);
CREATE INDEX ON intelligence_events (user_id, emitted_at DESC);
CREATE INDEX ON intelligence_events (subject_kind, subject_id);
CREATE INDEX ON intelligence_events (outcome_kind) WHERE outcome_kind IS NOT NULL;

-- Strictly append + measure. We never delete or mutate predicted / action_kind.
```

This single table is the substrate. Every existing table that already does this for one domain (`dispute_outcome_events`, `legal_ref_verifications`, `agent_feedback_events`) stays — but new domains write here first and only get promoted to a dedicated table once volume justifies it.

### 3.2 Aggregator crons

One per action_kind that emits useful per-N-period stats:

```sql
CREATE TABLE IF NOT EXISTS intelligence_stats (
  scope_kind      text NOT NULL,        -- 'alert_template','model','merchant','category'
  scope_value     text NOT NULL,
  window_kind     text NOT NULL,        -- 'day','week','month','all_time'
  window_start    date NOT NULL,
  emitted         integer NOT NULL DEFAULT 0,
  acted_on        integer NOT NULL DEFAULT 0,
  dismissed       integer NOT NULL DEFAULT 0,
  ignored         integer NOT NULL DEFAULT 0,
  won             integer NOT NULL DEFAULT 0,
  lost            integer NOT NULL DEFAULT 0,
  recovered_gbp   numeric(12,2) NOT NULL DEFAULT 0,
  precision_pct   numeric(5,2),          -- acted_on / emitted
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_kind, scope_value, window_kind, window_start)
);
```

Crons:

- `/api/cron/intelligence-rollup-daily` at `15 2 * * *` — yesterday's events into daily rows
- `/api/cron/intelligence-rollup-weekly` at `30 2 * * 1` — Monday-week into weekly rows
- `/api/cron/intelligence-rollup-all-time` at `45 2 * * 0` — Sunday refresh of all-time aggregates

Each cron is a single grouped SQL query per action_kind — cheap.

### 3.3 The intelligence-layer SDK

A thin TypeScript module at `src/lib/intelligence/index.ts`:

```ts
export interface IntelligenceContext {
  userId?: string;
  actionKind: string;
  subjectKind?: string;
  subjectId?: string;
  predicted?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Called BEFORE the action fires. Returns a hint the caller can use.
// Reads intelligence_stats; computes a per-scope precision baseline.
export async function consultLedger(
  ctx: IntelligenceContext
): Promise<{
  emit: boolean;            // false = caller should suppress (precision below floor)
  confidence: number;       // 0..1 — how much the caller should weight prior signals
  steer?: Record<string, unknown>; // domain-specific hints (e.g. preferred legal_refs)
  reason: string;
}>;

// Called AFTER the action fires. Writes the emit-side row + returns the id.
export async function recordAction(ctx: IntelligenceContext): Promise<string>;

// Called when the outcome is observed (user reply, dispute logged, etc.)
export async function recordOutcome(args: {
  eventId?: string;          // when we know the original event
  subjectKind?: string;      // when we need to look it up
  subjectId?: string;
  outcomeKind: 'action_taken'|'dismissed'|'ignored'|'won'|'lost'|'no_response'|'churned'|'switched'|'cancelled';
  outcome?: Record<string, unknown>;
}): Promise<void>;
```

Every existing dispatcher gets two lines:

```ts
// Before:
const evtId = await recordAction({
  userId, actionKind: 'alert_sent', subjectKind: 'alert_template',
  subjectId: 'paybacker_alert_price_increase',
  predicted: { merchant, old, new }
});

await sendWhatsAppTemplate({ ... });
```

Every receiver (Pocket Agent reply router, dispute outcome logger, Stripe webhook) gets one:

```ts
await recordOutcome({
  subjectKind: 'dispute', subjectId: dispute.id,
  outcomeKind: 'won', outcome: { recovered_gbp: 145.50 }
});
```

That's it. The aggregator cron does the rest.

### 3.4 AI as the intelligence layer

The user's spec — "the AI acts as an intelligence layer that every action runs through" — means: every consequential action calls `consultLedger` before firing, and an AI (Haiku — fast + cheap) is invoked when the historical signal is ambiguous to interpret the situation.

Concrete integration points:

| Decision point | Today | After |
|---|---|---|
| Dispatcher decides whether to fire `paybacker_alert_unusual_charge` | Hard-coded threshold (1.2× rolling avg) | Calls `consultLedger`. If template precision for this merchant has been <15% (mostly dismissed), suppress this fire and log a `intelligence_events` row with `outcome_kind = 'auto_suppressed'`. |
| `generateComplaintLetter` picks legal refs | Reads `dispute_intelligence_stats` for the merchant | Unchanged — already a closed loop. Add: log every legal_ref selection as a prediction event so we measure per-statute win rate even when no merchant-specific signal exists. |
| Pocket Agent answers user's chat | Sonnet replies | Add: 👍/👎 quick-reply buttons after each significant reply. Reply captured → `intelligence_events(action_kind='chat_reply_sent', outcome_kind='dismissed'|'action_taken')`. Weekly aggregator surfaces low-rated prompt patterns. |
| `check-deal-prices` recommends a switch | Cheapest deal wins | Add: cheapest-AND-highest-historical-conversion-rate wins. Awin click + conversion ping → outcome update. |

The AI is invoked specifically in `consultLedger` when the signal is mixed: Haiku gets the prediction + recent comparable events + asks "should we fire this or not?" That call is logged too — closing the loop on the AI's own decisions.

### 3.5 Founder-facing dashboard

A single new admin page at `/dashboard/admin/intelligence/` with one card per loop:

```
┌─ Alert engagement ─────────────────────────────────────┐
│ paybacker_alert_price_increase     78% precision  ▲4%  │
│ paybacker_alert_renewal            82% precision  ▼1%  │
│ paybacker_alert_unusual_charge     34% precision  ▼12% │ ← needs tuning
│ paybacker_alert_trial_ending       91% precision  ▲2%  │
└────────────────────────────────────────────────────────┘
┌─ Letter outcomes (last 30d) ───────────────────────────┐
│ 34 disputes resolved · 22 won · £4,820 recovered       │
│ Top legal ref by win rate: CCA s.75 (84%, n=19)        │
│ Top merchant: EE (12 disputes, 9 won)                  │
└────────────────────────────────────────────────────────┘
┌─ Auto-suppressed actions (last 7d) ────────────────────┐
│ 12 alerts suppressed by intelligence layer             │
│   8× paybacker_alert_unusual_charge (low precision)    │
│   3× paybacker_better_deal_found (low switch rate)     │
│   1× paybacker_alert_renewal (user opted out)          │
└────────────────────────────────────────────────────────┘
```

Each card links to the underlying `intelligence_events` slice.

---

## 4. Phased rollout

### Phase 0 — Foundation (week 1)

**Goal: substrate exists, one loop fully closed, pattern documented.**

- [ ] Migration `intelligence_events` + `intelligence_stats`
- [ ] `src/lib/intelligence/index.ts` SDK (recordAction, recordOutcome, consultLedger)
- [ ] First loop: WhatsApp alert engagement
  - Hook into the 13 alert dispatchers we just wired in the WhatsApp work
  - Hook into the Pocket Agent reply router (`user-bot.ts`) to recognise DISPUTE/DISMISS/CANCEL/KEEP and call `recordOutcome`
- [ ] Aggregator cron `/api/cron/intelligence-rollup-daily`
- [ ] Admin page `/dashboard/admin/intelligence` with one "Alert engagement" card
- [ ] Audit of the half-built loops (agent_goals etc.) — wire them or drop them

**Acceptance: after one week of live data, the dashboard shows per-template precision and at least one template is candidate for auto-suppression.**

### Phase 1 — Letter outcomes (week 2)

**Goal: every legal_ref citation is measured.**

- [ ] Hook `generateComplaintLetter` to write a prediction event with the legal refs chosen + Sonnet's reasoning summary
- [ ] Hook the dispute outcome logger to write the matching outcome event
- [ ] Aggregator: per-legal-ref win rate + per-(merchant, legal_ref) win rate
- [ ] Engine: when Sonnet's options include a legal_ref with <5 prior uses, mark it as exploratory in the prediction — the next outcome carries higher learning weight
- [ ] Dashboard card showing top + bottom legal refs by win rate

This extends `dispute_intelligence_stats` to include all citation choices, not just per-merchant.

### Phase 2 — AI chat quality (week 3)

**Goal: Sonnet's prompts improve from user feedback.**

- [ ] Add 👍/👎 quick-reply buttons after every significant Pocket Agent reply (define "significant": > 50 words OR includes a recommendation OR drafts a letter)
- [ ] Webhook + tool: `record_chat_feedback(replyEventId, score, comment?)`
- [ ] Aggregator: per-prompt-template thumb rate; per-tool-call success rate
- [ ] Weekly digest to the founder of low-rated reply patterns → prompt update opportunities
- [ ] One automated improvement path: if a tool call fails > 30% of the time AND has > 20 invocations, automatically downrank it in the tool registry (with founder notification)

### Phase 3 — Detection precision & churn (week 4)

**Goal: bank-sync detection self-tunes; churn captures.**

- [ ] Detection thresholds (price_increase 5%+, unusual_charge 1.2×) move from constants to per-(merchant, user) stats in `intelligence_stats`
- [ ] If 5 out of last 6 alerts of a kind for a merchant were dismissed, raise the threshold automatically + log the change
- [ ] Stripe `customer.subscription.deleted` webhook: prompt user via email + WhatsApp for a one-tap reason (price/feature/competitor/other)
- [ ] Aggregator: cancellation reason distribution → weekly digest
- [ ] Affiliate switch: capture Awin click → conversion ping → outcome update; aggregator outputs per-category switch rate → `check-deal-prices` weights by this signal

### Phase 4 — Remaining loops (weeks 5-8)

In priority order:

1. **Email scan finding outcomes.** Each finding gets a `scan_finding_emitted` event; user actions (Add/Letter/Dismiss/Claim) update outcome. Aggregator → per-finding-kind conversion. Engine: low-conversion finding kinds get demoted to a digest rather than per-finding push.

2. **Onboarding funnel.** Mirror PostHog steps into `intelligence_events` (action_kind = `onboarding_step`). Aggregator → drop-off per step. One automated improvement: if step N has > 40% drop-off and step N+1's copy was last changed > 14 days ago, surface a "this needs a copy review" alert in admin.

3. **Subscription cancellation verification.** When the AI drafts a cancellation, schedule a `verify_cancellation` event for (next_billing_date + 3 days). On that date: if no charge from this merchant landed → outcome = `cancelled`; else outcome = `failed_to_cancel` + open a support ticket.

4. **Letter recipient engagement.** Inbox watchdog already polls user inbox for supplier replies → existing `paybacker_dispute_reply` template. Add: per-letter-template (initial vs chase vs LBA vs ombudsman) response time + reply rate → Sonnet's choice of escalation timing tightens.

5. **Provider intelligence revival.** Audit the existing `provider_intelligence` table; either rebuild as a `intelligence_stats` slice (preferred) or drop.

---

## 5. AI integration — invocations per decision

Today, every alert decision fires a hard-coded threshold check. After Phase 0, every alert decision passes through:

```ts
const decision = await consultLedger({
  userId: alert.user_id,
  actionKind: 'alert_sent',
  subjectKind: 'alert_template',
  subjectId: templateName,
  predicted: { merchant, threshold_pct, days_to_event },
});

if (!decision.emit) {
  await intelligence.logAutoSuppression({...});
  continue; // skip the send
}
```

`consultLedger` returns `emit = false` only when the signal is unambiguous (e.g. > 80% dismissal rate over > 20 sends). When signal is mixed, it calls Haiku with a tight prompt:

```
You are an intelligence layer for Paybacker. Decide whether to fire
this alert based on prior behaviour.

Action: {actionKind} on {subjectKind} {subjectId}
Prediction: {predicted}
Last 30 days: {aggregated_outcomes_summary}
Suppression floor: 15% precision (below = always suppress)
Promotion floor: 70% precision (above = always fire)

Reply with JSON: { "emit": bool, "confidence": 0..1, "reason": "..." }
```

Haiku at sub-100ms latency, cents per 10k calls. The reasoning summary is logged so the founder can review why the AI suppressed alerts.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cold-start: no historical data → AI suppresses everything | Floor at 30 sends before `consultLedger` can suppress. Below floor, every alert fires. |
| User reply keywords are ambiguous (CANCEL could mean cancel sub or cancel alert) | Pocket Agent already disambiguates via context — the brain decides which intent matches the most recent template send. If ambiguous, asks. |
| `intelligence_events` table grows huge | Roll daily → weekly → monthly partitions. Prune raw events older than 90 days once aggregated. |
| AI in the loop adds latency to every alert send | Default to no-AI path: AI only invoked when historical signal is mixed AND volume > floor. Most alerts are decided by deterministic precision threshold. |
| Auto-suppression silences a critical alert | Critical events (price_increase, dispute_reply, money_recovered) bypass auto-suppression by design — they're hard-coded as "always fire" in the EVENT_CATALOG flag. |
| Founder can't audit why X was suppressed | Every suppression writes a `intelligence_events` row with outcome_kind = `auto_suppressed` + reason. Admin dashboard surfaces these. |

---

## 7. What this gets us

After Phase 0: one closed loop, one card on the dashboard, the pattern documented.

After Phase 4: every action in the system is measurable, every action consults prior performance before firing, and the founder has one dashboard that shows what's working, what isn't, and what's auto-tuning itself.

The system stops being a hand-coded thing the founder adjusts and becomes a thing that adjusts itself, with the founder reviewing decisions rather than making them.

---

## 8. Open questions

1. **AI cost.** Haiku in the loop at every alert decision = cents per day per user. Acceptable for Pro tier? Need a cost model before Phase 0 ships.
2. **Suppression authority.** Should auto-suppression be silent or surface a "we suppressed 8 alerts this week" line in the morning brief? The latter is more honest; the former is less noisy.
3. **Per-user vs global learning.** Some signals (legal_ref win rate) generalise across users; others (alert dismissal rate) might be very user-specific. Phase 1 should pick the per-scope split deliberately.
4. **Existing half-built loops.** Are `agent_goals` / `agent_predictions` / `provider_intelligence` worth reviving, or should they roll into `intelligence_events`?
5. **PostHog dual-write.** Today PostHog tracks user-facing events. Should we mirror those into `intelligence_events` or treat them as separate? I'd vote: write to both, treat PostHog as the user-funnel source of truth and `intelligence_events` as the system-decision source of truth.

---

## 9. Decision points for the founder

1. Approve Phase 0 scope as described above? (one week, one loop, one card)
2. Pick the cost ceiling per user per month for AI-in-the-loop spend before Phase 0 ships.
3. Confirm critical-event bypass list (current proposal: price_increase, dispute_reply, money_recovered, overcharge_detected, savings_milestone).
4. Sign off on `intelligence_events` schema or request modifications.
