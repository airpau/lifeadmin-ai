# WhatsApp Pocket Agent — Specification

_Last updated: 2026-05-28. Owner: Pocket Agent / Messaging surface._

The WhatsApp Pocket Agent gives every Paybacker Pro user a conversational
interface to the full Paybacker product, over WhatsApp. Anything they can
do or query on the dashboard — list disputes, draft a complaint letter,
chase a supplier, recategorise a transaction, cancel a subscription,
generate a savings goal — they can do here in plain English.

This document describes the architecture, the **two-tier model
strategy** (Haiku for conversation, Sonnet for letter generation), the
**grounding rules** that keep letters free of hallucinated facts, the
tool surface, the confirmation flow, the 24h-window handling, and how
to extend the agent. It is the source-of-truth for engineers touching
anything under `src/lib/whatsapp/` or `src/app/api/whatsapp/webhook/`.

---

## 0. Two-tier model strategy

```
  ┌──────────────────────────────────────────────────────────────────┐
  │ AGENT_MODEL = claude-haiku-4-5-20251001                          │
  │   Conversational layer, read-only tool calls, summarisation.     │
  │   ~10× cheaper than Sonnet, faster TTFT — critical for WhatsApp  │
  │   UX where users expect "iMessage-fast" replies, and at scale    │
  │   where hundreds of daily-active users compound the cost.        │
  └──────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ intercepted for letter tool calls
  ┌──────────────────────────────────────────────────────────────────┐
  │ DISPUTE_MODEL = claude-sonnet-4-6                                │
  │   ONLY used when generating a dispute letter or cancellation     │
  │   email — i.e. text a real human at a supplier / regulator       │
  │   will read. Letters are too consequential for the cheap model.  │
  │   Fed a DB-grounded `groundingContext`; never sees free-form     │
  │   text from the conversational layer.                            │
  └──────────────────────────────────────────────────────────────────┘
```

Both constants live at the top of `src/lib/whatsapp/pocket-agent.ts`
and are easy to upgrade later (flip the string + redeploy).

### Cost rationale

WhatsApp is a high-frequency surface: a single Pro user may send 30–80
messages per day across price-increase alerts, dispute follow-ups,
spend queries, and recategorisations. At Sonnet pricing
(£/M tokens) and full tool-context, a chatty user runs to several
pounds per month — fine at 5 users, painful at 5,000. Haiku handles
tool_use, multi-turn synthesis, and the existing system prompt fine,
and brings the per-message cost down by an order of magnitude.

Letter generation is the opposite — low frequency, high stakes. A
single misquoted statute citation in a dispute letter to the Energy
Ombudsman would be a worse outcome than a thousand 20p Sonnet calls.
Letters always go through Sonnet, never Haiku.

### Where the split is wired

| Layer | File | Model | Trigger |
|---|---|---|---|
| Conversation loop | `pocket-agent.ts::runAgent` | `AGENT_MODEL` | Every inbound that's not YES/NO/STOP. |
| Letter writer | `dispute-letter-writer.ts::generateGroundedDisputeLetter` → `dispute-reply-engine.ts::generateDisputeReply` → `complaints-agent.ts::generateComplaintLetter` | `DISPUTE_MODEL` | When the agent loop emits a `draft_dispute_letter` tool_use block, the interceptor in `pocket-agent.ts::runLetterInterceptor` short-circuits the default executor and calls the writer chain instead. |

---

## 0.5. Anti-hallucination — strict grounding rules

These rules are non-negotiable. They apply to BOTH model tiers but
are most important on the letter-writer call.

### 1. Fetch before act

Any tool that takes a `dispute_id`, `transaction_id`,
`subscription_id`, etc. resolves and validates the row against
`user_id` BEFORE doing anything. If the row doesn't exist or
doesn't belong to this user, the tool returns an error string. The
write never fires. Wired in `executeToolCall` for the default
executor and in `buildGroundingContext` for the letter writer.

### 2. Grounding check before letter generation

Before the Sonnet call fires, `buildGroundingContext` populates a
`DisputeGroundingContext` whose every field is read from a real
Supabase row:

```ts
{
  supplierName:        dispute.provider_name,
  amount:              dispute.disputed_amount,
  transactionDate:     dispute.created_at,
  accountName:         bank_connection.account_name,    // null when absent
  disputeReason:       dispute.issue_summary,
  issueType:           dispute.issue_type,
  providerType:        dispute.provider_type,
  priorLetters:        correspondence[entry_type='ai_letter'],
  supplierReplies:     correspondence[entry_type IN ('company_email','company_letter')],
  legislation:         legal_references[verification_status IN ('verified','needs_review')]
                          AND category MATCHES dispute category,
  userFullName:        profile.full_name,
  userAddress:         profile.address,
  userPostcode:        profile.postcode,
  firstLetterSentAt:   FIRST(priorLetters).sent_at,
  priorLetterCount:    priorLetters.length,
  fcaDeadline:         firstLetterSentAt + 8 weeks,
  fcaDaysRemaining:    fcaDeadline - now()
}
```

If a critical field is missing (`userFullName`, `supplierName`,
`disputeReason`), the writer returns the missing list to the agent.
The agent then explains the gap to the user in plain English — for
example, "I can't draft this letter — your full name is missing from
your profile. Please update it at paybacker.co.uk/dashboard/profile."

### 3. Letter-writer system prompt

The Sonnet call (inside `complaints-agent.ts::generateComplaintLetter`)
runs with a system prompt that includes:

- "You are a dispute letter writer for Paybacker. You must ONLY use the
  exact facts provided in the grounding context below. Do not infer
  dates, amounts, names, or any other details not explicitly given. Do
  not fabricate legislation references — only cite the legislation
  items provided in the grounding context."
- "If a piece of information you need to write the letter is not in
  the grounding context, state `[MISSING: field_name]` in the letter
  draft rather than guessing."
- "Write in formal UK English. Reference specific sections of the
  legislation provided."

The conversational layer's free-form text never reaches this prompt
— only the grounding payload does.

### 4. Legislation lookup

Pulled from `legal_references` rows whose `verification_status` is in
`('verified', 'needs_review')` and whose `category` matches the
dispute's `issue_type` / `provider_type`. Each row contributes its
`law_name`, `section`, `summary`, and `source_url` to the grounding
payload — full text, not just a name. The writer's prompt forbids
citing any statute not in the payload.

Coverage gaps are logged to `business_log.category =
'compliance_grounding_gap'` so the founder can extend the table.

### 5. Confirmation before send

Every letter draft is gated behind a structured YES/NO confirmation
block. The block is built from grounding fields — not the model's
output — so the user can sanity-check the facts before the letter
fires:

```
*Octopus Energy* — letter #3
Amount: £142.30
FCA 8-week clock: 31 days remaining (deadline 28/06/2026).
Cites:
• Consumer Rights Act 2015, s.49 — services must be performed with reasonable care and skill…
• Ofgem GSOP — guaranteed standards of performance for electricity and gas suppliers…
• Energy Ombudsman scheme — binding award process for unresolved energy complaints…

Letter preview (first 200 chars):
"Dear Octopus Energy Customer Services, I am writing further to my…"

Reply YES to send, NO to cancel, or describe changes ("make it firmer", "add the £85 figure").
```

The user types YES; the agent calls `record_letter_sent` to persist
the SAVE state. The user types NO; `discard_letter_draft` clears it.

### 6. Agent system prompt addendum

The Haiku conversation prompt includes this guard verbatim:

> CRITICAL — GROUNDING RULE (non-negotiable): You are grounded
> entirely in the user's Paybacker account data. Never speculate
> about transaction amounts, merchant names, dates, or account
> details. If you don't have data for something, call the relevant
> tool to fetch it; only after the tool returns do you state numbers.
> Never say "approximately", "around", or "probably" when referring
> to financial figures — always fetch and state the exact number.

Combined with the Drafting Rule ("never write a reply in chat prose
— always call `draft_dispute_letter`"), this routes all
high-consequence text through the grounded Sonnet call.

---

## 1. Architecture

```
┌──────────────────┐    inbound text     ┌──────────────────────────────┐
│  Twilio / Meta   │ ──────────────────▶ │  /api/whatsapp/webhook/POST  │
│  WhatsApp BSP    │                     │   (provider-agnostic)        │
└──────────────────┘                     └──────────────────────────────┘
                                                       │
                                          1. verify signature
                                          2. parse + dedupe
                                          3. resolve user_id
                                          4. STOP / unlink gates
                                          5. tier gate (Pro only)
                                          6. media / location stubs
                                                       │
                                                       ▼
                                      ┌────────────────────────────────┐
                                      │  src/lib/whatsapp/pocket-agent │
                                      │   handlePocketAgentMessage()   │
                                      └────────────────────────────────┘
                                                       │
                          ┌────────────────────────────┴────────────────────────────┐
                          │                                                         │
                          ▼                                                         ▼
                 pending_action slot?                                    no slot — run agent
                     (YES/NO?)                                                      │
                          │                                                         ▼
                          ▼                                       ┌────────────────────────────┐
                Inline handle, short-circuit                      │  runAgent — Anthropic call │
                          │                                       │     model: AGENT_MODEL     │
                          ▼                                       │  = claude-haiku-4-5-…      │
              "OK / Cancelled" → log                              │  tools: telegramTools (50+)│
                                                                  └────────────────────────────┘
                                                                                    │
                                                              tool_use? loop until stop_reason!=tool_use
                                                                                    │
                                                                ┌───────────────────┴────────────────────┐
                                                                │                                        │
                                                                ▼                                        ▼
                                                     name = draft_dispute_letter?              name = anything else
                                                                │                                        │
                                                                ▼                                        ▼
                                              ┌──────────────────────────────────┐    ┌─────────────────────────────────┐
                                              │  runLetterInterceptor            │    │  executeToolCall (default       │
                                              │    1. resolve dispute_id         │    │  dispatcher used by dashboard,  │
                                              │    2. buildGroundingContext      │    │  Telegram, WhatsApp)             │
                                              │       from real DB rows          │    └─────────────────────────────────┘
                                              │    3. detectMissingCriticalFields│
                                              │       → return MISSING if any    │
                                              │    4. call generateDisputeReply  │
                                              │       └ DISPUTE_MODEL =          │
                                              │         claude-sonnet-4-6        │
                                              │       └ grounded in              │
                                              │         legal_references         │
                                              │    5. build confirmation block   │
                                              │       (supplier / amount /       │
                                              │       letter # / FCA deadline /  │
                                              │       legislation summary)       │
                                              └──────────────────────────────────┘
                                                                │
                                                                ▼
                                                  queue pending_action slot
                                                  send confirmation + letter
                                                  user replies YES / NO / changes
                                                                │
                                                                ▼
                              ┌─────────────────────────────────────────────────────────────────────────┐
                              │  Supabase Postgres                                                      │
                              │                                                                         │
                              │   • whatsapp_sessions                                                   │
                              │       ─ pending_action JSONB                                            │
                              │       ─ conversation_history JSONB                                      │
                              │   • whatsapp_message_log                                                │
                              │   • disputes / correspondence / profiles / bank_connections /           │
                              │     subscriptions / savings_goals / legal_references / ...              │
                              └─────────────────────────────────────────────────────────────────────────┘
```

### Why this architecture

`pocket-agent.ts` runs its OWN agent loop on Haiku — it does not delegate
to `user-bot.ts` for new traffic. The legacy `user-bot.ts` remains in
place (per CLAUDE.md "new agents are additive only"), unmodified and
fully functional. It is no longer called from the webhook; if you need
to roll back the two-tier model in a hurry, swap the webhook import
from `handlePocketAgentMessage` back to `handleWhatsAppInbound` and
redeploy.

The agent loop in `pocket-agent.ts::runAgent` reuses the same
`telegramTools` registry and `executeToolCall` dispatcher that
`user-bot.ts` does, so tool parity with the Telegram bot is preserved
by construction — any tool added to `telegramTools` becomes available
on WhatsApp automatically.

The only behavioural difference from the legacy bot:

1. **AGENT_MODEL = Haiku** instead of Sonnet for the conversational loop.
2. **Letter tools are intercepted** — `draft_dispute_letter` is routed
   through the grounded writer (which uses Sonnet) rather than the
   default executor.
3. **Structured confirmation summary** is built from DB fields and sent
   before the letter body, so the user has a grounded checkpoint
   before the letter goes out.
4. **24h window awareness** — every reply goes through
   `sendPocketAgentReply` which falls back to a template outside the
   window.
5. **`pending_action` JSONB slot** + **`conversation_history` JSONB
   mirror** are owned here.

---

## 2. Tool surface

Tools are defined once in `src/lib/telegram/tools.ts` and dispatched by
`src/lib/telegram/tool-handlers.ts`. The WhatsApp brain consumes the
exact same list, so any tool added to the Telegram bot becomes
available here automatically (and vice-versa).

| Category | Tool | What it does |
|---|---|---|
| **Read — money** | `get_spending_summary` | Total spend over a period, with top categories. |
| | `list_transactions` | Recent transactions; filterable by category / merchant / date. |
| | `get_income_breakdown` | Income transactions grouped by source. |
| | `get_monthly_trends` | Spend / income trend chart data. |
| | `get_net_worth` | Total balance across linked accounts. |
| | `get_expected_bills` | Direct debits / standing orders due in the next N days. |
| | `get_overcharge_assessments` | Charges flagged as anomalous vs rolling average. |
| | `get_financial_overview` | One-shot dashboard summary. |
| **Read — subs / contracts** | `get_subscriptions` | Active subscriptions + next-payment dates. |
| | `get_contracts` | Fixed-term contracts (broadband, mobile, gas/electric). |
| | `get_upcoming_renewals` | Contracts expiring in the next N days. |
| | `get_upcoming_payments` | Charges due in the next 7-14 days. |
| | `get_price_alerts` | Price-increase alerts. |
| | `get_unused_subscriptions` | Subs the user hasn't engaged with recently. |
| **Read — disputes** | `get_disputes` | List disputes, filterable by status. |
| | `get_dispute_detail` | Full detail incl. letter history + supplier replies. |
| | `quote_email_from_thread` | Verbatim quote of a specific message in a linked thread. |
| | `find_email_thread_for_dispute` | Search the user's inbox for threads about a dispute. |
| | `get_total_recovered` | Cumulative refund total across all disputes. |
| **Read — savings & goals** | `get_savings_goals` | Active savings goals + progress. |
| | `get_savings_challenges` | Built-in savings challenges the user can opt in to. |
| | `get_verified_savings` | Confirmed savings vs estimates. |
| **Read — bank / scanner** | `get_bank_connections` | Linked banks + last sync time. |
| | `get_scanner_results` | Recent email-inbox scan results. |
| **Read — other** | `get_budget_status`, `get_deals`, `get_loyalty_status`, `get_referral_link`, `get_profile`, `get_tasks`, `get_weekly_outlook`, `get_monthly_recap`, `get_alert_preferences`, `list_spaces`, `get_active_space`, `list_user_subcategories` | Self-describing. |
| **Search — legal** | `search_legal_rights` | Pull UK consumer-law citations + benchmark rates. |
| **Write — disputes** | `draft_dispute_letter` | **TERMINAL.** Drafts an AI letter citing UK statute. |
| | `record_letter_sent` | Mark the most recent draft as sent (SAVE flow). |
| | `discard_letter_draft` | Drop the most recent pending draft. |
| | `update_dispute_status` | Set status (won / partial / lost / escalated / awaiting). |
| | `record_dispute_outcomes` | Bulk-record outcomes across multiple disputes. |
| | `link_email_thread_to_dispute` | Connect an email thread to a dispute. |
| **Write — subs** | `add_subscription`, `cancel_subscription`, `generate_cancellation_email`, `recategorise_subscription` | Self-describing. |
| **Write — budgets / goals** | `set_budget`, `delete_budget`, `create_savings_goal`, `update_savings_goal` | Self-describing. |
| **Write — txns** | `recategorise_transaction`, `recategorise_transactions`, `upsert_user_subcategory` | Single + bulk recategorisation. |
| **Write — contracts** | `add_contract` | Add a fixed-term contract. |
| **Write — tasks** | `create_task` | Add a to-do for the user. |
| **Write — prefs** | `update_alert_preferences`, `set_active_space` | Self-describing. |
| **Write — bank** | `remove_bank_connection` | Remove a linked bank. |
| **Support** | `create_support_ticket` | Only when the user genuinely needs a human. |

The list above is what's wired today. Anything user-facing on the
dashboard that the user can read or write should be reachable here.
If you spot a gap, add the tool to `telegramTools` and the handler to
`executeToolCall` — it lights up on both Telegram and WhatsApp in the
same commit.

---

## 3. Confirmation flow for destructive actions

Destructive write tools — sending a letter, cancelling a sub, marking a
dispute lost, creating a dispute, recategorising every transaction from
a merchant — should never fire on the first turn. The user types
something, the agent _proposes_, the user types YES to confirm.

The wrapper at `pocket-agent.ts` owns a generic slot for this:
`whatsapp_sessions.pending_action JSONB`.

### Shape

```json
{
  "kind": "send_dispute_letter",
  "args": { "dispute_id": "ab12…", "tone": "firm" },
  "summary": "Send the EE complaint letter (cites Consumer Rights Act 2015 s.49).",
  "queued_at": "2026-05-28T18:31:02Z",
  "expires_at": "2026-05-28T19:01:02Z"
}
```

### Flow

1. Tool that wants gating calls `queuePendingAction(phone, slot)` from
   `src/lib/whatsapp/pocket-agent.ts` and replies with the summary
   ("About to send the EE letter — reply YES to confirm or NO to
   cancel.").
2. Next inbound arrives at the webhook → wrapper reads the slot first.
3. `detectIntent(text)` matches `yes` / `y` / `confirm` / `ok` /
   `go ahead` / `send it` / `approve` → executes (currently: replies
   `OK — <summary>` and clears the slot; the executor sees the
   confirmation and proceeds on its own).
4. `no` / `cancel` / `don't` / `abort` → clears the slot, replies
   "Cancelled — I won't do that."
5. Anything else (`when?`, `actually drop that`, free-form question)
   → slot is cleared (user has moved on) and the message is routed
   to the agent normally.

### TTL

Slots auto-expire after 30 minutes. Once expired, the wrapper replies
"That confirmation expired — tell me again what you'd like to do" and
clears the slot rather than acting on a stale YES.

### What's wired today

The only destructive flow that uses this pattern today is
`draft_dispute_letter → SAVE / DISCARD`, which has its own bespoke
handling inside `tool-handlers.ts`. The generic slot in
`pocket-agent.ts` is wiring for future tools (`send_dispute_letter`,
`cancel_subscription`, `chase_supplier`) to opt in to the same UX
without writing a one-off state machine each time.

### How to add a new gated action

```ts
// inside a tool handler
import { queuePendingAction } from '@/lib/whatsapp/pocket-agent';

await queuePendingAction(phone, {
  kind: 'cancel_subscription',
  args: { subscription_id },
  summary: `Cancel ${merchantName} (£${monthly}/mo)`,
});
return {
  text: `About to cancel ${merchantName} — reply YES to confirm or NO to keep it.`,
};
```

The wrapper handles the next turn. The executor for `kind ===
'cancel_subscription'` can be added either as a fan-out in
`pocket-agent.handlePocketAgentMessage` (if it should fire silently)
or as a regular tool the agent calls on the next turn after seeing the
`OK — Cancel <merchant>` ack in history.

---

## 4. 24h customer-service window handling

WhatsApp Business policy forbids free-form outbound outside the 24h
window from the user's last inbound. Meta returns error 131047; Twilio
returns 63016. Inside the window, free-form is unrestricted.

### How the wrapper handles it

Every reply goes through `sendPocketAgentReply(phone, text, { userId })`,
which:

1. Calls `isWithinSessionWindow({ userId, phone })` (from
   `src/lib/whatsapp/session-window.ts`).
2. **Inside window** → `sendWhatsAppText({ to, text })` (free-form).
3. **Outside window** → `sendWhatsAppTemplate({ to, templateName:
   'paybacker_pocket_agent_reply', parameters: [text] })`.

The `paybacker_pocket_agent_reply` template is a UTILITY template with a
single `{{1}}` variable wrapped between short static bookends so Meta
won't reject for the start/end-variable rule. Body:

```
Pocket Agent:

{{1}}

— reply STOP to opt out.
```

### Why the brain doesn't check the window

99%+ of replies fire within seconds of the inbound, so the window is
always open by construction. The brain (`user-bot.ts`) assumes this
and uses `sendWhatsAppText` directly. The wrapper's window-aware send
is a defence-in-depth for the long-tail edge case where:

- The Anthropic call takes minutes (rare, but possible under load).
- A retried webhook fires after the window has expired.
- A tool that posts a follow-up message fires after a long-running
  external API call.

### When templates are PENDING

The new template is registered with `sid: PENDING_META_APPROVAL` until
the founder submits via `/dashboard/admin/whatsapp` Resubmit panel.
While pending, `getTemplateSid('paybacker_pocket_agent_reply')`
returns `null`, the Twilio provider skips the send, and the wrapper
catches the thrown error and falls back to plain `sendWhatsAppText` —
which will 400 outside the window but works inside it. The visible
impact is none until both (a) the template is approved by Meta AND
(b) a reply fires outside the window. The founder workflow is the
same as every other template: paste the new SID into
`whatsapp_template_sids` after Meta approval.

---

## 5. Conversation memory

Two complementary stores:

### `whatsapp_message_log` (canonical, authoritative)

Every inbound and outbound message is logged here with direction,
text, provider id, and timestamps. This is the source of truth for
audit, billing, and the brain's current history reconstruction (last
10 messages, deduped by alternating role).

### `whatsapp_sessions.conversation_history JSONB` (snapshot)

The wrapper mirrors the last ~10 inbound/outbound turns into this
JSONB column for faster reads and to give a future refactor of
`user-bot.ts` a cleaner source than the log (which includes outbound
chunks, template renders, and system fallbacks).

```json
[
  { "role": "user",      "content": "show my open disputes", "ts": "2026-05-28T18:30:00Z" },
  { "role": "assistant", "content": "You've got 3 open disputes…", "ts": "2026-05-28T18:30:01Z" }
]
```

History older than 30 minutes is dropped on the next write.
Mirror is fire-and-forget — failures are logged but never block the
user-facing reply.

---

## 6. How to add a new tool

1. Add the schema to `src/lib/telegram/tools.ts`:
   ```ts
   {
     name: 'get_pension_pots',
     description: 'List pension contributions per provider…',
     input_schema: { type: 'object', properties: { /*…*/ } },
   }
   ```
2. Add the handler to `src/lib/telegram/tool-handlers.ts` keyed on the
   tool name. Return `{ text, pendingAction? }`.
3. The tool is now available to both Telegram and WhatsApp Pocket
   Agents with zero further changes — the WhatsApp brain reads the same
   registry.
4. If the tool is destructive, queue a `pending_action` slot via
   `queuePendingAction(phone, { kind, args, summary })` instead of
   executing on the first call.

That's it. No template approval, no webhook changes, no migration.

---

## 7. Example conversations

### Example 1 — querying spending

```
User       (Mon 18:30)    show my spending this month
Pocket     (Mon 18:30)    May so far: £1,247.30 across 4 categories.
Agent                     Top spend:
                            • Groceries — £382.10 (Aldi, Tesco)
                            • Energy — £214.50 (E.ON Next)
                            • Eating out — £198.00
                            • Transport — £142.70
                          Net of income (£3,890), you're £2,642.70 in the black.
```

### Example 2 — taking a dispute action

```
User       (Tue 09:12)    chase EE on my broadband dispute
Pocket     (Tue 09:12)    Found one — EE broadband dispute opened
Agent                     14 days ago, last reply from EE was 9 days
                          ago offering £30. FCA 8-week clock: 42 days
                          remaining.

                          Want me to draft a firmer chase letter citing
                          Ofcom's Automatic Compensation Scheme (£9.76/day
                          for total loss of service)? Reply YES to draft
                          or NO to wait.
User       (Tue 09:13)    yes
Pocket     (Tue 09:13)    Drafting…

                          [letter body — 600 words, cites Ofcom GC C3
                          + Consumer Rights Act 2015 s.49]

                          Reply SAVE if you've sent it, or DISCARD to
                          drop the draft.
User       (Tue 12:04)    save
Pocket     (Tue 12:04)    Saved. I'll watch for a reply and ping you
Agent                     when one lands.
```

### Example 3 — manual bank sync

```
User       (Wed 07:45)    sync my barclays account
Pocket     (Wed 07:45)    Triggering a manual Yapily sync on your
Agent                     Barclays current account (last sync: 2026-
                          05-27 21:00). I'll let you know when new
                          transactions land — usually 30-60 seconds.
```

### Example 4 — cancelling a subscription

```
User       (Wed 19:02)    cancel my disney+ I never watch it
Pocket     (Wed 19:02)    Disney+ Premium — £9.99/mo, renews 2026-06-04
Agent                     (7 days). Last viewed activity: 4 months ago
                          (you weren't kidding).

                          About to draft a cancellation email citing
                          your right to cancel without notice on a
                          rolling month. Reply YES to draft or NO to
                          keep the sub.
User       (Wed 19:03)    yes
Pocket     (Wed 19:03)    [cancellation email — addressed to Disney
Agent                     Customer Care, references the auto-renewal
                          terms]

                          I've also queued a reminder for 2026-06-03
                          to check the £9.99 doesn't take. Anything
                          else?
```

### Example 5 — creating a dispute from a transaction

```
User       (Thu 11:18)    dispute the £42 npower charge from yesterday
                          - my tariff says £28 max
Pocket     (Thu 11:18)    Found it — Npower DD on 2026-05-27 for £42.13.
Agent                     Your usual is £27.80 (last 6 months avg) — that's
                          51% higher.

                          Want me to open a dispute against Npower for the
                          £14.33 overcharge, citing the Consumer Rights
                          Act 2015 s.49 + Ofgem GSOP? Reply YES to create
                          and draft, or NO to wait.
User       (Thu 11:19)    yes
Pocket     (Thu 11:19)    OK — opened dispute against Npower for £14.33.
Agent                     [letter body — 450 words, cites CRA 2015 s.49
                          + Ofgem standards]

                          Reply SAVE if you've sent it. FCA 8-week clock
                          starts on Npower's first acknowledgement.
```

---

## 8. Files

| Path | Purpose |
|---|---|
| `src/lib/whatsapp/pocket-agent.ts` | The active agent. Hosts AGENT_MODEL constant, the Haiku tool loop, the letter-tool interceptor, window-aware send, pending_action slot, and history mirror. |
| `src/lib/whatsapp/dispute-letter-writer.ts` | DB-grounded letter generation. Builds `DisputeGroundingContext`, validates critical fields, delegates the actual writing to the legal_references-grounded engine (Sonnet). |
| `src/lib/whatsapp/user-bot.ts` | Legacy AI brain — still here unmodified, no longer called from the webhook. Kept as a rollback path. |
| `src/lib/whatsapp/session-window.ts` | `isWithinSessionWindow()` — reads `whatsapp_message_log` for last inbound. |
| `src/lib/whatsapp/template-registry.ts` | Compile-time template source-of-truth (incl. `paybacker_pocket_agent_reply`). |
| `src/lib/whatsapp/template-sids.ts` | Runtime SID resolver (env / DB / registry / null). |
| `src/lib/whatsapp/index.ts` | Provider-agnostic send / parse / verify entry points. |
| `src/lib/whatsapp/twilio-provider.ts` | Twilio Content API adapter. |
| `src/lib/whatsapp/meta-provider.ts` | Meta Cloud API adapter. |
| `src/lib/agents/dispute-reply-engine.ts` | Letter-grounding engine — pulls from `legal_references`, calls Sonnet. Single source of truth across surfaces. |
| `src/lib/agents/complaints-agent.ts` | The actual `generateComplaintLetter` Anthropic call (DISPUTE_MODEL = claude-sonnet-4-6). |
| `src/lib/telegram/tools.ts` | Tool registry — shared between Telegram and WhatsApp. |
| `src/lib/telegram/tool-handlers.ts` | Tool dispatcher — keyed by name, channel-aware (`'telegram' \| 'whatsapp'`). |
| `src/app/api/whatsapp/webhook/route.ts` | Inbound webhook. Resolves user, gates, hands off to pocket-agent. |
| `supabase/migrations/20260528120000_whatsapp_pocket_agent_memory.sql` | Adds `pending_action` + `conversation_history` JSONB. |

---

## 9. Open follow-ups

- **Image OCR** — current media handler stubs return "I can't read
  images yet." Bill OCR via Claude vision is on the roadmap.
- **Voice notes** — same as above; Whisper transcription is the
  obvious next step.
- **Quick-reply buttons** — Twilio Content API supports up to 3 buttons
  per template, used today on `paybacker_outcome_check`. Generalising
  this to agent-emitted ad-hoc buttons (rather than pre-approved
  template buttons) would let the YES/NO confirmation become a
  one-tap UX rather than a typed reply.
- **Streaming partial replies** — Claude streaming would let us send
  the first chunk of a long reply (e.g. a 600-word letter) before the
  full generation completes. WhatsApp doesn't really do streaming
  though, so this is low-priority.
- **Conversation history source** — today the brain rebuilds history
  from `whatsapp_message_log` every turn. The new
  `conversation_history` JSONB is wiring for a future refactor that
  reads from there instead, which would let the agent see chronology
  more cleanly (no outbound chunk noise) and would also speed up
  cold-start turns slightly.
