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
      "Get the user's connected bank accounts — which banks are linked, their status (active/expired/expiring), last sync time, and account names.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
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
      'Draft a professional complaint or dispute letter citing exact UK consumer law. Returns a preview the user must approve before it is saved. Use Claude Sonnet for letter quality.',
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'The company or provider name being disputed (e.g. "BT", "British Gas").',
        },
        issue_description: {
          type: 'string',
          description:
            'Plain English description of the problem (e.g. "My broadband bill went up by £10/month without notice").',
        },
        desired_outcome: {
          type: 'string',
          description:
            'What the user wants to achieve (e.g. "revert to original price", "full refund", "compensation").',
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
];
