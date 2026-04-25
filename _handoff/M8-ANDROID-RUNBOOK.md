# M8 — Android parity + FCM sender (runbook)

Everything I could do from this session is on disk. This is the user-side checklist to bring Android online end-to-end. Estimated 30-45 minutes of Mac time.

## What's already done (code side)

| Component | Path | State |
|---|---|---|
| Mobile shell (cross-platform push) | `paybacker-mobile/src/push.ts` | ✅ already platform-agnostic |
| Capacitor Android plugin | `paybacker-mobile/package.json` | ✅ `@capacitor/android@^8.3.1` listed |
| Server APNs sender | `lifeadmin-ai/src/lib/push/apns.ts` | ✅ on disk (untracked) |
| Server FCM sender | `lifeadmin-ai/src/lib/push/fcm.ts` | ✅ on disk (untracked) |
| Wired dispatcher | `lifeadmin-ai/src/lib/push/dispatch-push.ts` | ✅ on disk (untracked) |
| Vercel env vars | APNS_KEY_ID/TEAM_ID/P8/HOST/BUNDLE_ID + FCM_SERVICE_ACCOUNT_JSON | ✅ task #41 |
| Firebase project + Android app | paybacker-647fe, package `co.uk.paybacker.app` | ✅ task #23 |
| google-services.json | in `~/Downloads/` | ⏳ needs moving |

## Step-by-step

### 1. lifeadmin-ai server side (5 min)

```bash
cd ~/Code/lifeadmin-ai   # or wherever your local clone lives
npm install apns2 firebase-admin
```

Then open `src/lib/notifications/dispatch.ts` and replace the body of the `sendPush` function (the one with the `TODO: wire APNs (iOS) + FCM (Android) senders here` comment) with:

```ts
const { dispatchPushToUser } = await import('@/lib/push/dispatch-push');
return dispatchPushToUser(supabase, userId, payload);
```

Commit and push:

```bash
git add src/lib/push/ src/lib/notifications/dispatch.ts src/app/api/push/unregister/ package.json package-lock.json
git commit -m "feat(push): wire APNs + FCM dispatcher"
git push
```

This is the bit that's been getting reverted in my session — committing it locks it in.

### 2. paybacker-mobile Android target (10 min)

```bash
cd ~/Code/paybacker-mobile   # adjust to your local clone path
npx cap add android
```

This generates the `android/` folder.

Move the Firebase config:

```bash
mv ~/Downloads/google-services.json android/app/google-services.json
```

Open `android/app/build.gradle` and confirm:
- `applicationId "co.uk.paybacker.app"` (Capacitor sets this from capacitor.config.ts)
- the bottom of the file has `apply plugin: 'com.google.gms.google-services'` (Capacitor adds this when google-services.json is present at build time; if it's missing, add it explicitly).

Open `android/build.gradle` (the project-level one, not the app one) and inside the top-level `dependencies { ... }` block, confirm:

```
classpath 'com.google.gms:google-services:4.4.2'
```

(Capacitor 8.x adds this automatically on `cap add android`. If missing, add it.)

### 3. First Android run (10 min)

```bash
npx cap sync android
npx cap open android   # opens Android Studio
```

In Android Studio:
1. Wait for Gradle sync to finish (will fail if step 2 isn't right — fix and re-sync)
2. Connect an Android device via USB or start the Android emulator
3. Click ▶ Run

Confirm:
- App opens to a splash screen
- WebView loads paybacker.co.uk
- After login, the app requests notification permission
- Token POSTs to `/api/push/register` (check `push_tokens` table in Supabase — there should be a new row with `platform = 'android'`)

### 4. Smoke test the FCM transport (5 min)

From a Supabase SQL editor or a quick `curl` to your `/api/test/notification` endpoint (or trigger any real notification event), watch:

```sql
select * from notification_log
order by created_at desc
limit 5;
```

You should see `notification_type = 'push_sent'` (rather than `push_pending_transport` or `push_failed`).

If you see `push_failed`, check the Vercel runtime logs for `[push.fcm]` lines — the most common issue is FCM_SERVICE_ACCOUNT_JSON malformed (the JSON has to be on a single line with `\n` instead of real newlines in the `private_key` field).

### 5. Internal Testing release (5 min)

Build the AAB:

```bash
cd android
./gradlew bundleRelease
# output: android/app/build/outputs/bundle/release/app-release.aab
```

Note: you'll need to set up a release signing config first if Capacitor didn't generate one. Android Studio → Build → Generate Signed Bundle / APK has a UI for this (creates a keystore at `android/app/release.keystore`).

Upload the AAB to Play Console → Internal testing → Create new release → upload AAB → "Save" → "Review release" → "Start rollout to Internal testing".

## Things to watch out for

- **Gradle sync failures** are usually a JDK mismatch. Capacitor 8.x needs JDK 17+. `brew install --cask temurin` if Android Studio complains.
- **Push not received on Android** but token registered: open Firebase Console → Cloud Messaging → check that the project still has Cloud Messaging enabled. The legacy `Cloud Messaging API (Legacy)` is irrelevant — we only use the v1 HTTP API via firebase-admin.
- **`google-services.json` missing fields**: re-download from Firebase Console → Project Settings → General → Your apps → Android → download.
- **Android channel id mismatch**: dispatch-push.ts uses channel `paybacker-default`. The Capacitor push plugin auto-creates this channel on first push, so no extra setup needed.
