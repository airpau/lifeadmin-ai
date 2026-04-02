## Yapily Integration Requirements

### Provider Details
- Provider: Yapily Connect Ltd (FCA firm no. 827001)
- Contacts: Thomas Picard, Christian
- Agreed: 31 March 2026
- Estimated fees: ~£1500/month (to be confirmed by Christian)

### Migration from TrueLayer
- Current provider: TrueLayer (client ID: paybacker-340887), sandbox/dev mode only
- Migration: Swap API client, update bank connection flow, map data formats
- Existing users will need to re-authenticate (no consent transfer between providers)

### FCA Compliance Rules
**Can show WITHOUT FCA approval:**
- Spending breakdowns by category (derived from transactions)
- Income breakdowns by category (derived from transactions)
- Transaction lists with amounts, merchants, categories
- Subscription/recurring payment detection
- Financial health scores (derived metrics)
- Spending trends, monthly comparisons, graphs
- Budget tracking, savings rate percentages, top merchants

**CANNOT show until FCA agent registration approved:**
- Actual bank account balances (current balance, available balance)
- Consolidated account balance totals across multiple accounts
- Any direct representation of how much money is in a bank account

**Feature flag:** SHOW_BANK_BALANCES in lib/feature-flags.ts (set to false until FCA approved)

### 90-Day Consent Renewal (CRITICAL)
- Open Banking consents expire after 90 days
- Users should be prompted to renew BEFORE the 90-day limit (e.g. 7 days before expiry)
- Renewal UX: Simple "OK" / "Renew Connection" button tap — NOT a full re-authentication
- Yapily confirmed this simple re-consent is supported
- IMPORTANT: Renewing before expiry avoids being charged a new connection fee by Yapily
- Implementation: Track consent_granted_at in bank_connections table, run daily check for connections expiring within 7 days, show in-app prompt + send email notification

### FCA Agent Registration
- Required because Paybacker displays consolidated account information to users
- Timeline: ~2 months from submission
- Yapily handles the FCA submission on Paybacker's behalf
- Paul needs: Basic DBS check (submitted 31 March 2026), fit and proper documentation
- Once approved: Enable SHOW_BANK_BALANCES feature flag, add balance display to MoneyHub

### Christian's Requirements Document
- Christian (Yapily) to send detailed document specifying exactly what can/cannot be shown
- Awaiting delivery — update this context once received

### Data Plus (Transaction Enrichment)
- Yapily Data Plus provides: merchant name enrichment, transaction categorisation (26 incoming / 72 outgoing consumer categories), recurring transaction detection, income insights
- Could replace Paybacker's manual merchant_rules table (160 rules currently in Supabase)
- Confirm with Yapily: pricing for Data Plus, availability for UK consumer accounts in production