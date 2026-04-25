# Paybacker — Money Hub & Telegram Assist Social Pack (v3)

Updated 16 Apr 2026. Full rebuild of the pack to fix the two issues flagged in v1/v2:
1. AI-hallucinated on-screen UI text (spelling mistakes in phone screens).
2. Wrong brand palette (gold instead of the current mint green + orange + navy).

## What v3 does differently

- **Base images are generated with blank / off phone screens only.** fal.ai `flux-pro/v1.1-ultra` is prompted with explicit "screen completely off, dark reflective glass, no UI, no text" directives so the AI never generates any garbled UI text.
- **The entire Money Hub dashboard and Telegram chat UI is drawn with Pillow** on top of the blank phone screens. Every string, colour, chart segment, chat bubble, and CTA is pixel-perfect and readable.
- **Palette matches `src/app/globals.css`**: navy `#0A1628 / #0F1D35 / #162544`, mint `#10B981 / #34D399 / #6EE7B7`, orange `#F97316 / #FB923C`. No gold anywhere.
- **Headline pattern matches the existing /pro/ ads** — white lead line + orange accent word + mint separator.
- **Mint "Try Free" CTA + `paybacker.co.uk` URL** baked into every asset.

## Deliverables (v3)

### Money Hub (4 images)
| File | Format | Use on |
|---|---|---|
| `v3-moneyhub-square-mockup-final.jpg` | 2048×2048 (1:1) | Instagram / Facebook feed, LinkedIn |
| `v3-moneyhub-portrait-mockup-final.jpg` | 1536×2752 (9:16) | Instagram Story, TikTok, Reels |
| `v3-moneyhub-landscape-mockup-final.jpg` | 2752×1536 (16:9) | X/Twitter, Facebook wide, LinkedIn banner |
| `v3-moneyhub-square-illustrated-final.jpg` | 2048×2048 (1:1) | Carousel slide, blog hero |

### Telegram Paybacker Assist (4 images + 1 video)
| File | Format | Use on |
|---|---|---|
| `v3-telegram-square-mockup-final.jpg` | 2048×2048 (1:1) | IG / FB feed, LinkedIn |
| `v3-telegram-portrait-mockup-final.jpg` | 1536×2752 (9:16) | IG Story, TikTok, Reels |
| `v3-telegram-landscape-mockup-final.jpg` | 2752×1536 (16:9) | X/Twitter, FB wide, LinkedIn |
| `v3-telegram-square-illustrated-final.jpg` | 2048×2048 (1:1) | Carousel slide, blog hero |
| `v3-telegram-paybacker-assist-demo.mp4` | 1072×1928, 5s @ 24fps, h264 | IG Reels, TikTok, YouTube Shorts |

Matching lossless PNGs are provided alongside each JPG. The unedited base renders (`v3-*-mockup.png`, no overlay) stay in the folder as editable source.

## Suggested captions

### Money Hub
**Feed (1:1 / 16:9)**
> Your complete Money Hub. Every subscription, every direct debit, every pound — finally in one place.
>
> Paybacker shows you exactly where your money is going, flags hidden overcharges, and hands you the exact legal letter to get your money back.
>
> Start free at paybacker.co.uk.

**Story / Reel (9:16)**
> Every penny, one place. Save thousands.
> Start free → paybacker.co.uk

### Telegram Paybacker Assist
**Feed (1:1)**
> Meet Paybacker Assist — your AI money friend on Telegram.
>
> It scans your bills. Spots overcharges. Writes the dispute letter citing UK consumer law. All while you're in the school-run WhatsApp.
>
> Add on Telegram via paybacker.co.uk.

**Reel / TikTok (9:16 + video)**
> POV: your phone just messaged you to say BT owes you £43. And it's already written the dispute letter.
> Get Paybacker Assist on Telegram — free. paybacker.co.uk

**LinkedIn (16:9)**
> We built an AI assistant that lives in your Telegram.
> It watches your bills, spots overcharges, and drafts the dispute letter — citing the exact UK consumer law clause — in under 30 seconds.
> Founding-member pricing now open: paybacker.co.uk

## Brand notes
- Palette: navy `#0A1628` background, mint `#10B981` CTAs, orange `#F97316` highlight word.
- URL on every asset: `paybacker.co.uk` (never `.com`).
- CTA on every asset: mint "Try Free" pill + URL.
- No AI-generated text is allowed on phone screens — everything is drawn with Pillow.

## Regenerate / extend
- `generate_v3_bases.py` — fal.ai blank-screen base image generator.
- `overlay_brand_v3.py` — Pillow overlay pipeline (Money Hub + Telegram UI + headline + CTA).
- `generate_video_v3.py` — Kling v2.1 Master image-to-video, using the v3 portrait final as the hero.

To produce a 10s version of the video (currently 5s), change `duration: "5"` to `duration: "10"` in `generate_video_v3.py` and rerun.

## Previous versions
The v1/v2 files in this folder (without the `v3-` prefix) are retained only as history. They have the gold palette and hallucinated on-screen text and should not be used.
