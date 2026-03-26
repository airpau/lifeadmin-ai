# Task Queue

## Strategic (Analyse in Claude Desktop first)
- [ ] Interactive chatbot dashboard management - Phase 1 DONE (subscription tools). Phase 2: Money Hub tools. Phase 3: cross-tab intelligence.
- [ ] Admin dashboard Leads tab - view, filter, update lead status, retargeting
- [ ] Meta Custom Audiences retargeting from leads table

## Critical
- [ ] Re-enable founding member programme (blocked: waiting Oscar Awin sign-off)
- [ ] Fix Telegram agent callback reliability (agents run but results not always returned)
- [ ] Verify Railway rebuilt with Casey's posting tools
- [x] ~~Fix sidebar routing~~ DONE
- [x] ~~Fix 404 public pages~~ DONE
- [x] ~~Custom 404 page~~ DONE
- [x] ~~Finexer -> TrueLayer~~ DONE
- [x] ~~Fix complaint letter dates~~ DONE - today's date injected into prompt
- [x] ~~Auto-fill user profile data~~ DONE - replaces placeholders post-generation
- [x] ~~Fix sidebar active state~~ DONE - startsWith for sub-routes
- [x] ~~Dead Octopus Energy link~~ DONE - removed from both deals pages

## High
- [ ] Chase Oscar for Awin sign-off on test+oscar7
- [ ] ElevenLabs integration for video content (Creator plan £11/mo)
- [ ] Action items form pre-fill -- verify complaints page reads params correctly
- [ ] Meta App icon (1024x1024) for App Settings
- [ ] Google Ads developer token -- check if basic access approved
- [ ] Mobile responsive pass -- full landing page (hamburger menu, stacking cards)
- [ ] Fix subscription billing dates: auto-advance next_billing_date when in past. Consolidate duplicate Other categories in spending. Show human-readable sync times.
- [x] ~~Onboarding flow~~ DONE
- [x] ~~Merchant name normalisation~~ DONE
- [x] ~~Chatbot popup~~ DONE
- [x] ~~Mobile chatbot~~ DONE
- [x] ~~Currency formatting~~ DONE - formatGBP utility
- [x] ~~Pricing page nav~~ DONE
- [x] ~~Cancellation email status~~ DONE - no longer changes to pending_cancellation
- [ ] Build Google Ads API Integration & Create First Search Campaigns - Build a Google Ads API integration for Paybacker to programmatically create and manage ad campaigns.
- [ ] Full Website Redesign — Calm & Trustworthy Design System - Complete visual redesign of paybacker.co.uk — landing page, all public pages, and full dashboard. Direction: "Calm & Trustworthy" fintech aesthetic inspired by Monzo, Revolut, and Linear. Must feel fresh, modern, premium, and desirable.
- [ ] Implement Welcome Email Sequence via Resend - Build a 5-email welcome/onboarding sequence triggered on new user signup. Full email copy and templates are in paybacker-marketing-pack.docx and MCP memory. Use Resend (already integrated). Emails should be behaviour-triggered with conditional content based on user state (bank_connected, letters_generated, plan tier). Sequence: Welcome (immediate), First Value (day 2), Social Proof (day 4), Feature Discovery (day 7), Upgrade Nudge (day 10, free users only). Also implement the Weekly Money Digest email (Monday 7am cron) that pulls user spending data from Supabase. (@Claude Code)
- [ ] ElevenLabs + HeyGen Integration — Video Ads Pipeline & Voice Features - Integrate ElevenLabs API (and optionally HeyGen API) for automated video ad creation and product voice features.
- [ ] Store ElevenLabs API key and configure voice cloning - Paul has signed up for ElevenLabs Creator plan ($22/mo). Set up the integration:

1. Add ELEVENLABS_API_KEY to environment variables (Railway for agents, Vercel for Next.js app)
2. Test the API connection with a basic TTS call
3. Once Paul provides his cloned voice ID, add ELEVENLABS_VOICE_ID to env vars
4. Then proceed with the ElevenLabs integration task already in the queue (TTS endpoint, "Listen to letter" button, voice chatbot, video ad pipeline)

API base URL: https://api.elevenlabs.io/v1
Auth header: xi-api-key: {ELEVENLABS_API_KEY}

Paul will provide the API key — get it from him via Telegram/Charlie or he'll add it to env vars directly. (@Claude Code)

## ACCOUNTS NEEDED (Paul to set up)
- ElevenLabs: Creator plan ($22/mo) for voice cloning + sound effects + music. Upgrade to Pro ($99/mo) later for higher volume.
- HeyGen: Creator plan ($29/mo) for avatar video generation via API.
- Total: ~$51/mo for both

## PART 1: AUTOMATED VIDEO AD PIPELINE

### Architecture
Create a new agent (or extend Casey CCO) that generates video ads automatically:

1. Script Generation (Claude API — already available)
   - Input: Ad campaign type, target audience, key message
   - Output: 30-second ad script with visual directions
   - Use the marketing pack copy as templates

2. Voiceover Generation (ElevenLabs API)
   - POST /v1/text-to-speech/{voice_id}
   - Use a cloned voice (Paul's) or a premium stock voice
   - Model: eleven_multilingual_v2 for quality, eleven_turbo_v2_5 for speed
   - Output: MP3/WAV audio file
   - Store in Supabase Storage

3. Avatar Video Generation (HeyGen API)
   - POST /v2/video/generate
   - Input: Avatar ID + audio file from step 2
   - Avatar IV model gives realistic lip sync + gestures
   - Output: MP4 video (720x1280 for social, 1920x1080 for YouTube)
   - Store in Supabase Storage

4. Background Music (ElevenLabs Music API)
   - POST /v1/music/compose
   - Generate subtle background music matching the ad tone
   - Mix with voiceover at lower volume

5. Social Posting (existing Casey agent)
   - Upload generated video to Facebook/Instagram via Meta Graph API
   - Casey already handles daily posting — extend to include video posts

### API Routes to Create
- POST /api/video-ads/generate — Trigger full pipeline (script → voice → avatar → video)
- GET /api/video-ads — List generated ads
- POST /api/video-ads/[id]/publish — Push to social media

### Ad Types to Automate
1. "Problem-Solution" ads: "Tired of unfair bills? Meet Paybacker." (30s)
2. "How It Works" ads: 3-step walkthrough with avatar demo (45s)
3. "Testimonial-style" ads: Avatar reading user success stories (30s)
4. "Feature Spotlight" ads: One feature deep-dive per ad (15-30s)
5. "Seasonal" ads: Energy price changes, holiday spending, tax year reminders (30s)

### Environment Variables
ELEVENLABS_API_KEY=<from ElevenLabs dashboard>
HEYGEN_API_KEY=<from HeyGen dashboard>
ELEVENLABS_VOICE_ID=<Paul's cloned voice or chosen stock voice>
HEYGEN_AVATAR_ID=<chosen avatar>

## PART 2: PRODUCT VOICE FEATURES

### A. Voice-Enabled Chatbot (ElevenLabs Conversational AI)
Upgrade the existing text chatbot to support voice interaction.

- ElevenLabs Conversational AI SDK handles:
  - Real-time speech-to-text (user speaks)
  - AI processing (Claude via existing /api/chat)
  - Text-to-speech response (ElevenLabs voice)
  - WebSocket-based for low latency

- Implementation:
  - Install @11labs/client npm package
  - Create /api/voice-chat/route.ts endpoint
  - Upgrade ChatWidget.tsx with a microphone button
  - When user clicks mic: stream audio → ElevenLabs STT → Claude processes → ElevenLabs TTS → play audio response
  - Keep text chat as fallback
  - This is a MASSIVE differentiator — no UK consumer finance app has voice AI

### B. Audio Complaint Letters
After generating a complaint letter, offer "Listen to your letter" button.
- POST to ElevenLabs TTS with the letter text
- Play audio in-browser so user can review before sending
- Also useful for accessibility (visually impaired users)

### C. Personalised Audio Notifications
Instead of just push/email notifications, offer optional audio digests:
- "Good morning Paul. You have 2 subscriptions renewing this week totalling £26.98. Your energy bill looks 15% higher than last month — would you like me to generate a complaint letter?"
- Generate via ElevenLabs TTS, deliver via browser notification or in-app player
- Weekly audio digest as alternative to email digest

### D. Multilingual Support (Future)
ElevenLabs supports 70+ languages with dubbing API.
- Could auto-translate complaint letters and read them in user's preferred language
- Expands Paybacker beyond UK English speakers

## PART 3: SOUND EFFECTS & BRANDING

### A. Paybacker Audio Brand
- Generate custom notification sounds via Sound Effects API
- "Money saved" celebration sound when user recovers money
- Subtle UI sounds for key actions (letter sent, scan complete, deal found)
- Creates a distinctive audio identity

### B. Background Music for Content
- Generate royalty-free background music for:
  - Social media video posts
  - Tutorial/explainer videos
  - Podcast-style weekly digest (if you go that route)

## IMPLEMENTATION ORDER
1. Set up ElevenLabs account + API key (Paul)
2. Create voice cloning (Paul records 2-min sample)
3. Build TTS endpoint /api/tts — basic text-to-speech
4. Add "Listen to letter" button on complaint letters
5. Build voice chatbot (mic button on ChatWidget)
6. Set up HeyGen account + API key (Paul)
7. Build video ad generation pipeline
8. Connect to Casey agent for automated posting
9. Add audio notifications (optional)
10. Audio branding sounds (optional)

## COST ESTIMATES
- ElevenLabs Creator: $22/mo (~100 mins TTS — enough for hundreds of letter readings + chatbot sessions)
- HeyGen Creator: $29/mo (~enough for 15-20 short video ads/month)
- Total: ~$51/mo
- At scale (Pro plans): ~$178/mo for heavy usage

## ELEVENLABS API QUICK REFERENCE

### Text to Speech
```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
Headers: xi-api-key: {API_KEY}, Content-Type: application/json
Body: { "text": "...", "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 } }
Response: audio/mpeg stream
```

### Sound Effects
```
POST https://api.elevenlabs.io/v1/sound-generation
Body: { "text": "celebratory chime, digital money sound", "duration_seconds": 2.0 }
```

### Music
```
POST https://api.elevenlabs.io/v1/music/compose
Body: { "prompt": "upbeat corporate background music, modern fintech feel", "duration_seconds": 30 }
```

### Voice Cloning
```
POST https://api.elevenlabs.io/v1/voices/add
Body: FormData with audio files + name + description
``` (@Claude Code)

## APPROACH: v0 by Vercel + Claude Code

The redesign workflow is:
1. Use v0.app (Vercel's AI UI builder) to generate polished React + Tailwind + shadcn/ui components from detailed prompts
2. Claude Code integrates the generated components into the existing Next.js codebase
3. Paul can also generate components via v0.app directly and share the code

v0 outputs Next.js-compatible React components with Tailwind CSS and shadcn/ui — the exact same stack Paybacker already uses. This means generated components can be dropped in with minimal adaptation.

Paul needs to: Sign up for v0 Premium ($20/mo) at v0.app/pricing to access the Platform API and generation features.

## DESIGN SYSTEM — DESIGN TOKENS

Create a design tokens file at src/lib/design-tokens.ts and tailwind.config.ts overrides:

### Colour Palette
```
// Primary
navy-950: #0A1628        // Main background (dark sections)
navy-900: #0F1D35        // Card backgrounds (dark mode)
navy-800: #162544        // Sidebar, secondary surfaces
navy-700: #1E3A5F        // Borders, dividers (dark)

// Accent
mint-400: #34D399        // Primary CTA, success states
mint-500: #10B981        // Hover states
mint-300: #6EE7B7        // Subtle highlights

// Warm
orange-400: #FB923C      // Secondary accent (keep Paybacker brand)
orange-500: #F97316      // Hover state

// Neutrals
slate-50: #F8FAFC        // Light backgrounds
slate-100: #F1F5F9       // Card backgrounds (light)
slate-200: #E2E8F0       // Borders (light)
slate-400: #94A3B8       // Secondary text
slate-600: #475569       // Body text
slate-900: #0F172A       // Headings

// Semantic
success: #10B981
warning: #F59E0B
error: #EF4444
info: #3B82F6
```

### Typography
```
Font family: "Plus Jakarta Sans" (headings) + "Inter" (body)
  - Install: @fontsource/plus-jakarta-sans, @fontsource/inter

Heading scale:
  h1: 3rem (48px), font-weight 800, tracking-tight, Plus Jakarta Sans
  h2: 2.25rem (36px), font-weight 700, tracking-tight
  h3: 1.5rem (24px), font-weight 600
  h4: 1.25rem (20px), font-weight 600
  
Body scale:
  body-lg: 1.125rem (18px), line-height 1.75, Inter
  body: 1rem (16px), line-height 1.75
  body-sm: 0.875rem (14px), line-height 1.5
  caption: 0.75rem (12px), line-height 1.5
```

### Spacing & Radius
```
Card radius: 16px (rounded-2xl)
Button radius: 12px (rounded-xl)
Input radius: 10px (rounded-lg)
Badge radius: 9999px (rounded-full)

Card padding: 24px (p-6)
Section spacing: 80px (py-20)
Container max-width: 1280px
```

### Shadows
```
shadow-card: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)
shadow-card-hover: 0 10px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04)
shadow-glow-mint: 0 0 20px rgba(52,211,153,0.15)
shadow-glow-orange: 0 0 20px rgba(251,146,60,0.15)
```

### Animations
```
transition-default: all 200ms cubic-bezier(0.4, 0, 0.2, 1)
transition-bounce: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)

Add framer-motion for:
- Page transitions (fade + slide up, 300ms)
- Card hover lifts (translateY -2px)
- Number count-ups on stats
- Staggered list animations (50ms delay between items)
- Sidebar active indicator slide
```

## PAGES TO REDESIGN (full list)

### PUBLIC PAGES

**1. Landing Page (/) — HIGHEST PRIORITY**
Current: Dark background, basic hero, feature cards, trust section
Redesign to:
- Hero: Large heading "Take Back Control of Your Money" with animated gradient text on "Control", subtitle in slate-400, two CTAs (primary mint "Get Started Free", ghost "See How It Works"), floating dashboard preview with subtle parallax
- Social proof bar: "Trusted by X users" + TrueLayer/FCA/Stripe logos in muted grey
- Feature sections: 3 main sections with alternating layout (text left/image right, then swap), each with icon, heading, body, subtle card with screenshot
  - Section 1: AI Complaint Letters
  - Section 2: Subscription Intelligence  
  - Section 3: Money Recovery
- How it works: 3-step horizontal flow with connecting lines and numbered circles
- Testimonials: Cards with quotes (even if placeholder for now)
- CTA banner: Full-width gradient (navy → mint subtle) with heading and signup button
- Footer: Clean 4-column layout with links, social icons, legal, "Made in the UK" badge

**2. Pricing Page (/pricing)**
- Add PublicNavbar (currently missing — Bug #3)
- 3-tier card layout, centre card (Essential) elevated and highlighted with mint border
- Feature comparison list with checkmarks
- FAQ accordion below
- "All plans include" strip at the top

**3. About Page (/about)**
- Fix Finexer → TrueLayer reference
- Story section, mission statement, team/founder section
- Tech stack trust badges (TrueLayer, Stripe, Supabase)
- Clean timeline of milestones

**4. Blog (/blog)**
- Card grid (2 or 3 columns) with featured image, date, category tag, title, excerpt
- Category filter chips at top

**5. Solutions Pages (/solutions/*)**
- Template layout: hero with problem statement, how Paybacker helps, CTA to sign up
- Specific pages: energy, broadband, mobile, insurance

**6. SEO Landing Pages**
- /dispute-energy-bill, /flight-delay-claim, etc.
- Problem → Solution → CTA template with trust signals

### DASHBOARD PAGES

**7. Sidebar**
- Redesign: Slim (260px), dark navy-900 background, rounded active indicator with mint-400 left border and subtle mint background tint
- User avatar + name at top, plan badge
- Icon + label for each nav item, smooth hover transitions
- Collapse to icon-only on mobile (bottom tab bar on small screens)

**8. Overview (/dashboard)**
- Welcome card with user name and "Money Recovery Score" widget
- Stats row: 4 cards (Total Saved, Active Subscriptions, Open Complaints, Scan Results)
- Recent activity feed
- Action items with priority badges
- Quick action buttons (Write Complaint, Add Subscription, Connect Bank)

**9. Money Hub (/dashboard/money-hub)**
- Income/spending summary cards with trend arrows
- Spending breakdown donut chart (recharts, soft colours)
- Transaction list with merchant logos, category pills, amounts
- Budget progress bars with colour coding (green → amber → red)

**10. Complaints (/dashboard/complaints)**
- Letter list with status badges (Draft, Sent, Resolved)
- Letter editor with clean preview pane
- Company search with logos
- ADD "Send via Email" button (mailto: link) — Bug #17

**11. Subscriptions (/dashboard/subscriptions)**
- Card grid view (not just table) with merchant logo, name, amount, next billing date, status badge
- Quick actions: cancel, edit, mark as paid
- Filters: Active, Cancelled, Bank-detected
- TrueLayer connection banner (redesigned, less intrusive)

**12. Deals (/dashboard/deals)**
- Category tabs/pills at top
- Deal cards with provider logo, savings amount, "View Deal" CTA
- Exclusive badge for member-only deals

**13. Spending (/dashboard/spending)**
- Category breakdown with horizontal bars
- Merchant-level drill down
- Month-over-month comparison

**14. Scanner (/dashboard/scanner)**
- Opportunity cards with estimated savings, confidence level, action button
- Categories: overcharges, flight delays, forgotten subs, contract renewals

**15. Forms (/dashboard/forms)**
- Clean form list with icons and descriptions
- Form wizard with progress steps

**16. Rewards (/dashboard/rewards)**
- Tier progress visualisation (Bronze → Platinum)
- Points balance card
- Activity list showing how points were earned
- Badge showcase grid

**17. Profile (/dashboard/profile)**
- Edit profile form (name, address, phone, postcode) — Bug #33
- Connected accounts section (bank, email)
- Subscription plan and billing info
- Data export / delete account

### SHARED COMPONENTS

**18. PublicNavbar**
- Sticky, glass-morphism background on scroll (backdrop-blur-lg)
- Logo left, nav links centre, "Get Started" CTA right
- Mobile: hamburger → slide-out menu

**19. ChatWidget**
- Redesigned floating button (smaller, less intrusive)
- Chat window with modern card UI
- Remove proactive popup (or limit to once per session) — Bug #7

**20. Footer**
- 4-column grid: Product, Resources, Legal, Company
- Social links, "Made with ❤️ in the UK"
- FCA/TrueLayer/Stripe trust badges

## IMPLEMENTATION ORDER FOR CLAUDE CODE

1. **Design tokens & Tailwind config** — Set up the foundation first
2. **Install fonts** — Plus Jakarta Sans + Inter via @fontsource
3. **Install framer-motion** — For animations
4. **Shared components** — PublicNavbar, Footer, Sidebar, ChatWidget, Card, Button, Badge
5. **Landing page** — Highest conversion impact
6. **Pricing, About, Blog** — Public pages
7. **Dashboard Overview** — First thing users see after login
8. **Money Hub, Subscriptions, Complaints** — Core features
9. **Deals, Scanner, Spending, Forms, Rewards, Profile** — Secondary pages
10. **Mobile responsive pass** — All pages

## v0 PROMPTS FOR PAUL

Paul can use these prompts in v0.app to generate components, then share the code with Claude Code:

**Landing page hero:**
"Create a modern fintech landing page hero section for 'Paybacker' — a UK consumer finance AI platform that helps people fight unfair bills, track subscriptions, and recover money. Use a dark navy (#0A1628) background, mint (#34D399) accent for the CTA, Plus Jakarta Sans for headings, Inter for body text. Include an animated gradient on the key word, a subtitle, two buttons (primary filled and ghost outline), and a floating dashboard preview mockup on the right side. Make it feel like Monzo meets Linear. Use Tailwind CSS and shadcn/ui."

**Dashboard sidebar:**
"Create a modern dashboard sidebar for a fintech app. Dark navy (#0F1D35) background, 260px wide. Navigation items: Overview, Money Hub, Complaints, Subscriptions, Deals, Spending, Scanner, Forms, Rewards, Profile. Active state has a mint (#34D399) left border and subtle mint background tint. User avatar and name at top with plan badge. Smooth hover transitions. Collapsible. Use Tailwind CSS, shadcn/ui, and lucide-react icons."

**Subscription card:**
"Create a subscription card component for a fintech dashboard. Shows: company logo (32x32, with initial circle fallback), subscription name, amount with billing cycle, next billing date, status badge (Active/Cancelled/Paused). Has quick action buttons for edit/cancel. Rounded-2xl, soft shadow, hover lift effect. Use Plus Jakarta Sans headings, Inter body, mint and navy colour scheme, Tailwind CSS, shadcn/ui."

## NOTES
- Keep all existing functionality — this is a VISUAL redesign, not a feature rewrite
- Preserve all API routes, data fetching, and business logic
- The dark theme (navy) works well for the dashboard, use lighter theme for public/marketing pages
- Ensure all existing shadcn/ui components get the updated design tokens
- Test on mobile (390px iPhone) and desktop (1440px) at minimum (@Claude Code)

## Credentials
- Access Level: Explorer (production access, 2,880 ops/day limit)
- Developer Token: jCSfgPvX1M1zrWb92a3Zyw
- Customer ID: 390-589-8717

IMPORTANT: Store these in environment variables, NOT hardcoded. Use GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID.

## What Explorer Access Allows
- Create/manage campaigns, ad groups, ads, extensions
- Set budgets, targeting, bidding strategies, manage keywords
- Read performance data and reporting
- Pause, enable, modify campaigns
- 2,880 operations/day (plenty for single account)

## What Explorer Access CANNOT Do (don't build these)
- Keyword Planner API (do research in Google Ads UI instead)
- Audience Insights / Reach Planning API
- Billing/payments management via API
- Creating new advertiser accounts

## Implementation Steps

1. INSTALL GOOGLE ADS API CLIENT
   - npm: google-ads-api (Node.js client) OR use REST API directly
   - Set up OAuth2 credentials (will need refresh token — check if already configured)

2. CREATE API ROUTE: /api/google-ads/campaigns
   - POST: Create new campaign (campaign type, budget, bidding strategy, targeting)
   - GET: List campaigns with performance metrics
   - PATCH: Update campaign settings (budget, status, targeting)

3. CREATE API ROUTE: /api/google-ads/ads
   - POST: Create ad groups and responsive search ads
   - GET: List ads with performance data
   - PATCH: Update ad copy, pause/enable ads

4. CREATE FIRST SEARCH CAMPAIGNS targeting these segments:
   a. "Complaint letter generator" / "write complaint letter" / "consumer rights letter" — high intent, low competition
   b. "Cancel subscription help" / "how to cancel [provider]" — matches core feature
   c. "Overcharged on energy bill" / "energy bill complaint" — matches SEO landing pages
   d. "Check if I'm owed a refund" / "claim refund from company" — money recovery angle

5. AD COPY TEMPLATES (Responsive Search Ads):
   Headlines (max 30 chars each, need 15):
   - "Free AI Complaint Letters"
   - "Fight Unfair Bills With AI"
   - "Get Your Money Back Today"
   - "Cancel Subscriptions Easily"
   - "AI-Powered Bill Fighter"
   - "Write Complaint Letters Free"
   - "Overcharged? We Can Help"
   - "Save Money on Every Bill"
   - "UK Consumer Rights Tool"
   - "Stop Overpaying on Bills"
   - "Free Energy Bill Check"
   - "AI Writes Your Complaints"
   - "Paybacker - Money Recovery"
   - "Reclaim What You're Owed"
   - "Smart Subscription Manager"
   
   Descriptions (max 90 chars each, need 4):
   - "Paybacker uses AI to write complaint letters, track subscriptions & find savings. Try free."
   - "Connect your bank, spot overcharges, and let AI generate complaint letters in seconds."
   - "Join thousands saving money with AI-powered bill management. No credit card needed."
   - "FCA-regulated Open Banking. AI complaint letters. Subscription tracking. 100% free tier."

6. CAMPAIGN SETTINGS:
   - Location targeting: United Kingdom
   - Language: English
   - Bidding: Maximise conversions (start with this)
   - Daily budget: Start at £10/day per campaign (Paul can adjust)
   - Conversion tracking: Track signups via the existing UTM/gclid tracking on signup

7. CREATE GOOGLE ADS AGENT (optional, for Oscar or new agent):
   - Daily performance check via API
   - Auto-pause underperforming ads (high spend, no conversions after 7 days)
   - Weekly performance report to Charlie for Telegram digest

## Notes
- Explorer access is sufficient for all campaign management operations
- Don't build keyword planner features — those are restricted at this access level
- The existing UTM/gclid tracking on signup should already capture Google Ads conversions
- Start with search campaigns only — display/video can come later (@Claude Code)

## High (from GTM Strategy)
- [ ] Install Meta Conversions API (server-side) alongside Pixel for better ad attribution
- [ ] Add fbclid capture on signup (same pattern as gclid/UTM in middleware)
- [ ] Weekly signup-by-source SQL query + Telegram report for CAC tracking
- [ ] Trust signals: testimonials section, letter count stats, success rate on homepage
- [ ] Weekly Money Digest Email - spending summary, renewal alerts, deal suggestions
- [ ] Money Recovery Score - gamified dashboard metric showing potential savings

## Medium
- [ ] Legal compliance monitoring (Leo CLO agent)
- [ ] Instagram Stories posting support
- [ ] Video content generation pipeline (ElevenLabs + fal.ai)
- [ ] Telegram approval buttons for proposals
- [ ] AI Bill Negotiator - automated negotiation letters for existing providers
- [ ] Smart Document Scanner - OCR for bills/contracts
- [ ] Energy Tariff Monitor - real-time energy deal alerts

## Low
- [ ] CJ Affiliate setup (British Gas)
- [ ] Charlie Telegram -- improve agent run reliability
- [ ] Update blueprint doc with MCP server and unified system
- [ ] Household Mode - shared household finance management
- [ ] Savings Passport - visual savings tracker with milestones
- [ ] Paybacker for Business - B2B expansion scoping
