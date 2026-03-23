# Paybacker AI Operations Blueprint

> Last updated: 23 March 2026

## Overview

Paybacker operates with an autonomous AI executive team that manages day-to-day business operations, supported by a human oversight layer for edge cases and strategic decisions. The system comprises 7 AI agents, a full support ticketing system, comprehensive contract tracking for deal targeting, an executive meeting room for live agent interaction, and a self-improving proposal system with one-click email approval.

---

## AI Executive Team — Full Roster

| Role | Agent Name | Schedule | Runs/Day | Model | Colour (UI) | Emails To |
|------|-----------|----------|----------|-------|-------------|-----------|
| **CFO** | Alex | 7am, 1pm, 6pm | 3x | Claude Haiku 4.5 | Green | aireypaul@googlemail.com |
| **CTO** | Morgan | 8:30am, 2:30pm, 7:30pm | 3x | Claude Haiku 4.5 | Blue | aireypaul@googlemail.com |
| **CAO** | Jamie | 8am, 12pm, 5pm | 3x | Claude Haiku 4.5 | Purple | aireypaul@googlemail.com |
| **CMO** | Taylor | 7:30am, 1:30pm, 5:30pm | 3x | Claude Haiku 4.5 | Pink | aireypaul@googlemail.com |
| **Exec Assistant** | Charlie | 7am, 9am, 11am, 1pm, 3pm, 5pm, 7pm | 7x | Claude Haiku 4.5 | Cyan | hello@paybacker.co.uk |
| **Support Lead** | Sam | Every 30 minutes | 48x | Claude Haiku 4.5 | Amber | DB only |
| **Support Agent** | Riley | Every 15 minutes | 96x | Claude Haiku 4.5 | Slate | DB only |

**Total: ~163 agent runs per day. Estimated cost: ~$0.50-1.00/day (Claude Haiku at ~$0.003/run)**

**Cron:** Vercel Pro plan, `/api/cron/executive-agents` runs every 15 minutes. Each agent's DB schedule determines whether it actually executes.

---

## Agent Profiles — What Each One Does

### Alex — CFO (Chief Financial Officer)
**Schedule:** 3x daily at 7am, 1pm, 6pm UTC (`0 7,13,18 * * *`)
**What it does autonomously:**
- Queries MRR, ARR, tier breakdown (free/essential/pro user counts)
- Calculates API costs from `agent_runs` (last 24h and 7 days)
- Projects monthly costs and revenue margin
- Counts new signups in the last 24 hours

**Output:** Daily Financial Report emailed to Paul with metrics, highlights, concerns, and recommendations.

**What it CANNOT do:** Make any financial decisions, change pricing, or modify Stripe configuration.

**How to interact:**
- View reports: Admin Dashboard → AI Team → expand Alex's card
- Trigger manually: AI Team → "Run Now" button
- API: `POST /api/admin/agents/{alex-id}` with CRON_SECRET

---

### Morgan — CTO (Chief Technology Officer)
**Schedule:** 3x daily at 8:30am, 2:30pm, 7:30pm UTC (`30 8,14,19 * * *`)
**What it does autonomously:**
- Reviews all `agent_runs` — total, completed, failed counts
- Calculates success rate across all AI operations
- Breaks down runs by agent type (chatbot, complaint_writer, etc.)
- Sums API costs and average cost per run
- Checks `social_posts` for generation/posting failures

**Output:** Weekly Tech Report emailed to Paul with agent performance metrics, tech concerns, and infrastructure recommendations.

**What it CANNOT do:** Deploy code, change infrastructure, modify API keys, or fix bugs.

**How to interact:**
- View reports: Admin Dashboard → AI Team → expand Morgan's card
- Trigger manually: AI Team → "Run Now" button
- API: `POST /api/admin/agents/{morgan-id}` with CRON_SECRET

---

### Jamie — CAO (Chief Admin Officer)
**Schedule:** 3x daily at 8am, 12pm, 5pm UTC (`0 8,12,17 * * *`)
**What it does autonomously:**
- Tracks total users, new signups (24h), and onboarding completion rates
- Monitors feature adoption: subscriptions tracked, tasks by type, bank connections
- Checks waitlist conversion rate (pending → invited → converted)
- Identifies churn signals (cancelled subscriptions, inactive users)

**Output:** Daily Ops Report emailed to Paul with growth metrics, feature adoption data, churn risks, and operational recommendations.

**What it CANNOT do:** Contact users, modify accounts, or take any action on user data.

**How to interact:**
- View reports: Admin Dashboard → AI Team → expand Jamie's card
- Trigger manually: AI Team → "Run Now" button
- API: `POST /api/admin/agents/{jamie-id}` with CRON_SECRET

---

### Taylor — CMO (Chief Marketing Officer)
**Schedule:** 3x daily at 7:30am, 1:30pm, 5:30pm UTC (`30 7,13,17 * * *`)
**What it does autonomously:**
- Analyses social media post performance (created, approved, posted counts)
- Tracks waitlist growth and conversion funnel
- Monitors deal click engagement (Awin affiliate clicks, 7-day trends)
- Reviews user acquisition (new signups, total users)
- Generates content and campaign recommendations

**Output:** Daily Marketing Report emailed to Paul with social metrics, waitlist data, deal engagement, and actionable marketing tactics.

**What it CANNOT do:** Post to social media, send marketing emails, change landing pages, or modify ad campaigns.

**How to interact:**
- View reports: Admin Dashboard → AI Team → expand Taylor's card
- Trigger manually: AI Team → "Run Now" button
- API: `POST /api/admin/agents/{taylor-id}` with CRON_SECRET

---

### Charlie — Executive Assistant
**Schedule:** 7x daily at 7am, 9am, 11am, 1pm, 3pm, 5pm, 7pm UTC (`0 7,9,11,13,15,17,19 * * *`)
**Emails to:** hello@paybacker.co.uk
**What it does autonomously:**
- Reads the latest reports from ALL other AI executives (Alex, Morgan, Jamie, Taylor)
- Checks support ticket status (open, urgent, escalated to human, overdue)
- Monitors user growth metrics and MRR
- Scans for contracts expiring within 30 days (deal targeting opportunities)
- Compiles a prioritised task list of things Paul needs to action TODAY
- Includes agent health status (which agents ran, which didn't)

**Output:** Executive Brief emailed to hello@paybacker.co.uk with:
- Urgent tasks (with source: which agent flagged it)
- Agent update summary (key finding from each agent's latest report)
- Ticket summary (open, urgent, human-required counts)
- Business metrics snapshot (MRR, total users, new users)
- Recommendations

**What it CANNOT do:** Take any actions. Charlie is purely a reporter and task compiler.

**How to interact:**
- Check your hello@paybacker.co.uk inbox — 3 briefs per day
- View reports: Admin Dashboard → AI Team → expand Charlie's card
- Trigger manually: AI Team → "Run Now" button

---

### Sam — Support Lead
**Schedule:** Every 30 minutes (`*/30 * * * *`)
**What it does autonomously:**
- Reviews all open and in-progress tickets
- Counts urgent tickets and overdue tickets (no response > 1 hour)
- Lists all active tickets with age, priority, category, and assignment
- Produces triage recommendations

**Output:** Ticket Triage Report (saved to DB, NOT emailed — too frequent). View in AI Team tab.

**What it CANNOT do:** Close tickets, issue refunds, or contact users directly.

**How to interact:**
- View reports: Admin Dashboard → AI Team → expand Sam's card
- Trigger manually: AI Team → "Run Now" button
- API: `POST /api/admin/agents/{sam-id}` with CRON_SECRET

---

### Riley — Support Agent
**Schedule:** Every 15 minutes (`*/15 * * * *`)
**What it does autonomously:**
- Fetches up to 5 open tickets with no first response
- For each ticket, reads the conversation thread
- Decides whether to respond or escalate:
  - **Respond:** Inserts an AI-drafted reply as a ticket message (sender: "Riley (AI)"), sets ticket status to `in_progress`, sets `first_response_at`
  - **Escalate:** Sets `assigned_to` to "Human Required", adjusts priority if needed
- Produces a summary report of actions taken

**Output:** Support Agent Report (saved to DB). Lists which tickets were responded to and which were escalated.

**What it CANNOT do:** Issue refunds, make account changes, make promises, or handle complex disputes. When in doubt, it escalates.

**How to interact:**
- View reports: Admin Dashboard → AI Team → expand Riley's card
- Trigger manually: AI Team → "Run Now" button
- Review AI responses: Admin Dashboard → Tickets → click a ticket to see the conversation
- API: `POST /api/admin/agents/{riley-id}` with CRON_SECRET

---

## Agent Coordination — Action Items System

Agents communicate via the `agent_action_items` table. When any agent spots something that needs attention, it flags an action item with a priority, category, and assignment.

### Flow
```
Alex/Morgan/Jamie/Taylor spot issue → flag action item (priority + category)
    ↓
Sam spots urgent ticket → flags action item
    ↓
Charlie reads ALL action items + ALL agent reports (7x daily)
    ↓
Compiles numbered, prioritised task list → emails hello@paybacker.co.uk
```

### Action Item Fields
- **title** — Short description
- **description** — What needs doing and why
- **priority** — urgent, high, medium, low
- **category** — finance, technical, operations, marketing, support, compliance, growth
- **flagged_by** — Which agent role created it
- **assigned_to** — `human` (for Paul) or an agent role
- **source_report_id** — Links back to the originating report
- **status** — open, in_progress, done, dismissed

### Staggered Schedule — Agents Build on Each Other
```
7:00  Alex (CFO) + Charlie brief #1
7:30  Taylor (CMO) — has Alex's data
8:00  Jamie (CAO) — has Alex + Taylor's data
8:30  Morgan (CTO) — has all morning reports
9:00  Charlie brief #2 — compiles ALL morning findings
...pattern repeats at midday and evening
```

---

## Executive Meeting Room

The admin dashboard has a **"Call a Meeting"** button that opens a full-screen boardroom interface.

### How It Works
- Type a message to address your AI executive team
- All 6 agents (Alex, Morgan, Jamie, Taylor, Charlie, Sam) respond simultaneously in character
- Uses Claude Sonnet for all agents in meetings (higher quality for live interaction)
- Conversation history maintained for multi-turn discussions
- Each agent responds only from their area of expertise

### "Make This a Proposal" Button
Every agent message in the meeting has a **"Make this a proposal"** button. Click it to:
1. Create a formal improvement proposal in the DB
2. Send you an approval email with Approve/Reject links

### When to Use It
- Brainstorming strategy ("How should we approach the waitlist launch?")
- Troubleshooting live issues ("Users aren't completing onboarding — ideas?")
- Getting quick consensus on decisions ("Should we prioritise mobile or broadband deals?")
- Ad-hoc status checks ("What are our top priorities this week?")

---

## Self-Improving System — Improvement Proposals

The system can propose its own improvements. Agents suggest changes in their reports, and you approve or reject them via one-click email links.

### Flow
```
Agent runs → spots improvement → includes in report
    ↓
Cron saves proposal to DB → emails hello@paybacker.co.uk
    ↓
You receive email: [Approve] [Reject] buttons
    ↓
Approve:
  Config/prompt/schedule → auto-executed immediately
  Code/feature/bugfix → creates GitHub issue
    ↓
Reject: dismissed, recorded
```

### Three Ways Proposals Are Created
1. **Automatically** — Agents include improvements in their 3x daily reports
2. **From meetings** — Click "Make this a proposal" on an agent message
3. **Manually** — POST to `/api/admin/proposals`

### What Happens on Approval

| Category | On Approve |
|----------|-----------|
| `prompt` | Agent's system prompt updated in DB immediately |
| `schedule` | Agent's cron schedule updated immediately |
| `config`, `data` | Logged — applied in next Claude Code session |
| `code`, `feature`, `bugfix`, `infrastructure` | Creates GitHub issue (requires `GITHUB_TOKEN` env var) |

### API Endpoints
- `GET /api/admin/proposals` — List proposals (filter by status)
- `POST /api/admin/proposals` — Create proposal + send approval email
- `GET /api/admin/proposals/approve?token=X&action=approve|reject` — One-click approve/reject

### Database Table: `improvement_proposals`
Key columns: title, description, implementation, category, priority, estimated_impact, status, approval_token, github_issue_url

### Environment Variable
`GITHUB_TOKEN` — GitHub personal access token with `repo` scope. Required for auto-creating issues on approval of code/feature proposals.

---

## How to Access Everything

### Admin Dashboard
**URL:** `/dashboard/admin` (only accessible to aireypaul@googlemail.com)

**4 Tabs:**
1. **Overview** — Revenue (MRR/ARR), tier breakdown, platform stats, recent signups
2. **Members** — All users with detail drill-down (subscriptions, tasks, bank connections, API cost)
3. **Tickets** — Full ticketing system with filters, conversation threads, reply with email notification
4. **AI Team** — All 6 agents with status, schedule, last run, pause/resume, run now, expandable reports

### Manual Agent Triggers
From the AI Team tab, click "Run Now" on any agent to trigger it immediately. The report will appear when you expand the agent's card.

### Pausing/Resuming Agents
Click "Pause" on any agent card to stop it from running on its schedule. Click "Resume" to reactivate. Paused agents can still be triggered manually.

---

## Support Ticketing System

### Ticket Sources
1. **Chatbot escalation** — When the chatbot detects user frustration or the user asks for human help, it auto-creates a ticket with the full conversation history attached as metadata. The ChatWidget also has a "Talk to a human" button that appears after 3 messages.
2. **Inbound email** — Emails to support@paybacker.co.uk hit the `/api/support/inbound-email` webhook. If the subject contains a ticket number (e.g. "Re: My issue (TKT-0012)"), the email is added as a message to that ticket. Otherwise, a new ticket is created.
3. **Manual creation** — POST to `/api/support/tickets` with subject, description, category, priority.

### Ticket Numbering
Auto-generated sequential numbers: TKT-0001, TKT-0002, etc. (Postgres sequence).

### Ticket Lifecycle
```
open → in_progress → awaiting_reply → resolved → closed
                  ↑                        ↓
                  └────── reopened ─────────┘
```

- `first_response_at` is set when the first agent/admin reply is added
- `resolved_at` is set when status changes to resolved or closed
- When an agent replies to an open ticket, status auto-changes to `in_progress`

### Categories
`billing` | `technical` | `complaint` | `general` | `account`

### Priority Levels
- **Urgent** — System outage, security issue, payment failure
- **High** — Billing dispute, account access problem
- **Medium** — Feature question, general complaint
- **Low** — Feedback, feature request

### SLA Targets
- Urgent: First response within 1 hour
- High: First response within 4 hours
- Medium: First response within 24 hours
- Low: First response within 48 hours

### Replying to Tickets
From the Tickets tab, click a ticket → type reply → click "Send & Notify User". This:
1. Adds the message to the ticket thread
2. Emails the user with a branded notification (subject: "Re: [subject] (TKT-XXXX)")
3. Sets `first_response_at` if this is the first reply
4. Auto-changes status from open to in_progress

---

## Escalation Paths

```
User Issue
    ↓
Chatbot (Paybacker Support AI)
    ↓ (escalation detected or "Talk to a human" clicked)
Support Ticket Created (source: chatbot)
    ↓
Riley (AI Support Agent) — auto-responds to simple queries every 15 mins
    ↓ (complex issue → assigned_to = "Human Required")
Sam (Support Lead AI) — triages hourly, adjusts priorities
    ↓ (requires human judgement)
Human Admin (Paul) — final decision authority via Tickets tab
```

### When AI Escalates to Human
- Refund requests over £50
- Account deletion requests
- Legal threats or regulatory complaints
- Technical bugs requiring code changes
- Billing disputes requiring Stripe actions
- Any issue the AI is not confident about

---

## Human Oversight Model

### AI Autonomy Levels

| Agent | Can Act Autonomously | Requires Human Approval |
|-------|---------------------|------------------------|
| CFO (Alex) | Generate reports, send email summaries | No autonomous actions on finances |
| CTO (Morgan) | Generate reports | No code changes or deployments |
| CAO (Jamie) | Generate reports, flag churn risks | No user communications |
| CMO (Taylor) | Generate reports, suggest campaigns | No social posting or email sends |
| Exec Assistant (Charlie) | Compile briefs, email task lists | No actions — reporting only |
| Support Lead (Sam) | Triage tickets, adjust priorities | Cannot close tickets or issue refunds |
| Support Agent (Riley) | Respond to simple tickets | Cannot make account changes or promises |

### Key Principle
**All AI agents produce reports and recommendations. Only the Support Agent (Riley) can auto-respond to users, and only for simple queries. All other actions require human review.**

---

## Cost Controls

- All agents use Claude Haiku 4.5 (~$0.003/run)
- Max tokens per response: 1024 (executive agents), 512 (support agent per ticket)
- Support Agent limited to 5 tickets per cycle (every 15 mins)
- Executive agents run on fixed schedules (not triggered by events)
- CFO, CTO, CAO, CMO reports emailed to admin; support reports saved to DB only
- Estimated monthly cost at scale: ~£5-20 for all agents combined

### Separate API Key for AI Staff Costs
All AI executive agents use `ANTHROPIC_AGENTS_API_KEY` instead of the main `ANTHROPIC_API_KEY`. This means:
- **ANTHROPIC_API_KEY** — Used by user-facing features (chatbot, complaint letters, cancellation emails). Tracks user-driven costs.
- **ANTHROPIC_AGENTS_API_KEY** — Used exclusively by the 6 AI executives (Alex, Morgan, Jamie, Taylor, Sam, Riley). Tracks autonomous staff costs.

Both keys are from the Anthropic console. Create a second API key in your Anthropic account, set it as `ANTHROPIC_AGENTS_API_KEY` in Vercel env vars. If not set, agents fall back to `ANTHROPIC_API_KEY`.

This separation lets you see at a glance:
- How much the AI staff is costing you (Anthropic dashboard → filter by agents key)
- How much user activity is costing you (Anthropic dashboard → filter by main key)

---

## Data Access Matrix

| Agent | profiles | tasks | subscriptions | bank_data | support_tickets | agent_runs | social_posts | waitlist | deal_clicks |
|-------|----------|-------|---------------|-----------|-----------------|------------|-------------|----------|-------------|
| CFO (Alex) | Read (tiers) | - | - | - | - | Read (costs) | - | - | - |
| CTO (Morgan) | - | - | - | - | - | Read (all) | Read (status) | - | - |
| CAO (Jamie) | Read (growth) | Read (types) | Read (counts) | Read (counts) | - | - | - | Read (counts) | - |
| CMO (Taylor) | Read (counts) | - | - | - | - | - | Read (all) | Read (all) | Read (counts) |
| Exec Asst (Charlie) | Read (tiers) | - | Read (expiring) | - | Read (counts) | - | - | - | - |
| Support Lead (Sam) | - | - | - | - | Read/Write | - | - | - | - |
| Support Agent (Riley) | - | - | - | - | Read/Write | - | - | - | - |

All access via service role key (bypasses RLS). No agent has access to raw user data (passwords, tokens, financial details).

---

## API Endpoints

### Support Tickets
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/support/tickets` | Any | Create ticket |
| GET | `/api/support/tickets` | CRON_SECRET | List tickets with filters |
| GET | `/api/support/tickets/[id]` | CRON_SECRET | Ticket detail + messages |
| PUT | `/api/support/tickets/[id]` | CRON_SECRET | Update status/priority/assignment |
| POST | `/api/support/tickets/[id]/messages` | CRON_SECRET | Add message + optional email notify |
| POST | `/api/support/inbound-email` | None (webhook) | Inbound email → ticket |

### AI Executives
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/agents` | CRON_SECRET | List all agents with latest report |
| PUT | `/api/admin/agents/[id]` | CRON_SECRET | Update agent config/status |
| POST | `/api/admin/agents/[id]` | CRON_SECRET | Manual trigger run |
| GET | `/api/admin/agents/[id]/reports` | CRON_SECRET | Paginated report history |
| GET | `/api/cron/executive-agents` | CRON_SECRET | Hourly cron (Vercel scheduled) |

---

## File Structure

```
src/lib/agents/
├── executive-agent.ts        # Base runner (Claude call, JSON parsing, types)
├── cfo-agent.ts              # Alex — financial data gathering + report
├── cto-agent.ts              # Morgan — tech health data gathering + report
├── cao-agent.ts              # Jamie — ops data gathering + report
├── cmo-agent.ts              # Taylor — marketing data gathering + report
├── exec-assistant-agent.ts   # Charlie — compiles all reports + action items (uses Sonnet)
├── support-lead-agent.ts     # Sam — ticket triage data gathering + report
├── support-agent.ts          # Riley — auto-respond/escalate logic
└── complaints-agent.ts       # (existing) complaint letter generation

src/app/api/
├── support/
│   ├── tickets/route.ts              # POST create, GET list
│   ├── tickets/[id]/route.ts         # GET detail, PUT update
│   ├── tickets/[id]/messages/route.ts # POST add message
│   └── inbound-email/route.ts        # POST webhook
├── admin/
│   ├── agents/route.ts               # GET list agents
│   ├── agents/[id]/route.ts          # PUT update, POST manual trigger
│   ├── agents/[id]/reports/route.ts  # GET report history
│   ├── meeting/route.ts              # POST live meeting with all agents
│   ├── proposals/route.ts            # GET list, POST create proposal
│   └── proposals/approve/route.ts    # GET one-click approve/reject via email link
└── cron/executive-agents/route.ts    # Every 15 mins cron runner

src/components/admin/
├── TicketList.tsx           # Ticket list + detail + reply UI
├── AITeamPanel.tsx          # Agent cards with controls + reports
└── MeetingRoom.tsx          # Live boardroom meeting with all agents

supabase/migrations/
├── 20260322000000_support_and_agents.sql                        # Tickets + agents + seed data
├── 20260323000000_contract_tracking_indexes_exec_assistant.sql  # Contract fields + indexes + Charlie
├── 20260323010000_agent_action_items.sql                        # Cross-agent coordination
└── 20260323020000_improvement_proposals.sql                     # Self-improving proposal system
```

---

## Contract & Deal Tracking

The `subscriptions` table tracks every financial commitment for every user — not just streaming subscriptions, but mortgages, loans, insurance, energy contracts, and more. This enables targeted deal recommendations.

### Contract Types Tracked
`subscription` | `fixed_contract` | `mortgage` | `loan` | `insurance` | `lease` | `membership` | `utility` | `other`

### Provider Types (for deal matching)
`energy` | `broadband` | `mobile` | `tv` | `insurance_home` | `insurance_car` | `insurance_pet` | `insurance_life` | `insurance_travel` | `mortgage` | `loan` | `credit_card` | `streaming` | `software` | `fitness` | `news` | `council_tax` | `water` | `other`

### Key Contract Fields
| Field | Purpose | Example |
|-------|---------|---------|
| `contract_type` | What kind of commitment | `mortgage`, `fixed_contract` |
| `contract_start_date` | When the contract began | `2024-06-01` |
| `contract_end_date` | When it expires (key for deal targeting) | `2026-06-01` |
| `contract_term_months` | Length of commitment | `24` |
| `auto_renews` | Whether it rolls over automatically | `true` |
| `early_exit_fee` | Penalty for leaving early | `£150.00` |
| `annual_cost` | Total yearly cost | `£1,200.00` |
| `total_contract_value` | Full value over the term | `£2,400.00` |
| `interest_rate` | APR for loans/mortgages | `4.5` |
| `remaining_balance` | Outstanding on loans/mortgages | `£185,000.00` |
| `monthly_payment` | Monthly amount due | `£850.00` |
| `provider_type` | Category for deal matching | `energy`, `mortgage` |
| `current_tariff` | Current plan name | `"EDF Standard Variable"` |
| `postcode` | For location-specific deals | `"SW1A 1AA"` |
| `property_type` | For energy/insurance comparison | `semi` |
| `bedrooms` | For energy comparison | `3` |
| `data_allowance` | Mobile/broadband data | `"unlimited"` |
| `speed_mbps` | Broadband speed | `80` |

### How This Enables Deal Targeting
1. **Contract ending soon** → alert user with better deals before renewal
2. **High annual cost + known provider_type** → compare against Awin affiliate deals
3. **Mortgage rate + remaining balance** → suggest remortgage when rates drop
4. **Energy tariff + postcode + bedrooms** → accurate energy comparison
5. **Broadband speed + postcode** → show faster/cheaper alternatives available in their area

### Indexed Queries
- `contract_end_date` — find all contracts expiring within N days
- `provider_type` — group by type for deal matching
- `auto_renews + contract_end_date` — find auto-renewing contracts expiring soon (highest value alerts)

---

## Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `support_tickets` | Support tickets | ticket_number, subject, description, category, priority, status, assigned_to, source, metadata |
| `ticket_messages` | Conversation thread per ticket | ticket_id, sender_type, sender_name, message |
| `ai_executives` | Agent definitions and config | role, name, system_prompt, schedule, status, last_run_at |
| `executive_reports` | Reports produced by agents | agent_id, title, content, data (JSONB), recommendations (JSONB), status |
| `agent_action_items` | Cross-agent coordination | flagged_by, assigned_to, title, description, priority, category, status |
| `improvement_proposals` | Self-improving system | title, description, implementation, category, priority, approval_token, status, github_issue_url |

---

## Environment Variables (Operations)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | User-facing Claude calls (chatbot, complaints, cancellations) |
| `ANTHROPIC_AGENTS_API_KEY` | AI executive agent calls (tracks staff costs separately) |
| `CRON_SECRET` | Auth for all cron and admin API routes |
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope — enables auto-creating issues from approved proposals |
| `NEXT_PUBLIC_SITE_URL` | Base URL for approval email links (default: https://paybacker.co.uk) |

---

## Future Roadmap

1. **User-facing ticket portal** — Users can view and respond to their tickets from the dashboard
2. **AI-powered auto-categorisation** — Automatically categorise tickets based on content
3. **Sentiment analysis** — Track user satisfaction across ticket interactions
4. **Knowledge base agent** — AI that learns from resolved tickets to improve responses
5. **Slack/Telegram notifications** — Real-time alerts for urgent tickets
6. **Performance scoring** — Track AI agent accuracy and improve prompts based on outcomes
7. **Auto-execute code proposals** — Claude Code integration to implement approved code changes automatically
8. **Proposal analytics** — Track approval rates, implementation success, business impact of approved changes
8. **CRO agent** — Conversion rate optimisation, A/B test recommendations
9. **Compliance agent** — Monitor for GDPR, FCA, and UK consumer law compliance
