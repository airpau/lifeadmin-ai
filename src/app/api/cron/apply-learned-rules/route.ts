import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalisePattern } from '@/lib/learning-engine';

export const runtime = 'nodejs';
export const maxDuration = 300;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/cron/apply-learned-rules
 *
 * Nightly cron (2am). For all bank_transactions where user_category is null,
 * checks against merchant_rules with confidence >= 3 and retroactively
 * applies the learned category. This means old transactions benefit from
 * collective learning as more users correct categorisations.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  try {
    // Load high-confidence rules (confidence >= 3)
    const { data: rules } = await admin
      .from('merchant_rules')
      .select('raw_name_normalised, display_name, category, is_transfer, income_type, confidence')
      .gte('confidence', 3)
      .order('confidence', { ascending: false });

    if (!rules || rules.length === 0) {
      return NextResponse.json({ message: 'No high-confidence rules to apply', updated: 0 });
    }

    // Fetch uncategorised transactions (no user_category set)
    // Process in batches to avoid memory issues
    let totalUpdated = 0;
    let offset = 0;
    const batchSize = 1000;

    while (true) {
      const { data: txns } = await admin
        .from('bank_transactions')
        .select('id, description, merchant_name, amount, category')
        .is('user_category', null)
        .order('timestamp', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (!txns || txns.length === 0) break;

      const updates: Array<{ id: string; user_category: string; income_type?: string }> = [];

      for (const txn of txns) {
        const desc = txn.merchant_name || txn.description || '';
        const pattern = normalisePattern(desc);
        if (!pattern) continue;

        // Find matching rule
        for (const rule of rules) {
          const rulePattern = (rule.raw_name_normalised || '').toLowerCase();
          if (!rulePattern) continue;

          if (pattern.includes(rulePattern) || rulePattern.includes(pattern)) {
            const update: { id: string; user_category: string; income_type?: string } = {
              id: txn.id,
              user_category: rule.category,
            };

            // Also set income_type if the rule specifies one and the transaction is a credit
            if (rule.income_type && parseFloat(txn.amount) > 0) {
              update.income_type = rule.income_type;
            }

            // Mark transfers
            if (rule.is_transfer) {
              update.user_category = 'transfers';
            }

            updates.push(update);
            break;
          }
        }
      }

      // Apply updates in batches
      for (const upd of updates) {
        const updateFields: Record<string, string> = { user_category: upd.user_category };
        if (upd.income_type) updateFields.income_type = upd.income_type;

        await admin
          .from('bank_transactions')
          .update(updateFields)
          .eq('id', upd.id);
      }

      totalUpdated += updates.length;

      if (txns.length < batchSize) break;
      offset += batchSize;
    }

    return NextResponse.json({
      message: `Applied ${rules.length} learned rules`,
      rulesApplied: rules.length,
      transactionsUpdated: totalUpdated,
    });
  } catch (err: any) {
    console.error('Apply learned rules error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
