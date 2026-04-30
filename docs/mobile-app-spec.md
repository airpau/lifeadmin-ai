# Paybacker iOS App — Build Spec for Claude Co-Work

> **Audience:** an agent picking this up cold. You haven't seen the web
> repo. You don't need to understand the full product. Read this doc
> top-to-bottom and you'll have enough to ship a TestFlight build.
>
> **Companion repo (new, to create):** `paybacker-mobile` — a Capacitor
> shell that wraps the existing web app at **paybacker.co.uk**.
>
> **Host repo (already live, reference-only unless a milestone asks for
> changes):** `airpau/lifeadmin-ai` — Next.js 15 / Supabase /
> TrueLayer. Cloned on the user's machine at
> `/Users/paul-ops/.openclaw/workspace/lifeadmin-ai`.

---

## 1 · Mission

Build a thin native iOS app (then Android, same scaffold) that:

1. Loads `https://paybacker.co.uk` inside a native WebView.
2. Registers the device for push notifications (APNs) and POSTs the
   token to the host app.
3. Receives remote pushes for the events catalogued in
   `src/lib/notifications/events.ts` (price increases, renewal
   reminders, dispute replies, etc.) and taps deep-link into the
   matching dashboard route.
4. Ships to the App Store with a passable review story — privacy
   manifest, permission strings, screenshots, the lot.

**Success =** a user can install from the App Store, sign in with their
existing paybacker.co.uk credentials, get a price-increase push within
minutes when a test alert fires, and tap through to the Money Hub.

---

## 2 · Hard constraints

| Rule | Why |
|---|---|
| **No native IAP.** App is free; subscription upgrades happen on the website only. | Avoids Apple's 30% cut; avoids the "external payment" review grief. |
| **No pricing UI in the app.** Don't mention tiers, prices, or an upgrade CTA. The paywalled features simply do less when the user is on Free. | Apple rejects apps that advertise external subscriptions. |
| **Hybrid (live WebView), not static export.** Capacitor `server.url = https://paybacker.co.uk`. | Web releases ship instantly — no App Store resubmission per feature. |
| **App ID:** `co.uk.paybacker.app` (decided; do not change). | Matches the Apple Developer Program enrollment. |
| **Bundle only what's needed.** No analytics SDKs (PostHog already fires from the web). No extra UI in the shell beyond splash + offline screen. | Keeps the review surface tiny. |
| **Never commit secrets.** APNs `.p8`, Apple Team ID, Keystore passwords → env vars / GitHub secrets only. | Standard — and the `.p8` is irrevocable if leaked. |

---

## 3 · Pre-existing infrastructure (DO NOT rebuild)

The web repo already shipped these pieces in anticipation of the native
app. Reference them; don't duplicate.

### 3.1 · Push-token storage

- **Table:** `push_tokens`
  (`user_id`, `platform` ∈ `'ios' | 'android'`, `token`, `device_name`,
  `last_seen_at`, `created_at`, unique on `(user_id, platform, token)`).
  RLS enabled; users own their rows.
  Migration: `supabase/migrations/20260423080000_push_tokens.sql`.

- **Register endpoint:** `POST /api/push/register`
  - Body: `{ token: string, platform: 'ios' | 'android', device_name?: string }`
  - Auth: Supabase session cookie (travels because the app runs
    inside a WebView on paybacker.co.uk).
  - Returns `{ ok: true }` on success. Upserts by
    `(user_id, platform, token)`.
  - File: `src/app/api/push/register/route.ts`.

### 3.2 · Notification dispatcher

- **Unified dispatch:** `src/lib/notifications/dispatch.ts` —
  `sendNotification(supabase, { userId, event, email?, telegram?,
  push?, bypassQuietHours? })` routes to email / telegram / push per
  the user's preferences. Push is **stubbed**: the function reads
  `push_tokens`, logs `push_pending_transport` rows, and returns
  `false`. It's waiting on APNs + FCM credentials and an actual sender
  call — that's a deliverable in Milestone 5 below.

- **Event catalog:** `src/lib/notifications/events.ts` — 19 events
  with per-channel defaults + `allowedChannels`. Push is allowed on:
  price_increase, dispute_reply, dispute_reminder, renewal_reminder,
  contract_expiry, budget_alert, unused_subscription, savings_milestone,
  overcharge_detected, new_opportunity, support_reply, morning_summary,
  evening_summary, payday_summary.

- **User preferences:** `notification_preferences` table, one row per
  (user, event). Absent row = event defaults apply.

### 3.3 · Auth

- Supabase Auth, cookie-based session. The WebView shares cookies with
  Safari → login inside the app uses the existing web `/auth/login`
  flow. No native auth UI needed for v1.
- **Biometric** gate is a shell-side lock that sits *in front of* the
  WebView; it does not replace Supabase auth.

### 3.4 · Admin test-fire

- `POST /api/admin/test-notification` (admin bearer only) — sends a
  test message through the dispatcher. Useful for verifying push once
  Milestone 5 is live. Pass `{ email: "<target>" }` to aim at any user.

---

## 4 · Target architecture

```
┌──────────────────────────┐          ┌────────────────────────────┐
│  paybacker-mobile (new)  │          │  lifeadmin-ai (existing)   │
│                          │          │                            │
│  Capacitor iOS shell     │  HTTPS   │  Next.js 15 @              │
│  ├─ WKWebView            ├─────────▶│  paybacker.co.uk           │
│  │   server.url =        │          │  ├─ /api/push/register     │
│  │   paybacker.co.uk     │          │  ├─ /api/notifications/*   │
│  ├─ PushNotifications    │          │  └─ Supabase backend       │
│  │   plugin (APNs)       │          │                            │
│  ├─ BiometricAuth        │          │  APNs sender lives here    │
│  │   gate                │  ◀─────  │  (Milestone 5)             │
│  └─ App Store binary     │   APNs   │                            │
└──────────────────────────┘          └────────────────────────────┘
```

**Key idea:** the shell is ~2 KB of app logic. Everything else is just
the existing web app, which the user can already see at
paybacker.co.uk.

---

## 5 · Milestones

Each milestone is a self-contained PR (or branch) you can ship in
isolation. They are ordered so the user can verify progress at every
step.

### Milestone 1 · Scaffold `paybacker-mobile` (day 1)

**Deliverable:** a Capacitor 6 project that loads paybacker.co.uk in
iOS Simulator.

Steps:

1. Create a new repo `paybacker-mobile` (GitHub, private).
2. `npm init -y`, add Capacitor:
   ```
   npm i @capacitor/core @capacitor/cli
   npm i @capacitor/ios @capacitor/android
   npx cap init "Paybacker" "co.uk.paybacker.app" --web-dir=www
   ```
3. Create `www/index.html` with a single redirect so Capacitor has a
   web dir to build from (we'll override `server.url` anyway):
   ```html
   <!DOCTYPE html><html><head><meta charset="utf-8">
   <meta http-equiv="refresh" content="0; url=https://paybacker.co.uk/">
   </head><body></body></html>
   ```
4. Edit `capacitor.config.ts`:
   ```ts
   import type { CapacitorConfig } from '@capacitor/cli';
   const config: CapacitorConfig = {
     appId: 'co.uk.paybacker.app',
     appName: 'Paybacker',
     webDir: 'www',
     server: {
       url: 'https://paybacker.co.uk',
       cleartext: false,
       // Only permit our own origin so a phishing redirect can't take
       // over the shell.
       allowNavigation: ['paybacker.co.uk', '*.paybacker.co.uk'],
     },
     ios: {
       contentInset: 'automatic',
       scrollEnabled: true,
       limitsNavigationsToAppBoundDomains: false,
     },
     android: { allowMixedContent: false },
   };
   export default config;
   ```
5. `npx cap add ios`. Open in Xcode, run on iPhone 15 Simulator.
   Verify paybacker.co.uk loads and the user can sign in.

**Acceptance:**
- `npx cap run ios` boots the web app.
- User can sign in, navigate to the Money Hub, sign out.
- No cert warnings, no mixed-content errors.

### Milestone 2 · Native chrome (day 1–2)

**Deliverable:** splash screen, offline fallback, status-bar styling.

Plugins:

```
npm i @capacitor/splash-screen @capacitor/status-bar @capacitor/network
```

1. **Splash:** generate assets from a 2732×2732 PNG using
   `@capacitor/assets`:
   ```
   npm i -D @capacitor/assets
   mkdir -p assets && cp <brand-splash.png> assets/splash.png
   npx capacitor-assets generate --ios
   ```
   Use the dark-navy (#0F172A) brand background with the gold "P"
   mark centred. (Ask the user for the source asset.)

2. **Status bar:** in `App.vue`-equivalent bootstrap (single
   `src/main.ts` entry), set `StatusBar.setStyle({ style: Style.Dark })`
   on iOS launch so the white status-bar text reads on the navy top
   nav.

3. **Offline fallback:** subscribe to `Network.addListener` in the
   shell; when offline, overlay a native sheet with the brand and a
   "Reconnecting…" spinner. As soon as online fires, dismiss and
   `window.location.reload()`.
   File: `src/offline-overlay.ts` (shell-only, not the web app).

**Acceptance:**
- App icon + splash render correctly on cold start.
- Toggle airplane mode mid-session → branded offline screen shows,
  reconnecting dismisses it.

### Milestone 3 · Push notification registration (day 2)

**Deliverable:** the app requests notification permission on first
launch and POSTs the APNs token to `/api/push/register`.

1. **Plugin:**
   ```
   npm i @capacitor/push-notifications
   npx cap sync ios
   ```

2. **Enable capability** in `ios/App/App.xcodeproj`:
   Signing & Capabilities → +Capability → **Push Notifications**.
   This is mechanical; Xcode also needs a provisioning profile with
   the push entitlement, generated in the Apple Developer portal.

3. **Request + register flow** (shell code, e.g.
   `src/push.ts`):
   ```ts
   import { PushNotifications } from '@capacitor/push-notifications';

   export async function initPush() {
     if (Capacitor.getPlatform() === 'web') return;
     const perm = await PushNotifications.requestPermissions();
     if (perm.receive !== 'granted') return;
     await PushNotifications.register();
     PushNotifications.addListener('registration', async (token) => {
       // Post to host. Session cookie travels with the WebView
       // because we share a WKWebsiteDataStore.
       await fetch('https://paybacker.co.uk/api/push/register', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         credentials: 'include',
         body: JSON.stringify({
           token: token.value,
           platform: 'ios',
           device_name: (await Device.getInfo()).name ?? null,
         }),
       });
     });
     PushNotifications.addListener('pushNotificationReceived', () => {});
     PushNotifications.addListener('pushNotificationActionPerformed', (n) => {
       const deepLink = n.notification.data?.deepLink as string | undefined;
       if (deepLink) {
         window.location.href = `https://paybacker.co.uk${deepLink}`;
       }
     });
   }
   ```

4. **Gotcha — cookies across the WebView → fetch boundary:** the
   registration `fetch` runs in the **WKWebView's** JS context, not
   the native Swift side. Session cookies therefore travel normally.
   Do not try to read the Supabase cookie natively; keep the call
   web-side.

5. **Gotcha — first-launch timing:** wait until the user has signed
   in before calling `initPush()`. A pre-auth call returns 401 and
   silently drops the token. Hook it onto a `paybacker:logged-in`
   `window` event that the web app will dispatch (see Milestone 7).

**Acceptance:**
- Fresh install → permission prompt appears after login.
- `select * from push_tokens where user_id = <me>` returns a row with
  `platform='ios'`.
- No token is registered until the user is signed in.

### Milestone 4 · Deep linking (day 2–3)

**Deliverable:** tapping a push opens the app at the matching route.

1. Server side (host repo): update each event's push payload in
   `sendNotification` calls to include
   `data: { deepLink: '/dashboard/money-hub#price-alerts' }` etc. The
   `PushPayload` type already has `deepLink?: string` and
   `data?: Record<string, string>`. Thread the value through the APNs
   sender built in Milestone 5.

2. Shell side: already wired in the snippet above —
   `pushNotificationActionPerformed` reads `data.deepLink` and calls
   `window.location.href = …`.

3. **Universal Links (optional, later):** register
   `applinks:paybacker.co.uk` in `ios/App/App/App.entitlements` and
   host `.well-known/apple-app-site-association` on the web so a
   tapped link in Mail / Messages opens the app. Park this until the
   app is approved — Apple sometimes queries AASA during review.

**Acceptance:**
- Fire `POST /api/admin/test-notification` with a payload whose
  `data.deepLink = '/dashboard/subscriptions'` (you'll need to extend
  the admin endpoint or wire it via the Vercel log): app opens to the
  subscriptions page.

### Milestone 5 · APNs sender on the host (day 3)

**Deliverable:** replace the stubbed `sendPush` in
`src/lib/notifications/dispatch.ts` with a real APNs call.

File you'll touch in **lifeadmin-ai**, not paybacker-mobile:

1. `npm i apns2` (or `@parse/node-apn`). Prefer `apns2` — maintained,
   HTTP/2 native, zero deps.

2. New module `src/lib/push/apns.ts`:
   ```ts
   import { ApnsClient, Notification } from 'apns2';
   let client: ApnsClient | null = null;
   function getClient() {
     if (client) return client;
     client = new ApnsClient({
       team: process.env.APNS_TEAM_ID!,
       keyId: process.env.APNS_KEY_ID!,
       signingKey: process.env.APNS_KEY_P8!,  // raw .p8 contents
       defaultTopic: 'co.uk.paybacker.app',
       host: process.env.APNS_HOST ?? 'api.push.apple.com', // or api.sandbox.apple.com
     });
     return client;
   }
   export async function sendApnsOne(token: string, payload: {
     title: string; body: string; data?: Record<string, string>;
   }) {
     const n = new Notification(token, {
       alert: { title: payload.title, body: payload.body },
       sound: 'default',
       badge: 1,
       topic: 'co.uk.paybacker.app',
       data: payload.data ?? {},
     });
     await getClient().send(n);
   }
   ```

3. Unstub `sendPush` in `src/lib/notifications/dispatch.ts` — for each
   `push_tokens` row with `platform='ios'`, call `sendApnsOne`. Keep
   the existing `push_no_device` / `push_pending_transport` logs; add
   a third `push_delivered` on success and `push_failed` on error
   (capture the apns2 error code so `410 BadDeviceToken` can drive
   token cleanup).

4. On `410 BadDeviceToken` **delete** the `push_tokens` row — the
   device uninstalled or revoked. Do this in the same loop.

5. **Env vars on Vercel (production + preview):**
   - `APNS_KEY_ID` — 10-char ID from Apple Dev → Keys.
   - `APNS_TEAM_ID` — 10-char Apple Developer Team ID.
   - `APNS_KEY_P8` — raw PEM contents of the `.p8` file (leave the
     `-----BEGIN PRIVATE KEY-----` headers intact).
   - `APNS_HOST` — `api.sandbox.push.apple.com` for TestFlight /
     development certificates, `api.push.apple.com` for App Store.
     Keep a preview env pointed at sandbox so the dev build doesn't
     cross-fire production devices.

6. Android: add `FCM_SERVICE_ACCOUNT_JSON` env var + a parallel
   `sendFcmOne` in Milestone 8.

**Acceptance:**
- `curl -X POST https://paybacker.co.uk/api/admin/test-notification
  -H "Authorization: Bearer $ADMIN_BEARER" -H "Content-Type:
  application/json" -d '{}'` delivers an alert to your iPhone within
  ~10 seconds.
- `dispatch.delivered = ['telegram', 'push']` in the response.

### Milestone 6 · Biometric gate (day 3)

**Deliverable:** on cold launch, the app asks for Face ID before
revealing the WebView. Session still lives in the Supabase cookie;
this is only an app-level lock.

1. `npm i @capawesome-team/capacitor-biometrics` (or the community
   plugin — pick one with active maintenance; Apple-facing, not
   Google-facing).

2. Flow on `App.addListener('appStateChange')`:
   - On `active`, if `SecureStorage.get('biometric_enabled') === '1'`,
     present a native overlay and call `Biometrics.authenticate()`.
     Reveal the WebView only on success.
   - If the user has never enabled biometrics, skip the gate.

3. Settings entry point on the web: when inside the native shell
   (detected via `window.Capacitor?.isNativePlatform()`), show a
   "Enable Face ID" toggle on `/dashboard/settings/security`. The
   toggle writes to `SecureStorage` via a tiny postMessage bridge
   the shell exposes.

**Acceptance:**
- Toggle ON → close app → reopen → Face ID prompt → dashboard.
- Toggle OFF → close app → reopen → dashboard (no prompt).

### Milestone 7 · Web-side niceties (day 3–4)

**Deliverable:** small edits in **lifeadmin-ai** that make the mobile
shell feel polished.

1. **Expose platform flag.** Add to `src/app/layout.tsx` or a client
   boot script:
   ```ts
   // @ts-expect-error Capacitor global
   const isNative = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
   document.documentElement.dataset.nativeShell = isNative ? 'true' : 'false';
   ```
   Lets us hide "download the app" prompts / show a back button on
   native.

2. **Dispatch `paybacker:logged-in`** on successful auth so the shell
   can call `initPush()` at the right moment. Add the dispatch to the
   post-auth redirect target (probably `/dashboard/page.tsx` or
   wherever `supabase.auth.onAuthStateChange` fires).

3. **Remove upgrade CTAs on native.** Any `<UpgradeCta>` component
   gets `if (document.documentElement.dataset.nativeShell === 'true')
   return null`. Apple rejects anything that directs to external
   subscription purchase, however subtly.

4. **Safe-area CSS.** Add
   ```css
   :root {
     --safe-top: env(safe-area-inset-top, 0);
     --safe-bottom: env(safe-area-inset-bottom, 0);
   }
   ```
   Use in the top nav + bottom tab strip so they don't sit under the
   notch / home indicator.

### Milestone 8 · Android parity (day 4–5)

`npx cap add android`. Repeat Milestones 2–6 on Android:

- Splash + adaptive icon (via `@capacitor/assets`).
- FCM instead of APNs (same plugin API; token is FCM token).
- `FCM_SERVICE_ACCOUNT_JSON` env var on Vercel + parallel
  `src/lib/push/fcm.ts` using the `firebase-admin` SDK.
- Play Console listing prep in Milestone 9.

### Milestone 9 · Store submission prep (day 5–6)

**iOS — App Store Connect:**

1. **App privacy** (fill in):
   - Data types collected: Name, Email, Contact info, Financial info
     (bank transactions), User content (support messages),
     Identifiers.
   - Used for: App functionality, Product personalisation.
   - Linked to identity: Yes. Tracking: No.

2. **Privacy manifest** (`ios/App/App/PrivacyInfo.xcprivacy`). Add
   required-reason API declarations for:
   - `UserDefaults` — "Store user preferences" reason code `CA92.1`.
   - File timestamps — `C617.1` if we touch any file metadata.
   - Nothing else by default — we're a WebView shell.

3. **Permission strings** in `ios/App/App/Info.plist`:
   - `NSFaceIDUsageDescription` —
     "Use Face ID to unlock Paybacker securely."
   - `NSCameraUsageDescription` —
     "Attach a photo of a bill or letter to a dispute." (Only if we
     wire a native camera capture in v1. If not, omit — Apple
     rejects unused usage strings.)
   - `NSUserTrackingUsageDescription` — **leave out**; we do no ATT
     tracking.

4. **Screenshots (6.7" iPhone — required):**
   Must be 1290×2796. Produce 5:
   1. Homepage dashboard.
   2. Money Hub with Spaces tab.
   3. Dispute detail — "AI drafted reply".
   4. Subscriptions list with a detected price increase.
   5. Notifications settings.

5. **App Store listing copy:** (full text in
   `docs/mobile-app-store-listing.md` — create this file as a
   sibling.)
   - Subtitle (30 chars): "Dispute bills. Save money."
   - Promotional text (170 chars): see listing doc.
   - Description — lead with "Most UK households overpay by £1,000+
     a year. Paybacker finds it, disputes it, cancels it." Full copy
     to be drafted with the user.

6. **Test account for App Review** — create a sandbox user in
   Supabase + seed it with a revoked modelo-sandbox connection, one
   dispute, one price alert, and a Business / Personal Space. Supply
   credentials in the Review Notes. Apple rejects apps they can't
   sign into.

**Android — Play Console:** parallel, less strict. Same assets, no
privacy manifest, but a **Data Safety** form that maps to the same
declarations.

### Milestone 10 · Review-hardening pass (day 6–7)

Before submission, run through this list:

- [ ] No pricing or upgrade CTAs visible anywhere in the app.
- [ ] Sign-in works with the review account's credentials.
- [ ] All "Connect your bank" flows complete successfully in the
      sandbox (TrueLayer sandbox supports this — see the memory
      `project_bank_providers.md` in the host repo).
- [ ] App icon + splash correct on both light and dark system
      themes.
- [ ] No crashes during a 10-minute exploration session.
- [ ] Force-quit → relaunch → user stays logged in (Face ID if
      enabled).
- [ ] Pull-to-refresh works in the Money Hub.
- [ ] Log out → log in as a different user → push tokens aren't
      leaked to the old account. (Host-side `POST /api/push/unregister`
      on sign-out — **add this endpoint** if it doesn't exist.)
- [ ] Pure offline test: kill network → branded offline screen →
      restore network → app recovers without restart.

---

## 6 · File inventory (new repo)

```
paybacker-mobile/
├── capacitor.config.ts
├── package.json
├── www/
│   └── index.html                  # redirect to paybacker.co.uk
├── src/
│   ├── main.ts                     # bootstrap: statusbar + push + biometric
│   ├── push.ts                     # register + listeners
│   ├── biometric.ts                # cold-start gate
│   └── offline-overlay.ts
├── ios/
│   └── App/
│       ├── App.xcodeproj
│       ├── App/Info.plist          # permission strings
│       ├── App/App.entitlements    # push + (later) applinks
│       └── App/PrivacyInfo.xcprivacy
├── android/                        # added in Milestone 8
└── assets/
    ├── icon.png                    # 1024×1024 iOS
    ├── splash.png                  # 2732×2732
    └── screenshots/
        └── ios/6.7-inch/*.png
```

## 7 · Files to change in the host repo (lifeadmin-ai)

- `src/lib/push/apns.ts` — **new** (Milestone 5).
- `src/lib/push/fcm.ts` — **new** (Milestone 8).
- `src/lib/notifications/dispatch.ts` — replace the stubbed
  `sendPush`; import `sendApnsOne` / `sendFcmOne`.
- `src/app/api/push/unregister/route.ts` — **new** (Milestone 10).
  Accepts `{ token }` in the body and deletes the matching row so a
  user on a shared device doesn't keep getting another user's pushes.
- `src/app/layout.tsx` (or a client boot file) — set
  `data-native-shell` on `<html>`.
- `docs/mobile-app-store-listing.md` — **new** (Milestone 9, copy to
  be drafted with the user).

---

## 8 · Environment variables

Add to Vercel (both production and preview, separately for sandbox):

| Var | Purpose | Where from |
|---|---|---|
| `APNS_KEY_ID` | APNs auth key identifier | Apple Developer → Keys |
| `APNS_TEAM_ID` | Apple Developer Team ID | Apple Developer → Membership |
| `APNS_KEY_P8` | Raw `.p8` PEM contents | Apple Developer → Keys (download once!) |
| `APNS_HOST` | `api.push.apple.com` (prod) or `api.sandbox.push.apple.com` (TestFlight) | Pick per environment |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK service account JSON (one-line) | Firebase Console → Project settings → Service accounts |

**Never** set these on preview deployments pointing at production
tokens — they'll cross-fire real users' devices.

---

## 9 · Review risk register

What gets apps rejected, and how we pre-empt it:

| Risk | Mitigation |
|---|---|
| "App just loads a website." | Ship real native features: push, biometric, offline screen, splash, haptics. Document in review notes which native APIs we use. |
| "References external payment." | Strip every "Upgrade" / "Subscribe" / tier CTA on native. Run the web repo's UI in a native simulator and grep the DOM for £ / $ / "upgrade". |
| "Can't evaluate — we can't sign in." | Bundle a review-only test account in submission notes. Seed it with realistic data (one dispute, one price alert, one Space). |
| "Missing privacy manifest / required-reason API declarations." | Ship `PrivacyInfo.xcprivacy` from Milestone 9. Xcode 16 catches most of these. |
| "Uses camera/mic without a usage string." | If we don't use it in v1, don't include the capability. |
| "Face ID without usage string." | Include `NSFaceIDUsageDescription`. |
| "Bank-connection flow fails during review." | Put TrueLayer into sandbox mode for the review account so Apple's NYC IPs can complete a mock-bank connect flow. |

---

## 10 · Decisions needed from Paul before submission

Ask before shipping Milestone 9:

1. **Support URL** for the App Store listing (probably
   `paybacker.co.uk/support`).
2. **Privacy policy URL** and **Terms of service URL** — must be
   reachable without login.
3. **Marketing URL** — can be the homepage.
4. **Copyright line** — "© 2026 Paybacker LTD" probably.
5. **Primary + secondary categories** — Finance / Productivity
   (confirm).
6. **Age rating** — 4+ (no UGC, no violence, finance is fine at 4+).
7. **Review account** — create fresh or reuse an existing sandbox
   account? Flag any data that mustn't appear.
8. **D-U-N-S verification** — memory notes this may be pending. Apple
   requires it for the seller/developer name to show as "Paybacker
   LTD". Without it, it shows as "Paul Airey". Confirm status.

---

## 11 · Timeline estimate

| Days | Milestones |
|---|---|
| 1 | M1 scaffold + M2 native chrome |
| 2 | M3 push registration + M4 deep linking |
| 3 | M5 APNs sender + M6 biometric |
| 4 | M7 web niceties + M8 Android parity (start) |
| 5 | M8 finish + M9 store prep |
| 6 | M10 review hardening + submission |
| 7 | TestFlight review (external) |

Total: ~1 week of focused work plus Apple review time (24–48h for
TestFlight, 1–3 days for App Store).

---

## 12 · How to verify the handoff worked

At the end of Milestone 5, the user (Paul) should be able to:

1. Install the TestFlight build on his iPhone.
2. Sign in with `aireypaul@googlemail.com`.
3. Open the web admin panel and fire `POST
   /api/admin/test-notification`.
4. Receive the push on the iPhone within ~10 seconds.
5. Tap the push → app opens on the deep-linked page.

That's the success criterion for this spec. Everything else is polish.

---

**Questions while building?** Read `CLAUDE.md` in the host repo — it
lays out the product, pricing, tech stack, and the "never break prod"
rules you need to respect when editing `lifeadmin-ai`.
