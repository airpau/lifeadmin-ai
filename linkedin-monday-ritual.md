# LinkedIn Monday 09:30 ritual — Paybacker

This is the Monday operating procedure for posting + comment management on Paul's LinkedIn for Paybacker. Updated 2026-04-28.

## Pre-conditions (one-off setup)
- ✅ Personal profile B2B-positioned (headline, About, Skills, Featured 2/3, Open-to → Providing services, "Try the API" link to /for-business)
- ✅ Paybacker company page updated (tagline, About, custom button, 9 specialties, phone +447488895049, year founded 2026)
- ✅ Engagement tracker Sheet created in `hello@paybacker.co.uk` Drive — https://docs.google.com/spreadsheets/d/1_eUbuspUzqYAQ3pU6mcWPMKdQO4ePStq0yWZXu11lKA/edit
- ⏸ Personal LinkedIn Premium trial (deferred — needed to add custom button)
- ⏸ Featured pin #3 on personal profile (placeholder for first LinkedIn post)
- ⏸ Featured pin on company page (Featured only takes LinkedIn-native posts, so we'll post to the company page Monday and pin that)

## Sunday 17:00 UTC (automatic)
- Cron `trig_0153C4JZwMxYrwHt6w29tdXK` composes a LinkedIn post draft for the week ahead.
- Output: Gmail draft to `business@paybacker.co.uk` with subject `📅 LinkedIn post — YYYY-MM-DD`.

## Monday 09:30 UK time (Cowork-driven)

1. **Open Gmail in Chrome** — `mail.google.com` (signed in to `business@paybacker.co.uk` at the same Google account index Paul used for the Drive Sheet, currently `/u/1/`).

2. **Find the draft** — search Drafts for `📅 LinkedIn post`. Open the latest one.

3. **Review the draft** — read it for:
   - Off-brand phrasing (vague/generic vs the B2B-led tone)
   - Time-stamped wording that won't age well ("last week", "recently", "tomorrow")
   - Made-up metrics (we have NO live B2B customers yet — soften any specific numeric claim to forward-looking voice)
   - Statute citations — verify they're real (CRA 2015, EU/UK261, Section 75, FSMA, UK GDPR, Ofcom GC, Ofgem SLC, Package Travel Regs are all valid)

4. **Get Paul's approval in chat** — paste the draft, ask explicitly: "Post as-is, edit X, or skip this week?"

5. **Post via Chrome MCP** — open `linkedin.com` in Paul's Chrome, hit "Start a post" on the home feed, paste the approved text, hit Post. Capture the resulting post URL.

6. **Pin to Featured (first post only)** — first post becomes Featured pin #3 on personal profile. Once it's also posted to the company page (manual share), pin it there too.

7. **Update the engagement Sheet**:
   - New row, columns: Date / Day / Post URL / Topic / Likes / Comments / Reposts / Profile views / Followers / Notes
   - Seed Likes/Comments/Reposts as 0
   - Profile views: read from `linkedin.com/me/profile-views` (logged in)
   - Followers: read from profile header (number next to the connections count)
   - Notes: anything to remember

## Comment replies — first 30 days post-launch

- Check comments on Paul's posts hourly during UK business hours (09:00-18:00 UK).
- For each new comment, draft a tailored reply IN CHAT WITH PAUL FIRST:
  - **B2B prospects** (titles like "VP Engineering", "Head of CX", "Compliance Lead", "Insurance Operations"): thank by name, ask one specific question about their use case, link `paybacker.co.uk/for-business`. Example: "Thanks Sara — curious how Klarna handles UK261 disputes today, do you triage them with a human first or send straight to FOS? Free 1k pilot at paybacker.co.uk/for-business if you want to poke at the API."
  - **Consumer questions** (general public, "how does this work for me"): empathy first, link `paybacker.co.uk`. Example: "Sorry to hear about the broadband bill — exactly the use case Paybacker handles. Free at paybacker.co.uk."
  - **Off-topic / spam**: don't reply, don't engage.
- 4-hour SLA during day, by next morning if posted overnight.
- Wait for Paul's "post" approval before publishing each reply.

## Engagement tracker — weekly review

Each Monday after posting, also do:
- Pull the previous week's metrics on the prior Monday's row (it's now 7 days old, engagement has settled).
- Roll up: which post got best engagement-per-impression? Which got most B2B-shaped comments? Refresh the brief for next week's Sunday cron based on what's working.

## Migration to Late API (post-decision-gate)

After 4 weeks of validated manual output AND ≥10 qualified UK fintech signups (the decision gate at 28 May 2026):

1. Build `src/lib/late.ts` with `postEverywhere(content, platforms[])`.
2. Add `/api/admin/multi-post` endpoint behind `CRON_SECRET`.
3. Update Sunday cron prompt to call `/api/admin/multi-post` directly instead of saving to Gmail Drafts.
4. Add `LATE_API_KEY` to Vercel env (paste from getlate.dev/dashboard).
5. Initial platforms: LinkedIn personal + LinkedIn company + X. Add Threads / Bluesky / IG when content cadence is steady.
6. Wire Late engagement webhooks → `/api/webhooks/late-engagement` → auto-update the engagement tracker Sheet via Google Sheets API. No more manual scraping.

Until then: Chrome-MCP manual approval loop (this doc).

## Key decisions locked in 2026-04-28

- **B2B-led positioning** wins over consumer-led — see About section structure.
- **Evergreen wording** — no "last week" / "recently" / time-stamped phrases.
- **Manual approval** for first 4 weeks. No auto-post until 10 qualified signups.
- **Founder voice, British spelling, plain language.**
- **Never imply customers we don't have.** API launched 2026-04-28; 0 paying customers as of this writing.
