# Paybacker UAT checklist — post-tier-gating audit

Run after Vercel has deployed PR #314 + #315. Login with
`aireypaul@googlemail.com` / `Chippy(1302)`.

Tick each item; anything ❌ — open a fresh chat with the failing
step + screenshot.

---

## 1 · Signup defaults a new user to Free

- [ ] Open an incognito tab, sign up with a throwaway email
      (e.g. `paul+uat-2026-04-27@googlemail.com`).
- [ ] After completing signup, go to **/dashboard/profile** —
      the plan badge should read **Free**, NOT Pro.
- [ ] Run this in Supabase SQL editor (or ask me):
      ```sql
      SELECT subscription_tier, subscription_status, trial_ends_at, founding_member
      FROM profiles WHERE email = 'paul+uat-2026-04-27@googlemail.com';
      ```
      Expect: `tier='free'`, `status='free'` (or null),
      `trial_ends_at=null`, `founding_member=false`.

---

## 2 · Free-tier blockers (use the throwaway account from §1)

### Bank cap
- [ ] Connect 2 banks (TrueLayer or Yapily). Both succeed.
- [ ] Try to connect a 3rd. Should be **blocked** with an upgrade
      prompt — page should redirect to subscriptions with
      `?bank_limit_reached=1` or 403 with the upgrade message.

### Email cap
- [ ] Connect 1 email (Gmail). Succeeds.
- [ ] Try to connect a 2nd email (any provider). Should redirect
      to **/dashboard/profile?email_limit_reached=1**.

### AI letter cap (3/month)
- [ ] Generate 3 dispute letters (any topic). All succeed.
- [ ] Try a 4th. Should hit a 403 with `upgradeRequired=true` and
      surface the UpgradeModal.

### Cancellation email (Essential+)
- [ ] On any subscription, click "Generate cancellation email".
      Should be **blocked** with 403 (banner / toast saying
      "available on Essential plan").

### Budgets / Goals (Essential+)
- [ ] Open Money Hub → try to create a budget. Server returns
      403 with upgradeRequired=true.
- [ ] Try to create a savings goal. Same — 403.

### Renewal reminders (Essential+)
- [ ] Hard to test live (cron-driven), but `/api/cron/renewal-reminders`
      now skips Free users in the per-user loop. Verify by adding
      a test renewal in 7 days and checking next cron run.

### Export (Pro)
- [ ] Hit `/api/export/csv` directly in browser → 403.
- [ ] Hit `/api/export/xlsx` → 403.

### MCP token mint (Pro)
- [ ] Go to **/dashboard/settings/mcp** → page should show
      "Pro feature" gate, not the token form.

### On-demand bank sync (Pro)
- [ ] On Money Hub, click "Sync now" on a bank → should show
      "Pro feature" upsell.

### Top Merchants (Pro)
- [ ] Money Hub spending panel → Top Merchants section should be
      gated with "Upgrade to Pro" overlay for Free.

---

## 3 · Now upgrade the throwaway account to Pro (manually via SQL)

```sql
UPDATE profiles
SET subscription_tier = 'pro', subscription_status = 'active'
WHERE email = 'paul+uat-2026-04-27@googlemail.com';
```

Refresh the dashboard. All previously-403'd endpoints should now
work. Verify:
- [ ] Sidebar badge → Pro
- [ ] Profile page → Pro
- [ ] Cancellation email generates without 403
- [ ] Budgets / Goals POST succeed
- [ ] Export CSV downloads
- [ ] On-demand bank sync runs

---

## 4 · Mobile dashboard layout

Open `paybacker.co.uk/dashboard` on a phone (or DevTools mobile view).

- [ ] **Single bell icon** at the top right (next to menu hamburger).
      No second bell appearing below the brand. ← PR #313 fix
- [ ] **Chat widget** in the bottom-right corner, NOT floating over
      mid-page content. ← PR #313 fix
- [ ] **Action centre** — open a fresh tab, count to 5. The
      "£X of potential savings" headline should appear in one go,
      not flick from a low number to a high number. ← PR #313 fix
- [ ] **Deals slowness** — second consecutive dashboard load (within
      6h) should be noticeably faster than first; cached deals
      render instantly. ← PR #313 fix

---

## 5 · Email scanning works for all providers

For each provider you have connected (Gmail, Outlook, IMAP):
- [ ] Open the Overview page → scroll to "Email scanner" widget.
- [ ] Click **Scan now**. Spinner → result count updates.
      ← PR #314 fix (provider-aware dispatch)
- [ ] After scan, the timestamp ("Last scanned X ago") refreshes
      to "today / a moment ago".
- [ ] Findings (if any) appear in the list below.

Repeat for the **Email Scanner page** (`/dashboard/email-scanner` or
similar) — the dedicated scan UI should also work.

---

## 6 · Cancellation flow end-to-end

- [ ] On a subscription with a known provider (e.g. Sky, Patreon),
      click **Generate cancellation email**.
- [ ] LetterModal opens with subject + body. Two new buttons:
      **Open in Email** (mailto pre-addressed to provider) and
      **I've sent it — track the reply**.
- [ ] In Supabase: a row in `disputes` with `issue_type='cancellation'`
      should now exist for that provider. ← PR #315 fix
      ```sql
      SELECT id, provider_name, issue_type, status, created_at
      FROM disputes WHERE user_id = '64a7d7bf-...'
        AND issue_type = 'cancellation' ORDER BY created_at DESC;
      ```
- [ ] Click "I've sent it" — toast confirms. Subscription flips to
      `pending_cancellation` in the list.
- [ ] In Supabase, a `dispute_watchdog_links` row should now exist
      with `match_source='auto_domain'` and the provider's domain.

When the provider eventually replies (real test takes days):
- [ ] Reply lands in your inbox. Watchdog cron imports it as a
      `correspondence` row tagged `company_email` with
      `entry_type='company_email'`.
- [ ] You mark the dispute "won" in the Disputes UI.
- [ ] **Subscription auto-progresses to `cancelled`** (PR #315 only
      fires this on `issue_type='cancellation'` + `outcome='won'`).

---

## 7 · Connection health banner

- [ ] In Supabase, flip one of your email_connections to broken:
      ```sql
      UPDATE email_connections SET status = 'needs_reauth'
      WHERE email_address = 'aireypaul@googlemail.com';
      ```
- [ ] Reload `/dashboard`. **Amber banner** appears at the top with
      "Sign-in expired — Reconnect" CTA. ← PR #295
- [ ] Click Reconnect → Google OAuth flow.
- [ ] On success, status returns to `active`, banner disappears.
- [ ] Same for bank: flip a `bank_connections.status = 'expired'` →
      banner shows "Reconnect <bank>". ← PR #298

---

## 8 · Nice-to-have spot-checks

- [ ] **Admin cancel-info page** (`/dashboard/admin/cancel-info`):
      coverage table renders, "Run refresh now" button fires the
      Perplexity cron, uncovered-providers list shows merchants
      not in the DB (with finance providers excluded — PR #301).
- [ ] **Telegram bot** if you use it: ask "list my spaces" → returns
      spaces. Ask "switch to business" → confirms. Ask for
      "this month's spending" — number should match Money Hub's
      monthly total.

---

## What to do if something fails

Open a chat with:
- The section + step number (e.g. "§5 step 3")
- A screenshot if visual
- The actual vs expected behaviour
- Any error in the browser console / network tab

I'll pick it up immediately.
