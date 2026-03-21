# TASK: Google OAuth App Verification Prep + Final Pre-Launch Polish

## Context
Paybacker is almost launch-ready. Google OAuth currently works in test mode (limited to approved test users). To allow real users to connect Gmail, the app needs to be submitted for Google verification.

## TASK 1: Google OAuth — Prepare Verification Assets

Google requires a privacy policy URL, homepage URL, and an authorised domain. Check the current Google OAuth config in src/app/api/auth/google/route.ts and src/app/api/auth/callback/google/route.ts.

Ensure the OAuth consent screen metadata in the code is correct:
- App name: Paybacker
- Homepage: https://paybacker.co.uk
- Privacy policy: https://paybacker.co.uk/legal/privacy
- Authorized redirect URI: https://paybacker.co.uk/api/auth/callback/google

Create a file at docs/GOOGLE_OAUTH_CHECKLIST.md documenting exactly what Paul needs to do in Google Cloud Console to submit for verification:
1. Go to console.cloud.google.com → APIs & Services → OAuth consent screen
2. App name: Paybacker
3. User support email: hello@paybacker.co.uk
4. App homepage: https://paybacker.co.uk
5. App privacy policy: https://paybacker.co.uk/legal/privacy
6. App terms of service: https://paybacker.co.uk/legal/terms
7. Authorised domains: paybacker.co.uk
8. Developer contact: hello@paybacker.co.uk
9. Scopes needed: gmail.readonly (for inbox scanning), userinfo.email, userinfo.profile
10. Submit for verification — attach a demo video showing the Gmail scan flow

## TASK 2: Soft-launch waitlist email

Create src/app/api/cron/launch-announcement/route.ts — an endpoint that sends a launch announcement email to all waitlist signups using Resend.

Email content:
- Subject: "Paybacker is live — you're in 🎉"
- From: Paybacker <hello@paybacker.co.uk>
- Body (HTML):
  - Hero: "You're one of the first. Paybacker is now live."
  - CTA button: "Claim your free account" → https://paybacker.co.uk/auth/signup
  - What's waiting for them: AI complaint letters, subscription tracker, deal finder
  - PS: "Your first 7 days are free — no card required to start"
- Fetch all emails from waitlist_signups table (where unsubscribed IS NULL or false)
- Send in batches of 50 (Resend rate limit)
- Log sends to a sent_emails table or just console.log for now
- Protect with CRON_SECRET Bearer auth
- Add to vercel.json crons: NOT scheduled (manual trigger only — path /api/cron/launch-announcement)

## TASK 3: Pre-launch smoke test page

Create src/app/dashboard/admin/page.tsx — a simple admin page (only accessible if email = 'aireypaul@googlemail.com') that shows:
- Current Stripe price IDs with amounts
- Count of waitlist signups
- Count of registered users  
- Count of complaints generated
- Count of subscriptions tracked
- TrueLayer: connected bank accounts count
- Last deployment info

This gives Paul a quick health check dashboard.

## TASK 4: Fix git committer name

The git commits are showing "Paul-Ops <paul-ops@Mac.communityfibre.co.uk>". Set proper git config:
```bash
git config --global user.name "Paul Airey"
git config --global user.email "aireypaul@googlemail.com"
```
Run this as a bash command.

## NOTES
- TypeScript throughout
- Run `npm run build` when done
- Commit all changes

When completely finished, run: openclaw system event --text "Done: Google OAuth prep, launch email, admin dashboard, git config fixed" --mode now
