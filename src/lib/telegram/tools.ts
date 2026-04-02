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
            'parking', 'travel', 'gambling', 'bills', 'fee', 'water', 'motoring', 'property_management',
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
      'Create or update a monthly budget limit for a spending category. If a budget already exists for the category it will be updated, otherwise a new one is created.',
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
];
