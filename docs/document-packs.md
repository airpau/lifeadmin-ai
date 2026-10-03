# Document packs, warranties, price-rise watch and the weekly digest (documents stage three)

Stage three builds on the documents vault (`docs/email-documents-vault.md`).
It adds seven consumer features:

1. Dispute evidence bundle
2. Mortgage or lender pack
3. Tax year pack
4. Price-rise watch
5. Insurance claim pack
6. Warranties and guarantees store
7. Weekly digest of dates coming up

Features 1, 2, 3 and 5 are **packs**, built on one small engine. A pack
is a ZIP of the user's own documents with an index PDF at the front.
Nothing in this stage sends anything to a company, a lender, an insurer
or an ombudsman. The user downloads or shares a pack themselves.

## Plans

| | Free | Essential | Pro / Household |
|---|---|---|---|
| See any pack's checklist (preview) | yes | yes | yes |
| Build packs | 1 a month | unlimited | unlimited |
| Share a pack by link | no | no | yes |
| Pack tools in Claude (MCP, read only) | no | no | yes (existing MCP Pro gate) |
| Warranties store, own warranty dates | yes | yes | yes |
| Warranty reminders (.ics and Todoist) | no | yes | yes |
| Price-rise watch | no | yes | yes |
| Weekly documents digest | no | yes | yes |

New fields on `PlanLimits` (`src/lib/plan-limits.ts`), all additive,
no existing value changed: `packBuildsPerMonth` (Free 1, others null),
`priceRiseWatch`, `warrantyReminders`, `documentDigest` (Essential and
above), `packSharing` (Pro and above). They are read through
`documentEntitlements()` in `src/lib/documents/plan.ts`, so trials and
Household seats get what `getEffectiveTier` says. Every route checks
them server side.

The Free build allowance:

- Builds are counted per calendar month (UTC). Each build stores a hash
  of what it contained (pack type, options, document ids and, for
  disputes, the correspondence). Rebuilding the same contents in the same
  month is free; a pack whose contents changed is a new build, so editing
  one pack cannot be used to build any number of different packs.
- A deleted pack still counts (soft delete keeps its counters), so
  deleting cannot reset the allowance.
- A build that fails gives the allowance back.
- The allowance check, the "one build of this pack at a time" lock and a
  "the pack has not been edited since it was read" check are taken
  together, atomically, by `document_pack_claim_build()` under a per-user
  advisory lock, so two tabs cannot both use the last build and an edit
  made during a build is never built with stale contents.
- A pack cannot be deleted while it is building. If it is deleted in the
  moment between the check and the build finishing, the new ZIP is
  removed and the pack stays deleted.

## The packs engine

`src/lib/documents/packs/`:

| File | What |
|---|---|
| `types.ts` | `PackDefinition`, checklist item, context, timeline types |
| `registry.ts` | the four definitions, `getPackDefinition`, type cards |
| `dispute-evidence.ts`, `lender.ts`, `tax-year.ts`, `insurance-claim.ts` | one definition per pack type |
| `engine.ts` | pure: selection (auto picks, user adds and removes, ID exclusion, order), checklist found and missing, timeline |
| `common.ts` | pure: dates, UK tax years, ID document detection, ZIP file names |
| `supplier-match.ts` | pure: supplier normalising and fuzzy matching |
| `load.ts` | reads candidates, the user's added documents and (disputes) the dispute and its correspondence, then runs the engine: `previewPack()` |
| `index-pdf.tsx` | the index PDF, `@react-pdf/renderer` on the server |
| `build.ts` | downloads, zips, uploads: `buildPackBundle()` |
| `rows.ts` | `document_packs` row helpers, `packAvailability()` |

A definition declares:

- `parseParams`: validates the pack's options (dispute id, tax year,
  policy and receipts)
- `candidateQuery`: which document types and date range to pull from
  the vault (or explicit ids)
- `autoSelect`: which candidates go in automatically
- `checklist`: required and optional items, each detected from the
  selected documents (`match`, optionally `assess` over the matches) or
  from context (`fromContext`, for dispute letters)
- `summary`, `timeline`, `includeRegisterCsv`, `sort`, `footnote`: how
  to render

The user's own choices are stored on the pack as `params.added_ids` and
`params.removed_ids`. Every preview and build re-runs the selection, so
documents filed after the pack was made show up.

**Identity documents are never put in any pack**, even when the user
adds one by hand (`looksLikeIdDocument`: passport, driving licence, ID
card, birth or marriage certificate, National Insurance number letter).
The index notes how many were left out.

### What a built pack contains

- `00 Index.pdf`: cover (title, pack type, options, who it is for, date),
  checklist with Included, Missing or Not found and what to do about each
  missing item, the definition's summary sections, a timeline (dispute
  evidence), the list of files (number, date, type, supplier, amount,
  file name) and, for disputes, the text of each letter and reply as
  exhibits
- the original files, named `NN YYYY-MM-DD Supplier, type.ext`, for
  example `03 2026-02-14 British Gas, bill.pdf`. The date is the
  document's own date, else the email date, else the filing date (the
  register's rule). Names are made unique with `(2)`.
- `Register.csv` (tax year pack only): the accountant register
  (`register.ts`), each row pointing at its file in the ZIP

The ZIP is stored in the private `documents` bucket at
`<user_id>/packs/<pack_id>/<name>.zip`, so the existing owner-only read
policy covers it. Downloads are 5 minute signed URLs with an ASCII
download name (`asciiFilename`); the route also returns the full
`Content-Disposition` value with `filename*`.

### Limits

- 95 MB of source files per pack (`MAX_PACK_BYTES`, correspondence
  attachments included), checked from the stored sizes before anything
  is downloaded and again as files arrive, so the ZIP with its index PDF
  and CSV stays under the bucket's 100 MB object limit (checked again on
  the finished ZIP). The migration raises the `documents` bucket object
  limit from 15 MB to 100 MB for this; single documents are still capped
  at 15 MB in code. The Supabase project's own upload limit (Storage
  settings) must also be at least 100 MB.
- At most 300 documents per pack.
- The build runs in the request (`maxDuration` 300) with a 240 second
  budget, checked before every download and before zipping, so a slow
  build fails with a message rather than being killed.
- Downloads run four at a time. Files are stored uncompressed (PDFs and
  images are already compressed); only text is deflated. Peak memory is
  about twice the pack size.

## The four packs

### 1. Dispute evidence bundle (`dispute_evidence`)

For one of the user's disputes. Reads `disputes` and `correspondence`
only; it never changes a dispute's state, outcome or correspondence.

- Correspondence comes through the Ombudsman escalation pack's own
  `buildEvidencePack()`, so exhibits are numbered in the same order
  (oldest first) as the paid escalation pack.
- Vault documents are picked when their supplier, or the sender's
  domain, fuzzily matches the dispute's `provider_name` or
  `merchant_normalised`. The user can add or remove any document.
- Correspondence attachments (uploaded to `correspondence-files`) are
  included when their path is under `disputes/<user_id>/<dispute_id>/`,
  except ones whose file name looks like an identity document, which are
  left out and listed as excluded like vault documents.
- Checklist: the letters you sent (required), the company's replies,
  bills, invoices or statements from the company (required), contract or
  terms, proof of payment.
- Entry point: `EvidenceBundleCard` on the dispute page, under the
  escalation pack section, linking to the Packs tab with the dispute
  chosen. It is additive, like `DisputeAgentBanner`.

How it relates to the £14.99 Ombudsman escalation pack: that product is
the drafted referral letter, the exhibit list and the deadlines. This
bundle is the files themselves, numbered the same way. It does not draft
anything and makes no AI call.

### 2. Mortgage or lender pack (`lender`)

Candidates: statements, letters, bills, policies and certificates from
the last 400 days.

| Item | Rule | Required |
|---|---|---|
| Bank statements for the last three months | the three calendar months before the current one; a statement counts for the period it states ("statement for August 2026") when it names one month; otherwise one dated in the first 10 days of a month counts for the month before (statements are issued just after their period) and a later one for its own month, the same rule for every month; credit card, mortgage, loan, pension, savings and bill-like statements are not bank statements | yes |
| Payslips | statement or letter with payslip wording, last 92 days, latest three | no |
| Proof of address | a bill (not a mobile phone bill) or a council tax letter, dated in the last 92 days, latest one | yes |
| Buildings or home insurance | policy or certificate with home, buildings or contents wording, still running by its renewal or expiry date, or dated in the last 400 days if it has neither | yes |
| Current mortgage statement | statement with mortgage wording, last 400 days | no |

Never includes identity documents.

### 3. Tax year pack (`tax_year`)

The user picks a UK tax year, 6 April to 5 April (from 2015 to 2016 up to
the current one). Every receipt, invoice and bill dated in it, using the
email date (then the filing date) for undated documents. Summary: totals
by type and by supplier in pounds, VAT, how many have no amount, how many
are in another currency (listed, not converted, not in the totals). Plus
`Register.csv`.

### 5. Insurance claim pack (`insurance_claim`)

The user picks the policy (any policy, certificate or contract), says
what happened (free text, up to 2,000 characters) and when (optional,
not in the future), and picks up to 50 receipts or invoices. The bundle
is the policy first, then the receipts, with a claim summary page: what
happened, the policy's dates, a table of the items with purchase date,
supplier and price, and the total. A warning appears when the policy
renewed or ended before the incident date. No auto-sending.

## Sharing a pack (Pro)

A pack share link is a row in the existing `document_share_links` with
the new nullable `pack_id` column set. Same token format, hash and
prefix, expiry (1 to 90 days), revocation and per-IP rate limits as the
register links. Up to 5 active links per pack.

- `/shared/pack/<token>`: the pack's name, checklist and one download
  button. Not indexed, no referrer.
- `/api/shared/pack/<token>/download`: re-checks everything and
  redirects to a 60 second signed URL.

The two kinds of link are kept apart in `resolveShareToken(admin,
token, kind)`: a pack link is refused by the register pages, and a
register link is refused by the pack pages. Existing callers default to
`'register'`. A link stops working when it is revoked, expires, its pack
is deleted (links are revoked on delete) or not currently built, or the
owner leaves a plan with `packSharing`. Revoking uses the existing
`DELETE /api/documents/share-links/[id]`.

## 4. Price-rise watch

Pure computation, no AI (`src/lib/documents/price-rise.ts`), run by
`src/lib/documents/price-rise-watch.ts` after every filing run (Find my
documents, Drive import, the daily filing cron) and on demand.

Rules:

- Documents: bills; policies and contracts (renewals); letters with a
  renewal date or renewal wording; statements only when they read like a
  bill (energy, water, broadband, phone, insurance, council tax). Bank and
  card statements are balances, not prices. Receipts and invoices are
  never compared: they are one-off purchases.
- Pounds only, above £5.
- Same supplier: fuzzy match on the normalised name. Bills compare with
  bills, policies with policies.
- Cadence from the typical (median) gap between the supplier's
  documents: up to 45 days monthly, up to 135 quarterly, up to 250 half
  yearly, 300 or more yearly (policies are always yearly). A gap between
  250 and 300 days is unclear and the supplier is skipped rather than
  guessed.
- The newest document is compared with the one dated closest to a year
  earlier: within 20 days (monthly), 35 (quarterly), 45 (half yearly) or
  60 (yearly).
- Flag when the rise is **more than 5 percent or more than £50 a year**
  (difference times 12, 4, 2 or 1). The per-merchant threshold the existing
  alert system auto-tunes (`getEffectiveThreshold`) is respected; it can
  only raise the 5 percent.
- A new amount over three times the old one is treated as two different
  things, not a price rise.

### How it fits the existing price increase alerts

Audited first: `price_increase_alerts` (migration 20260401000000),
`src/lib/price-alerts/suppression.ts`, `src/lib/price-increase-detector.ts`,
the `price-increases` cron, the `telegram-alerts` cron and the dashboard
`PriceIncreaseCard`.

- **Monthly rises (typical gap of 45 days or less) are fed into
  `price_increase_alerts`**, in exactly the
  shape the bank detector writes: monthly old and new amounts,
  `annual_impact` = difference x 12, `merchant_normalized` from the same
  `normaliseMerchantName()`, a category where the wording makes it clear.
  `buildPriceAlertSuppressor()` is asked first, so an active alert for the
  same merchant (from the bank feed or an earlier vault run) or a
  recently dismissed identical one stops a duplicate. From there the
  dashboard card, the Telegram alerts cron and the chat tool pick it up
  as they do bank alerts. The vault does not send its own notification.
- **Quarterly, half yearly and yearly rises are not**, because the consumers of that
  table treat the amounts as monthly direct debits: the Telegram alerts
  cron says "raised your direct debit" and "went up by £X/month". A £60
  rise on a yearly home insurance renewal would be announced as £60 a
  month. Fitting those in would mean changing that contract, so they are
  recorded only in the new `document_price_rises` table and shown on the
  Documents page.
- Every finding, monthly or not, is recorded in `document_price_rises`,
  with `price_alert_id` set when it was fed in. Before a finding is
  recorded or fed in: if the user dismissed a rise for the same supplier
  and cadence dated in the last 12 months, it is skipped (so next month's
  bill does not bring it back); if one is still active, that row is
  updated to the newer documents instead of adding a second row or a
  second alert.

## 6. Warranties and guarantees

- New nullable columns on `documents`: `warranty_until`, `warranty_note`,
  `warranty_todoist_task_id`. The `doc_type` CHECK is untouched.
- The classifier (`classify.ts`) now also returns `warranty_months` and
  `warranty_product` when a receipt, invoice or warranty certificate
  states a length. It is told never to guess one. Same single Haiku
  call; about 15 more output tokens.
- `warranty_until` = purchase date + length - 1 day (a 12 month warranty
  bought on 15 March 2026 covers to 14 March 2027), month ends clamped.
  The purchase date is the document date, else the email date. A warranty
  certificate that states its own end date and no length uses that date.
- If the warranty columns are missing (migration not applied), the
  document is still saved, without the warranty, and every documents
  list, search and share link page retries without the new columns.
- `PATCH /api/documents/[id]/warranty` (every plan): set the end date, or
  a length in months from the purchase date, and a note; or clear it.
- Reminders (Essential and above): `GET /api/documents/[id]/warranty/ics`
  (the same .ics builder, alarms 30, 7 and 1 days before) and
  `POST /api/documents/[id]/warranty/todoist` (a task 30 days before).
- Documents page: a warranty badge on each document, a Warranty button to
  set or correct it, and a "Warranties only" filter (soonest first).

## 7. Weekly digest

`/api/cron/document-digest`, Mondays 08:20 UTC (`vercel.json`; 09:20 in
British Summer Time).

**Off until `DOCUMENT_DIGEST_CRON_ENABLED=true`.** Rejects every call
when `CRON_SECRET` is unset.

- **Opt in.** The new event `document_digest` is in `EVENT_CATALOG`
  with every channel off by default, so it does nothing until the user
  turns it on, on the notification settings page or with the "Turn on the
  weekly digest" button on the Documents page (Essential and above; the
  same preference row). It is `scheduleKind: 'system'`: the time is fixed
  by the cron, so it is not offered as reschedulable.
- Finds documents with a due, renewal, expiry or warranty date from today
  to today + 30 days (London dates, both ends inclusive), grouped by user;
  only users who opted in and are entitled to `documentDigest` get one.
  Up to 25 dates each, soonest first.
- Sent through `sendNotification()`, so the user's channel choices and
  quiet hours apply.
- Email cap: the email leg only goes when `canSendEmail()` allows it, and
  a delivered email is recorded with `markEmailSent()`. The task type is
  the existing `renewal_reminder`, because `tasks_type_check` only allows
  listed types and widening it means replacing the constraint. Telegram
  and push are not affected by the email cap, as in the renewal
  reminders cron.
- Once a week at most: a `notification_log` row with reference key
  `document_digest:<user id>:<ISO week>` is claimed before sending and
  released when nothing was delivered. The user id is in the key because
  production has a unique index on `reference_key` alone.

## Tables and migration

`supabase/migrations/20261003130000_document_packs.sql`, additive, no
statement removes anything, safe to run twice:

| Change | Notes |
|---|---|
| `document_packs` | owner can select, writes server side, `updated_at` trigger; `pack_type` has no CHECK on purpose; `counted_build_at`, `counted_builds`, `counted_build_hash` for the Free allowance |
| `document_share_links.pack_id` | nullable, cascades when a pack row is removed |
| `documents.warranty_until`, `warranty_note`, `warranty_todoist_task_id` | nullable, partial index on `warranty_until` |
| `document_price_rises` | owner can select, unique per document pair; cadence monthly, quarterly, half_yearly or annual |
| `document_pack_claim_build()` | service role only, `search_path` pinned (as are the two trigger functions) |
| `documents` bucket object limit 15 MB to 100 MB | only ever raised |

Apply it before switching on the new features. The existing pages do not
depend on it: documents lists, search, downloads, reminders, the register
and accountant share links retry without the new columns (`42703` or
`PGRST204`) if the code is deployed first. The packs, price rises and
digest need the migration.

## Routes

Logged in (cookie session):

| Route | What | Gate |
|---|---|---|
| `GET /api/documents/packs/types` | pack types and plan availability | all |
| `GET, POST /api/documents/packs` | list, create a draft (validates options, works out the checklist) | all |
| `POST /api/documents/packs/preview` | checklist without saving | all |
| `GET, PATCH, DELETE /api/documents/packs/[id]` | fresh checklist, change, delete | all |
| `POST /api/documents/packs/[id]/build` | build the ZIP | Free 1 build a month |
| `GET /api/documents/packs/[id]/download` | signed URL | all |
| `GET, POST /api/documents/packs/[id]/share` | list, create pack links | Pro+ |
| `GET /api/documents/packs/disputes` | the user's disputes, for the picker | all |
| `GET, POST /api/documents/price-rises` | list, check now | Essential+ |
| `PATCH /api/documents/price-rises/[id]` | dismiss | all |
| `PATCH /api/documents/[id]/warranty` | set or correct | all |
| `GET /api/documents/[id]/warranty/ics` | calendar file | Essential+ |
| `POST /api/documents/[id]/warranty/todoist` | Todoist task | Essential+ |

Public: `/shared/pack/<token>` and `/api/shared/pack/<token>/download`.

Claude (MCP), Pro gate in `authenticateMcp`, read only:

| REST | Tool |
|---|---|
| `GET /api/mcp/packs` | `list_packs` |
| `GET /api/mcp/packs/[id]` | `get_pack` (checklist, documents, 10 minute download URL when built) |

Registered in the hosted `/api/mcp/v1` server (12 tools) and the stdio
package (`@paybacker/mcp` 0.4.0).

## Costs

- Packs, price-rise watch, warranty reminders and the digest make no AI
  call.
- The classifier asks for two more fields: roughly 15 to 30 more output
  tokens per new document, about $0.0001 on Haiku 4.5. Logged as before
  (`metadata.feature = 'documents_vault'`).
- Storage: a pack ZIP is about the size of its documents (most packs a
  few MB, at most 100 MB). Rebuilding replaces the ZIP; deleting a pack
  removes it.
- Email: the digest is at most one email a week per Essential and above
  user with dates coming up, inside the existing daily cap.
- Compute: a build is a few seconds for typical packs, up to the 240
  second budget for the largest.

## Environment variables

| Variable | Needed for |
|---|---|
| `DOCUMENT_DIGEST_CRON_ENABLED` | the weekly digest; `true` to switch on |
| existing: `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, Todoist and Supabase variables | |

No other new variables.
