import { createClient } from '@supabase/supabase-js';
import { resolveProviderLogo } from '@/lib/logo-resolver';
import { ChatTool } from './registry';
import { USER_SELECTABLE_IDS, normaliseCategory } from '@/lib/categories';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const listSubscriptions: ChatTool = {
  name: 'list_subscriptions',
  description:
    `List the user's subscriptions. Optionally filter by status (active, cancelled, pending_cancellation) or canonical category (${USER_SELECTABLE_IDS.join(', ')}).`,
  input_schema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: active, cancelled, pending_cancellation, expired',
      },
      category: {
        type: 'string',
        description: `Filter by canonical category. Valid values: ${USER_SELECTABLE_IDS.join(', ')}`,
      },
    },
    required: [],
  },
  handler: async (args: { status?: string; category?: string }, userId: string) => {
    const admin = getAdmin();
    let query = admin
      .from('subscriptions')
      .select('id, provider_name, category, amount, billing_cycle, status, next_billing_date, contract_end_date, provider_type, notes, logo_url, source')
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false });

    if (args.status) {
      query = query.eq('status', args.status);
    }
    if (args.category) {
      query = query.eq('category', args.category);
    }

    const { data, error } = await query;

    if (error) {
      return { error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        message: 'No subscriptions found matching your criteria.',
        subscriptions: [],
        count: 0,
      };
    }

    const totalMonthly = data
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => {
        if (s.billing_cycle === 'monthly') return sum + Number(s.amount);
        if (s.billing_cycle === 'yearly') return sum + Number(s.amount) / 12;
        if (s.billing_cycle === 'quarterly') return sum + Number(s.amount) / 3;
        return sum;
      }, 0);

    return {
      subscriptions: data.map((s) => ({
        id: s.id,
        provider_name: s.provider_name,
        category: s.category,
        amount: `£${Number(s.amount).toFixed(2)}`,
        billing_cycle: s.billing_cycle,
        status: s.status,
        next_billing_date: s.next_billing_date,
        contract_end_date: s.contract_end_date,
        provider_type: s.provider_type,
        notes: s.notes,
      })),
      count: data.length,
      total_monthly_spend: `£${totalMonthly.toFixed(2)}`,
    };
  },
};

const getSubscription: ChatTool = {
  name: 'get_subscription',
  description:
    'Look up a specific subscription by provider name (fuzzy match) or by subscription ID.',
  input_schema: {
    type: 'object' as const,
    properties: {
      provider_name: {
        type: 'string',
        description: 'The provider/company name to search for (e.g. "Netflix", "BT")',
      },
      id: {
        type: 'string',
        description: 'The subscription UUID',
      },
    },
    required: [],
  },
  handler: async (args: { provider_name?: string; id?: string }, userId: string) => {
    const admin = getAdmin();

    if (args.id) {
      const { data, error } = await admin
        .from('subscriptions')
        .select('*')
        .eq('id', args.id)
        .eq('user_id', userId)
        .is('dismissed_at', null)
        .single();

      if (error || !data) {
        return { error: 'Subscription not found.' };
      }
      return { subscription: data };
    }

    if (args.provider_name) {
      const { data, error } = await admin
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .is('dismissed_at', null)
        .ilike('provider_name', `%${args.provider_name}%`);

      if (error) {
        return { error: error.message };
      }
      if (!data || data.length === 0) {
        return { error: `No subscription found matching "${args.provider_name}".` };
      }
      if (data.length === 1) {
        return { subscription: data[0] };
      }
      return {
        message: `Found ${data.length} matching subscriptions. Please be more specific.`,
        matches: data.map((s) => ({
          id: s.id,
          provider_name: s.provider_name,
          amount: `£${Number(s.amount).toFixed(2)}`,
          status: s.status,
        })),
      };
    }

    return { error: 'Please provide either a provider_name or id.' };
  },
};

const updateSubscription: ChatTool = {
  name: 'update_subscription',
  description:
    'Update fields on an existing subscription. You must provide the subscription id. Updatable fields: category, amount, billing_cycle, contract_end_date, provider_type, notes, next_billing_date.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The subscription UUID (required)',
      },
      category: {
        type: 'string',
        description: 'New category',
      },
      amount: {
        type: 'number',
        description: 'New amount in GBP',
      },
      billing_cycle: {
        type: 'string',
        description: 'New billing cycle: monthly, quarterly, yearly, one-time',
      },
      contract_end_date: {
        type: 'string',
        description: 'New contract end date (YYYY-MM-DD)',
      },
      provider_type: {
        type: 'string',
        description: 'New provider type',
      },
      notes: {
        type: 'string',
        description: 'Updated notes',
      },
      next_billing_date: {
        type: 'string',
        description: 'Next billing date (YYYY-MM-DD)',
      },
    },
    required: ['id'],
  },
  handler: async (
    args: {
      id: string;
      category?: string;
      amount?: number;
      billing_cycle?: string;
      contract_end_date?: string;
      provider_type?: string;
      notes?: string;
      next_billing_date?: string;
    },
    userId: string
  ) => {
    const admin = getAdmin();

    // Build update payload with only provided fields
    const updates: Record<string, any> = {};
    if (args.category !== undefined) updates.category = args.category;
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.billing_cycle !== undefined) updates.billing_cycle = args.billing_cycle;
    if (args.contract_end_date !== undefined) updates.contract_end_date = args.contract_end_date;
    if (args.provider_type !== undefined) updates.provider_type = args.provider_type;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.next_billing_date !== undefined) updates.next_billing_date = args.next_billing_date;

    if (Object.keys(updates).length === 0) {
      return { error: 'No fields to update.' };
    }

    const { data, error } = await admin
      .from('subscriptions')
      .update(updates)
      .eq('id', args.id)
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .select('id, provider_name, category, amount, billing_cycle, status, next_billing_date, contract_end_date, provider_type, notes')
      .single();

    if (error) {
      return { error: error.message };
    }
    if (!data) {
      return { error: 'Subscription not found.' };
    }

    return {
      message: `Updated ${data.provider_name} successfully.`,
      subscription: {
        ...data,
        amount: `£${Number(data.amount).toFixed(2)}`,
      },
    };
  },
};

const createSubscription: ChatTool = {
  name: 'create_subscription',
  description:
    'Create a new subscription for the user. Required: provider_name, amount. Optional: category, billing_cycle (defaults to monthly), contract_end_date, provider_type, notes, next_billing_date.',
  input_schema: {
    type: 'object' as const,
    properties: {
      provider_name: {
        type: 'string',
        description: 'The provider/company name (e.g. "Netflix", "Sky")',
      },
      amount: {
        type: 'number',
        description: 'Amount in GBP',
      },
      category: {
        type: 'string',
        description: `Canonical category. Valid values: ${USER_SELECTABLE_IDS.join(', ')}`,
      },
      billing_cycle: {
        type: 'string',
        description: 'Billing cycle: monthly, quarterly, yearly, one-time. Defaults to monthly.',
      },
      contract_end_date: {
        type: 'string',
        description: 'Contract end date (YYYY-MM-DD)',
      },
      provider_type: {
        type: 'string',
        description: 'Provider type',
      },
      notes: {
        type: 'string',
        description: 'Any notes',
      },
      next_billing_date: {
        type: 'string',
        description: 'Next billing date (YYYY-MM-DD)',
      },
    },
    required: ['provider_name', 'amount'],
  },
  handler: async (
    args: {
      provider_name: string;
      amount: number;
      category?: string;
      billing_cycle?: string;
      contract_end_date?: string;
      provider_type?: string;
      notes?: string;
      next_billing_date?: string;
    },
    userId: string
  ) => {
    const admin = getAdmin();

    // Try to resolve logo
    const logoUrl = await resolveProviderLogo(args.provider_name);

    const { data, error } = await admin
      .from('subscriptions')
      .insert({
        user_id: userId,
        provider_name: args.provider_name,
        amount: args.amount,
        category: args.category || 'other',
        billing_cycle: args.billing_cycle || 'monthly',
        currency: 'GBP',
        status: 'active',
        usage_frequency: 'sometimes',
        contract_end_date: args.contract_end_date || null,
        provider_type: args.provider_type || null,
        notes: args.notes || null,
        next_billing_date: args.next_billing_date || null,
        logo_url: logoUrl,
        source: 'manual',
      })
      .select('id, provider_name, category, amount, billing_cycle, status')
      .single();

    if (error) {
      return { error: error.message };
    }

    return {
      message: `Created subscription for ${data.provider_name}.`,
      subscription: {
        ...data,
        amount: `£${Number(data.amount).toFixed(2)}`,
      },
    };
  },
};

const dismissSubscription: ChatTool = {
  name: 'dismiss_subscription',
  description:
    'Soft-delete (dismiss) a subscription. The user must confirm before you call this. Provide either the subscription id or provider_name to find it first.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The subscription UUID',
      },
      provider_name: {
        type: 'string',
        description: 'The provider name to find and dismiss',
      },
    },
    required: [],
  },
  handler: async (args: { id?: string; provider_name?: string }, userId: string) => {
    const admin = getAdmin();

    let subscriptionId = args.id;

    // If provider_name given, look it up first
    if (!subscriptionId && args.provider_name) {
      const { data } = await admin
        .from('subscriptions')
        .select('id, provider_name')
        .eq('user_id', userId)
        .is('dismissed_at', null)
        .ilike('provider_name', `%${args.provider_name}%`);

      if (!data || data.length === 0) {
        return { error: `No subscription found matching "${args.provider_name}".` };
      }
      if (data.length > 1) {
        return {
          error: `Found ${data.length} matching subscriptions. Please be more specific.`,
          matches: data.map((s) => ({ id: s.id, provider_name: s.provider_name })),
        };
      }
      subscriptionId = data[0].id;
    }

    if (!subscriptionId) {
      return { error: 'Please provide either an id or provider_name.' };
    }

    const { data, error } = await admin
      .from('subscriptions')
      .update({ dismissed_at: new Date().toISOString(), status: 'dismissed' })
      .eq('id', subscriptionId)
      .eq('user_id', userId)
      .select('id, provider_name')
      .single();

    if (error) {
      return { error: error.message };
    }
    if (!data) {
      return { error: 'Subscription not found.' };
    }

    return {
      message: `Dismissed ${data.provider_name}. It will no longer appear in your subscriptions list.`,
    };
  },
};

/**
 * Convenience tool: recategorise a subscription by name.
 * Users don't know UUIDs — they say "change Paratus to mortgage".
 */
const recategoriseSubscription: ChatTool = {
  name: 'recategorise_subscription',
  description:
    `Recategorise a subscription by provider name. Use when the user says things like "change Paratus to mortgage" or "HMRC should be under tax". Finds the subscription by name and updates its category. Canonical categories: ${USER_SELECTABLE_IDS.join(', ')}.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      provider_name: {
        type: 'string',
        description: 'The provider/company name to find (fuzzy match)',
      },
      new_category: {
        type: 'string',
        description: 'The new category to assign',
      },
    },
    required: ['provider_name', 'new_category'],
  },
  handler: async (args: { provider_name: string; new_category: string }, userId: string) => {
    const admin = getAdmin();

    // Normalise to canonical — resolves aliases e.g. "fitness" → "health"
    const canonicalCategory = normaliseCategory(args.new_category);

    // 1. Update Subscriptions table
    const { data } = await admin
      .from('subscriptions')
      .select('id, provider_name, category, amount')
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .ilike('provider_name', `%${args.provider_name}%`);

    let subUpdated = 0;
    const results = [];
    if (data && data.length > 0) {
      for (const sub of data) {
        const { error } = await admin
          .from('subscriptions')
          .update({ category: canonicalCategory })
          .eq('id', sub.id)
          .eq('user_id', userId);

        if (!error) {
          subUpdated++;
          results.push({
            provider_name: sub.provider_name,
            old_category: sub.category,
            new_category: args.new_category,
            amount: `£${Number(sub.amount).toFixed(2)}`,
          });
        }
      }
    }

    // 2. Update Money Hub Bank Transactions and Overrides
    const pattern = args.provider_name.toLowerCase().trim();
    const corePattern = pattern
      .replace(/^\d{4}\s+\d{2}[a-z]{3}\d{2}\s+/i, '')
      .replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '')
      .replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '')
      .trim();

    await admin.from('money_hub_category_overrides').upsert({
      user_id: userId,
      merchant_pattern: corePattern || pattern,
      user_category: args.new_category,
    }, { onConflict: 'user_id,merchant_pattern' });

    // Update historical bank_transactions matching this provider
    const { data: matchingTxns } = await admin.from('bank_transactions')
      .select('id, description, merchant_name')
      .eq('user_id', userId);

    let txnsUpdated = 0;
    if (matchingTxns) {
      for (const txn of matchingTxns) {
        const merchantName = (txn.merchant_name || '').toLowerCase();
        const desc = (txn.description || '').toLowerCase();
        const txnCore = desc
          .replace(/^\d{4}\s+\d{2}[a-z]{3}\d{2}\s+/i, '')
          .replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '')
          .replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '')
          .trim();

        if (
          merchantName === pattern || merchantName.includes(pattern) || desc.includes(pattern) ||
          (corePattern.length > 3 && (txnCore.includes(corePattern) || txnCore.startsWith(corePattern)))
        ) {
          await admin.from('bank_transactions')
            .update({ user_category: args.new_category })
            .eq('id', txn.id);
          txnsUpdated++;
        }
      }
    }

    if (subUpdated === 0 && txnsUpdated === 0) {
      return { error: `No subscription or bank transactions found matching "${args.provider_name}".` };
    }

    // Log the correction for future auto-categorisation improvement
    try {
      const originalCategory = results.length > 0 ? results[0].old_category : null;
      await admin.from('chatbot_corrections').insert({
        user_id: userId,
        correction_type: 'category',
        original_value: originalCategory,
        corrected_value: args.new_category,
        merchant_pattern: corePattern || pattern,
        context: `Recategorised "${args.provider_name}" from "${originalCategory}" to "${args.new_category}"`,
      });
    } catch { /* non-critical */ }

    return {
      message: `Recategorised ${subUpdated} subscription(s) and ${txnsUpdated} transaction(s) to "${args.new_category}".`,
      updated: results.length > 0 ? results : { updated_transactions: txnsUpdated, new_category: args.new_category },
      dashboard_refresh: true,
    };
  },
};

/**
 * Recategorise bank transactions by keyword.
 * E.g. "categorise all Tesco transactions as groceries"
 */
const recategoriseTransactions: ChatTool = {
  name: 'recategorise_transactions',
  description:
    'Recategorise bank transactions matching a description keyword. Use when the user says "categorise Tesco as groceries" or "my Costa transactions should be food". Only updates the user_category field on the user\'s own transactions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      keyword: {
        type: 'string',
        description: 'Description keyword to match transactions (e.g. "Tesco", "Costa")',
      },
      new_category: {
        type: 'string',
        description: 'The new category to assign',
      },
    },
    required: ['keyword', 'new_category'],
  },
  handler: async (args: { keyword: string; new_category: string }, userId: string) => {
    const admin = getAdmin();

    // Normalise to canonical category
    const canonicalCategory = normaliseCategory(args.new_category);

    // Count matching transactions
    const { data: matches } = await admin
      .from('bank_transactions')
      .select('id')
      .eq('user_id', userId)
      .ilike('description', `%${args.keyword}%`);

    if (!matches || matches.length === 0) {
      return { error: `No transactions found matching "${args.keyword}".` };
    }

    // Update user_category for all matching transactions
    const { error } = await admin
      .from('bank_transactions')
      .update({ user_category: canonicalCategory })
      .eq('user_id', userId)
      .ilike('description', `%${args.keyword}%`);

    if (error) {
      return { error: error.message };
    }

    // Log the correction for future auto-categorisation improvement
    try {
      await admin.from('chatbot_corrections').insert({
        user_id: userId,
        correction_type: 'category',
        original_value: null,
        corrected_value: canonicalCategory,
        merchant_pattern: args.keyword.toLowerCase().trim(),
        context: `Recategorised ${matches.length} transaction(s) matching "${args.keyword}" to "${canonicalCategory}"`,
      });
    } catch { /* non-critical */ }

    return {
      message: `Updated ${matches.length} transaction(s) matching "${args.keyword}" to category "${args.new_category}".`,
      count: matches.length,
      dashboard_refresh: true,
    };
  },
};

export const subscriptionTools: ChatTool[] = [
  listSubscriptions,
  getSubscription,
  updateSubscription,
  createSubscription,
  dismissSubscription,
  recategoriseSubscription,
  recategoriseTransactions,
];
