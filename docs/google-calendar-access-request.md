# Adding Google Calendar to Paybacker (calendar.events)

Today, document reminders are a calendar file (.ics) the user taps to
add, plus Todoist. That works with every calendar and needs no Google
approval. This note is the plan for also adding events straight into a
user's Google Calendar, which needs a new Google scope.

Nothing in the current code asks for Calendar access.

## What Google will treat it as

- `https://www.googleapis.com/auth/calendar.events` is a **sensitive**
  scope, not a restricted one. It needs Google's **sensitive scope
  verification** (a review of the consent screen, privacy policy and a
  demo video). It does **not** need a CASA security assessment; CASA is
  only for restricted scopes such as `gmail.readonly`, which Paybacker
  already holds and keeps reassessing on its own schedule.
- Adding a scope to an app that is already verified sends the app back
  through review for that scope. Until it is approved, anyone asked for
  the new scope sees Google's "unverified app" warning, so the Calendar
  connect must be a separate, optional step (see the code plan below)
  and never part of the existing Gmail connect.
- Before submitting, check Google's current scope list for a narrower
  option. `calendar.events.owned` (only events the user owns) and
  `calendar.app.created` (only calendars the app creates) both exist; if
  `calendar.app.created` is still classed as non-sensitive when you
  apply, a dedicated "Paybacker reminders" calendar would avoid the
  review entirely. Confirm the classification on the day; it has changed
  before.

## Steps for Paul

1. **Google Cloud Console**, the project that owns `GOOGLE_CLIENT_ID`:
   APIs and Services, Library, enable **Google Calendar API**.
2. **Google Auth Platform, Data access** (the old "OAuth consent screen,
   Scopes" page): Add or remove scopes, add
   `https://www.googleapis.com/auth/calendar.events`, save.
3. **Branding**: check the app home page, privacy policy and terms links
   still point at paybacker.co.uk and the domain is still verified in
   Search Console.
4. **Privacy policy** (`/privacy-policy`): add a short Google Calendar
   paragraph: what we write (one event per reminder the user asks for)
   and that we do not read other events. Also add the Google API
   Services User Data Policy "Limited Use" statement. As of this branch
   the page mentions read-only Gmail access but has no Limited Use
   statement and does not mention Google Drive, so it is worth doing for
   Gmail and Drive at the same time; reviewers look for it.
5. **Demo video** (unlisted YouTube link): show signing in, opening
   Documents, pressing "Add to Google Calendar" on a renewal, the Google
   consent screen with the Calendar scope and the app name visible, and
   the event appearing in Google Calendar. Show the OAuth client id in
   the browser address bar on the consent screen.
6. **Justification text** for the scope, for example: "Paybacker adds a
   single reminder event to the user's own Google Calendar when they
   press Add to Google Calendar on a bill, policy or certificate in their
   documents vault, so they are reminded before a renewal, payment or
   expiry date. We only create and update the events we add. We do not
   read, change or delete any other event."
7. **Submit for verification** from the Verification centre and answer
   Google's emails promptly. Sensitive scope reviews usually take from a
   few days to a few weeks.

## What changes in code once approved

1. `src/lib/oauth-state.ts`: add a `google_calendar` purpose.
2. New connect route `/api/auth/google-calendar` (and `/callback`):
   request only `calendar.events` with `include_granted_scopes=true`
   (incremental consent), signed state, tokens encrypted with
   `encryptToken`. Store in a new `calendar_connections` table (new
   migration, RLS on, no end-user policies), the same shape as
   `drive_connections`.
3. New route `POST /api/documents/[id]/google-calendar`, gated on
   `PlanLimits.documentReminders`, that calls
   `POST https://www.googleapis.com/calendar/v3/calendars/primary/events`
   through `fetchWithRetry` with:
   - the same title, description and 09:00 Europe/London time the
     `.ics` uses (`buildDocumentIcs` in `src/lib/documents/ics.ts`)
   - `reminders.useDefault = false` and popup overrides at 28 days,
     7 days and 1 day (Google's maximum reminder is 4 weeks, so the
     `.ics` file's 30 day alarm becomes 28 days here)
   - a stable `id` derived from the document id and date kind, so
     pressing twice updates rather than duplicates
   Store the returned event id on the document (an additive
   `google_event_id` column).
4. `src/app/dashboard/documents/page.tsx`: an "Add to Google Calendar"
   button next to the existing Calendar (.ics) and Todoist buttons,
   shown only when `/api/documents/status` reports the calendar
   connection, with a Connect link otherwise.
5. Docs: `docs/email-documents-vault.md` and the env table (no new env
   vars; the Google client is the existing one).
