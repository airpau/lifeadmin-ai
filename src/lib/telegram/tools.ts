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
    name: 'get_subscriptions',
    description:
      "Get the user's subscriptions with monthly/annual costs, renewal dates, and status.",
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'active', 'cancelled'],
          description: 'Filter subscriptions by status. Defaults to active.',
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
      "Get the user's active contracts (broadband, mobile, energy, insurance, gym etc.) with end dates, costs, and provider details.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'Optional: filter by provider name (partial match, case-insensitive).',
        },
      },
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
];
