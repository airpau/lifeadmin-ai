# Ad Creative — fal.ai Image Prompts and Video Generation

**Platform rule:** per CLAUDE.md, **all image and video generation goes through fal.ai only.** Never OpenAI image gen, never Midjourney direct, never Stability direct. Casey's role when re-activated is to manage this pipeline.

**Creative inventory needed for launch (60 days):**
- 30 static Meta ad images (9:16 and 1:1)
- 30 TikTok ad thumbnails (9:16)
- 6 short-form ads (10-30 seconds) from UGC footage
- 4 website hero/section images
- Assorted social post images

## Principles

- **Never put text in generated images.** The AI hallucinates garbled copy. All headlines and CTAs are added in post-production (Canva, CapCut, or our in-house overlay tool).
- **Brand colours exactly:** Dark navy `#0F172A`, gold accent `#F59E0B`, white `#FFFFFF`. Every prompt includes this.
- **Photographic-realistic preferred** for UGC-style ads. Avoid "AI-looking" — no glossy skin, no uncanny hands.
- **UK-specific visual cues:** British accents in video, UK-style letters (A4), UK car parks with UK number plates if visible, UK high streets. Prompt this explicitly.

## fal.ai model picks

| Use case | Model | Why |
|---|---|---|
| Photographic realism (people) | `fal-ai/flux-pro/v1.1-ultra` | Best quality for realistic UK faces and scenes |
| Quick iterations / thumbnails | `fal-ai/flux/schnell` | Fast, cheap, good-enough for testing |
| Product interface mockups | `fal-ai/flux-pro/v1.1` | Sharp rendering of dashboards/phones |
| Video from image | `fal-ai/luma-dream-machine` or `fal-ai/kling-video/v2.1-pro` | For ad-ready short-form video from stills |
| UGC video editing assist | Runway Gen-3 via `fal-ai/runway` endpoint | Only as backup — Gen-3 is expensive |

## Prompt library

### Pillar 1 — The Injustice (static images)

**P1.1 — The parking fine moment**
> A frustrated man in his early 30s in a Marks & Spencer car park in the UK, holding up a printed parking charge notice near his car windscreen, golden-hour natural lighting, photographic realism, shallow depth of field, UK number plates visible, shot on 35mm, subtle disappointment expression. No text visible in image. Deep navy parked car (#0F172A adjacent). Style: editorial documentary.

**P1.2 — The letter on the doormat**
> Close-up photographic shot of an A4 envelope lying on a UK front-door doormat, "Private Parking Charge" vibe (not readable as text), viewed from above, Saturday-morning sunlight from the side, realistic household carpet, subtle shadow from the letterbox. No visible readable text. Muted warm tones. Style: hyperrealistic still life.

**P1.3 — The broadband bill on a laptop screen**
> Close-up of a female hand in her 30s holding a UK paper bill and looking at a laptop screen with spreadsheet-like interface (no visible readable text), cosy UK living room, soft window light, golden-hour, UK-style rental flat details (radiator, window), expression: quiet frustration. Realistic, shot on 50mm, shallow DOF. No legible text anywhere. Style: lifestyle editorial.

### Pillar 2 — The Product (static images)

**P2.1 — Phone showing the letter generator interface**
> Photographic shot of a hand holding a modern smartphone, on the screen is a clean, professional financial app interface in deep navy (#0F172A) and gold (#F59E0B), visible UI suggests a form with input fields and a prominent gold "Generate" button (no readable text), background is a blurred UK coffee shop, warm natural light. Shot on 50mm f/1.8. Highly realistic.

**P2.2 — Dashboard on a laptop**
> Laptop screen with a modern finance dashboard in dark navy theme with gold accents, visible chart-like elements and sidebar navigation (no readable text on screen), the laptop sits on a light oak desk in a UK home-office, window with UK-garden view in soft bokeh background, late-morning light. Realistic, cinematic colour grade. No legible text.

### Pillar 3 — The Founder (static images)

**P3.1 — Paul at his desk (for authentic founder posts)**
> *Prompt this only if we have licence to use Paul's actual image. Otherwise skip — don't AI-generate a "fake founder." Use a real photograph.*

### Pillar 4 — Abstract / mood (static images)

**P4.1 — The regulator letter-to-consumer visual**
> Minimalist flat-lay photography, an open UK government-style letter on an oak desk beside a pair of reading glasses and a half-drunk cup of tea, natural side light, neutral colour palette with subtle navy accent, shot top-down, high-detail paper texture, UK envelope visible. No readable text. Style: FT Weekend editorial.

**P4.2 — The AI-writing-legislation metaphor**
> Abstract conceptual photograph of a stack of UK legal textbooks on a desk with a modern laptop open beside them showing a clean navy-and-gold dashboard interface (no readable text), warm morning light, shallow DOF, cinematic. Realistic. Suggests: ancient legal knowledge meets modern tools.

### Video prompts (10-20 seconds from still)

**V1 — Letter arriving moment**
> From still P1.2: gentle camera push-in toward the envelope on the doormat, then a hand reaches down to pick it up, subtle realistic motion, 5-second clip, no added text.

**V2 — Phone interface reveal**
> From still P2.1: hand tilts phone slightly towards camera, screen glows, subtle UI animation (button press, loading state — generated as video motion only), 8-second clip. Realistic physics. Good for the 0-2 second hook of a paid ad.

**V3 — Dashboard data animation**
> From still P2.2: on the laptop screen, numbers subtly tick up, a gold bar chart grows left-to-right, gentle warm light shifts, 10-second clip. No readable text. Good for "results in your dashboard" type ads.

## Text-overlay specifications (added in post)

All ad overlays follow a tight design spec, created in Canva or via our in-house overlay route.

- **Hook copy** — top third, 60pt Inter Bold, white on dark navy #0F172A band
- **Body copy** — middle, 36pt Inter Regular, white
- **CTA** — bottom third, gold #F59E0B pill button, "Try free at paybacker.co.uk" in dark navy 28pt bold
- **Logo** — top-left corner, 8% of width, gold on transparent
- **Legal line** — bottom edge, 12pt white 60% opacity: "Free tier: 3 letters/month forever. No card."

## Ad copy matrix — hooks to pair with each creative

Every generated image pairs with 3-5 pre-written hook lines. The creative + hook combinations are what gets A/B tested.

| Image | Hook options |
|---|---|
| P1.1 (parking fine) | "87% of parking appeals succeed. If you write one." / "I wrote mine in 30 seconds." / "POFA 2012 is your friend." |
| P1.2 (letter on doormat) | "The letter that cost you £100 — and the one that gets it cancelled." / "This envelope made me £287 poorer. This time last year." |
| P1.3 (broadband bill) | "Your broadband went up £10/mo. That might be illegal now." / "One letter. 30 seconds. Out of contract, free." |
| P2.1 (phone interface) | "UK consumer law, in your pocket." / "30 seconds from problem to solicitor-grade letter." / "The tool UK companies don't want you to have." |
| P2.2 (dashboard) | "Every subscription, in one place. Every overcharge, surfaced." |

## Automation workflow

1. **cron-content-generator.md** triggers daily at 7am: picks 3 prompts from this library that haven't been used in the last 14 days.
2. Calls fal.ai Flux Pro endpoint server-side with `FAL_KEY`.
3. Stores generated image in Supabase Storage `social-images` bucket.
4. Inserts row in `content_drafts` with prompt text, image URL, status `pending`.
5. Paul reviews in `/admin/content-drafts` dashboard (to be built), approves with selected caption/hook from the matrix, chooses publish time.
6. On approve: Late API posts to selected platforms OR Meta Ads API uploads to ad creative library.

## What to never generate

- Images with **people holding branded products** (IP risk)
- Images featuring **specific celebrities** (Martin Lewis, Katie Morley, any named journalist)
- Any image claiming a specific named UK company overcharges or does wrong (legal risk — libel/malicious falsehood)
- Generated text claiming specific savings ("£1,000 saved!") — only use real numbers from our data
- Generated images of lawyers, judges, or courtrooms (conveys regulated legal-advice impression — FCA risk)
