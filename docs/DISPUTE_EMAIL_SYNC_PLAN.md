# Dispute ⇄ Email Thread Auto-Sync

**Status:** APPROVED 19 Apr 2026 — build in progress
**Drafted:** 19 April 2026
**Owner:** Paul
**Feature codename:** "Watchdog"
**Approved decisions:**
- Matching: Hybrid (user confirms thread, auto-match fallback)
- Tagline: *"Your disputes don't end when you hit send. Neither do we."*
- Tiering: Free (1 linked thread, manual sync), Essential (5, hourly), Pro (unlimited, 30 min)
- Telegram alerts: default ON for Essential & Pro
- Added: user can "Move this reply" and "Relink thread" to correct any mis-match

---

## 1. The problem (in Paul's words)

> I have an open dispute with OneStream. When OneStream replies to me, I currently have to copy their email, open Paybacker, open the dispute, click "Add correspondence", paste the text, save. Then I have to manually generate a follow-up reply. It's cumbersome and it's the main reason my disputes go stale.

The fix: Paybacker watches the user's connected inbox in the background, auto-pulls supplier replies into the matching dispute thread, alerts the user in-app + Telegram, and offers one-click "Draft response".

This turns a passive complaint archive into a live case-management system.

---

## 2. What already exists (verified 19 Apr 2026)

Most of the plumbing is in place. The gaps are the matching layer, the sync cron, and the notification UI.

**Already built and working**
- `disputes` table with status enum including `awaiting_response`
- `correspondence` table (timeline entries) with entry types including `company_email`, `company_response`
- `gmail_tokens` table (read-only scope `gmail.readonly`)
- `email_connections` table (unified Gmail OAuth / Outlook OAuth / IMAP for Yahoo/BT/Sky)
- `src/lib/imap-scanner.ts` for IMAP fetch with encrypted app passwords
- `/api/gmail/scan` and `/api/outlook/scan` route handlers
- Telegram user bot: `telegram_sessions`, `telegram_alert_preferences`, `telegram_pending_actions`, `sendProactiveAlert()` in `src/lib/telegram/user-bot.ts`
- Existing cron pattern at `/api/cron/dispute-reminders` (daily 9am, email + Telegram)
- `checkUsageLimit()` and `incrementUsage()` in `src/lib/plan-limits.ts`
- Dispute detail UI at `src/app/dashboard/complaints/page.tsx` with chronological correspondence thread
- `/api/disputes/[id]/correspondence` POST/DELETE for adding timeline entries
- `/api/complaints/generate` takes the correspondence thread as context when drafting — so auto-imported replies will naturally flow into the next AI letter

**Missing and needs to be built**
- Matching layer: how do we know email X belongs to dispute Y?
- Deduplication columns on `correspondence` (`supplier_message_id`, `detected_from_email`, `email_thread_id`)
- `dispute_email_threads` table to store the Gmail `threadId` / Outlook `conversationId` linked to each dispute
- Sync cron `/api/cron/dispute-reply-sync`
- In-app notification centre: there is no `notifications` table and no bell in the dashboard header today — all alerts are Telegram-only
- "Link email thread" UI on the dispute detail page
- "Sync now" manual button for Free tier
- Plan-limit entries for linked-thread count and sync frequency

---

## 3. Matching strategy — the hard part

The original AI letter is generated in Paybacker but **sent from the user's own email account** (Gmail scope is `readonly` — we don't send on their behalf). That means we don't have a Gmail `threadId` at the moment of creation. So "auto-find the reply" needs one of the following:

**Option A — Manual link once, then auto-sync forever (Recommended default)**
1. When the user creates a dispute, Paybacker surfaces a modal: "Did you already send this to the provider? If yes, link the email thread so we can watch it for replies."
2. Paybacker searches the user's inbox for recent messages to/from the provider and returns the top 3 candidates.
3. The user picks one. We store `{gmail_thread_id, subject, sender_domain, first_message_id}` in `dispute_email_threads`.
4. From then on, the sync cron just does an incremental pull on that specific threadId. Rock-solid.

**Option B — Fully automatic domain match**
1. Paybacker keeps a provider → email-domain lookup (OneStream → `onestream.co.uk`, E.ON → `eonenergy.com`, etc.).
2. Cron scans inbox for any message received from that domain in the last 48h.
3. Claude Haiku classifies relevance (cheap).
4. Auto-links the first confident match.

Option B is magical but brittle — domain records drift (`noreply@mail.onestream.co.uk`), same provider can reply to multiple open disputes, and classification costs scale per-message.

**Recommended: Hybrid.** Default to Option A (user confirms the thread once — takes 5 seconds). If user skips linking, fall back to Option B with a Claude Haiku classifier, but display a "Likely reply from OneStream — attach to this dispute?" banner instead of silently importing. This keeps the trust model tight.

---

## 4. Data model changes

All additive. Never DROP, per deployment safety rules.

### 4.1 New migration `20260420000000_dispute_email_sync.sql`

```sql
-- Link a dispute to an email thread in the user's connected inbox
CREATE TABLE IF NOT EXISTS dispute_email_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_connection_id UUID REFERENCES email_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gmail','outlook','imap')),
  thread_id TEXT NOT NULL,           -- Gmail threadId / Outlook conversationId / IMAP Message-ID chain root
  subject TEXT,
  sender_domain TEXT,
  first_message_id TEXT,
  last_synced_at TIMESTAMPTZ,
  last_message_date TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, provider, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_dispute_email_threads_dispute ON dispute_email_threads(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_email_threads_user_sync ON dispute_email_threads(user_id, sync_enabled) WHERE sync_enabled = TRUE;

-- Additions to correspondence (additive only)
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS supplier_message_id TEXT;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS detected_from_email BOOLEAN DEFAULT FALSE;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS email_thread_id UUID REFERENCES dispute_email_threads(id) ON DELETE SET NULL;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS sender_address TEXT;
-- Dedupe index: same supplier message can't be imported twice into the same dispute
CREATE UNIQUE INDEX IF NOT EXISTS uniq_correspondence_msgid
  ON correspondence(dispute_id, supplier_message_id)
  WHERE supplier_message_id IS NOT NULL;

-- Dispute-level reply metadata
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS last_reply_received_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS unread_reply_count INTEGER DEFAULT 0;

-- In-app notification centre (new)
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'dispute_reply' | 'dispute_resolved' | 'bank_alert' | etc.
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,                     -- e.g. /dashboard/complaints/<id>
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- RLS
ALTER TABLE dispute_email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_threads" ON dispute_email_threads FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_notifications" ON user_notifications FOR ALL USING (user_id = auth.uid());
```

Nothing existing is modified. Safe to deploy.

---

## 5. API surface

All routes server-side; no API keys in client.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/disputes/[id]/suggest-threads` | Return top 3 candidate email threads for a dispute (search user's inbox by provider name + domain) |
| POST | `/api/disputes/[id]/link-email-thread` | Persist chosen thread in `dispute_email_threads`; do initial sync |
| DELETE | `/api/disputes/[id]/link-email-thread` | Unlink (sets `sync_enabled=false`) |
| POST | `/api/disputes/[id]/sync-replies-now` | User-triggered manual sync (Free tier uses this) |
| GET | `/api/notifications` | List user's notifications |
| POST | `/api/notifications/mark-read` | Mark one or many as read |
| GET | `/api/notifications/unread-count` | For the bell badge |
| POST | `/api/cron/dispute-reply-sync` | **NEW CRON** — runs on Vercel schedule, gated by `CRON_SECRET` |

---

## 6. The sync cron — full logic

### Trigger
Add to `vercel.json`:
```json
{
  "path": "/api/cron/dispute-reply-sync",
  "schedule": "*/30 * * * *"   // every 30 min
}
```
(Vercel Hobby caps crons at daily; Pro plan supports 30-min.)

### Algorithm

```
for each user U with email_connections.status='active' AND at least one dispute_email_thread.sync_enabled=true:
  plan = getPlan(U)
  if plan = 'free': skip (Free tier is manual-sync only, skip in cron)
  if plan = 'essential' and last_cron_for_user < 1h: skip (hourly cap)
  if plan = 'pro' and last_cron_for_user < 30m: skip (30-min cap)

  for each linked thread T (where sync_enabled=true):
    conn = getConnection(T.email_connection_id)
    messages = fetchNewMessages(conn, T.thread_id, since=T.last_synced_at)

    for each message M in messages (chronological):
      if M.from.domain matches connection's own address: continue  // user's own reply
      if exists(correspondence WHERE dispute_id=T.dispute_id AND supplier_message_id=M.id): continue  // dedupe

      summary = claudeHaiku.summarise(M.body, max_tokens=120)   // short plain-text preview

      INSERT INTO correspondence (
        dispute_id = T.dispute_id,
        user_id = U.id,
        entry_type = 'company_email',
        title = M.subject,
        content = M.plainBody,
        summary = summary,
        sender_address = M.from.address,
        supplier_message_id = M.id,
        detected_from_email = TRUE,
        email_thread_id = T.id,
        entry_date = M.received_at
      )

      UPDATE disputes SET
        last_reply_received_at = M.received_at,
        unread_reply_count = unread_reply_count + 1,
        status = CASE WHEN status='awaiting_response' THEN 'open' ELSE status END,
        updated_at = NOW()
      WHERE id = T.dispute_id

      INSERT INTO user_notifications (
        user_id = U.id,
        type = 'dispute_reply',
        title = `New reply from ${providerName}`,
        body = summary,
        link_url = `/dashboard/complaints?dispute=${T.dispute_id}`,
        dispute_id = T.dispute_id
      )

      if user_opted_into_telegram_alerts(U, 'dispute_replies'):
        sendProactiveAlert(U.id, telegramMessage(providerName, M.subject, summary, dispute_url))

    UPDATE dispute_email_threads SET last_synced_at = NOW(), last_message_date = max(messages.received_at)
```

### Provider-specific fetch helpers

`src/lib/dispute-sync/fetchers.ts` (new file):

```ts
export async function fetchNewMessages(conn: EmailConnection, threadId: string, since: Date) {
  switch (conn.provider_type) {
    case 'gmail':   return fetchGmailThread(conn, threadId, since);
    case 'outlook': return fetchOutlookConversation(conn, threadId, since);
    case 'imap':    return fetchImapThread(conn, threadId, since);
  }
}
```

- **Gmail**: `users.threads.get?id={threadId}&format=metadata` + `users.messages.get` for each message payload. Filter by `internalDate > since`.
- **Outlook (Graph)**: `/me/messages?$filter=conversationId eq '{id}' and receivedDateTime gt {since}&$orderby=receivedDateTime asc`.
- **IMAP**: Use existing `src/lib/imap-scanner.ts` with a SEARCH on `References`/`In-Reply-To` matching the first-message-id.

All three already have auth code paths in the codebase — we just need the per-thread fetchers.

### Cost control

Claude Haiku (not Sonnet) for the 120-token summary: ~£0.00008 per reply. At 1,000 active Pro users with an average of 2 supplier replies per month each = 2,000 summaries × £0.00008 = **£0.16/month**. Negligible.

"Draft response" button uses the existing `/api/complaints/generate` route which already uses Sonnet and is counted against the user's monthly letter quota — no new cost path.

---

## 7. Plan gating (per your choice: all tiers, capped)

Add to `src/lib/plan-limits.ts`:

| Tier | Max linked dispute threads | Sync frequency | Telegram instant alerts |
|---|---|---|---|
| Free | 1 | Manual only ("Sync now" button) | No |
| Essential | 5 | Hourly background cron | Yes |
| Pro | Unlimited | Every 30 min background cron | Yes + in-app push |

Enforcement in `/api/disputes/[id]/link-email-thread`:
```ts
const { allowed, used, limit, upgradeRequired } = await checkUsageLimit(userId, 'dispute_thread_link');
if (!allowed) return 402 with upgrade prompt;
```

Free-tier acquisition angle: "Try one dispute free — see a reply arrive in Paybacker without lifting a finger." That single linked thread is the wow-moment that converts to Essential.

---

## 8. UI changes (no redesign, additive)

### 8.1 Dispute detail page (`src/app/dashboard/complaints/page.tsx`)

Add a card above the correspondence timeline:

```
┌────────────────────────────────────────────────────────────┐
│ 📨 Email sync                                              │
│                                                            │
│ ✓ Linked to OneStream thread                               │
│ "Re: Complaint about direct debit 30 Mar"                  │
│ Last checked: 4 minutes ago · Next check: ~26 mins         │
│                                                            │
│ [Sync now]  [Unlink]                                       │
└────────────────────────────────────────────────────────────┘
```

Unlinked state:

```
┌────────────────────────────────────────────────────────────┐
│ 📨 Watch this dispute for replies                          │
│                                                            │
│ Paybacker can scan your connected Gmail inbox for          │
│ replies from OneStream and pull them in automatically.     │
│                                                            │
│ [Find thread]   [Not now]                                  │
└────────────────────────────────────────────────────────────┘
```

Correspondence items that came from auto-sync get a badge and two amendment affordances:

```
  📨 From onestream.co.uk · Auto-imported from email · 2h ago
  [Move to different dispute]   [This isn't from OneStream — remove]
```

And on the "Linked thread" card, a "Relink thread" button lets the user swap the watched thread if the first pick was wrong.

### 8.2 Dashboard header (new bell)

New component `src/components/dashboard/NotificationBell.tsx`:
- Bell icon with unread count badge
- Dropdown panel with last 10 notifications
- Each item: icon + title + body preview + relative time
- Click → navigate to `link_url` and mark read
- "Mark all read" link at the bottom

### 8.3 Disputes list

Disputes with `unread_reply_count > 0` get a pulse dot and a "NEW REPLY" badge.

### 8.4 Telegram message format

```
🔔 *New reply on your OneStream dispute*

*Subject:* Re: Complaint about direct debit 30 Mar
*Received:* 2 minutes ago

_"Thank you for your complaint. We've reviewed your account
and would like to offer..."_

[View in Paybacker] /dashboard/complaints?dispute=abc123
[Draft my response]

Reply *draft* to generate your next letter.
```

Handled via existing `sendProactiveAlert()` in `src/lib/telegram/user-bot.ts` and a new `telegram_pending_actions` entry of type `dispute_reply_draft`.

---

## 9. Build plan — suggested sequence

| # | Task | Est. effort |
|---|---|---|
| 1 | Migration `20260420000000_dispute_email_sync.sql` + apply via Supabase MCP | 30 min |
| 2 | Helpers: `src/lib/dispute-sync/fetchers.ts` (Gmail + Outlook + IMAP thread fetchers) | 3 h |
| 3 | `src/lib/dispute-sync/matcher.ts` (provider → domain lookup, fuzzy candidate finder) | 2 h |
| 4 | `GET /api/disputes/[id]/suggest-threads` | 1 h |
| 5 | `POST /api/disputes/[id]/link-email-thread` + DELETE | 1 h |
| 6 | `POST /api/cron/dispute-reply-sync` (the main loop) | 3 h |
| 7 | `POST /api/disputes/[id]/sync-replies-now` (user-triggered wrapper) | 30 min |
| 8 | Vercel cron entry + CRON_SECRET check | 15 min |
| 9 | Plan-limit updates in `src/lib/plan-limits.ts` | 30 min |
| 10 | UI: "Email sync" card on dispute detail page | 2 h |
| 11 | UI: Auto-imported badge on correspondence entries | 30 min |
| 12 | UI: NotificationBell component + `/api/notifications*` routes | 3 h |
| 13 | UI: "NEW REPLY" badges on disputes list | 45 min |
| 14 | Telegram integration (new alert type + preference toggle) | 1.5 h |
| 15 | Unit tests: matcher, fetchers (mock Gmail/Graph responses), dedupe behaviour | 3 h |
| 16 | End-to-end test on your OneStream dispute in dev | 1 h |
| 17 | Deploy to Vercel preview, then production after manual verification | 30 min |

**Total: ~24 engineering hours**, realistically 2 focused days.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Gmail API rate limits per user (250 quota units/sec) | Batch thread fetches; cache `historyId` so incremental syncs are cheap |
| Misattributed reply (email imported into wrong dispute) | Hybrid matching defaults to user confirmation; "Unlink and move" button on each correspondence entry |
| Supplier spoofs sender address | Rely on DKIM-verified `sender_domain`; flag unverified as "possible reply — verify" rather than silent import |
| User disconnects email mid-sync | Cron checks `email_connections.status='active'` before each run; degrades gracefully |
| Duplicate notifications if cron double-fires | `UNIQUE (dispute_id, supplier_message_id)` index on correspondence kills duplicates at DB level |
| Telegram noise | Already have `telegram_alert_preferences` — add `dispute_replies` toggle (default ON) |
| Cost of Claude Haiku summaries scales with reply volume | Hard cap: skip summary if body < 200 chars (use first paragraph verbatim); monitor via `ANTHROPIC_AGENTS_API_KEY` cost dashboard |
| Gmail read-only scope insufficient? | No — read-only is exactly what we need. We never send on the user's behalf. User still hits "Draft response" → letter generated → user sends from their own Gmail. |

---

## 11. Deployment safety checklist (per CLAUDE.md rules)

- [x] Migration is additive only — no DROPs, all `ADD COLUMN IF NOT EXISTS`, new tables use `CREATE TABLE IF NOT EXISTS`
- [x] `complaint_writer` and Riley are not modified
- [x] No existing cron entries altered — only a new one added
- [x] All API keys server-side (Gmail/Graph/Claude already are)
- [x] Plan: tag release before deploy — `v2026-04-dispute-email-sync`
- [x] Plan: `npx tsc --noEmit` clean before deploy
- [x] Plan: deploy to Vercel preview first, smoke test on your OneStream dispute, then production
- [x] Rollback path: set `sync_enabled=false` globally + remove cron from `vercel.json` — feature goes dark without data loss

---

## 12. Marketing

### 12.1 Demo video storyboard ("Watchdog" — 45 seconds)

| # | Shot | Duration | On-screen text | Voiceover |
|---|---|---|---|---|
| 1 | Close-up of frustrated person at desk, phone showing a OneStream email notification | 3s | — | "You've sent the complaint. Now what?" |
| 2 | Phone screen: email from OneStream arriving in Gmail inbox | 3s | "OneStream replied…" | "Most people miss the reply. Or lose track of what they sent. Or just give up." |
| 3 | Split-screen cuts to Paybacker dashboard — the notification bell in the header lights up with "1" | 3s | "🔔 New reply from OneStream" | "Not with Paybacker." |
| 4 | Phone screen: Telegram message arriving — "🔔 New reply on your OneStream dispute" | 3s | "Paybacker Pocket Agent" | "We watch your inbox for you." |
| 5 | User taps Paybacker notification → dispute detail slides in → supplier reply is already in the timeline, labelled "Auto-imported from email" | 5s | "OneStream's reply, already in your case file." | "The reply lands in your dispute timeline automatically." |
| 6 | User scrolls — sees the full thread: their original AI letter, OneStream's reply, a highlighted "Draft response" CTA | 4s | "Your full paper trail. One tap away." | "Every message. Chronological. Searchable." |
| 7 | User taps "Draft response" → loading shimmer → professionally-worded follow-up appears citing Consumer Rights Act 2015 | 6s | "New letter in 30 seconds." | "And your next move? Drafted in thirty seconds, citing the exact UK law that protects you." |
| 8 | User taps "Copy to clipboard" → switches to Gmail → pastes → hits send | 5s | — | "You paste it, you send it. Done." |
| 9 | Stat card overlay: "Average Paybacker user recovers £847 per year" | 3s | "£847 avg. recovered" | "This is how disputes get won." |
| 10 | Brand lockup with CTA | 3s | "Paybacker — your money's watchdog. Start free at paybacker.co.uk" | "Paybacker. Your money's watchdog." |

**Assets needed:** 1 hero image (desk/phone scene), 4 UI captures (Gmail, Paybacker bell, dispute detail, Telegram), 1 end-card. Generate UI captures from your staging environment with a real OneStream thread. Generate hero via fal.ai once feature ships.

**Suggested platforms for this asset:** Homepage hero video, Instagram Reels, TikTok, YouTube Shorts, LinkedIn (slightly longer cut with voiceover narrated by a UK voice).

### 12.2 Homepage section copy (drop-in block)

Section placement: directly beneath the existing complaint-letter hero, before the bank-scanner section.

```markdown
## Your disputes don't sleep. Neither do we.

Sending the complaint is the easy bit. Most people lose the
thread the moment the supplier replies — if they even notice
the reply at all.

**Paybacker's new Watchdog** connects to your Gmail or Outlook
and watches for replies on every open dispute. When the
supplier responds, we pull their message straight into your
case timeline, alert you in the app and on Telegram, and draft
your next move automatically — citing the exact UK legislation
that backs you up.

### What Watchdog does for you

- **Auto-imports replies** from OneStream, E.ON, Virgin Media,
  any UK provider — straight into your dispute timeline
- **Alerts you instantly** via the in-app bell and your
  Paybacker Pocket Agent on Telegram
- **Drafts your response** in 30 seconds, cited to UK consumer
  law, ready to paste and send
- **Read-only email access** — Paybacker can only watch, never
  send on your behalf, and you can unlink any thread with one
  click

### Try it free

Link one dispute thread on any free account. Paid plans get up
to 5 (Essential) or unlimited (Pro) with automatic 30-minute
background sync.

[ Start free at paybacker.co.uk → ]
```

**Hero tagline options (A/B candidates):**

1. *"Your disputes don't end when you hit send. Neither do we."* — problem-first, my pick
2. *"The only dispute tool that reads the reply for you."* — feature-first
3. *"Complain once. Paybacker handles the rest."* — promise-first

### 12.3 Integration into existing marketing plan

From `docs/MARKETING_PLAN.md` and `docs/SOCIAL_CONTENT_30_DAYS.md`, this feature deserves:

- **Week 1 after launch:** The demo video pinned to homepage + YouTube + LinkedIn
- **Week 2:** Three short "before/after Watchdog" TikToks (user struggling to find the reply → the bell going off)
- **Week 3:** Paul's own OneStream case as a case study blog post: "I stopped managing my own disputes. Here's what happened."
- **Week 4:** Reddit thread in r/UKPersonalFinance — "We built something that reads your complaint replies so you don't have to"
- **Ongoing:** Add Watchdog as a row in the homepage comparison grid vs DoNotPay / Resolver / Emma / Snoop (none of them do this)

### 12.4 PR angle

"First UK consumer-rights app to turn email replies into dispute-timeline entries automatically." That's a legitimate first — Resolver is manual, DoNotPay doesn't read user inboxes, Emma/Snoop don't do disputes at all. Pitch to: *The Times* Money section, *MoneySavingExpert* news, *The Sun* Money, *This Is Money*. Also TechCrunch UK given the AI angle.

---

## 13. Decisions needed from Paul before build starts

1. Confirm the migration filename date (I've used `20260420000000` — swap if you'd rather use today's date on your timezone)
2. Confirm the recommended default matching approach (**Hybrid A→B**) or push for full-auto Option B
3. Confirm Telegram alert default: **ON for Essential/Pro, OFF for Free** (Free doesn't get background cron anyway)
4. Confirm homepage hero tagline pick (1/2/3 above)
5. Confirm video length target — I've assumed 45s for short-form first cut

Once you approve the plan (or request changes), I'll build it in the order listed in §9.

---

*Drafted by Claude on 19 Apr 2026. Nothing in this plan has been deployed. No code has been modified. No database changes have been made.*
