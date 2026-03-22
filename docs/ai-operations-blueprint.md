# Paybacker AI Operations Blueprint

## Overview

Paybacker operates with an autonomous AI executive team that manages day-to-day business operations, supported by a human oversight layer for edge cases and strategic decisions.

---

## AI Executive Team

| Role | Agent Name | Schedule | Responsibilities |
|------|-----------|----------|-----------------|
| **CFO** | Alex | Daily 7am | Financial reporting, MRR/ARR tracking, cost analysis, revenue projections |
| **CTO** | Morgan | Weekly (Monday 7am) | Technical health, agent success rates, API costs, infrastructure recommendations |
| **CAO** | Jamie | Daily 7am | User growth, onboarding rates, feature adoption, churn signals |
| **Support Lead** | Sam | Hourly | Ticket triage, priority assessment, SLA monitoring, escalation management |
| **Support Agent** | Riley | Every 15 minutes | Auto-respond to simple tickets, escalate complex issues |

All agents use Claude Haiku 4.5 for cost efficiency (~$0.003 per run).

---

## Support Ticketing System

### Ticket Sources
1. **Chatbot escalation** — When the AI chatbot detects user frustration or is asked for human help, it auto-creates a ticket with the full conversation history.
2. **Inbound email** — Emails to support@paybacker.co.uk are parsed and create tickets (or add to existing ones if the subject contains a ticket number).
3. **Manual creation** — Admin can create tickets directly from the dashboard.

### Ticket Lifecycle
```
open → in_progress → awaiting_reply → resolved → closed
                  ↑                        ↓
                  └────── reopened ─────────┘
```

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

---

## Escalation Paths

```
User Issue
    ↓
Chatbot (Riley AI)
    ↓ (escalation detected)
Support Ticket Created
    ↓
Riley (AI Support Agent) — auto-responds to simple queries
    ↓ (complex issue)
Sam (Support Lead AI) — triages, assigns priority
    ↓ (requires human judgement)
Human Admin (Paul) — final decision authority
```

### When AI Escalates to Human
- Refund requests over £50
- Account deletion requests
- Legal threats or regulatory complaints
- Technical bugs requiring code changes
- Any issue the AI is not confident about

---

## Human Oversight Model

### AI Autonomy Levels

| Agent | Can Act Autonomously | Requires Human Approval |
|-------|---------------------|------------------------|
| CFO (Alex) | Generate reports, send email summaries | No autonomous actions on finances |
| CTO (Morgan) | Generate reports | No code changes or deployments |
| CAO (Jamie) | Generate reports, flag churn risks | No user communications |
| Support Lead (Sam) | Triage tickets, adjust priorities | Cannot close tickets or issue refunds |
| Support Agent (Riley) | Respond to simple tickets | Cannot make account changes or promises |

### Key Principle
**All AI agents produce reports and recommendations. Only the Support Agent can auto-respond to users, and only for simple queries. All other actions require human review.**

---

## Cost Controls

- All agents use Claude Haiku 4.5 (~$0.003/run)
- Max tokens per response: 1024
- Support Agent limited to 5 tickets per cycle
- Executive agents run on fixed schedules (not triggered by events)
- Estimated monthly cost at scale: ~£5-15 for all agents combined

---

## Data Access Matrix

| Agent | profiles | tasks | subscriptions | bank_data | support_tickets | agent_runs |
|-------|----------|-------|---------------|-----------|-----------------|------------|
| CFO | Read (counts) | - | - | - | - | Read (costs) |
| CTO | - | - | - | - | - | Read (all) |
| CAO | Read (growth) | Read (types) | Read (counts) | Read (counts) | - | - |
| Support Lead | - | - | - | - | Read/Write | - |
| Support Agent | - | - | - | - | Read/Write | - |

All access via service role key (bypasses RLS). No agent has access to raw user data (passwords, tokens, financial details).

---

## API Endpoints

### Support Tickets
- `POST /api/support/tickets` — Create ticket
- `GET /api/support/tickets` — List tickets (admin)
- `GET /api/support/tickets/[id]` — Ticket detail (admin)
- `PUT /api/support/tickets/[id]` — Update ticket (admin)
- `POST /api/support/tickets/[id]/messages` — Add message (admin)
- `POST /api/support/inbound-email` — Inbound email webhook

### AI Executives
- `GET /api/admin/agents` — List all agents
- `PUT /api/admin/agents/[id]` — Update agent config
- `POST /api/admin/agents/[id]` — Manual trigger
- `GET /api/admin/agents/[id]/reports` — Agent reports
- `GET /api/cron/executive-agents` — Hourly cron (runs all due agents)

---

## Future Roadmap

1. **User-facing ticket portal** — Users can view and respond to their tickets from the dashboard
2. **AI-powered auto-categorisation** — Automatically categorise tickets based on content
3. **Sentiment analysis** — Track user satisfaction across ticket interactions
4. **Knowledge base agent** — AI that learns from resolved tickets to improve responses
5. **Slack/Telegram notifications** — Real-time alerts for urgent tickets
6. **Multi-agent collaboration** — Agents that consult each other (e.g., CFO flags cost spike → CTO investigates)
7. **Performance scoring** — Track AI agent accuracy and improve prompts based on outcomes
