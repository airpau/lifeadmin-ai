# Paybacker — Marketing Plan
*March 2026*

---

## 1. Launch Strategy

### Soft Launch — Waitlist Email

The waitlist email blast is already built at `/api/cron/launch-announcement`.

**Steps to execute:**
1. Confirm Resend domain is verified (run `GET /api/cron/test-email`)
2. Trigger the announcement: `GET /api/cron/launch-announcement` with `Authorization: Bearer <CRON_SECRET>`
3. Monitor Resend dashboard for bounces/opens
4. Respond to any replies from waitlist manually within 24 hours

**Goal:** Convert 10–20% of waitlist to free accounts on day one.

---

### ProductHunt Launch

**Best day to launch:** Tuesday or Wednesday (highest PH traffic days)

**What you need before launching:**

#### Tagline (60 chars max)
```
AI that fights your bills and cancels your subscriptions
```

#### Description (260 chars max)
```
Paybacker uses AI to dispute incorrect bills, cancel forgotten subscriptions, and write formal complaints — citing UK consumer law. Fully automated. Built for busy UK professionals who deserve their money back.
```

#### 5 Screenshots needed
1. **Dashboard overview** — shows total saved, active tasks, subscription count
2. **Complaint letter generator** — form filled in + generated letter displayed
3. **Subscription tracker** — list with 🏦/📧/✏️ badges + cancel buttons
4. **Deals tab** — 4-category grid with Energy, Broadband, Insurance, Mobile deals
5. **Pricing page** — 3-tier pricing with Free / Essential / Pro comparison

#### Demo video outline (60–90 seconds)
- 0–10s: Hook — "Brits lose £billions a year to wrong bills and forgotten subscriptions"
- 10–25s: Show complaint letter being generated in 15 seconds (screen recording)
- 25–40s: Show subscription tracker with bank + email sources
- 40–55s: Show AI cancellation email being drafted
- 55–70s: CTA — "Try Paybacker free for 7 days at paybacker.co.uk"

#### Hunter
- You need someone with ProductHunt credibility (500+ followers) to post it
- Options: reach out to UK fintech community on Twitter/X, ask in Indie Hackers, or use a launch service like MakerHunt

---

## 2. Social Media Automation Plan

### Platforms

| Platform | Audience fit | Content type | Frequency |
|----------|-------------|-------------|-----------|
| Twitter/X | UK fintech, indie hackers, professionals | Short tips, wins, threads | 1–2x/day |
| LinkedIn | UK professionals, 30–50 age range | Longer posts, consumer rights insights | 1x/day |
| Instagram | Lifestyle/money content | Visual tips, infographics | 1x/day |
| TikTok | Under 35, money-saving content | Short video scripts (for manual recording) | 3–5x/week |

---

### Content Pillars (4 rotating themes)

**Pillar 1 — Money-saving tips**
> "Did you know you can claim a refund if your energy direct debit is consistently higher than your usage? Here's how..."

**Pillar 2 — Complaint wins**
> "One of our users just recovered £340 from their broadband provider using an AI-generated letter. The whole process took 4 minutes."

**Pillar 3 — Product features**
> "Paybacker scans your inbox for forgotten subscriptions — and drafts the cancellation email for you. You just hit send."

**Pillar 4 — UK consumer rights facts**
> "Under the Consumer Rights Act 2015, if a service isn't delivered with reasonable care and skill, you're entitled to a repeat performance or a price reduction. Most people never claim it."

---

### Automation Approach

#### Option A — Buffer/Later (Quickest to launch)
- Sign up for Buffer (free tier: 3 channels, 10 posts queued)
- Or Later (free tier: 1 social set, 30 posts/month)
- Use the `/api/social/generate-post` endpoint (see below) to generate post ideas daily
- Review in Supabase `social_posts` table, approve the best ones
- Paste approved posts into Buffer queue manually

**Pros:** Live in 30 minutes, no code
**Cons:** Manual approval + paste step; free tier limits

#### Option B — Native Paybacker automation (built — see below)
- Daily cron at 8am generates post ideas for all 4 platforms using Claude Haiku
- Posts saved to `social_posts` table with status = 'draft'
- You review and approve in Supabase (or a future admin UI)
- Future: add one-click posting via platform APIs (Twitter API v2, LinkedIn API)

---

### Platform API setup (for Option B full automation)

| Platform | API product needed | Cost | Notes |
|----------|-------------------|------|-------|
| Twitter/X | Basic API ($100/mo) or Free tier (limited) | Free tier: 500 tweets/month | Sufficient for 1/day |
| LinkedIn | LinkedIn Marketing API | Free (approval required) | Apply via LinkedIn developer portal |
| Instagram | Meta Graph API (via Facebook App) | Free | Requires Facebook Business account |
| TikTok | TikTok for Business API | Free | Video uploads only via API |

**Recommendation:** Start with Twitter/X (free tier, 500 posts/month covers 1/day) and LinkedIn. Add Instagram once you have image generation. Skip TikTok API — record short videos manually and post natively.

---

## 3. API: /api/social/generate-post

**Endpoint:** `POST /api/social/generate-post`
**Auth:** `Authorization: Bearer <CRON_SECRET>`

**Request:**
```json
{
  "platform": "twitter",
  "pillar": "money_tip",
  "topic": "energy bills"
}
```

**Response:**
```json
{
  "content": "Did you know your energy supplier must refund you within 10 working days if your account is in credit? Most people never ask. Here's how to claim yours back 👇",
  "hashtags": "#EnergyBills #ConsumerRights #MoneySaving #Paybacker",
  "suggested_image_prompt": "Dark premium graphic showing a UK energy bill with a red 'OVERCHARGED' stamp and a gold refund arrow"
}
```

**Platforms:** `twitter` | `linkedin` | `instagram` | `tiktok`
**Pillars:** `money_tip` | `complaint_win` | `product_feature` | `consumer_rights`

---

## 4. Cron: Daily Social Post Generation

A Vercel cron runs at 8am daily: `GET /api/cron/generate-social-posts`

- Generates one post per platform (4 posts total)
- Rotates through all 4 content pillars
- Saves to `social_posts` table with `status = 'draft'`
- Review drafts in Supabase: `SELECT * FROM social_posts WHERE status = 'draft' ORDER BY created_at DESC`
- Approve by updating: `UPDATE social_posts SET status = 'approved' WHERE id = '...'`

---

## 5. Supabase Table: social_posts

```sql
SELECT id, platform, pillar, content, hashtags, status, created_at
FROM social_posts
ORDER BY created_at DESC;
```

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated |
| platform | text | twitter / linkedin / instagram / tiktok |
| pillar | text | money_tip / complaint_win / product_feature / consumer_rights |
| content | text | Main post copy |
| hashtags | text | Space-separated hashtag string |
| image_prompt | text | Prompt for image generation (DALL-E / Midjourney) |
| status | text | draft → approved → posted / rejected |
| scheduled_for | timestamptz | When to post (set manually or via scheduling tool) |
| posted_at | timestamptz | When actually posted |
| created_at | timestamptz | Auto |

---

## 6. 30-Day Content Calendar Template

### Week 1: Launch week — Product awareness
- Mon: Product feature (complaint generator)
- Tue: Consumer rights fact
- Wed: Complaint win story
- Thu: Money tip (energy bills)
- Fri: Product feature (subscription tracker)
- Sat/Sun: Money tip / light consumer content

### Week 2: Trust-building
- Focus on UK consumer law facts and "did you know" tips
- 1 complaint win story midweek

### Week 3: Feature spotlight
- Rotate through: Scanner, Bank connection, Deals tab, AI emails

### Week 4: Social proof + CTA
- Recoveries by users, retention content, "Start your free trial" CTA

---

## 7. KPIs to track

| Metric | Target (Month 1) | Tool |
|--------|-----------------|------|
| Twitter/X followers | 200 | Twitter Analytics |
| LinkedIn followers | 100 | LinkedIn Analytics |
| Instagram followers | 150 | Instagram Insights |
| Click-throughs to paybacker.co.uk | 500 | Vercel Analytics / UTM links |
| Social-attributed signups | 50 | Supabase waitlist_signups + UTM param |

---

---

## 8. Community Marketing (Reddit, Forums, Facebook Groups)

### Reddit Strategy

Target subreddits:
- **r/UKPersonalFinance** (450k members) — largest UK personal finance community
- **r/moneysavingexpert** — deal-hunters and bill-busters
- **r/LegalAdviceUK** — consumer rights questions
- **r/britishproblems** — relatable content about utility companies
- **r/AskUK** — broad UK audience

**Approach:** Do NOT spam. Provide genuine value. Answer questions about billing disputes, energy overcharges, and subscription cancellations — then mention Paybacker naturally when relevant.

**Post types that work on r/UKPersonalFinance:**
- "I built a tool that..." posts — indie products with clear value are welcomed
- Case study posts: "How I got £240 back from British Gas using the Consumer Rights Act"

**Weekly cadence:**
- 2–3 helpful replies in UKPersonalFinance threads per week
- 1 genuine original post per month (not promotional — provide real value first)

**Rules:** Always read subreddit rules before posting. Never post promotional content in subreddits that prohibit it. Build karma before mentioning Paybacker.

---

### Money Saving Expert (MSE) Forum

- forum.moneysavingexpert.com — massive UK audience (Martin Lewis's community)
- Create account, contribute genuinely to billing dispute threads for at least 2 weeks
- Add Paybacker to signature after 10+ posts (forum etiquette)
- Target boards: **Energy**, **Broadband & Phone**, **Consumer Rights**, **Debt-Free Wannabe**

---

### Facebook Groups

| Group | Members | Strategy |
|-------|---------|----------|
| UK Money Saving Tips | 300k+ | Join, contribute value for 2 weeks, then share Paybacker as a resource |
| Energy Bill Help UK | varies | Answer questions about Ofgem complaints, smart meter disputes |
| UK Broadband Complaints & Help | varies | Help with Ofcom escalation queries |

**Rule:** Join and contribute genuine value for a minimum of 2 weeks before any mention of Paybacker.

---

### Quora

Answer questions about:
- "How do I complain to my energy provider?"
- "Can I get a refund on my broadband bill?"
- "What are my consumer rights in the UK?"
- "How do I escalate a complaint to Ofgem/Ofcom?"

Add Paybacker link in bio and in answers where genuinely relevant (not in every answer).

---

## 9. SEO Content Strategy

**Target: 200+ programmatic SEO pages**

### Page Templates (high search volume, low competition)

1. **"How to complain to [Company]"** — e.g. "How to complain to British Gas", "How to complain to BT Broadband" (500+ companies)
2. **"Am I owed a refund from [Company]?"**
3. **"How to cancel [Subscription]"** — Netflix, Sky, gym memberships etc.
4. **"[Company] complaints — know your rights"**

### Each page should:
- Target a specific long-tail keyword
- Include a CTA to use Paybacker's complaint generator
- Be generated programmatically from a company database (`/src/data/companies.ts`)
- Be 400–600 words with genuine, useful advice
- Reference the relevant UK regulator (Ofgem, Ofcom, Trading Standards)

### Implementation

Dynamic route: `/src/app/complaints/[company]/page.tsx`

**Phase 1 (launch):** 20 pages for top companies — British Gas, BT, Sky, Virgin Media, EDF, Vodafone, O2, Three, EE, Amazon, Netflix, Evri, DPD, PureGym, The Gym Group, Octopus Energy, OVO Energy, Utilita, ASOS, Royal Mail.

**Phase 2:** Expand to 200+ companies using the same template.

### SEO Page Structure
Each page:
1. Title: "How to complain to [Company] — and get results"
2. Meta description: "Know your rights when complaining to [Company]. Step-by-step guide including escalation to [Regulator]. Let Paybacker write your complaint letter for free."
3. Content sections:
   - Your rights when complaining to [Company]
   - Step-by-step: how to make a formal complaint
   - What to do if [Company] ignores you (escalation to regulator)
   - CTA: "Let Paybacker write your complaint letter for free →"

### KPIs for SEO
| Metric | Target (Month 3) |
|--------|-----------------|
| Indexed SEO pages | 20 |
| Organic impressions | 10,000/month |
| Organic clicks | 500/month |
| SEO-attributed signups | 25/month |

---

## 10. Influencer & PR Strategy

### Micro-Influencers (10k–100k followers)

**Target:** UK personal finance YouTubers and TikTokers

**Search terms:** `#UKMoney`, `#MoneySavingTips`, `#ConsumerRights` on TikTok and Instagram

**Offer:**
- Free Pro account to trial
- 20% affiliate commission on any signups they refer
- Simple affiliate link via a referral code system

**Pitch template:**
> "Hey [Name], I love your content on UK money saving. I built Paybacker — an AI that fights incorrect bills and cancels forgotten subscriptions automatically. Here's a free Pro account to try. If you love it, here's your affiliate link — you earn 20% on every signup. No obligation."

---

### PR Targets

| Publication | Contact angle | Why it fits |
|------------|--------------|-------------|
| **Which?** Magazine | Consumer rights AI tool | Their audience is exactly our users |
| **MoneySavingExpert.com** | Martin Lewis editorial team | Largest UK money site — a mention here = thousands of signups |
| **The Guardian Money** | "AI tool helps UK consumers reclaim millions" | Technology + consumer interest angle |
| **BBC Consumer Affairs** | "Startup fights back against wrong bills" | Strong public interest story |
| **City A.M.** | UK fintech startup story | B2B and investor audience |

**PR angle:** "AI tool helps UK consumers reclaim millions from incorrect bills — fully automated, citing Consumer Rights Act 2015"

**How to pitch:**
1. Write a 200-word press release with a specific money recovery stat (e.g. "UK consumers lose £2.3bn annually to billing errors")
2. Include a quote from founder
3. Offer an exclusive to one outlet before wider distribution
4. Follow up once, 5 days after initial pitch

---

*Marketing plan prepared for Paybacker LTD · March 2026*
