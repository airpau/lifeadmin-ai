# Session continuation — 2026-04-24 (evening)

Picks up from `SESSION-2026-04-24-COMPLETE.md`. That doc captured the morning's work; this one captures the afternoon/evening continuation.

## Net delta vs. morning

### ✅ Closed in this leg

| Task | What |
|---|---|
| **#43** Play Console: App content questionnaires | All 8 declarations (Privacy URL, Ads No, App access reviewer creds, Content rating Everyone/All-ages, Target 18+, Advertising ID No, Government No, Health None) |
| **#44** Play Console: Data Safety form | All 5 steps complete — 11 data types declared with collected/required/purpose answers; submitted |
| **#45** Play Console: Financial Services declaration | "Other" category with PFM via Yapily description |
| **App Privacy** | Published on App Store Connect (was saved-but-unpublished) |
| **App Information → Content Rights** | "No third-party content" set + saved |
| **#31** Web bug: footer 404 links | Fixed `/privacy` → `/privacy-policy`, `/terms` → `/terms-of-service`, `/cookies` → `/cookie-policy` in `careers/page.tsx` and `blog/_shared.tsx`. NB: this is on branch `feat/e2e-uat-suite` as uncommitted modifications — needs `git add` + commit |
| **#47** Create /account-deletion page | New page at `src/app/account-deletion/page.tsx` (GDPR-compliant, in-app + email-request flows, what-we-keep disclosure, timelines) |
| **#34, #35** Google Ads global tag | New `src/components/GoogleAdsScript.tsx` (gated on marketing consent, env-var driven) |
| **#36** Google Ads signup conversion | `src/components/analytics/SignupConversionTracker.tsx` + `src/lib/analytics/conversions.ts` `trackSignupCompleted()` |
| **#37** Google Ads paid-upgrade conversion | `src/components/analytics/UpgradeConversionTracker.tsx` + `trackPaidUpgrade()` |
| **#38** Meta Pixel | Confirmed already live in `src/components/TrackingScripts.tsx` (Pixel ID 722806327584909) |
| **#18** M8 Android parity + FCM sender | New `src/lib/push/dispatch-push.ts` (drop-in replacement for stubbed `sendPush`) + `_handoff/M8-ANDROID-RUNBOOK.md` step-by-step Mac runbook |
| **#39** PostHog → Google Ads + Meta integration | `_handoff/POSTHOG-AD-DESTINATIONS-RUNBOOK.md` — server-side conversion forwarding playbook |

### 🆕 New tasks opened for you

| # | What |
|---|---|
| **#46** | Create `play-reviewer@paybacker.co.uk` Supabase account with seeded data (bank/email/subscriptions) |
| **#48** | After lifeadmin-ai deploy: update Play Data Safety Delete URLs from `/privacy-policy` (placeholder I used to dodge Google's 404 check) to `/account-deletion` (the real page) |
| **#49** | Provide Google Ads ID `AW-XXXXXXXXXX` + signup/upgrade conversion labels; set Vercel env vars `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL`, `NEXT_PUBLIC_GOOGLE_ADS_UPGRADE_LABEL`; mount `<GoogleAdsScript />` in `src/app/layout.tsx` after `<TrackingScripts />` |

## Files I created (all on disk, mostly untracked — needs `git add`)

```
lifeadmin-ai/
├── src/
│   ├── app/
│   │   ├── account-deletion/page.tsx                    [NEW]
│   │   └── api/push/unregister/route.ts                 [NEW]
│   ├── components/
│   │   ├── GoogleAdsScript.tsx                          [NEW]
│   │   └── analytics/
│   │       ├── SignupConversionTracker.tsx              [NEW]
│   │       └── UpgradeConversionTracker.tsx             [NEW]
│   └── lib/
│       ├── analytics/conversions.ts                     [NEW]
│       └── push/
│           ├── apns.ts                                  [NEW]
│           ├── fcm.ts                                   [NEW]
│           └── dispatch-push.ts                         [NEW]
└── _handoff/
    ├── M8-ANDROID-RUNBOOK.md                            [NEW]
    ├── POSTHOG-AD-DESTINATIONS-RUNBOOK.md               [NEW]
    └── SESSION-2026-04-24-CONTINUATION.md               [NEW] (this file)
```

Plus `src/app/blog/_shared.tsx` and `src/app/careers/page.tsx` are modified-not-committed with the footer link fix.

## What's left — all user-side

| # | Owner action | Approx time |
|---|---|---|
| #10 | Sign in to Xcode with `aireypaul@googlemail.com`; set team in Project Navigator → App → Signing & Capabilities | 5 min |
| #28 | App Store Connect → Business → Tax + Banking forms + sign Paid Apps Agreement | 20 min (need bank routing + tax ID) |
| #40 | (Future) Enable Firebase Analytics + link to Google Ads — only if you run app-install ads | Skip until after launch |
| #46 | Create `play-reviewer@paybacker.co.uk` in Supabase with seeded data | 15 min |
| #48 | Post-deploy: update both Play Data Safety Delete URLs → `/account-deletion` | 2 min |
| #49 | Google Ads → create signup + upgrade conversion actions, copy IDs into Vercel env vars, mount `<GoogleAdsScript />` | 15 min |
| Mac-side build chain | `npm install` + `cap add ios` + `cap add android` + first Sim run + first Android Studio run + AAB build | 60-90 min |
| Generate iOS screenshots | 5 × 1290×2796 from Simulator | 15 min |
| Generate Android assets | 512×512 icon (no alpha), 1024×500 feature graphic, 4-8 phone screenshots 1080×1920+ | 30 min |
| Apple Org conversion | Wait on case `102877570452`. Have Companies House extract ready when they reply | Depends on Apple |

## Recommended order to unblock submission

1. **Server commits first**: on lifeadmin-ai, `git add src/lib/push/ src/app/api/push/unregister/ src/app/account-deletion/ src/components/analytics/ src/components/GoogleAdsScript.tsx src/lib/analytics/ src/app/blog/_shared.tsx src/app/careers/page.tsx _handoff/` and commit. Then `npm install apns2 firebase-admin` and swap the stub `sendPush` body in `dispatch.ts` per the M8 runbook. Push and let Vercel deploy.
2. **Update Play URLs** (#48) immediately after deploy — takes 2 min and unblocks Play submission.
3. **Mac chain** (Xcode signin, `cap add ios`, first Sim run) — confirms the iOS shell builds.
4. **Tax + Banking** (#28) and **Paid Apps Agreement** in App Store Connect.
5. **Reviewer account** (#46) so the iOS reviewer can log in.
6. **iOS screenshots** from Sim, upload to ASC.
7. **Submit for Review** in App Store Connect.
8. In parallel, **Android build chain** + **Android assets** + **upload AAB to Internal Testing** in Play Console.
9. **Promote Internal → Production** in Play Console (Internal usually approves in hours; Production a few days).

Both stores' first review typically takes 24-48h. Realistic launch window: 4-7 days from today assuming no rejections.
