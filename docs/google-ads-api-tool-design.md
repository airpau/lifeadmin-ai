# Paybacker Google Ads API Tool - Design Documentation

## Company Overview

**Company:** Paybacker LTD (UK registered)
**Website:** paybacker.co.uk
**Contact:** hello@paybacker.co.uk
**Founded:** March 2026

Paybacker is an AI-powered consumer finance platform for UK consumers. It helps users dispute unfair bills, track subscriptions, scan bank accounts and email inboxes for hidden costs, compare deals from 56 providers, and take control of their finances.

## Purpose of Google Ads API Integration

Paybacker uses the Google Ads API for **read-only campaign performance monitoring**. Our internal AI advertising agent ("Jordan - Head of Ads") retrieves campaign metrics on a scheduled basis and produces performance reports for the founder.

We do **not** use the API to create, modify, or delete campaigns, ad groups, ads, or keywords. All campaign management is done manually through the Google Ads web interface.

## Technical Architecture

### System Overview

```
Google Ads Account (390-589-8717)
        |
        v
Google Ads API (REST, v19)
        |
        v
Paybacker Agent Server (Railway)
        |
        v
Jordan (AI Advertising Agent)
        |
        v
Performance Reports (Supabase database)
        |
        v
Founder Dashboard + Email Briefings
```

### Components

1. **Agent Server** - A Node.js server hosted on Railway that runs our AI agent system
2. **Jordan (Head of Ads)** - An AI agent that analyses Google Ads performance data
3. **Supabase Database** - Stores performance reports for historical tracking
4. **Admin Dashboard** - Web interface where the founder reviews agent reports

### API Endpoints Used

| Endpoint | Purpose | Frequency |
|----------|---------|-----------|
| `customers/{id}/googleAds:searchStream` | Query campaign metrics | Daily |
| `customers/{id}/googleAds:searchStream` | Query ad group metrics | Daily |
| `customers/{id}/googleAds:searchStream` | Query keyword performance | Daily |
| `customers/{id}/googleAds:searchStream` | Query search terms | Daily |

### Data Retrieved (Read-Only)

- Campaign names, statuses, and budgets
- Impressions, clicks, cost, conversions, CTR, CPC
- Ad group performance breakdown
- Keyword performance and match types
- Actual search terms triggering ads

### Data NOT Modified

We do not use the API to:
- Create or modify campaigns
- Create or modify ad groups or ads
- Add or remove keywords
- Change budgets or bids
- Modify account settings

## Authentication Flow

1. OAuth 2.0 authorisation with `https://www.googleapis.com/auth/adwords` scope
2. Refresh token stored securely in Railway environment variables
3. Access token refreshed automatically before each API call
4. All credentials stored server-side only (never exposed to clients)

## Rate Limiting and Compliance

- API calls limited to daily reporting cycles (once per day per report type)
- Budget cap of $0.15 per agent run prevents excessive API usage
- Maximum 10 API calls per agent run
- All API calls logged to audit trail (agent_run_audit table)

## Security

- OAuth credentials stored as encrypted environment variables
- Refresh token never exposed in client-side code
- API calls made server-side only from Railway infrastructure
- Agent has read-only access (no write/mutate operations)
- Full audit trail of every API call with timestamp and parameters

## Contact

For questions about this integration:
- **Email:** hello@paybacker.co.uk
- **Website:** paybacker.co.uk
- **Developer:** Paul Airey, Founder
