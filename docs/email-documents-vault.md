# Documents vault (email upgrade, stage two)

The documents vault finds receipts, invoices, bills, statements,
certificates, policies, contracts and letters in a user's connected
inboxes (Gmail and Outlook), or takes them from Google Drive, and files
them in one searchable place with reminders before the dates that matter.

It is built on stage one of the email upgrade
(`feat/email-multi-account-security`): every inbox is handled as its own
connection, OAuth tokens are encrypted at rest and decrypted on read, and
every Gmail, Graph and Drive call goes through `fetchWithRetry` with a
deadline.

## Plans

| | Free | Essential | Pro / Household |
|---|---|---|---|
| Inboxes (existing limit) | 1 | 3 | unlimited |
| Find my documents (button) | yes | yes | yes |
| Automatic daily filing | no | yes | yes |
| Documents saved a month | 20 | unlimited | unlimited |
| Google Drive import | 1 file at a time | up to 10 at a time | up to 10 at a time |
| Reminders (.ics and Todoist) | no | yes | yes |
| Copy filed into own Google Drive | no | no | yes |
| Accountant register (CSV and share links) | no | no | yes |
| Document tools in Claude (MCP) | no | no | yes (existing MCP Pro gate) |

The limits live on `PlanLimits` in `src/lib/plan-limits.ts`:
`documentsPerMonth`, `autoDocumentFiling`, `documentReminders`,
`driveDocumentFiling`, `accountantRegister`, `driveImportMaxFiles`.
`src/lib/documents/plan.ts` turns a tier into entitlements and is used by
every route, so trials and Household seats get what `getEffectiveTier`
says they get. No gate is written as `tier === 'pro'`.

The Free monthly count includes documents the user later deleted, so
deleting and finding again cannot be used to go round it.

## How a document gets filed

1. **Candidates.** For each active OAuth inbox
   (`listActiveOAuthConnections`):
   - Gmail: three searches, the same idea as the inbox scanner's parallel
     queries. Attachments with a document-like subject, attachments with
     a document-like filename, and attachment-free receipts.
     Promotions, social and chats are excluded.
   - Outlook: Graph cannot mix `$search` with `$filter`, so a
     date-bounded `$filter` over message headers only, then a subject
     match in code (`DOCUMENT_SUBJECT_RE`, `BODY_RECEIPT_SUBJECT_RE`).
2. **Skip what was handled.** `document_processed_messages` holds every
   message with a final outcome. Those are never downloaded or classified
   again. Transient failures and quota stops are not recorded, so they
   are retried next time.
3. **Attachments.** Gmail MIME parts are walked (`listGmailAttachments`,
   keyed by part id because Gmail attachment ids change on every fetch).
   Graph attachments come from `/attachments` with `$select` so no bytes
   are listed, and files are downloaded through `/$value`, which handles
   large attachments. Item and reference attachments are skipped.
   MailHub's signature image rule is used and widened (inline images
   under 40 KB, any image under 10 KB, logo and Outlook auto names).
   Allowed: PDF, JPEG, PNG, WebP, HEIC, TIFF, Word, Excel, OpenDocument,
   CSV. Cap: 15 MB.
4. **Email with no attachment.** If the subject looks like a receipt,
   the email is classified first; only when the model says it is a
   document with confidence of at least 0.6 is a sanitised HTML snapshot
   stored. See "Why HTML and not PDF" below.
5. **Dedupe before cost.** SHA-256 per user, then
   (provider, message id, part). A file we already hold never costs an
   Anthropic call.
6. **Classify.** One Claude Haiku call (`claude-haiku-4-5-20251001`, the
   model the scanner already uses) with sender, subject, filename, type
   and up to 3,000 characters of email text. Strict JSON, every field
   validated. Anything unusable becomes `doc_type: 'other'` with low
   confidence; nothing throws. Every call is logged with
   `logAnthropicCall` (`metadata.feature = 'documents_vault'`).
7. **Store.** Private `documents` bucket, path `<user_id>/<sha256>.<ext>`,
   then the `documents` row.
8. **Pro.** If Drive is connected, a copy is uploaded to
   `Paybacker/<Type>/<Year>/` in the user's Drive, named
   `YYYY-MM-DD Type, Supplier.ext`. Failures are written to
   `documents.drive_error` and never stop filing.

PDF contents are not read. There is no PDF text parser in the repo and
this change does not add one, so classification works from the email
around the file. Adding one later is a contained change in
`classify.ts`.

### Why HTML and not PDF for body-only receipts

The only PDF renderer in the repo is `@react-pdf/renderer`, which draws
its own component tree and cannot render arbitrary email HTML. MailHub
converts through a temporary Google Doc, which needs a Drive token most
users will not have. A self-contained HTML file keeps the receipt as the
sender laid it out and costs nothing. It is sanitised (scripts, frames,
forms, event handlers, `javascript:` links and meta refresh removed),
carries a Content-Security-Policy that blocks scripts and all remote
loads (so no tracking pixels fire), and is always served as a download.

## Why a new table and bucket, not the Contract Vault's

`contract_extractions` requires every row to link to a dispute or a
subscription and its columns are contract terms. Loosening that would
change what the Contract Vault page shows. The `contracts` bucket's
storage policies are not in version control. So the documents vault has
its own `documents` table and `documents` bucket, created with its read
policy in the same migration. The Contract Vault is untouched and both
appear in the sidebar.

## Tables (all RLS enabled)

| Table | Purpose | End-user policy |
|---|---|---|
| `documents` | one row per stored file, classification, Drive copy, Todoist task id, soft delete | owner can select |
| `document_processed_messages` | one row per handled message (unique per user, connection, message) | owner can select |
| `drive_connections` | drive.file grant for the vault, encrypted tokens, cached Paybacker folder id | none (service role only) |
| `todoist_connections` | Todoist token, encrypted | none (service role only) |
| `document_share_links` | accountant links: SHA-256 hash and prefix only, expiry, revocation | owner can select |

Plus one nullable column, `email_connections.documents_scanned_at`, the
cursor for incremental daily filing. Storage: bucket `documents`
(private, 15 MB object limit) with policy `documents_owner_read` so a
logged-in user can only read objects under their own user id. All writes
are server side.

Migrations, all additive:

- `supabase/migrations/20261003120000_documents_vault.sql`
- `supabase/migrations/20261003120100_document_integrations.sql`
- `supabase/migrations/20261003120200_document_share_links.sql`

## Routes

Logged-in user (cookie session):

| Route | What | Gate |
|---|---|---|
| `GET /api/documents` | list and search (type, from, to, supplier, q) | all |
| `GET /api/documents/status` | entitlements, quota, Drive, Todoist, Picker config | all |
| `GET /api/documents/[id]/download` | 2 minute signed URL | all |
| `DELETE /api/documents/[id]` | remove the stored object, mark row deleted | all |
| `POST /api/documents/find` | Find my documents | all, Free cap |
| `POST /api/documents/drive/import` | import picked Drive files | all, Free 1 file |
| `GET /api/documents/drive/picker-token` | short-lived access token for Picker | all |
| `POST /api/documents/drive/disconnect` | forget the vault's Drive tokens | all |
| `GET /api/documents/[id]/ics` | calendar file | Essential+ |
| `POST /api/documents/[id]/todoist` | create one Todoist task | Essential+ |
| `POST /api/documents/todoist/disconnect` | revoke and forget | all |
| `GET /api/documents/register` | CSV register | Pro+ |
| `GET, POST /api/documents/share-links` | list, create | Pro+ |
| `DELETE /api/documents/share-links/[id]` | revoke | all (so a downgraded user can still switch links off) |
| `GET /api/auth/google-drive` (+ `/callback`) | Drive connect, drive.file only | all |
| `GET /api/auth/todoist` (+ `/callback`) | Todoist connect | Essential+ |

Public:

| Route | What |
|---|---|
| `/shared/register/<token>` | read-only register page, noindex, no referrer, 30 requests a minute per IP |
| `GET /api/shared/register/<token>/download/<docId>` | re-checks the token, redirects to a 60 second signed URL, 60 a minute per IP |

Share links stop working the moment the owner revokes them, they expire
(1 to 90 days, default 30), or the owner leaves a plan with the register.

Claude (MCP), `pbk_` token, Pro gate in `authenticateMcp`, read only:

| REST | Tool |
|---|---|
| `GET /api/mcp/documents` | `search_documents` |
| `GET /api/mcp/documents/[id]` | `get_document` (metadata plus 10 minute download URL) |
| `GET /api/mcp/email-findings` | `list_email_findings` (from `email_scan_findings`) |

The tools are registered in both `packages/paybacker-mcp/src/server.ts`
(stdio, version 0.3.0) and the hosted `/api/mcp/v1` server.

## Cron

`/api/cron/document-filing`, daily at 06:40 UTC (`vercel.json`).

**Off until `DOCUMENT_FILING_CRON_ENABLED=true`.** Until then it returns
`{ ok: true, skipped: ... }` without touching any inbox or calling
Anthropic. CRON_SECRET protected.

When on: users with an active OAuth inbox, pre-filtered to paid tiers,
open trials and Household seats, then confirmed with `getEffectiveTier`.
Least recently filed first. Run budget 250 s, at most 60 s, 25 saves and
30 messages per inbox per user. Incremental from `documents_scanned_at`
less two days; the first run for an inbox looks back 30 days.

## Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `DOCUMENT_FILING_CRON_ENABLED` | daily filing | `true` to switch on. Anything else is off. |
| `GOOGLE_PICKER_API_KEY` | Drive import | Browser API key. Restrict it to the Google Picker API and to `https://paybacker.co.uk/*` referrers. Not a secret by Google's design. |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | Drive import | The numeric project number of the project that owns `GOOGLE_CLIENT_ID` (Picker `setAppId`). Without it, picked files are not granted to the app. |
| `TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET` | Todoist | From the Todoist App Management console. |
| `TODOIST_API_BASE` | optional | Defaults to `https://api.todoist.com/api/v1`. |
| existing: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET` (or `CRON_SECRET`), `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL` | | |

## Google Cloud and Todoist set up

Google Cloud (the project that owns `GOOGLE_CLIENT_ID`):

1. Enable the **Google Picker API** and the **Google Drive API**.
2. Credentials, create an **API key**, restrict it to the Picker API and
   HTTP referrer `https://paybacker.co.uk/*`. Set it as
   `GOOGLE_PICKER_API_KEY`.
3. Copy the **project number** (Dashboard, Project info) into
   `GOOGLE_CLOUD_PROJECT_NUMBER`.
4. OAuth client, add the authorised redirect URI
   `https://paybacker.co.uk/api/auth/google-drive/callback`.
5. `drive.file` is already on the consent screen for the Sheets export.
   It is a non-sensitive scope, so no new verification is needed.

Todoist: create an app at the Todoist App Management console, set the
OAuth redirect URL to `https://paybacker.co.uk/api/auth/todoist/callback`,
copy the client id and secret.

## Costs

Haiku 4.5 is $1 per million input tokens and $5 per million output
tokens. A classification is roughly 1,000 to 1,500 input tokens and 150
output tokens, so about $0.002 (0.16p) per new document.

- Free: at most 20 saved documents a month, plus a one-off look at any
  body-only receipt candidates (each message classified once, ever). In
  practice well under 5p per Free user a month.
- Essential and Pro: duplicates and handled messages cost nothing. The
  cron caps each user at 25 new documents a day.
- Storage: Supabase storage for the files (typical receipt PDFs are
  50 to 300 KB).
- Drive, Picker, Todoist: free.

Spend shows on `/dashboard/admin/billing` under the Haiku model with
`metadata->>'feature' = 'documents_vault'`.

## Security notes

- Tokens: Drive and Todoist tokens are encrypted with stage one's
  `encryptToken`; read with `decryptToken`. The Sheets connection is read
  with `decryptToken` (plain text passes through) and never written to.
- OAuth: Drive and Todoist connects use stage one's signed state and
  nonce cookie (`google_drive` and `todoist` purposes).
- Drive: `drive.file` only. Disconnect does not call Google's revoke
  endpoint, because that would also cut off the Sheets export on the same
  Google account.
- Storage: objects always under `<user_id>/`; delete refuses any path
  outside it; downloads are short-lived signed URLs.
- Share tokens: 256-bit secret, hash and prefix stored, constant-time
  compare, IP rate limits, noindex, no referrer.
- Nothing is sent to anyone automatically. The cron only writes to the
  user's own vault and Drive. Todoist tasks and calendar files only exist
  when the user asks.
