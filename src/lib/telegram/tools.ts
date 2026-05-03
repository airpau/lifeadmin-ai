import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const telegramTools: Tool[] = [
  // ============================================================
  // READ TOOLS — no confirmation needed
  // ============================================================
  {
    name: 'get_spending_summary',
    description:
      "Get the user's spending summary grouped by category for a given month. Returns totals per category and comparison to the previous month's spend.",
    input_schema: {
      type: 'object' as const,
      properties: {
        month: {
          type: 'string',
          description:
            'Month in YYYY-MM format (e.g. 2026-04). Defaults to current month if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_transactions',
    description:
      "List individual bank transactions with merchant name, amount, category, and date. Use this when the user asks to see specific transactions, direct debits, payments, or wants to review what they've been charged. Can filter by category, merchant, or date range.",
    input_schema: {
      type: 'object' as const,
      properties: {
        month: {
          type: 'string',
          description: 'Month in YYYY-MM format (e.g. 2026-04). Defaults to current month.',
        },
        category: {
          type: 'string',
          description: 'Filter by category (e.g. "food", "streaming", "bills"). Optional.',
        },
        merchant: {
          type: 'string',
          description: 'Filter by merchant name (partial match, case-insensitive). Optional.',
        },
        limit: {
          type: 'number',
          description: 'Max number of transactions to return. Defaults to 25.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_subscriptions',
    description:
      "Get the user's subscriptions, regular payments, direct debits, and recurring charges from Money Hub. This is the SAME data shown on the Subscriptions page and Money Hub dashboard. Use this for ANY question about recurring payments, bills, mortgages, loans, insurance, broadband, streaming, gym memberships, etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'active', 'cancelled'],
          description: 'Filter subscriptions by status. Defaults to active.',
        },
        category: {
          type: 'string',
          description: 'Filter by category (e.g. "mortgage", "insurance", "streaming", "broadband", "food", "fitness", "loan", "utility", "council_tax", "mobile"). Optional — returns all categories if omitted.',
        },
        provider: {
          type: 'string',
          description: 'Filter by provider name (partial match, case-insensitive, e.g. "Sky", "Netflix", "British Gas"). Optional.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_disputes',
    description:
      "Get the user's bill disputes and complaint letters with status, provider, and last activity date.",
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'open', 'resolved'],
          description: 'Filter disputes by status. Defaults to all.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_contracts',
    description:
      "Get the user's active contracts (broadband, mobile, energy, insurance, gym, mortgage, loan etc.) with end dates, costs, interest rates, remaining balance, and provider details. This is the SAME data shown on the Contracts page and Money Hub dashboard.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Optional: filter by provider name (partial match, case-insensitive).',
        },
        category: {
          type: 'string',
          description: 'Optional: filter by category (e.g. "mortgage", "loan", "broadband", "insurance", "energy").',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_financial_overview',
    description:
      "Get a complete financial overview of the user's Money Hub — total income, total spending, net position, number of active subscriptions, bank connections, open disputes, and savings. Use this when the user asks for an overview, summary, or \"how am I doing?\" question.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_budget_status',
    description:
      "Get the user's budget limits vs actual spend for the current month, broken down by category with progress indicators.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_upcoming_renewals',
    description:
      'Get subscriptions and contracts expiring or auto-renewing within the next 30 days, so the user can act before being charged.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_price_alerts',
    description:
      "Get active price increase alerts where the user's recurring payments have gone up compared to before.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  {
    name: 'get_savings_goals',
    description:
      "Get the user's savings goals from Money Hub — name, target amount, current progress, target date, and emoji. Use when they ask about savings targets, goals, or how much they've saved towards something.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_savings_challenges',
    description:
      "Get the user's active savings challenges — gamified challenges like No-Spend Week, Round-Up Challenge, etc. Shows status, progress, and when started/completed.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_bank_connections',
    description:
      "Get the user's connected bank accounts — which banks are linked, their status (active/expired/expiring), last sync time, and account names. Revoked and soft-deleted connections are hidden.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_spaces',
    description:
      "List the user's Money Hub Spaces — the named groupings of bank connections shown on the dashboard (e.g. Everything, Business, Personal). Returns the currently-active Space so you can tell the user which scope their financial answers are coming from.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'set_active_space',
    description:
      "Switch the scope of subsequent financial queries to a particular Space. All transaction, spending, and overview tools will then only report on that Space's connections until the user switches away. Use fuzzy name matching (e.g. 'business' matches 'Business expenses'). Pass 'everything' / 'all' / 'clear' to reset to the user's default scope.",
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Space name (fuzzy, case-insensitive). Aliases: "everything", "all", "clear", "reset" return to the default scope.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_active_space',
    description:
      "Tell the user which Space is currently scoping their financial queries. Use when they ask 'what Space am I in?' / 'what am I looking at?' or before answering an ambiguous figures question, so they can confirm the scope.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'remove_bank_connection',
    description:
      "Permanently hide a bank connection the user no longer wants to see — typically a sandbox/test connection they used while exploring. Only call after the user has explicitly confirmed they want to remove it (not just disconnect it). The connection stops appearing in this bot and in Money Hub, but historical transactions are preserved. Matches on bank name or account-name substring (case-insensitive).",
    input_schema: {
      type: 'object' as const,
      properties: {
        identifier: {
          type: 'string',
          description: 'A bank name or unique substring of a linked account (e.g. "modelo", "sandbox", "mario"). If multiple connections match, the tool will ask you to narrow it down.',
        },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_verified_savings',
    description:
      "Get the user's verified savings — money confirmed saved through disputes, cancellations, price reversions, and refunds. Shows each saving with amount, type, and how it was verified.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_monthly_trends',
    description:
      "Get income vs spending trends over the last 6 months, showing how the user's finances have changed month by month. Use for questions like 'how has my spending changed?' or 'show my trends'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        months: {
          type: 'number',
          description: 'Number of months to look back. Defaults to 6.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_income_breakdown',
    description:
      "Get the user's income breakdown for a month — salary, refunds, transfers in, and other credits, grouped by source.",
    input_schema: {
      type: 'object' as const,
      properties: {
        month: {
          type: 'string',
          description: 'Month in YYYY-MM format. Defaults to current month.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_dispute_detail',
    description:
      "Get the full detail of a specific dispute including all correspondence (letters sent, responses received). Use when the user asks about a specific complaint or dispute with a provider.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Provider name to find the dispute for (partial match).',
        },
      },
      required: ['provider'],
    },
  },

  {
    name: 'quote_email_from_thread',
    description:
      "Read the actual body text of the user's correspondence on a dispute — the linked email thread plus AI-drafted letters they've sent. ALWAYS call this tool when the user asks about content, amounts, dates, deadlines, demands, requests, or specific words from any email or letter on a dispute (e.g. 'what did I write', 'what amount did I demand', 'what was in my last letter', 'what did they offer', 'what date did they say', 'confirm the figure I quoted'). NEVER infer email content from summaries, dispute metadata, offer figures, or earlier conversation context — always call this tool first and quote verbatim from the returned `body` field. Returns the most recent N entries with FULL body text (not snippets), ordered most-recent first, with structured fields {date, sender, recipient, subject, body, direction, message_index_in_thread}.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description:
            'Provider/dispute name (case-insensitive partial match — e.g. "OneStream" matches "Onestream"). Used to find the active dispute whose correspondence we read.',
        },
        direction: {
          type: 'string',
          enum: ['sent', 'received', 'all'],
          description:
            "Filter which messages to return. 'sent' = only the user's outbound letters/notes (ai_letter, user_note). 'received' = only the company's replies (company_email, company_letter, company_response). 'all' = both directions interleaved by date. Defaults to 'all'.",
        },
        limit: {
          type: 'number',
          description: 'Max number of correspondence entries to return. Defaults to 5. Capped at 20.',
        },
      },
      required: ['provider'],
    },
  },

  {
    name: 'find_email_thread_for_dispute',
    description:
      "Search the user's connected inboxes (Gmail / Outlook) for email threads that could be linked to one of their disputes. Use when the user says 'link an email', 'connect a thread', 'find the email about X', or 'attach the response from Y'. Returns up to 5 candidate threads with subject + sender + date + the connection_id and thread_id needed for link_email_thread_to_dispute. Always present the list to the user and ask them to pick before linking — never auto-link the top result.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description:
            'Provider/dispute name (case-insensitive partial match — "Nuki" matches "Nuki Home Solutions"). Used to find the active dispute and seed the inbox search.',
        },
        query: {
          type: 'string',
          description:
            "Optional extra search keyword if the user gave one (e.g. 'alice', 'refund', 'ticket 785661'). Falls back to the provider name when omitted.",
        },
      },
      required: ['provider'],
    },
  },

  {
    name: 'discard_letter_draft',
    description:
      "Discard the most recent pending dispute letter draft for a provider. Call when the user replies DISCARD, says 'don't send it', 'forget it', 'cancel that draft'. Marks the pending_dispute_letters row as discarded so the 1-hour follow-up cron stops pinging the user about it.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Dispute provider name (case-insensitive partial match).',
        },
        reason: {
          type: 'string',
          description: "Optional short reason logged for audit (e.g. 'user wants to call instead', 'changed mind').",
        },
      },
      required: ['provider'],
    },
  },

  {
    name: 'record_letter_sent',
    description:
      "Save a finalised dispute letter to the dispute history AND mark the dispute as awaiting a response. Call when the user says 'I've sent it', 'I've emailed that', 'use the firm one', 'save this letter', 'finalise the formal version', or otherwise confirms they're done iterating on a draft. Inserts an ai_letter row to correspondence so the dispute timeline shows you sent it, then bumps status to 'awaiting_response' if currently 'open'. Pass the FULL letter_text from the most recent draft you produced (read it back from your prior message in the conversation history). After this fires, the watchdog auto-import will alert the user when the supplier replies.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Dispute provider name (case-insensitive partial match — same shape as get_dispute_detail).',
        },
        letter_text: {
          type: 'string',
          description: "Full text of the letter the user sent. Read this back verbatim from your prior pendingAction.letter_text in conversation history — don't paraphrase or trim.",
        },
        title: {
          type: 'string',
          description: "Optional short title for the dispute timeline (e.g. 'Reply to Enterprise — firm tone'). Defaults to 'AI letter sent on <date>'.",
        },
      },
      required: ['provider', 'letter_text'],
    },
  },

  {
    name: 'link_email_thread_to_dispute',
    description:
      "Link a specific email thread to a dispute. Call this AFTER find_email_thread_for_dispute returned candidates AND the user picked one. Pass the connection_id + thread_id + provider_type from the chosen candidate verbatim. Triggers an immediate sync so the body imports into Paybacker right away — the user sees Hadil-style supplier replies in the dispute timeline within seconds. Replaces any previously-linked thread on this dispute (one active link at a time).",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Dispute provider name (same value passed to find_email_thread_for_dispute).',
        },
        connection_id: {
          type: 'string',
          description: "The candidate's connection_id from find_email_thread_for_dispute.",
        },
        thread_id: {
          type: 'string',
          description: "The candidate's thread_id from find_email_thread_for_dispute.",
        },
        provider_type: {
          type: 'string',
          enum: ['gmail', 'outlook', 'imap'],
          description: 'gmail | outlook | imap — from the candidate.',
        },
        subject: {
          type: 'string',
          description: 'Optional thread subject for display in dispute history.',
        },
        sender_address: {
          type: 'string',
          description: "Optional supplier email address (e.g. 'contact@nuki.io') for the thread.",
        },
      },
      required: ['provider', 'connection_id', 'thread_id', 'provider_type'],
    },
  },

  {
    name: 'get_deals',
    description:
      "Get current affiliate deals and offers from Paybacker's deals page — broadband, mobile, SIM-only, and other money-saving offers. Use this when the user asks about deals, switching providers, saving on bills, or 'what deals do you have?'. NEVER refer them to Uswitch or other external comparison sites — use this tool to show Paybacker's own deals.",
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['broadband', 'mobile', 'sim_only', 'energy', 'insurance'],
          description: 'Filter by deal category. Omit to show all available deals.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_loyalty_status',
    description:
      "Get the user's loyalty rewards status — points balance, tier (Bronze/Silver/Gold/Platinum), badges earned, active streak, and available redemptions. Use when they ask about their points, rewards, tier, badges, or perks.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_referral_link',
    description:
      "Get the user's referral link and stats — unique referral URL, how many friends they've referred, and how many have subscribed (earning them 1 free month per paid referral). Use when they ask about referring friends, their referral code, or referral rewards.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_net_worth',
    description:
      "Get the user's net worth breakdown from Money Hub — total assets (property, savings, investments, vehicles) vs total liabilities (mortgages, loans, credit cards), with an overall net worth figure. Use when they ask about net worth, total assets, total debts, or their financial position.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_expected_bills',
    description:
      "Get the user's expected bills for the current month — recurring payments predicted to come out this month, which have already been paid, and the total outstanding. Use when they ask what bills are coming up, what's been paid, or what's still due this month.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_overcharge_assessments',
    description:
      "Get AI-generated overcharge assessments — subscriptions and contracts where the user is likely paying more than the market rate, with confidence score and estimated annual saving if they switch or dispute. Use when they ask if they're overpaying, what they could save, or what overcharges have been detected.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_profile',
    description:
      "Get the user's account profile — name, email address, subscription plan (Free/Essential/Pro), phone number, address, and postcode. Use when they ask about their account details, what plan they're on, their email address, or their profile information.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_tasks',
    description:
      "Get the user's financial tasks and action items — things flagged for action from disputes, opportunity scanner findings, and manual entries. Shows title, status, priority, and date created. Use when they ask about their to-do list, pending actions, or tasks.",
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'pending_review', 'completed', 'dismissed'],
          description: 'Filter by task status. Defaults to pending_review (outstanding tasks).',
        },
        limit: {
          type: 'number',
          description: 'Max tasks to return. Defaults to 20.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_scanner_results',
    description:
      "Get opportunity scanner findings from the user's email inbox scan — detected overcharges, forgotten subscriptions, price increases, flight delay compensation opportunities, refund opportunities, and more. Use when they ask what the scanner found, about their inbox scan results, or what financial opportunities were detected in their emails.",
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'pending_review', 'actioned', 'dismissed'],
          description: 'Filter by status. Defaults to pending_review (new findings that need reviewing).',
        },
      },
      required: [],
    },
  },

  // ============================================================
  // ACTION TOOLS — require inline keyboard confirmation
  // ============================================================
  {
    name: 'draft_dispute_letter',
    description:
      "Draft a letter from a UK consumer to a company — either a fresh complaint, or a reply to a message the company just sent. EVERY draft is auto-grounded in UK statute and regulator citations pulled from the Paybacker legal_references compliance index — the reply will read like a UK consumer-rights solicitor's letter, never as plain prose. Use this for ALL dispute drafts and ALL dispute replies; never write replies yourself in chat. Reads the supplier's last message (when provided) and calibrates tone. Returns a preview the user must approve.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'The company or provider name being written to (e.g. "BT", "British Gas").',
        },
        issue_description: {
          type: 'string',
          description:
            'Plain English description of the underlying issue (e.g. "My broadband has been out 22 days"). For a reply, keep this short — it is background, not the main content of the reply.',
        },
        desired_outcome: {
          type: 'string',
          description:
            'What the user wants (e.g. "revert price", "full refund", "confirm engineer appointment"). For a scheduling reply this might just be "confirm the appointment".',
        },
        issue_type: {
          type: 'string',
          enum: [
            'complaint',
            'energy_dispute',
            'broadband_complaint',
            'flight_compensation',
            'parking_appeal',
            'debt_dispute',
            'refund_request',
            'hmrc_tax_rebate',
            'council_tax_band',
            'dvla_vehicle',
            'nhs_complaint',
          ],
          description: 'Category of dispute. Defaults to complaint if not specified.',
        },
        supplier_latest_message: {
          type: 'string',
          description:
            "The full text of the supplier's most recent message to the user, if this is a REPLY to something they've sent (not a fresh complaint). Include subject + body. When provided, the letter will directly address what they said rather than re-stating the whole complaint history. Get this from get_dispute_detail.",
        },
        user_reply_brief: {
          type: 'string',
          description:
            'What the user wants this reply to say, in plain English, copied from the user\'s own words (e.g. "I\'m available any day except Friday, AM or PM"). When set, the letter is a LIKE-FOR-LIKE professional rendering of these words — short, polite, business-toned — and nothing substantive is added beyond them. Do not embellish, do not add extra points, do not invent availability/dates/outcomes the user didn\'t mention. The system professionalises the phrasing; it does not rewrite the content.',
        },
        reply_tone: {
          type: 'string',
          enum: ['auto', 'friendly', 'balanced', 'firm'],
          description:
            "Tone override. Default 'auto' — the AI picks based on what the supplier said (scheduling question → friendly, rejection → firm, settlement offer → balanced). Use 'friendly' for co-operative messages, 'balanced' for neutral professional, 'firm' for escalation/final-response threats.",
        },
      },
      required: ['provider', 'issue_description', 'desired_outcome'],
    },
  },
  {
    name: 'search_legal_rights',
    description:
      "Search Paybacker's UK consumer law knowledge base for rights and regulations relevant to the user's issue.",
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description:
            'Category of law to search (e.g. "energy", "broadband", "flight", "parking", "debt", "retail", "gym").',
        },
        query: {
          type: 'string',
          description:
            'What to search for (e.g. "price increase notice period", "flight delay compensation amount").',
        },
      },
      required: ['query'],
    },
  },

  // ============================================================
  // WRITE TOOLS — modify user data
  // ============================================================
  {
    name: 'recategorise_transactions',
    description:
      'Change the category of bank transactions matching a merchant name. For example, recategorise all "Costa" transactions from "other" to "food". Returns how many transactions were updated.',
    input_schema: {
      type: 'object' as const,
      properties: {
        merchant_name: {
          type: 'string',
          description: 'The merchant name to match (case-insensitive partial match, e.g. "Costa", "Tesco", "Netflix").',
        },
        new_category: {
          type: 'string',
          enum: [
            'broadband', 'council_tax', 'food', 'insurance', 'loan', 'mobile', 'mortgage',
            'streaming', 'software', 'transport', 'utility', 'other', 'fitness', 'music',
            'gaming', 'storage', 'healthcare', 'security', 'charity', 'education', 'pets',
            'parking', 'travel', 'gambling', 'bills', 'fee', 'water', 'motoring', 'property_management', 'transfers',
          ],
          description: 'The category to assign to matching transactions.',
        },
      },
      required: ['merchant_name', 'new_category'],
    },
  },
  {
    name: 'set_budget',
    description:
      'Create or update a monthly SPENDING LIMIT budget for a category. This limits how much the user wants to spend per month — it is NOT a savings goal. Use when the user says "set a budget for travel", "limit my groceries spending to £300", "budget £400 for eating out". If the user says "save for" or "savings goal" or "save £X towards Y", use create_savings_goal instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: [
            'broadband', 'council_tax', 'food', 'insurance', 'loan', 'mobile', 'mortgage',
            'streaming', 'software', 'transport', 'utility', 'other', 'fitness', 'music',
            'gaming', 'storage', 'healthcare', 'security', 'charity', 'education', 'pets',
            'parking', 'travel', 'gambling', 'bills', 'fee', 'water', 'motoring', 'property_management',
          ],
          description: 'The spending category to set a budget for.',
        },
        monthly_limit: {
          type: 'number',
          description: 'The monthly budget limit in GBP (e.g. 200 for £200/month).',
        },
      },
      required: ['category', 'monthly_limit'],
    },
  },
  {
    name: 'recategorise_subscription',
    description:
      'Change the category of a subscription/regular payment. Finds the subscription by provider name and updates its category.',
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The subscription provider name to match (case-insensitive partial match, e.g. "Netflix", "British Gas").',
        },
        new_category: {
          type: 'string',
          enum: [
            'broadband', 'council_tax', 'food', 'insurance', 'loan', 'mobile', 'mortgage',
            'streaming', 'software', 'transport', 'utility', 'other', 'fitness', 'music',
            'gaming', 'storage', 'healthcare', 'security', 'charity', 'education', 'pets',
            'parking', 'travel', 'gambling', 'bills', 'fee', 'water', 'motoring', 'property_management',
          ],
          description: 'The new category for this subscription.',
        },
      },
      required: ['provider_name', 'new_category'],
    },
  },
  {
    name: 'add_subscription',
    description:
      'Add a new subscription or regular payment to track. The user provides the provider name, amount, and billing cycle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The name of the subscription provider (e.g. "Netflix", "Spotify", "Sky").',
        },
        amount: {
          type: 'number',
          description: 'The payment amount in GBP (e.g. 12.99).',
        },
        billing_cycle: {
          type: 'string',
          enum: ['monthly', 'quarterly', 'yearly'],
          description: 'How often the payment is charged. Defaults to monthly.',
        },
        category: {
          type: 'string',
          enum: [
            'broadband', 'council_tax', 'food', 'insurance', 'loan', 'mobile', 'mortgage',
            'streaming', 'software', 'transport', 'utility', 'other', 'fitness', 'music',
            'gaming', 'storage', 'healthcare', 'security', 'charity', 'education', 'pets',
            'parking', 'travel', 'gambling', 'bills', 'fee', 'water', 'motoring', 'property_management',
          ],
          description: 'Category for the subscription. Optional — defaults to other.',
        },
      },
      required: ['provider_name', 'amount'],
    },
  },
  {
    name: 'cancel_subscription',
    description:
      'Mark a subscription as cancelled in the system. Finds by provider name and sets status to cancelled. Does NOT contact the provider — just updates the tracking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The subscription provider name to cancel (case-insensitive partial match).',
        },
      },
      required: ['provider_name'],
    },
  },
  {
    name: 'delete_budget',
    description:
      'Remove a budget limit for a spending category.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'The spending category to remove the budget for.',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'update_alert_preferences',
    description:
      "Update the user's Pocket Agent notification preferences. Use this when the user wants to turn off/on specific alerts, mute morning or evening summaries, stop budget notifications, etc. Examples: 'stop sending me budget alerts', 'turn off morning summary', 'mute all alerts', 'only send me price increase alerts'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        morning_summary: {
          type: 'boolean',
          description: 'Enable/disable the 7:30am morning financial briefing.',
        },
        evening_summary: {
          type: 'boolean',
          description: 'Enable/disable the 8pm evening money wrap-up.',
        },
        proactive_alerts: {
          type: 'boolean',
          description: 'Enable/disable all proactive alerts (price increases, budget overruns, etc). Master switch.',
        },
        price_increase_alerts: {
          type: 'boolean',
          description: 'Enable/disable alerts when a recurring payment increases in price.',
        },
        contract_expiry_alerts: {
          type: 'boolean',
          description: 'Enable/disable alerts when a contract is about to expire.',
        },
        budget_overrun_alerts: {
          type: 'boolean',
          description: 'Enable/disable alerts when spending exceeds a budget limit.',
        },
        renewal_reminders: {
          type: 'boolean',
          description: 'Enable/disable reminders about upcoming subscription renewals.',
        },
        dispute_followups: {
          type: 'boolean',
          description: 'Enable/disable follow-up reminders about open disputes.',
        },
        quiet_start: {
          type: 'string',
          description: 'Start of quiet hours in HH:MM format (e.g. "22:00"). No alerts sent during quiet hours.',
        },
        quiet_end: {
          type: 'string',
          description: 'End of quiet hours in HH:MM format (e.g. "07:00").',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_alert_preferences',
    description:
      "Show the user's current Pocket Agent notification preferences — which alerts are on/off, quiet hours, etc.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_savings_goal',
    description:
      "Create a new savings goal in Money Hub. The goal will appear on the dashboard immediately. Use when the user says things like \"I want to save for a holiday\", \"set a savings target of £500\", or \"create a goal for a new car\".",
    input_schema: {
      type: 'object' as const,
      properties: {
        goal_name: {
          type: 'string',
          description: 'Name for the savings goal (e.g. "Holiday Fund", "Emergency Fund", "New Car").',
        },
        target_amount: {
          type: 'number',
          description: 'The target savings amount in GBP (e.g. 2000 for £2,000).',
        },
        target_date: {
          type: 'string',
          description: 'Optional target date in YYYY-MM-DD format (e.g. "2026-12-01").',
        },
        emoji: {
          type: 'string',
          description: 'Optional emoji for the goal (e.g. "✈️" for holiday, "🚗" for car, "🏠" for house). Defaults to 🎯.',
        },
      },
      required: ['goal_name', 'target_amount'],
    },
  },
  {
    name: 'update_savings_goal',
    description:
      "Update the progress on an existing savings goal — set the current amount saved, or add to it. Use when the user says \"I saved £200 towards my holiday fund\" or \"update my car savings to £1500\".",
    input_schema: {
      type: 'object' as const,
      properties: {
        goal_name: {
          type: 'string',
          description: 'Name of the savings goal to update (partial match, case-insensitive).',
        },
        amount_saved: {
          type: 'number',
          description: 'Set the current_amount to this exact value (e.g. 1500 means they now have £1500 saved). Use this OR add_amount, not both.',
        },
        add_amount: {
          type: 'number',
          description: 'Add this amount to the current saved amount (e.g. 200 adds £200 to whatever is already saved). Use this OR amount_saved, not both.',
        },
      },
      required: ['goal_name'],
    },
  },
  {
    name: 'create_task',
    description:
      "Create a financial task or reminder for the user. Use when the user wants to set a to-do item or track something they need to do (e.g. \"remind me to cancel Netflix\", \"add a task to check my mortgage rate\", \"create a task to claim flight compensation\").",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the task (e.g. "Cancel Netflix subscription", "Review energy tariff").',
        },
        description: {
          type: 'string',
          description: 'Longer description of what needs to be done.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority. Defaults to medium.',
        },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'update_dispute_status',
    description:
      "Update the status of an existing dispute — mark it resolved, escalate it, or add a note. Use when the user provides an update from a company (e.g. an email they received). Always include the full 'provider_response' if they give one, and if you draft them a response to send back, include it in 'draft_reply' so both are logged to the dispute history audit trail.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Provider name of the dispute to update (partial match, case-insensitive).',
        },
        new_status: {
          type: 'string',
          enum: ['open', 'awaiting_response', 'escalated', 'resolved_won', 'resolved_partial', 'resolved_lost', 'closed'],
          description: 'The new status for the dispute.',
        },
        notes: {
          type: 'string',
          description: 'Optional notes about the update (e.g. "Company replied refusing refund", "Ombudsman case opened").',
        },
        provider_response: {
          type: 'string',
          description: 'The exact response from the provider/company if the user provided it (e.g. the text of the email they forwarded). This will be saved to the dispute history.',
        },
        draft_reply: {
          type: 'string',
          description: 'If you draft a reply for the user to send back to the provider, include the full text of that letter here so it is saved to the dispute history.',
        },
        money_recovered: {
          type: 'number',
          description: 'Amount of money recovered in GBP — only for resolved_won or resolved_partial.',
        },
      },
      required: ['provider', 'new_status'],
    },
  },
  {
    name: 'add_contract',
    description:
      'Add a new contract manually — mortgage, broadband, mobile, energy, insurance, loan, gym, etc. Creates a tracked entry with end date so it appears on the Contracts page and triggers renewal reminders.',
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The provider or lender name (e.g. "Halifax", "Sky", "British Gas", "Santander").',
        },
        category: {
          type: 'string',
          enum: ['mortgage', 'loan', 'broadband', 'mobile', 'energy', 'insurance', 'fitness', 'streaming', 'software', 'utility', 'other'],
          description: 'Contract category.',
        },
        monthly_cost: {
          type: 'number',
          description: 'Monthly payment amount in GBP.',
        },
        contract_end_date: {
          type: 'string',
          description: 'Contract end date in YYYY-MM-DD format (e.g. "2027-03-01").',
        },
        contract_start_date: {
          type: 'string',
          description: 'Optional contract start date in YYYY-MM-DD format.',
        },
        auto_renews: {
          type: 'boolean',
          description: 'Whether the contract auto-renews. Defaults to true.',
        },
        interest_rate: {
          type: 'number',
          description: 'Optional interest rate as a percentage (e.g. 4.5 for 4.5%). For mortgages and loans.',
        },
        remaining_balance: {
          type: 'number',
          description: 'Optional remaining balance in GBP. For mortgages and loans.',
        },
      },
      required: ['provider_name', 'category', 'monthly_cost'],
    },
  },
  {
    name: 'get_upcoming_payments',
    description:
      "Get the user's upcoming subscription payments, bills, and loan payments due within the next 7 days (or a custom number of days). Returns provider name, amount, due date, and payment type. Use this when the user asks what's due this week, upcoming payments, payment schedule, or what they owe soon.",
    input_schema: {
      type: 'object' as const,
      properties: {
        days: {
          type: 'number',
          description: 'Number of days ahead to look. Defaults to 7.',
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_cancellation_email',
    description:
      'Generate a formal cancellation letter for a subscription, contract, or service citing the correct UK consumer law for that category. Returns a ready-to-send email subject and body. Use when the user wants to cancel a specific provider — this generates the letter with the right legal references (Ofcom for broadband/mobile, Ofgem for energy, FCA for insurance/mortgage, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The provider or company to cancel (e.g. "Sky", "BT", "Netflix", "British Gas").',
        },
        category: {
          type: 'string',
          enum: ['broadband', 'mobile', 'energy', 'insurance', 'streaming', 'fitness', 'software', 'mortgage', 'loan', 'utility', 'council_tax', 'gambling', 'other'],
          description: 'Type of subscription or contract — used to include the correct UK legal references.',
        },
        amount: {
          type: 'number',
          description: 'Monthly cost in GBP (e.g. 49.99). Optional but improves the letter quality.',
        },
        account_email: {
          type: 'string',
          description: "The user's account email address with this provider. Optional — include if known.",
        },
      },
      required: ['provider_name', 'category'],
    },
  },
  {
    name: 'create_support_ticket',
    description:
      "Create a support ticket with the Paybacker help team. Use when the user has a problem, bug report, billing question, or account issue that needs human support. Returns a ticket reference. Don't use for general questions you can answer — only use when the user genuinely needs help from the Paybacker team.",
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: {
          type: 'string',
          description: 'Short subject line for the ticket (e.g. "Bank connection not syncing", "Incorrect charge on account").',
        },
        description: {
          type: 'string',
          description: 'Full description of the issue or request.',
        },
        category: {
          type: 'string',
          enum: ['billing', 'technical', 'account', 'bank_connection', 'email_scan', 'general'],
          description: 'Category for the support ticket. Defaults to general.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level. Defaults to medium.',
        },
      },
      required: ['subject', 'description'],
    },
  },
  {
    name: 'recategorise_transaction',
    description:
      "Change the category of a specific bank transaction by its ID. The change is immediately reflected in the Money Hub dashboard (writes to user_category). First use list_transactions to find the transaction ID, then use this tool to change its category.",
    input_schema: {
      type: 'object' as const,
      properties: {
        transaction_id: {
          type: 'string',
          description: 'The unique ID of the transaction to recategorise (shown in list_transactions output).',
        },
        new_category: {
          type: 'string',
          enum: [
            'broadband', 'council_tax', 'food', 'insurance', 'loan', 'mobile', 'mortgage',
            'streaming', 'software', 'transport', 'utility', 'other', 'fitness', 'music',
            'gaming', 'storage', 'healthcare', 'security', 'charity', 'education', 'pets',
            'parking', 'travel', 'gambling', 'bills', 'fee', 'water', 'motoring', 'property_management',
          ],
          description: 'The new category for this transaction.',
        },
      },
      required: ['transaction_id', 'new_category'],
    },
  },

  // ============================================================
  // PROACTIVE INTELLIGENCE TOOLS — on-demand equivalents of cron alerts
  // ============================================================
  {
    name: 'get_weekly_outlook',
    description:
      "Get a week-ahead financial lookahead: bills due this week, total outgoings, and contracts/subscriptions ending in the next 30 days. Uses the same get_expected_bills RPC as the Money Hub dashboard. Use when the user asks 'what's due this week?', 'any bills coming up?', or 'what should I expect financially?'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_monthly_recap',
    description:
      "Get a full financial recap for a given month: total income, total spending, savings rate, top 5 spending categories, and net position. Uses get_monthly_spending_total, get_monthly_spending, and get_monthly_income_total RPCs — the same source as the Money Hub dashboard. Use when the user asks 'how was my March?', 'show my monthly summary', or 'what did I spend last month?'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        month: {
          type: 'string',
          description: 'Month in YYYY-MM format (e.g. 2026-03). Defaults to previous month if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_unused_subscriptions',
    description:
      "Find active subscriptions that have had no matching bank transactions in the last 90 days — potential zombie subscriptions the user is paying for but not using. Use when the user asks 'what am I not using?', 'any subscriptions I should cancel?', or 'find unused payments'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_dispute_status',
    description:
      "Get all active disputes with their age in days, days until the FCA 8-week deadline, and recommended next action. Use when the user asks 'how are my disputes going?', 'any complaints I need to follow up?', or 'what's the status of my complaints?'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_savings_total',
    description:
      "Get the user's total verified savings since joining Paybacker — money confirmed saved through disputes, cancellations, price reversions, and refunds. Also shows the breakdown by saving type. Use when the user asks 'how much have I saved?', 'what's my total savings?', or 'show my Paybacker savings'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ============================================================
  // MONEY HUB WRITE TOOLS — subscription updates, FAC management
  // ============================================================
  {
    name: 'update_subscription',
    description:
      "Update an existing subscription's billing cycle, amount, or next billing date. Use when the user says things like 'change Netflix to yearly', 'update my Spotify to £11.99', or 'set the next billing date for Sky to the 1st'. Finds the subscription by provider name (partial match).",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The subscription provider to update (partial match, case-insensitive, e.g. "Netflix", "Sky", "Gym").',
        },
        billing_cycle: {
          type: 'string',
          enum: ['monthly', 'quarterly', 'yearly'],
          description: 'New billing cycle. Omit if not changing.',
        },
        amount: {
          type: 'number',
          description: 'New payment amount in GBP (e.g. 11.99). Omit if not changing.',
        },
        next_billing_date: {
          type: 'string',
          description: 'New next billing date in YYYY-MM-DD format (e.g. "2026-05-01"). Omit if not changing.',
        },
      },
      required: ['provider_name'],
    },
  },
  {
    name: 'dismiss_action_item',
    description:
      "Dismiss one or more items from the Financial Action Centre (scanner findings, opportunity alerts, money hub alerts) by provider name. Use when the user says things like 'dismiss Creation Financial from action centre', 'remove Patreon from my scanner', or 'I don't need to action that'. Searches tasks, email_scan_findings, and money_hub_alerts tables.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The provider or item name to dismiss (partial match across title and provider fields).',
        },
        item_type: {
          type: 'string',
          enum: ['task', 'finding', 'alert', 'any'],
          description: "Which type of action item to dismiss. Defaults to 'any' (searches all sources).",
        },
      },
      required: ['provider_name'],
    },
  },
  {
    name: 'mark_bill_paid',
    description:
      "Manually mark an expected bill as paid for the current month. Use when the user says things like 'mark Paratus as paid', 'I paid the council tax', or 'that bill has been paid'. Useful when a payment was made from a bank account not connected to Paybacker (cash, other bank). The bill will show as ✅ in expected bills for this month.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider_name: {
          type: 'string',
          description: 'The bill provider name (e.g. "Paratus", "Council Tax", "Gym").',
        },
        amount: {
          type: 'number',
          description: 'Amount paid in GBP (optional — recorded for reference).',
        },
        paid_date: {
          type: 'string',
          description: 'Date paid in YYYY-MM-DD format (e.g. "2026-04-10"). Defaults to today.',
        },
      },
      required: ['provider_name'],
    },
  },

  // ============================================================
  // NOTIFICATION SCHEDULE TOOLS — user customises Pocket Agent timing
  // ============================================================
  // These are "set/disable/enable/list_notification_schedule" + "set_quiet_hours".
  // The user talks to the agent in plain English ("send me a morning summary
  // at 9am") and the agent translates that into a structured tool call.
  //
  // Tier gates enforced in tool-handlers:
  //   - Free:      enable/disable only on schedulable events; cannot pick a time
  //   - Essential: can set cron times + lead-time-days
  //   - Pro:       can also set custom_prompt
  //
  // System-managed events (price_increase, dispute_reply, money_recovered,
  // etc.) cannot be scheduled — only enabled/disabled, and ONLY if not
  // marked critical+mandatory.
  {
    name: 'set_notification_schedule',
    description:
      "Schedule a notification for the user. Use when they say things like 'send me a morning summary at 9am', 'budget alerts only when I'm over 90%', 'remind me 60 days before contracts end'. ONLY usable on schedulable events (morning_summary, evening_summary, payday_summary, weekly_digest, monthly_recap, unused_subscription, deal_alert, targeted_deal — these take a cron expression; renewal_reminder, contract_expiry, dispute_reminder — these take lead_time_days; budget_alert — takes a threshold). For system-managed events (price_increase, dispute_reply, money_recovered, etc.) you must use enable_notification or disable_notification instead. If the user is on Free tier, this returns an upgrade prompt. If Essential, you can set timing/lead-time. Custom prompts (style preferences) require Pro.",
    input_schema: {
      type: 'object' as const,
      properties: {
        event: {
          type: 'string',
          enum: [
            'morning_summary', 'evening_summary', 'payday_summary',
            'weekly_digest', 'monthly_recap', 'unused_subscription',
            'deal_alert', 'targeted_deal',
            'renewal_reminder', 'contract_expiry', 'dispute_reminder',
            'budget_alert',
          ],
          description: 'The event being scheduled.',
        },
        cron_expression: {
          type: 'string',
          description: 'Standard 5-field cron expression evaluated in the user\'s timezone. Required for cron-kind events. Examples: "0 9 * * *" = 9am daily; "0 8 * * 1" = 8am Mondays; "30 18 * * 1-5" = 6:30pm weekdays. ONLY pass for cron-kind events.',
        },
        lead_time_days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Days-before triggers for lead_time events (renewal_reminder, contract_expiry, dispute_reminder). E.g. [60, 14] for 60d and 14d ahead.',
        },
        threshold_percent: {
          type: 'number',
          description: 'Threshold percentage for budget_alert (e.g. 90 for "alert when 90% of budget reached"). 0-200.',
        },
        custom_prompt: {
          type: 'string',
          description: 'Pro-only: a style preference passed to the agent when generating this notification. E.g. "Keep it punchy, focus on what\'s overspending." Up to 500 chars.',
        },
      },
      required: ['event'],
    },
  },
  {
    name: 'disable_notification',
    description:
      "Turn off a specific notification event for this user. Use when they say 'stop sending morning summaries', 'turn off renewal reminders', 'mute deal alerts'. Cannot disable mandatory events (support_reply) — return an explanation. For critical events (price_increase, dispute_reply, money_recovered, savings_milestone, overcharge_detected) warn the user that these protect them, and confirm before disabling.",
    input_schema: {
      type: 'object' as const,
      properties: {
        event: {
          type: 'string',
          description: 'The event to disable, e.g. "morning_summary".',
        },
      },
      required: ['event'],
    },
  },
  {
    name: 'enable_notification',
    description:
      "Turn a previously-disabled notification back on. If a custom schedule existed (cron expression, lead-time, threshold, prompt), it is restored. Use when the user says 'turn morning summaries back on', 'resume renewal reminders'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        event: {
          type: 'string',
          description: 'The event to re-enable, e.g. "morning_summary".',
        },
      },
      required: ['event'],
    },
  },
  {
    name: 'list_notification_schedules',
    description:
      "List all of the user's current notification schedules: enabled/disabled state, cron times, lead-times, custom prompts. Use when they ask 'what notifications are you sending me?', 'show my alert settings', 'what's scheduled?'.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'set_quiet_hours',
    description:
      "Set the user's quiet hours — Pocket Agent and push notifications are suppressed in this window; email still sends. Use when they say 'no alerts after 10pm', 'quiet from 11pm to 7am', 'don't message me overnight'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        start: {
          type: 'string',
          description: '24h time HH:MM (e.g. "22:00"). Pass empty string to clear.',
        },
        end: {
          type: 'string',
          description: '24h time HH:MM (e.g. "07:00"). Pass empty string to clear.',
        },
      },
      required: ['start', 'end'],
    },
  },

  // ============================================================
  // PARITY TOOLS — added 2026-04-29 to close gaps with the website
  // ============================================================
  {
    name: 'dismiss_price_alert',
    description: "Dismiss a specific price-increase alert so it stops appearing on the dashboard. Use when the user says 'dismiss the BG alert', 'I've dealt with the rise', 'stop showing me this'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Provider name on the alert (partial match).' },
      },
      required: ['provider'],
    },
  },
  {
    name: 'update_profile',
    description: "Update the user's profile fields — name, phone, or alternative contact email. Use when the user says 'change my phone to X', 'update my name', 'set my contact email to Y'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        full_name: { type: 'string', description: 'New full name. Omit to keep existing.' },
        phone: { type: 'string', description: 'New phone number (E.164 if possible). Omit to keep existing.' },
        contact_email: { type: 'string', description: "Alternative contact email if different from auth email. Omit to keep existing." },
      },
      required: [],
    },
  },
  {
    name: 'list_email_connections',
    description: "List the user's connected email accounts (Gmail / Outlook / Yahoo IMAP) with their status. Use when the user asks 'which inboxes are connected', 'is my outlook still working', 'show me my email accounts'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'disconnect_email_connection',
    description: "Disconnect a specific email account so the watchdog stops polling it. Use when the user says 'remove my outlook', 'disconnect aireypaul@googlemail.com', 'unlink my work email'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        email_address: { type: 'string', description: 'The email address to disconnect (case-insensitive exact match).' },
      },
      required: ['email_address'],
    },
  },
  {
    name: 'add_correspondence_note',
    description: "Add a manual entry to a dispute timeline — typically when the user has had a phone call with the supplier, received an email outside their connected inbox, or wants to log a note. Saves to the dispute history without going through the watchdog. Don't use this for letters the AI drafted (use record_letter_sent instead).",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Provider name of the dispute (partial match).' },
        entry_type: {
          type: 'string',
          enum: ['user_note', 'phone_call', 'company_email', 'company_letter', 'company_response'],
          description: "What kind of entry. Default 'user_note' for the user's own thoughts; use phone_call for call summaries; use company_* when pasting an actual supplier reply.",
        },
        title: { type: 'string', description: 'Short title (e.g. "Phone call with refund team", "Email from billing").' },
        content: { type: 'string', description: 'Full text of the note / paste / call summary. Verbatim if pasting.' },
      },
      required: ['provider', 'entry_type', 'content'],
    },
  },
  {
    name: 'list_watchdog_links',
    description: "List all email threads currently being monitored by the watchdog across the user's disputes. Returns each link's dispute, subject, supplier domain, sync status, and last-synced time.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Optional dispute provider filter.' },
      },
      required: [],
    },
  },
  {
    name: 'unlink_email_thread',
    description: "Stop watching an email thread for a dispute (turns off auto-import of supplier replies). Use when the user says 'stop watching the nuki thread', 'unlink the wrong thread', 'remove the watchdog on X'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Dispute provider name (partial match).' },
      },
      required: ['provider'],
    },
  },
  {
    name: 'sync_replies_now',
    description: "Manually trigger an immediate watchdog sync for a dispute — pulls any new supplier replies right now instead of waiting for the next 30-min cron. Use when the user says 'check for new replies', 'has nuki replied yet', 'sync the enterprise thread now'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Dispute provider name (partial match).' },
      },
      required: ['provider'],
    },
  },
  {
    name: 'get_notifications',
    description: "Get the user's recent in-app notifications (the bell-icon dropdown on the website). Returns the last 10 notifications with type, title, body, and read state.",
    input_schema: {
      type: 'object' as const,
      properties: {
        unread_only: { type: 'boolean', description: 'If true, only show unread notifications. Default false (show all).' },
      },
      required: [],
    },
  },
  {
    name: 'mark_notification_read',
    description: "Mark a notification as read so it stops showing in the bell badge. Pass either notification_id (specific) or all=true to mark every unread notification read.",
    input_schema: {
      type: 'object' as const,
      properties: {
        notification_id: { type: 'string', description: 'Specific notification UUID to mark read.' },
        all: { type: 'boolean', description: 'If true, mark all unread notifications read.' },
      },
      required: [],
    },
  },
  {
    name: 'get_money_recovery_score',
    description: "Get the user's overall Money Recovery Score — a 0-100 score combining recovered savings + active dispute progress + subscription efficiency. Use when the user asks 'how am I doing', 'what's my score', 'overall financial health'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_top_merchants',
    description: "Get the user's top spending merchants for a given month or all-time. Returns merchants ranked by total spend with transaction counts. Use when the user asks 'who am I spending the most with', 'top 10 merchants', 'where does my money go'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        month: { type: 'string', description: "YYYY-MM format. Omit for all-time." },
        limit: { type: 'number', description: 'How many merchants to return (default 10).' },
      },
      required: [],
    },
  },
  {
    name: 'get_savings_rate',
    description: "Get the user's monthly savings rate as a percentage of income, including average over the last 3 / 6 / 12 months. Use when the user asks 'what's my savings rate', 'am I saving enough', 'what % of my income am I saving'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'detect_price_increases',
    description: "Run the price-increase detector now to find recurring charges that have gone up since the user's last sync. Returns any new alerts found. Use when the user says 'check for price rises', 'have any of my bills gone up', 'run the price detection'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_contract_alerts',
    description: "Get upcoming contract end-date alerts (mortgages, broadband, mobile, energy, insurance contracts ending within the alert window). Returns each contract's provider, end date, days remaining, and matched switch deals.",
    input_schema: {
      type: 'object' as const,
      properties: {
        within_days: { type: 'number', description: 'Show contracts ending within N days. Default 60.' },
      },
      required: [],
    },
  },
  {
    name: 'redeem_loyalty_points',
    description: "Redeem the user's loyalty points for a specific reward — the bot returns a list of available redemptions if no reward_id passed. Use when the user says 'redeem my points', 'I want to claim a reward', 'use 500 points for a discount'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        reward_id: { type: 'string', description: "Specific reward UUID. Omit to first list available rewards." },
      },
      required: [],
    },
  },
  {
    name: 'bank_sync_now',
    description: "Trigger an immediate bank sync — pulls fresh transactions from all connected banks now instead of waiting for the next scheduled cycle. Use when the user says 'sync my bank now', 'pull fresh transactions', 'have any new transactions come in'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'run_email_scan',
    description: "Trigger an immediate inbox scan across the user's connected email accounts — looks for forgotten subscriptions, overcharges, debt-collection letters, refund opportunities. Returns a count of new findings. Use when the user says 'scan my inbox', 'check for new opportunities', 'run the scanner'.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_support_tickets',
    description: "List the user's support tickets — currently open and recently resolved. Returns each ticket's reference, subject, status, and last update.",
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['open', 'resolved', 'all'], description: "Filter by status. Default 'open'." },
      },
      required: [],
    },
  },
  {
    name: 'add_ticket_message',
    description: "Add a follow-up message to an existing support ticket. Use when the user wants to add information to a ticket they raised, e.g. 'add to my ticket about the mortgage display'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        ticket_ref: { type: 'string', description: 'Ticket reference (TKT-XXXX) or ticket UUID.' },
        message: { type: 'string', description: 'The follow-up message text.' },
      },
      required: ['ticket_ref', 'message'],
    },
  },
  {
    name: 'mark_subscription_cancellation_sent',
    description: "Mark that the user has sent a cancellation request for a subscription — flips its status to 'pending_cancellation' so we can track when it actually stops billing. Use when the user says 'I cancelled my X subscription', 'cancellation email sent to Y'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Subscription provider name (partial match).' },
      },
      required: ['provider'],
    },
  },
  {
    name: 'refine_letter',
    description: "Re-tune an EXISTING saved letter on a dispute (for example, 'make it more polite', 'shorten it'). Different from draft_dispute_letter (which creates a fresh draft). Use only when the user has ALREADY saved a letter and wants to revise it.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Dispute provider name.' },
        instruction: { type: 'string', description: "What to change (e.g. 'shorter', 'firmer', 'add the £85 figure', 'cite EU261')." },
      },
      required: ['provider', 'instruction'],
    },
  },
  {
    name: 'request_data_export',
    description: "Trigger a GDPR data export — Paybacker emails the user a downloadable archive of their account data within 24h. Use when the user says 'export my data', 'GDPR request', 'download all my information'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['json', 'csv'], description: 'Export format. Default csv.' },
      },
      required: [],
    },
  },
  {
    name: 'generate_form_letter',
    description: "Generate a non-complaint government / regulator form letter — HMRC, council tax, DVLA, NHS, parking, flight delay, debt response, plus 10 newer types (TV licence, FOS templates, Ofgem back-billing, Ofcom mid-contract rise, s.75 chargeback, holiday compensation, council tax exemption, DWP/UC complaint, pension complaint). Use when the dispute follows a fixed legal template rather than a private supplier complaint.",
    input_schema: {
      type: 'object' as const,
      properties: {
        form_type: {
          type: 'string',
          enum: [
            'hmrc_tax_rebate',
            'council_tax_band_challenge',
            'council_tax_exemption_claim',
            'dvla_dispute',
            'nhs_complaint',
            'parking_appeal',
            'flight_delay_uk261',
            'debt_collection_response',
            'statute_barred_debt',
            'tv_licence_dispute',
            'insurance_complaint_fos',
            'bank_complaint_fos',
            'pension_complaint',
            'energy_back_billing_slc21b',
            'broadband_mid_contract_rise_gcc1',
            's75_chargeback',
            'holiday_compensation_ptr2018',
            'dwp_universal_credit_complaint',
          ],
          description: 'Which government / regulator / legal form letter to generate.',
        },
        situation: { type: 'string', description: "Plain-English description of the user's situation — facts, dates, amounts, refs." },
        desired_outcome: { type: 'string', description: 'What outcome the user wants.' },
      },
      required: ['form_type', 'situation', 'desired_outcome'],
    },
  },

  // ============================================================
  // PHASE 3a — edge-action tools
  // ============================================================
  {
    name: 'complete_task',
    description: "Mark a task / action item as completed (distinct from dismiss — completed counts toward the user's resolution stats). Use when the user says 'I've done that', 'mark complete', 'this one's sorted'.",
    input_schema: {
      type: 'object' as const,
      properties: { task_id: { type: 'string', description: 'Task UUID.' } },
      required: ['task_id'],
    },
  },
  {
    name: 'snooze_task',
    description: "Snooze a task to reappear in N days. Use when the user says 'remind me in a week', 'snooze for 3 days'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'Task UUID.' },
        days: { type: 'number', description: 'How many days to snooze. 1-30.' },
      },
      required: ['task_id', 'days'],
    },
  },
  {
    name: 'snooze_dispute',
    description: "Push a dispute's reminder clock forward by N days without changing status. Useful when the user is waiting on a regulator deadline that's longer than the standard 14-day cycle.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Dispute provider name.' },
        days: { type: 'number', description: 'Days to snooze. 1-60.' },
      },
      required: ['provider', 'days'],
    },
  },
  {
    name: 'escalate_dispute',
    description: "One-call escalation — flips dispute status to 'escalated' AND drafts the matching ombudsman/regulator letter (Energy Ombudsman / CISAS / FOS / CEDR / Rail Ombudsman based on the dispute's issue_type). Use when the user says 'escalate the X dispute', 'take it to ombudsman'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Dispute provider name.' },
      },
      required: ['provider'],
    },
  },
  {
    name: 'reopen_dispute',
    description: "Re-open a previously-closed dispute (e.g. user got new info that changes the case). Flips status back to 'open' and clears resolution fields.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Dispute provider name.' },
        reason: { type: 'string', description: 'Why re-opening (logged to history).' },
      },
      required: ['provider', 'reason'],
    },
  },
  {
    name: 'move_correspondence_to_dispute',
    description: "Re-assign a correspondence entry from one dispute to another (when the watchdog mis-routed a reply, or the user pasted into the wrong dispute).",
    input_schema: {
      type: 'object' as const,
      properties: {
        correspondence_id: { type: 'string', description: 'Correspondence UUID to move.' },
        target_dispute_provider: { type: 'string', description: 'Provider name of the destination dispute.' },
      },
      required: ['correspondence_id', 'target_dispute_provider'],
    },
  },
  {
    name: 'delete_correspondence_entry',
    description: "Delete a single correspondence entry (use sparingly — for cleaning up wrong / duplicate entries). Auditable but irreversible.",
    input_schema: {
      type: 'object' as const,
      properties: { correspondence_id: { type: 'string', description: 'Correspondence UUID.' } },
      required: ['correspondence_id'],
    },
  },
  {
    name: 'add_note_to_subscription',
    description: "Add a free-text note to a subscription (e.g. 'cancellation phone number 0800 X', 'auto-renews 14 May'). Stored on subscriptions.notes.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'Subscription provider name.' },
        note: { type: 'string', description: 'Note text. Replaces any prior note.' },
      },
      required: ['provider', 'note'],
    },
  },
  {
    name: 'merge_subscriptions',
    description: "Merge two duplicate detected subscriptions into one (common after recategorisation when the same provider was detected twice under slightly different names).",
    input_schema: {
      type: 'object' as const,
      properties: {
        keep_provider: { type: 'string', description: "The subscription name to KEEP." },
        merge_provider: { type: 'string', description: 'The duplicate name to merge in (will be marked cancelled with notes referencing the kept one).' },
      },
      required: ['keep_provider', 'merge_provider'],
    },
  },
  {
    name: 'tag_transaction',
    description: "Add a custom tag/label to a single transaction for the user's own filtering (e.g. 'business expense', 'tax deductible', 'one-off').",
    input_schema: {
      type: 'object' as const,
      properties: {
        transaction_id: { type: 'string', description: 'Transaction UUID.' },
        tag: { type: 'string', description: 'Tag string (max 32 chars).' },
      },
      required: ['transaction_id', 'tag'],
    },
  },
  {
    name: 'pause_alerts_until',
    description: "Pause all proactive Pocket Agent alerts (price increases, contract renewals, dispute follow-ups) until a specific date. Use when the user is on holiday or just wants peace and quiet.",
    input_schema: {
      type: 'object' as const,
      properties: { until_date: { type: 'string', description: 'YYYY-MM-DD format. Inclusive.' } },
      required: ['until_date'],
    },
  },

  // ============================================================
  // PHASE 3b — long-tail read tools
  // ============================================================
  {
    name: 'get_login_history',
    description: "Get the user's recent login history — IP, user-agent, country, time. Useful for security checks ('have I been logging in from anywhere weird').",
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'number', description: 'How many recent logins. Default 10.' } },
      required: [],
    },
  },
  {
    name: 'get_active_sessions',
    description: "List the user's currently active web sessions (Supabase auth sessions). Useful for 'who's logged in', 'sign out all other devices'.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_referral_stats',
    description: "Get the user's referral programme stats — referral link, # of signups attributed, # of paying conversions, # of free-month rewards earned.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_disputes',
    description: "Free-text search across the user's full dispute history (provider, summary, correspondence content). Use when the user asks 'do I have a dispute about X', 'find that one I had with Y'.",
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Search keyword(s).' } },
      required: ['query'],
    },
  },
  {
    name: 'get_transaction_detail',
    description: "Get the full detail of a specific transaction by ID — date, amount, raw bank description, merchant, category, recategorisation history, linked subscription.",
    input_schema: {
      type: 'object' as const,
      properties: { transaction_id: { type: 'string' } },
      required: ['transaction_id'],
    },
  },
  {
    name: 'get_dashboard_stats',
    description: "Get the headline numbers shown on the user's overview page — total recovered, active disputes, monthly subscriptions, savings goals progress, money recovery score.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_savings_breakdown_by_provider',
    description: "Get savings achieved per provider — how much money has been recovered from each supplier across all closed disputes.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_renewal_calendar',
    description: "Get a chronological calendar of upcoming subscription renewals + contract end dates over the next N days.",
    input_schema: {
      type: 'object' as const,
      properties: { within_days: { type: 'number', description: 'Default 90.' } },
      required: [],
    },
  },
  {
    name: 'archive_subscription',
    description: "Archive a subscription so it stops appearing in active lists but stays in history. Different from cancel — use for subscriptions you've already cancelled outside Paybacker.",
    input_schema: {
      type: 'object' as const,
      properties: { provider: { type: 'string' } },
      required: ['provider'],
    },
  },
  {
    name: 'archive_dispute',
    description: "Archive a closed dispute so it stops appearing in lists but stays in history. Use for old resolved cases.",
    input_schema: {
      type: 'object' as const,
      properties: { provider: { type: 'string' } },
      required: ['provider'],
    },
  },
  {
    name: 'get_subscription_history',
    description: "List subscriptions the user has cancelled or archived — useful for 'what did I cancel last year', 'show my cancellation history'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Default 20.' },
      },
      required: [],
    },
  },
  {
    name: 'get_refund_status',
    description: "Get the status of refunds tied to disputes — pending, in-flight, received. Includes recovered amounts and dates.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_blog_posts',
    description: "List recent blog posts on Paybacker (UK consumer-rights guides, how-tos). Use when the user asks 'how do I do X', 'is there a guide on Y'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Default 5.' },
        topic: { type: 'string', description: 'Optional keyword filter.' },
      },
      required: [],
    },
  },
  {
    name: 'get_consumer_law_news',
    description: "Get recent UK consumer-law news / regulatory updates from the legal-news feed. Use for 'any new consumer rights laws', 'what's changed recently'.",
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'number', description: 'Default 5.' } },
      required: [],
    },
  },
  {
    name: 'set_monthly_budget',
    description: "Set the user's TOP-LEVEL monthly spending budget (different from per-category set_budget). Used as the headline savings target.",
    input_schema: {
      type: 'object' as const,
      properties: { amount: { type: 'number', description: 'Monthly budget in £.' } },
      required: ['amount'],
    },
  },
  {
    name: 'record_negotiation_outcome',
    description: "Manually record savings the user achieved by negotiating with a provider (e.g. 'I called Sky and got £10/mo off' → record £120/yr saved). Adds to total_money_recovered.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string' },
        annual_saving: { type: 'number', description: 'Annual saving in £.' },
        notes: { type: 'string', description: 'Brief description of what was negotiated.' },
      },
      required: ['provider', 'annual_saving'],
    },
  },

  // ============================================================
  // PHASE 3c — browser-handoff URL-return tools
  // ============================================================
  {
    name: 'start_bank_connection',
    description: "Return a URL the user can click to connect a UK bank via TrueLayer/Yapily. Bank OAuth needs a browser redirect so we hand off rather than try to do it in chat.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'start_email_connection',
    description: "Return a URL the user can click to connect a Gmail or Outlook inbox. Email OAuth requires browser redirect.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', enum: ['google', 'outlook'], description: 'Which provider.' },
      },
      required: ['provider'],
    },
  },
  {
    name: 'start_plan_upgrade',
    description: "Return a Stripe Checkout URL for upgrading to Essential or Pro. Stripe requires browser context for SCA / 3DS.",
    input_schema: {
      type: 'object' as const,
      properties: {
        target_tier: { type: 'string', enum: ['essential', 'pro'] },
        billing: { type: 'string', enum: ['monthly', 'yearly'], description: "Default monthly." },
      },
      required: ['target_tier'],
    },
  },
  {
    name: 'start_subscription_cancel',
    description: "Return a Stripe customer-portal URL where the user can cancel their Paybacker subscription.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'start_account_deletion',
    description: "Initiate account deletion — sends a confirmation email with a single-use link. Requires browser confirmation per UK GDPR right-to-erasure security.",
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Optional reason logged for product feedback.' },
      },
      required: [],
    },
  },
  {
    name: 'start_data_export_download',
    description: "Return the latest data-export download URL (after request_data_export has fired and the export job has completed).",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ============================================================
  // PHASE 4 — founder-only admin tools
  // ============================================================
  {
    name: 'get_business_log',
    description: "[FOUNDER ONLY] Get recent business_log entries filtered by category. Used by the founder bot persona for at-a-glance health checks.",
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: "Optional filter (e.g. 'critical', 'finding', 'milestone')." },
        limit: { type: 'number', description: 'Default 10.' },
      },
      required: [],
    },
  },
  {
    name: 'get_open_support_tickets',
    description: "[FOUNDER ONLY] List all open support tickets across ALL users.",
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'number', description: 'Default 20.' } },
      required: [],
    },
  },
  {
    name: 'get_mrr',
    description: "[FOUNDER ONLY] Current month MRR — totals from active Stripe subscriptions split by tier.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_pending_disputes_across_users',
    description: "[FOUNDER ONLY] List disputes across all users that haven't been resolved or escalated in 30+ days. Oversight tool.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_recent_signups',
    description: "[FOUNDER ONLY] Last N signups across all users with their tier, signup source, days-since-signup.",
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'number', description: 'Default 20.' } },
      required: [],
    },
  },
  {
    name: 'get_failed_payments',
    description: "[FOUNDER ONLY] Stripe failed payments / past-due subscriptions in the last 30 days.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_legal_coverage_status',
    description: "[FOUNDER ONLY] Snapshot of the legal_references index — total refs, stale count, missing categories, missing named statutes (mirrors the daily canary).",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_managed_agent_run_status',
    description: "[FOUNDER ONLY] Recent managed-agent session activity (alert-tester, support-triager, bug-triager, etc.) — last run time, status.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ============================================================
  // PHASE 5 — dispute write parity (mirrors website /dashboard/disputes
  // edit / outcome / mark-read / evidence / correspondence-edit flows
  // so users can drive the full dispute workflow from chat).
  // ============================================================
  {
    name: 'update_dispute',
    description:
      "Patch editable fields on an existing dispute (claim amount, category/issue type, evidence summary, provider name). Mirrors the website's PATCH /api/disputes/[id] non-resolve path. Use when the user says 'update the amount to £X', 'change the category to broadband_complaint', 'rename the dispute to <provider>', or wants to edit the issue summary mid-flight. For terminal outcomes (won / lost / partial / withdrawn) call record_dispute_outcome instead.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Provider name of the dispute to update (case-insensitive partial match — same shape as get_dispute_detail).',
        },
        claim_amount: {
          type: 'number',
          description: "New disputed_amount in GBP (positive number). Optional.",
        },
        category: {
          type: 'string',
          enum: [
            'complaint',
            'energy_dispute',
            'broadband_complaint',
            'flight_compensation',
            'parking_appeal',
            'debt_dispute',
            'refund_request',
            'hmrc_tax_rebate',
            'council_tax_band',
            'dvla_vehicle',
            'nhs_complaint',
          ],
          description: 'New issue_type for the dispute. Optional.',
        },
        evidence_summary: {
          type: 'string',
          description: "New issue_summary text — the plain-English description shown on the dispute card. Optional.",
        },
        provider_name: {
          type: 'string',
          description: "New provider_name (rename the dispute, e.g. 'British Gas' → 'British Gas Trading Ltd'). Optional.",
        },
      },
      required: ['provider'],
    },
  },
  {
    name: 'record_dispute_outcome',
    description:
      "Tag a terminal outcome on a dispute and write a row to dispute_outcome_events for the intelligence flywheel. Mirrors POST /api/disputes/[id]/outcome. Use when the user confirms a result — won / partial / lost / withdrawn / timeout / still_open. Always pass recovered_amount_gbp when outcome is won or partial. The matching subscription auto-cancel only fires for 'won' on cancellation-type disputes — same guards as the website.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Provider name of the dispute (case-insensitive partial match).',
        },
        outcome: {
          type: 'string',
          enum: ['won', 'partial', 'lost', 'withdrawn', 'timeout', 'still_open'],
          description: "Terminal outcome to record. 'still_open' keeps the dispute active but tags the dataset row.",
        },
        recovered_amount_gbp: {
          type: 'number',
          description: 'Money recovered in GBP. Required for won/partial; ignored otherwise.',
        },
        evidence_excerpt: {
          type: 'string',
          description: "Optional short quote from the supplier's reply that proves the outcome — stored on dispute_outcome_events.ai_evidence_excerpt for the intelligence dataset.",
        },
      },
      required: ['provider', 'outcome'],
    },
  },
  {
    name: 'mark_dispute_read',
    description:
      "Clear the unread-replies badge on a dispute (zero out unread_reply_count). Mirrors POST /api/disputes/[id]/mark-read. Use when the user has read or quoted from the latest supplier reply in chat and you want the dashboard 'NEW REPLY · N' badge to clear.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Provider name of the dispute (case-insensitive partial match).',
        },
      },
      required: ['provider'],
    },
  },
  {
    name: 'attach_evidence_to_dispute',
    description:
      "Save a free-text evidence note to the dispute timeline. Use when the user pastes an excerpt, observation, or proof point from chat (e.g. 'add this to my Sky dispute: meter read on 14 Apr was 12345'). The bot only handles text — for photo / PDF uploads tell the user to use the website upload flow at /dashboard/disputes. Inserts a user_note row tagged 'Evidence — <source>' so it stands out in the timeline alongside ai_letter and company_email entries.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Provider name of the dispute (case-insensitive partial match).',
        },
        evidence_text: {
          type: 'string',
          description: 'The full evidence text to save. Must be a non-empty string — the bot does not handle file uploads.',
        },
        source: {
          type: 'string',
          enum: ['telegram_chat', 'whatsapp_chat'],
          description: "Which channel the evidence came from. Used to label the timeline entry. Defaults to telegram_chat.",
        },
      },
      required: ['provider', 'evidence_text'],
    },
  },
  {
    name: 'edit_correspondence_entry',
    description:
      "Edit the title or content of an existing correspondence entry (the user's own notes / pasted supplier responses). Mirrors PATCH /api/disputes/[id]/correspondence/[entryId]. Use when the user wants to fix a typo or update text on a previously-saved entry. AI-generated letters cannot be edited (engine refuses). Pass the correspondence_id from get_dispute_detail or quote_email_from_thread output.",
    input_schema: {
      type: 'object' as const,
      properties: {
        correspondence_id: {
          type: 'string',
          description: 'UUID of the correspondence row to edit. Must belong to the calling user (security predicate is enforced server-side).',
        },
        title: {
          type: 'string',
          description: 'New title for the entry. Optional — pass empty string to clear.',
        },
        content: {
          type: 'string',
          description: 'New content body for the entry. Optional. Must be non-empty if provided.',
        },
      },
      required: ['correspondence_id'],
    },
  },
];
