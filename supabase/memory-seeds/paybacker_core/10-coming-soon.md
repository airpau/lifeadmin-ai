# Coming Soon — Roadmap

These are features the founder has flagged as planned but NOT yet shipped. Treat them as
"not built" — never tell a user they exist, never assume agents can call APIs that
haven't been integrated. If you propose work that touches these areas, flag the
dependency in your recommendation so the founder can sequence properly.

## Switching / deal comparison
- Energy, broadband, insurance switching.
- API target: Switchcraft.
- Affiliate revenue stream (commission per switch).

## Automated cancellations
- Pro tier feature (already advertised on pricing).
- Will use stored Watchdog credentials + Late API or direct provider integration.
- Compliance dependency: needs Leo's legal sign-off (now feature-tester's compliance
  watch) on consent + audit trail before shipping.

## Instagram posting
- Currently blocked by Meta App Review (incorporation docs needed).
- Once approved, switches `META_ACCESS_TOKEN` from dev mode to live mode.
- Manual workflow used in interim: generate image, post via Telegram to Paul for
  manual upload.

## Self-learning from user feedback
- Loop NPS feedback + ticket-resolution outcomes back into the chatbot + complaint-letter
  fine-tuning. Likely a separate cron + an evaluation harness.

## WhatsApp integration
- Budget alerts, dispute tracking, complaint letters via WhatsApp chat.
- Dependency: WhatsApp Business API approval.

## Telegram (deeper integration)
- Beyond Pocket Agent: budget alerts + dispute tracking + complaint letters via chat
  for ALL tiers (currently Pro-only Pocket Agent).

## SMS notifications
- For urgent alerts only: budget exceeded, contract expiring.
- Provider TBD; Twilio likely.

## Native mobile app
- iOS + Android with push notifications.
- Currently web-only with PWA potential.

## In-app push notifications
- Budget tracking alerts in real time.

## Savings goal affiliate links
- Contextual deals matching user goals (holiday savings → travel deals, car fund →
  car finance, wedding → venue/service deals).

## Pro financial reports
- Automated daily / weekly / monthly email reports with budget progress, spending
  analysis, savings tracking. Builds on the Money Hub.

## Smart budget alerts
- Email / SMS / push when approaching or exceeding budget limits.
- Triggered from the budget-planner spend stream.

## SEO landing pages to build
Each needs: H1, meta title, meta description, OG tags, JSON-LD schema, free-signup CTA.
- `/dispute-energy-bill` — "How to dispute an energy bill UK"
- `/flight-delay-compensation` — "Flight delay compensation claim UK" (up to £520)
- `/cancel-gym-membership` — "How to cancel gym membership UK"
- `/council-tax-challenge` — "Council tax band challenge UK"
- `/debt-collection-letter` — "Debt collection letter response UK"

## Things the agents should NOT propose unprompted
- New banned-integration partners (OpenAI image, GA, Mixpanel, etc. — see
  `03-tech-stack.md` NEVER-VIOLATE rules).
- A new agent role outside the current 10 managed agents.
- Changing the pricing tiers without revenue-impact analysis from finance-analyst.
- Auto-execution of any kind.
