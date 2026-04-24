# Paybacker UX Audit — April 2026

Comprehensive code-level UX review across the Paybacker public site and authenticated dashboard. Captures accessibility, error/loading/empty states, form validation, copy, interaction feedback, navigation, and information-architecture issues. Companion to the Playwright E2E suite in `/e2e`.

**Methodology:** Static analysis of every page file in `/src/app/` against the ui-ux-pro-max pattern set (priority 1–10: Accessibility, Touch, Performance, Style, Layout, Typography/Color, Animation, Forms, Navigation, Charts). Runtime/visual testing was not possible in this pass — findings that require live verification are marked `runtime-check`.

**Severity key:**
- `HIGH` — blocks a primary task, data loss risk, or accessibility-critical
- `MED`  — friction, confusion, or accessibility-important
- `LOW`  — polish, consistency, or accessibility-niceties

Reference numbers like [#288] map to shipped PRs that already addressed related patterns.

---

## Global patterns (apply across every route)

### A1. No global error boundary — `HIGH`
A runtime error in any dashboard route crashes the whole page with no user-facing fallback. Next.js App Router error.tsx conventions aren't in use at the route-group level.
**Fix:** add `src/app/dashboard/error.tsx` with a friendly "Something went wrong — [reload] [contact support]" card that captures and posts to Sentry/PostHog.

### A2. Skeleton loaders not consistent — `HIGH`
Several routes show a blank container → data pop-in (FOUC) rather than skeletons. Money Hub, Subscriptions, and Complaints all have this pattern. Users on slow connections see empty UI for several seconds.
**Fix:** use `loading.tsx` route-group files with matching skeleton shapes per surface.

### A3. Submit buttons don't disable during async — `HIGH`
Forms across signup, login, complaint-new, subscription-edit allow double-click submission. Backend usually idempotency-keys, but the UI should prevent it.
**Fix:** every submit button that triggers a mutation must spread `disabled={submitting}` + show a spinner (lucide `Loader2` + `animate-spin` is already imported everywhere).

### A4. Generic error copy — `MED`
"Failed to sign in", "Something went wrong", "Please try again" — these appear across auth, complaints, money-hub sync. Users don't get actionable next steps.
**Fix:** write an error-copy ladder:
- Network: "Can't reach Paybacker — check your connection."
- Auth: "Email or password doesn't match any account."
- Rate-limited: "Too many tries. Try again in 60 seconds."
- Server (5xx): "Our end — we're on it. [Retry] [Contact support]."

### A5. No skip-to-main-content link — `MED`
Keyboard and screen-reader users must tab through the full dashboard sidebar on every page.
**Fix:** add a visually-hidden `<a href="#main-content">Skip to content</a>` in `layout.tsx`.

### A6. Icon-only buttons without `aria-label` — `MED`
Several icon buttons across the dashboard were caught and fixed in #288/#290/#294/#296 mobile passes (close, dismiss, delete, month nav). A full sweep is still needed on: notifications list actions, rewards page, tutorials, export page, admin pages.
**Fix:** grep for `<button[^>]*>\s*<[A-Z]\w+\s+className=` across the repo to find remaining candidates, add `aria-label` to each.

### A7. Color-only status indication — `MED`
`STATUS_CONFIG` patterns in complaints, subscriptions, deals all convey state purely by color (amber/green/red). Fails for colorblind users and monochrome printing.
**Fix:** pair every color with either an icon, label, or distinctive shape (✓ for done, ⏸ for pending, ⚠ for attention).

---

## `/` (homepage via `preview/homepage/page.tsx`)

### H1. StickyCTA `aria-hidden` but still tabbable — `MED`
Line 782: the fixed bottom CTA fades out but keeps pointer-events + tab order, so a keyboard user can focus an invisible button.
**Fix:** toggle `inert` or conditionally `display: none`.

### H2. HeroDemo "Generate" has no validation feedback — `MED`
Lines 503–646. Clicking the button with an empty issue description silently disables the button with no inline error. User assumes nothing happened.
**Fix:** inline helper text on the textarea "Describe what went wrong (e.g. 'unexpected £40 charge on my energy bill')", and flash a toast/error if submitted empty.

### H3. Anchor scroll has no smooth behavior — `LOW`
Jumps feel jarring on mobile when tapping `#how`, `#features`, etc.
**Fix:** `html { scroll-behavior: smooth }` or use Framer's `scroll` helper if respecting `prefers-reduced-motion`.

---

## `/auth/signup`

### S1. Server errors only at top of form — `HIGH`
Line 460. "Email already in use" shows in a banner at top, not inline below the email input. Violates the "error near field" UX rule (ui-ux-pro-max #8).
**Fix:** lift server validation errors into a `fieldErrors: { email?: string, password?: string }` map and render each beside its field.

### S2. Submit button: text-only loading — `MED`
Line 467. Text flips to "Creating account…" but no spinner. Unclear if system is working.
**Fix:** use `<Loader2 className="animate-spin h-4 w-4" />` alongside the text.

### S3. Password strength aria-live announces full checklist — `MED`
Line 441. Screen reader re-reads the whole 3-rule list on each keystroke.
**Fix:** split each rule into its own `aria-live="polite"` region so only the rule that flipped is announced.

### S4. Password help text mismatches live checklist — `LOW`
Line 138 error says "8 chars + letter + number" but the live checklist shows 3 rules. User ticks all 3 and still sees "missing something" error if server validation trips.
**Fix:** single source of truth for password rules; import the same list into both the checklist and the error message.

### S5. Inconsistent "required" / "optional" signalling — `LOW`
Phone marked `(optional)`, first-name not marked as required. Users must guess.
**Fix:** label required with subtle asterisk; optional fields show "(optional)" in muted text.

---

## `/auth/login`

### L1. Lockout message has no escape — `MED`
Lines 76–86. After 5 failed attempts user sees a 60s lockout but nothing tells them what to do if they're locked out repeatedly (password reset link, support contact).
**Fix:** lockout message should include "Forgot password?" link prominently.

### L2. Generic "Failed to sign in" — `MED`
Line 83. No indication of why — wrong password, unknown email, network error, captcha? User can't fix what they can't diagnose.
**Fix:** map Supabase error codes to specific user-facing copy (see A4 above).

### L3. No inline email-format validation — `LOW`
Line 201. User can submit `notanemail` and only learn it's wrong after round-trip.
**Fix:** `onBlur` regex check with inline error.

### L4. Tab group focus unclear — `MED`
Lines 177–192. Magic-link vs. password tabs have no visible focus ring; Tab-key users can't see which is focused.
**Fix:** `:focus-visible` outline of 2–4px (matches ui-ux-pro-max accessibility rule `focus-states`).

---

## `/auth/accept-terms`

### AT1. "Checking your account…" shows no spinner — `MED`
Line 209. Static text, no animation. Page feels frozen.
**Fix:** `<Loader2 className="animate-spin" />` paired with the text.

### AT2. No context for why user is here — `LOW`
Users auto-redirected by the middleware terms-gate [PR #268] land here with no explanation of why they can't get to the dashboard.
**Fix:** above the consent form, add: "Before you continue, please accept our updated terms."

---

## `/auth/reset-password`

### RP1. Weak email validation — `MED`
Line 24. `email.includes('@')` accepts `a@.com`.
**Fix:** standard email regex or HTML `type="email"` which covers most cases.

### RP2. Emoji-as-icon without alt — `MED`
Lines 79–85. 🔑 rendered without `role="img" aria-label="Password reset"`.
**Fix:** wrap in `<span role="img" aria-label="Password reset">🔑</span>` — or better, replace with a lucide `<KeyRound />`.

### RP3. "60 minutes" → "1 hour" — `LOW`
Line 69. Shorter is clearer. Also mention checking spam folder.

---

## `/onboarding`

### O1. Loading spinner with no text — `MED`
Lines 93–96. Is it loading the page or checking account state? User can't tell.

### O2. "Skip" button affordance changes type — `MED`
Lines 829–843. On step 0, "Back" becomes a text link "Skip onboarding"; on later steps it's a `<button>`. Inconsistent click target size and visual weight.
**Fix:** always use a button with a clear label; change the label, not the element.

### O3. Skip-to-step-3 isn't obvious — `LOW`
Lines 517–518. Clicking "Skip for now — use Paybacker without data connections" jumps to step 3 (final). No breadcrumb feedback that user has jumped ahead.
**Fix:** visual step indicator already exists — add "(skipped connections)" subtitle on step 3 if connection data is missing.

### O4. Example-win is hard-coded Spotify — `MED`
Lines 711–798. If user connects a bank but has no subscriptions, they still see the Spotify £11.99 example card. Disappointing when they hit the real dashboard and find nothing.
**Fix:** if actual scan results exist, render the top one; else render the example with a clearer "This is what a win will look like" badge.

### O5. Choice cards lack hover state — `MED`
Lines 338–504. Bank / Email choice cards on desktop don't elevate or show pointer feedback. Users unsure they're clickable.
**Fix:** add `transition-shadow shadow-sm hover:shadow-md cursor-pointer` to each card.

---

## `/pricing`

### P1. Billing toggle wrong ARIA role — `MED`
`PricingGrid.tsx` line 30. `role="radiogroup"` with buttons, but buttons don't carry `role="radio"`. Screen reader announces "group" but no items.
**Fix:** either add `role="radio"` and `aria-checked` to each button, or switch the whole thing to a native `<input type="radio">` with visually-styled labels.

### P2. FAQ `<summary>` has no focus outline — `MED`
Line 442. Keyboard users can't see when an FAQ item is focused.
**Fix:** `summary:focus-visible { outline: 2px solid var(--accent-mint); }`

### P3. FAQ expand/collapse is instant — `LOW`
No transition, jarring UX.
**Fix:** `details[open] summary ~ *` animate with `interpolate-size: allow-keywords` (or use framer-motion with `AnimatePresence` if you need cross-browser).

### P4. "Save £14.89 vs monthly" copy is ambiguous — `LOW`
Unclear whether the £44.99 is after discount or the same annual total. Reword: "Annual billing saves you £14.89 vs paying monthly."

---

## `/about`

### AB1. Step numbers have no semantic meaning — `MED`
Line 382. "01", "02", "03", "04" styled with `fontFamily: 'JetBrains Mono'` but rendered in plain divs.
**Fix:** wrap content in `<ol>` or mark each section with `aria-labelledby` pointing at a heading; the numbers become CSS counters.

### AB2. Sticky timeline breaks on mobile — `LOW`
Line 268. `position: sticky` on desktop collides with fixed headers on mobile.
**Fix:** gate with `@media (min-width: 768px) { position: sticky; }`.

---

## `/dashboard` (overview)

### DB1. Single large spinner for 12 data regions — `HIGH`
Lines 27–133. Whole dashboard hangs on a single `loading` flag. Slow bank sync means user sees nothing for 10+ seconds.
**Fix:** independent loading states per region; skeletons per card.

### DB2. Browser `confirm()` for bank disconnect — `MED`
Lines 71–92. Uses native `confirm()` which looks out of place with the app's design. Can't style, can't add context.
**Fix:** custom confirm modal matching `.shell-v2` aesthetics with "Disconnect [bank name]? You'll stop getting daily sync and new alerts."

### DB3. Optimistic remove but no rollback on failure — `HIGH`
Lines 82–88. State removes the bank before server confirms. If server fails, UI shows bank removed but it's actually still there.
**Fix:** move the state update inside the `.then()` callback, OR implement proper optimistic pattern with rollback on error.

### DB4. Toasts have no auto-dismiss — `MED`
Errors stick until manually dismissed (or may disappear on route change). Inconsistent behaviour.
**Fix:** success toasts auto-dismiss in 3s; errors in 8s (or stay until dismissed if destructive).

### DB5. No empty-state CTA if user hasn't connected anything — `MED`
Fresh user with no bank / email / subs sees a grid of empty cards.
**Fix:** if every connection is absent, render a single large "Let's connect your first account" CTA.

---

## `/dashboard/money-hub`

### MH1. Multiple loading flags with no skeleton — `HIGH`
Lines 105–150. `loading`, `syncing`, `switching` all trigger different states but none show skeleton cards.
**Fix:** per-panel skeletons (Income card, Spending card, Net Worth card, Contracts card).

### MH2. Scan caption has no timeout — `HIGH`
Lines 148–150. If `scanning` hangs (network failure), the rotating message never recovers.
**Fix:** timeout after 60s → error toast with retry button.

### MH3. No CTA for no-bank-connected state — `MED`
Lines 128–130. Expected bills empty with no explanation.
**Fix:** "Connect a bank to see upcoming bills automatically" link.

### MH4. Collapsible panels don't announce state — `MED`
Keyboard users tab into Goals/Contracts panels but don't hear "expanded"/"collapsed".
**Fix:** `<button aria-expanded={isOpen} aria-controls="goals-panel">` pattern.

---

## `/dashboard/complaints`

### C1. No error boundary — `HIGH`
If disputes API fails, the page appears blank or crashes.
**Fix:** `src/app/dashboard/complaints/error.tsx`.

### C2. Loading state hangs on large threads — `HIGH`
A dispute with 50+ emails blocks the whole correspondence section.
**Fix:** paginate or virtualise the correspondence list; show first 10, "Load more" below.

### C3. 3-dot menu button no hover/focus — `MED`
`MoreVertical` icon appears dead.
**Fix:** `hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500`.

### C4. Form modals don't show submit spinner — `MED`
Edit-dispute and add-note modals' submit buttons go silent during the API call.

### C5. No breadcrumb on `/dashboard/complaints/[id]` — `LOW`
User has to use browser back to return to list.
**Fix:** `‹ All disputes` link at top-left of detail view.

---

## `/dashboard/subscriptions`

### SB1. Blank list while fetching — `HIGH`
Line 116. No skeleton — empty page for seconds.

### SB2. Empty state lacks prominent CTA — `MED`
"No subscriptions yet" is easy to miss; the "Add subscription" button should dominate the empty state.

### SB3. Form fields no inline validation — `MED`
Edit form only validates on submit.

### SB4. Error state not rendered — `MED`
Lines 140–142. `cancellationError` stored in state but no visible render location found in excerpt. Either error is invisible or it's rendered somewhere not easily found.
**Fix:** standardise on a `<FormError>` component used across every form.

### SB5. Optimistic delete without rollback — `MED`
Same pattern as DB3. Subscription disappears before server confirms.

---

## `/dashboard/contracts` & `/dashboard/contract-vault`

### CT1. Upload progress not visible — `MED`
Users uploading a PDF contract have no progress bar or "Reading your contract…" feedback; the page just waits.
**Fix:** progress bar + status copy.

### CT2. Extracted-terms grid was fixed [#294] but the "edit terms" flow isn't reviewed here — `runtime-check`
Haven't verified the edit modal works at mobile widths post-extraction.

### CT3. Contract end-date reminders: unclear cadence copy — `LOW`
"We'll remind you at 30, 14, 7 days" on pricing page, but no visible indicator on the contract itself of next reminder date.

---

## `/dashboard/deals`

### D1. Deal card dismiss was hover-gated [#294] — fixed
Still worth a runtime check that the dismiss actually POSTs to `/api/deals/dismiss` with the right id.
**Fix in e2e:** add a destructive test behind `DESTRUCTIVE=1`.

### D2. No active state on deal card click — `MED`
Cards have hover but no active press feedback.

### D3. Deal card "Not for me" vs dismiss X — `LOW`
Potential confusion between the two actions; the X is actually "not interested" but the copy on the in-card link may also say "not relevant".
**Fix:** unify copy; pick one word (suggest "Hide").

---

## `/dashboard/settings` (+ /spaces, /notifications, /telegram)

### ST1. No confirmation on destructive Space delete — `HIGH`
`settings/spaces/page.tsx:266` delete icon fires immediately. No confirm step. A mistap loses the Space and its grouping.
**Fix:** `window.confirm` at minimum; ideally a styled confirm modal with "Type SPACE-NAME to confirm" for destructive.

### ST2. Telegram unlink error copy — `MED`
`settings/telegram/page.tsx` Unlink button doesn't explain what unlinking loses (bot commands, alerts).
**Fix:** copy near button: "Unlinking stops all Telegram alerts but keeps your account data."

### ST3. Quiet-hours inputs missing helper text — `LOW`
`settings/notifications/page.tsx:156`. Start/End time inputs have no "timezone: UK" clarification. User abroad may not know which timezone these apply to.

---

## `/dashboard/profile`

### PR1. "Connect Email" modal provider cards now stack [#294] — verified
No further action.

### PR2. Subscription status (Member-since / Tier) shows no upgrade CTA if on Free — `MED`
User on Free tier sees their tier but no prominent upgrade button on the profile page.
**Fix:** if `tier === 'free'`, show an "Upgrade to Essential" CTA with the same styling as pricing page.

### PR3. Account deletion flow — `runtime-check`
Haven't verified the account-deletion page structure is accessible (I noticed `src/app/account-deletion/` appeared during a fetch but wasn't in scope).

---

## `/dashboard/rewards`

### RW1. Locked badge state low contrast — `MED`
Line 473: locked badges use `opacity: 40%` which on slate-50 backgrounds falls below 3:1 contrast for large text.
**Fix:** raise to `opacity-60` or switch to a grayscale treatment that still meets contrast.

### RW2. "Show all challenges" no active state — `LOW`
Line 571. Hover only.
**Fix:** add `active:text-emerald-800`.

### RW3. Redemption options grid cramped at 430px — `LOW`
Line 423 `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`. 2-col is fine for short cards but the Redemption cards have long titles ("£5 Amazon voucher", "1 free month Essential") that truncate.
**Fix:** `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5` — single col below 480px.

---

## `/dashboard/notifications`

### N1. Row onClick without keyboard handler — `HIGH`
`notifications/page.tsx:185`. Each row is a `<div>` with `onClick` but no `role="button"`, `tabIndex={0}`, or `onKeyDown`. Keyboard users can't open notifications.
**Fix:** change to `<button>` or add the three required attributes.

### N2. No active state on row — `MED`
Inline styles with no active pseudo-class.

### N3. Unread indicator relies on `background: #FEFDF7` — `MED`
Color-only signal. Colorblind users won't see it.
**Fix:** add a small `•` unread dot next to the title.

---

## `/dashboard/forms`

### F1. `Amount` + `Reference` now stacks on mobile [#296] — verified

### F2. No character count on issue textarea — `LOW`
Users typing their complaint don't know if there's a limit.
**Fix:** show `0 / 2000` counter below the textarea.

### F3. "Generate letter" button has no loading copy — `MED`
Just goes to the preview modal with no "Writing your letter…" feedback during the 10–30s Claude API call.
**Fix:** intermediate modal: "We're drafting your complaint letter using UK Consumer Rights Act…" with a spinner.

---

## `/dashboard/export`

### EX1. Format selection not reviewed — `runtime-check`
Export supports CSV / PDF per pricing page. Haven't reviewed the page for:
- date range picker ergonomics on mobile
- download feedback
- error state if export fails

---

## `/dashboard/tutorials` & `/dashboard/pocket-agent` & `/dashboard/upgrade`

Not flagged for issues in this pass — they're mostly static content pages. Recommend a dedicated pass when these have more interactive elements.

---

## Summary

**HIGH severity** (11 items): A1, A2, A3, DB1, DB3, MH1, MH2, C1, C2, SB1, N1, ST1

These block a primary task, risk data loss, or fail accessibility-critical criteria. Recommend scheduling these as a single "UX foundation" sprint.

**MED severity** (~40 items): bulk of the polish work. Bundle by theme:
- Error-copy ladder (A4 + L1 + L2 + RP1 + …)
- Skeleton loaders (A2 expansion across every async region)
- Button loading states (A3 expansion)
- Empty-state CTAs (DB5, SB2, MH3, …)
- Accessibility pass (A5, A6, A7, L4, P1, RP2, N1, …)

**LOW severity** (~15 items): can be folded into regular feature work.

## Next recommended action

1. Ship an `error.tsx` + skeleton primitives per route group (A1 + A2) — one PR, high leverage.
2. Standardise button-loading + error-copy patterns (A3 + A4) — single component library update.
3. Accessibility pass: icon-button `aria-label`, skip-link, focus rings (A5 + A6 + L4 + P1 + N1) — grep-driven PR.
4. Empty-state CTA pattern applied across dashboard (DB5, SB2, MH3, +deals, +complaints).

After that, individual-route polish (the MED bucket) can be parallelised across agents.
