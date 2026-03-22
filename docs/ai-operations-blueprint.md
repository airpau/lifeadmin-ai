# Paybacker AI Operations Blueprint

> Last updated: 22 March 2026

## Overview

Paybacker operates with an autonomous AI executive team that manages day-to-day business operations, supported by a human oversight layer for edge cases and strategic decisions. The system comprises 6 AI agents and a full support ticketing system.

---

## AI Executive Team — Full Roster

| Role | Agent Name | Schedule | Model | Colour (UI) |
|------|-----------|----------|-------|-------------|
| **CFO** | Alex | Daily 7am UTC | Claude Haiku 4.5 | Green |
| **CTO** | Morgan | Weekly (Monday 7am UTC) | Claude Haiku 4.5 | Blue |
| **CAO** | Jamie | Daily 7am UTC | Claude Haiku 4.5 | Purple |
| **CMO** | Taylor | Daily 7am UTC | Claude Haiku 4.5 | Pink |
| **Support Lead** | Sam | Hourly | Claude Haiku 4.5 | Amber |
| **Support Agent** | Riley | Every 15 minutes | Claude Haiku 4.5 | Slate |

---

## Agent Profiles — What Each One Does

### Alex — CFO (Chief Financial Officer)
**Schedule:** Daily at 7am UTC (`0 7 * * *`)
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
**Schedule:** Weekly on Mondays at 7am UTC (`0 7 * * 1`)
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
**Schedule:** Daily at 7am UTC (`0 7 * * *`)
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
**Schedule:** Daily at 7am UTC (`0 7 * * *`)
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

### Sam — Support Lead
**Schedule:** Hourly (`0 * * * *`)
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

---

## Data Access Matrix

| Agent | profiles | tasks | subscriptions | bank_data | support_tickets | agent_runs | social_posts | waitlist | deal_clicks |
|-------|----------|-------|---------------|-----------|-----------------|------------|-------------|----------|-------------|
| CFO (Alex) | Read (tiers) | - | - | - | - | Read (costs) | - | - | - |
| CTO (Morgan) | - | - | - | - | - | Read (all) | Read (status) | - | - |
| CAO (Jamie) | Read (growth) | Read (types) | Read (counts) | Read (counts) | - | - | - | Read (counts) | - |
| CMO (Taylor) | Read (counts) | - | - | - | - | - | Read (all) | Read (all) | Read (counts) |
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
├── executive-agent.ts      # Base runner (Claude call, JSON parsing, types)
├── cfo-agent.ts            # Alex — financial data gathering + report
├── cto-agent.ts            # Morgan — tech health data gathering + report
├── cao-agent.ts            # Jamie — ops data gathering + report
├── cmo-agent.ts            # Taylor — marketing data gathering + report
├── support-lead-agent.ts   # Sam — ticket triage data gathering + report
├── support-agent.ts        # Riley — auto-respond/escalate logic
└── complaints-agent.ts     # (existing) complaint letter generation

src/app/api/
├── support/
│   ├── tickets/route.ts              # POST create, GET list
│   ├── tickets/[id]/route.ts         # GET detail, PUT update
│   ├── tickets/[id]/messages/route.ts # POST add message
│   └── inbound-email/route.ts        # POST webhook
├── admin/agents/
│   ├── route.ts                      # GET list agents
│   └── [id]/
│       ├── route.ts                  # PUT update, POST trigger
│       └── reports/route.ts          # GET report history
└── cron/executive-agents/route.ts    # Hourly cron runner

src/components/admin/
├── TicketList.tsx           # Ticket list + detail + reply UI
└── AITeamPanel.tsx          # Agent cards with controls + reports

supabase/migrations/
└── 20260322000000_support_and_agents.sql  # Tables + seed data
```

---

## Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `support_tickets` | Support tickets | ticket_number, subject, description, category, priority, status, assigned_to, source, metadata |
| `ticket_messages` | Conversation thread per ticket | ticket_id, sender_type, sender_name, message |
| `ai_executives` | Agent definitions and config | role, name, system_prompt, schedule, status, last_run_at |
| `executive_reports` | Reports produced by agents | agent_id, title, content, data (JSONB), recommendations (JSONB), status |

---

## Future Roadmap

1. **User-facing ticket portal** — Users can view and respond to their tickets from the dashboard
2. **AI-powered auto-categorisation** — Automatically categorise tickets based on content
3. **Sentiment analysis** — Track user satisfaction across ticket interactions
4. **Knowledge base agent** — AI that learns from resolved tickets to improve responses
5. **Slack/Telegram notifications** — Real-time alerts for urgent tickets
6. **Multi-agent collaboration** — Agents that consult each other (e.g., CFO flags cost spike → CTO investigates)
7. **Performance scoring** — Track AI agent accuracy and improve prompts based on outcomes
8. **CRO agent** — Conversion rate optimisation, A/B test recommendations
9. **Compliance agent** — Monitor for GDPR, FCA, and UK consumer law compliance
