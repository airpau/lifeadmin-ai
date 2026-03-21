# TASK: Paybacker — Next Steps (Post-Deploy)

## What's been completed today (21 Mar 2026)

All 4 hard launch blockers are built and deployed to paybacker.co.uk:

✅ Plan-gating in src/proxy.ts — free users blocked from /dashboard/scanner and /dashboard/deals
✅ Stripe Customer Portal — /api/stripe/portal route + Manage Billing / Upgrade Plan buttons on profile page
✅ Vercel cron jobs — vercel.json with waitlist (9am) + onboarding (10am) daily, secured with CRON_SECRET
✅ Affiliate Deals tab — /dashboard/deals with 13 providers across Energy, Broadband, Insurance, Mobile
✅ TrueLayer Open Banking — full OAuth flow, transaction sync, recurring detection, bank connection UI
✅ Supabase migrations applied — deal_clicks, bank_connections, bank_transactions tables live
✅ All env vars set in Vercel — CRON_SECRET, TRUELAYER_CLIENT_ID/SECRET/REDIRECT_URI/AUTH_URL/API_URL
✅ Resend domain verified — paybacker.co.uk domain confirmed working

## Current env state (.env.local)
- NEXT_PUBLIC_SUPABASE_URL=https://kcxxlesishltdmfctlmo.supabase.co
- NEXT_PUBLIC_APP_URL=https://lifeadmin-ai.vercel.app (NOTE: needs updating to https://paybacker.co.uk)
- TRUELAYER_CLIENT_ID=sandbox-paybacker-340887 (sandbox for now)
- TRUELAYER_AUTH_URL=https://auth.truelayer-sandbox.com
- TRUELAYER_API_URL=https://api.truelayer-sandbox.com
- RESEND domain: verified ✅

## YOUR TASKS

### TASK 1: Fix NEXT_PUBLIC_APP_URL in Vercel

The NEXT_PUBLIC_APP_URL env var is set to the old Vercel preview URL. Update it to the real domain.

Run:
```
vercel env add NEXT_PUBLIC_APP_URL production --force
```
Value: https://paybacker.co.uk

Then redeploy.

### TASK 2: Update Resend from address

Now that paybacker.co.uk domain is verified in Resend, update the from address used in emails.

Find all places in the codebase that send emails via Resend (check src/app/api/cron/ and any other email sending code). Update the `from` field to:
- From: Paybacker <hello@paybacker.co.uk>

Also check if RESEND_FROM_EMAIL env var exists and update it in Vercel:
```
vercel env add RESEND_FROM_EMAIL production --force
```
Value: Paybacker <hello@paybacker.co.uk>

### TASK 3: End-to-end audit — fix any broken imports or TypeScript errors

Run a full TypeScript check across the new files built today:
```
npx tsc --noEmit
```

Fix any type errors in:
- src/lib/truelayer.ts
- src/lib/detect-recurring.ts
- src/app/api/auth/truelayer/route.ts
- src/app/api/auth/callback/truelayer/route.ts
- src/app/api/bank/sync/route.ts
- src/app/api/bank/disconnect/route.ts
- src/app/api/deals/click/route.ts
- src/app/dashboard/deals/page.tsx
- src/app/api/stripe/portal/route.ts

### TASK 4: Add loading states and error handling to new UI components

Review src/app/dashboard/deals/page.tsx and src/app/dashboard/subscriptions/page.tsx (bank connection section):

- Add proper loading spinner while click tracking fires
- Add error toast if bank sync fails
- Add error state if Stripe portal request fails (show "Please try again or contact support")
- Make sure all fetch calls have try/catch

### TASK 5: Verify email sending works end-to-end

Check the waitlist email route (src/app/api/cron/waitlist-emails/route.ts) and onboarding route:
- Confirm they use the correct Resend from address
- Confirm CRON_SECRET auth is working (check the implementation)
- Add a test endpoint GET /api/cron/test-email that sends a single test email to hello@paybacker.co.uk to verify Resend is working with the verified domain

### TASK 6: Update .env.local.example

Make sure .env.local.example has ALL required env vars documented (including ones added today):
- TRUELAYER_CLIENT_ID
- TRUELAYER_CLIENT_SECRET  
- TRUELAYER_REDIRECT_URI
- TRUELAYER_AUTH_URL
- TRUELAYER_API_URL
- CRON_SECRET
- RESEND_FROM_EMAIL
- NEXT_PUBLIC_APP_URL

## NOTES
- TypeScript throughout, follow existing patterns
- Run `npm run build` before finishing to confirm no build errors
- Do not touch .env.local itself — only .env.local.example
- Commit all changes with a clear message

When completely finished, run: openclaw system event --text "Done: Paybacker post-deploy fixes — app URL, Resend, TypeScript audit, error handling" --mode now
