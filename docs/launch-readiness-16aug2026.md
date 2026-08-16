# Paybacker launch readiness — 16 August 2026

Session summary. Everything below is deployed to `master` and live on
paybacker.co.uk unless explicitly marked otherwise.

Commits shipped this session: `9ee287d9`, `7a1697fc`, `1cfe5450`,
`6cd1f670`, `d5498f1c`, `49fcb353`. Full production build verified
before each push (`npx next build`, exit 0), not just typecheck.

---

## 1. What was fixed

### Legal risk in marketing copy (your top concern)

The comparisons to solicitors and claims firms are gone from the whole
site. Worth knowing where they were hiding: the visible homepage was
only part of it. The same claims sat in the page metadata that Google
and every social share actually read, and in the prompt for the daily
social-post generator, which would have kept regenerating them
regardless of what the pages said.

- Hero is now "Your AI financial helper. In your pocket. On your side."
- The whole "why people pay solicitors and claims firms" section is
  deleted, including both price cards
- Pocket Agent promoted to the first feature section, hero CTA points at it
- Metadata, OG and Twitter cards rewritten
- Social-post generator now has explicit rules forbidding the comparison
- Removed unevidenced outcome claims: "usually four-figure savings",
  "most letters do succeed", "the only UK app", "beats every incumbent"
- Every "we are not a law firm" disclaimer deliberately kept

Also corrected a false product claim: three pages advertised two-way or
bi-directional Google Sheets sync. It is one way. Copy now says so
plainly.

### Billing (this was losing you money)

**No logged-in user could upgrade.** `/pricing` posted to checkout
without the confirmation flag, the API replied 409 asking for
confirmation, and the client had no handler for that case, so it fell
through to an alert and never redirected. The recovery link was wrong
too: checkout emitted `?priceId=` while `/upgrade` reads `?plan=`,
defaulting to Pro, so an Essential upgrade would have shown the Pro page.

Both fixed, plus:

- Telegram bot bypassed the paywall entirely. Free users had unlimited
  AI letters through it, which nullified your main Free to Essential
  lever. Letters now count against the 3/month cap, and cancellation
  emails, budgets, savings goals and top merchants are tier-gated
- `/api/founding-member` publicly granted anyone Pro plus permanent
  exemption from downgrade. Now gated behind an env flag
- Two divergent hardcoded price-to-tier maps both defaulted unknown
  price IDs to Essential, so changing a price ID in env would have
  written every Pro subscriber down. One canonical map now, and unknown
  IDs skip the write entirely rather than guessing
- Bank limit message said Free allows 1 connection; it is 2
- The profile page now renders the upgrade banner that the Gmail and
  Outlook routes have been redirecting to all along. That redirect
  landed on a page that showed nothing, at the highest-intent moment in
  the funnel

### Subscription tracking

Root cause of one-off payments showing as recurring: the detector needed
only 2 payments and checked "weekly" first with a five day tolerance, so
any two payments 2 to 12 days apart matched, then got rewritten to
"monthly". Two Tesco shops a week apart became a monthly subscription.

There was also a second, hidden writer: a Postgres function inserting
subscriptions on every bank sync, whose dedup deliberately ignored
dismissed rows. That is why deleted subscriptions kept coming back.

- New qualification core: 3+ occurrences, 2+ intervals, all inside one
  tight cadence window, amounts within 8% of median, 13-month lookback,
  series must not have lapsed. Supermarket, fuel and retail merchants
  need 4+ identical amounts
- Dismissals are permanent now
- The rogue function no longer writes subscriptions (migration applied
  to production)
- The daily cron re-checks existing bank-detected subscriptions against
  the new rules and flags ones that no longer hold as needs_review. It
  never deletes or changes status, so you decide

Category pills were invisible because the palette was built for the old
navy theme and the cards are white now. Re-mapped, plus the 10 category
keys that writers emit but the config never had.

### Money Hub mobile

- Recategorise pickers rebuilt as bottom sheets on mobile. The ledger's
  picker had no positioned ancestor, so it anchored to the document
  rather than the row, and was 320px wide with no clamp
- Modal backdrops were opaque white behind white cards, so the screen
  went blank and read as a crash
- Saving no longer wipes the list and refetches, which was throwing you
  back to the top of an infinite scroll
- Health Score pillars and the trends tooltip were hover-only with
  pointer-events-none, so unreachable on touch. Both tappable now
- Page reordered so the financial picture leads
- Removed 63 stale editor artefact files

### Google Sheets and file exports

The export filtered bank connections to `active`/`token_expired`, but
consent renewal routinely moves users to `expiring_soon` then `expired`
as Open Banking consent rolls every 90 days. With no matching connection
it wrote zero rows and reported success. Then `sync-now` discarded the
error field, so every failure surfaced to you as "All caught up".

- Connections excluded only when permanently dead
- Real errors now shown, with a Reconnect button where that is the fix
- Missing or deleted spreadsheet self-heals: new sheet, full backfill
- Initial backfill runs via `after()` instead of a fire-and-forget fetch
  that Vercel dropped when the lambda froze
- CSV and Excel were capped at the oldest 1000 rows by PostgREST. Both
  paginate now. CSV also defangs formula injection

### WhatsApp cost and fatigue

A busy day could be 8 to 20 separately billed templates: one per credit,
one per large debit, one per budget category, three renewal messages in
one morning.

- New evening digest groups queued alerts into one message per user
- Hard cap of 2 paid templates per user per day; anything over is
  queued, not dropped
- In-window sends now prefer free text over paid templates
- Quiet hours 22:00 to 07:30 defer
- Implements the marketing opt-in and 24h cap that a migration
  documented but no code ever enforced
- Deleted `whatsapp-intraday`: it claimed to have replaced two crons
  that were in fact still scheduled, and its design allowed 10 billed
  templates a day

Estimated roughly £12.60 to £2.70 per Pro user per month. Telegram is
unchanged and stays rich.

### MCP

- New `/api/mcp/accounts` so Claude can see accounts, not just
  transactions. This was the gap for the GymIQ use case
- `get_accounts` added to the packaged server and rebuilt
- Health endpoint reported 27 tools against 30 registered, and two
  different version numbers. Both derive from one constant now
- CLAUDE.md pointed every session at a legacy server and a
  `get_project_briefing` tool that does not exist on the canonical one

---

## 2. Blocking launch

### B1. Yapily consent cannot read transactions (critical)

Since 15 Aug 20:00 UTC every sync returns 403 on all four HSBC accounts:
three with "insufficient rights, consent does not have the right
privileges", one with "consent must has been revoked". `/accounts`
returns 200 but `/transactions` refuses, and all six requested scopes
are advertised by `hsbcbusiness_uk`.

This is not something we can fix in code. Ask Migle directly on the
call, it is a genuine question for her. Build review points 5, 9 and 11
have no working live artefact until it is resolved.

### B2. Your MCP tokens are both revoked

Tier is fine (Pro, active), but both tokens were revoked minutes after
minting during UAT in April. Mint a fresh one at
`/dashboard/settings/mcp`. Nothing MCP works until you do.

Note the packaged server is not published to npm, so
`npx -y @paybacker/mcp` fails. Use the local path:

```json
{
  "mcpServers": {
    "paybacker": {
      "command": "node",
      "args": ["/Users/paul-ops/lifeadmin-ai/packages/paybacker-mcp/dist/server.js"],
      "env": { "PAYBACKER_TOKEN": "pbk_<your fresh token>" }
    }
  }
}
```

Balances will read null until the bank reconnects, because the
connection is `token_expired` and balances were never populated.

### B3. Rotate a leaked credential

`docs/claude-desktop-setup.md` line 14 has a live Meta Graph API token
committed in plaintext. Rotate it in the Meta developer console and
replace the doc value with a placeholder. Removing it from HEAD does not
remove it from git history.

### B4. Check the Google OAuth consent screen

`docs/GOOGLE_OAUTH_CHECKLIST.md` reads as though the app is still in
Testing mode. If so, Google expires refresh tokens after 7 days, which
would independently explain your Sheets symptom regardless of the code
fix. Worth confirming the publishing status in Google Cloud Console.

---

## 3. Migle demo

`docs/migle-signoff-pack.md` has the full verification table, the
click-by-click script and the pre-call checklist.

All 11 points are genuinely implemented in current code, independently
verified rather than taken from the previous runbook. The Yapily test
suite passes 44 of 44.

Two instructions in the older runbook are now wrong:

- "Don't reconnect the dead bank" — the reconnect already happened on
  15 Aug and produced the broken consent. A clean reconnect is now
  needed. The point 6 evidence is permanently in Yapily's logs anyway
- "Click Sync now on the dead connection" — this fired nothing, because
  Sync now filtered to `active` only. Fixed this session, so it works
  now, but re-read the corrected script rather than the old one

Only demo steps 2 and 3 need your phone. The other eight are solo.

---

## 4. Worth doing, not blocking

- `src/lib/category-taxonomy.ts` buckets `credit` as discretionary, so a
  bank credit is counted as spending. Pre-existing, out of scope this
  session
- Branches `fix/mcp-schema-bugs` and `fix/mcp-finance-tier-essential`
  are unmerged. The first fixes a misleading Pro upsell shown on token
  failure
- `/pricing` now shows a browser confirm and then the confirmation page.
  Removing the browser confirm would clean up the double prompt
- Money Hub "Better Deals" sits inside the Action Centre card, so it did
  not move in the reorder. Extracting it is a larger refactor
- Budgets and goals PUT/DELETE are ungated, only POST is gated. A
  downgraded user keeps edit access
- The institution picker shows 4 UK institutions, two of them sandboxes
  (`mock-sandbox`, `natwest-sandbox`). Migle will see this
- Onboarding CTAs link to `/api/auth/yapily` with no institutionId and
  return raw 400 JSON

---

## 5. Suggested order

1. Mint an MCP token (2 minutes, unblocks GymIQ)
2. Rotate the Meta token
3. Check the Google OAuth publishing status
4. Read `docs/migle-signoff-pack.md`, do a clean bank reconnect, then
   run the demo with Migle and raise B1 with her directly
5. Test the upgrade flow end to end yourself with a real card, since it
   has never once worked for a logged-in user
