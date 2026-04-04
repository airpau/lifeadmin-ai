import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper: delete all rows from a table matching a column value.
 * Swallows errors (table may not exist) and logs them.
 */
async function safeDelete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  table: string,
  column: string,
  value: string,
  errors: string[]
) {
  try {
    const { error } = await admin.from(table).delete().eq(column, value);
    if (error) {
      console.error(`GDPR delete: failed on ${table}:`, error.message);
      errors.push(`${table}: ${error.message}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`GDPR delete: exception on ${table}:`, msg);
    errors.push(`${table}: ${msg}`);
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const userId = user.id;
    const userEmail = user.email ?? '';
    const errors: string[] = [];

    // ---------------------------------------------------------------
    // Phase 1: Deep children (tables with FKs to disputes/subscriptions/bank_connections)
    // ---------------------------------------------------------------
    await Promise.all([
      safeDelete(admin, 'correspondence', 'user_id', userId, errors),
      safeDelete(admin, 'contract_extractions', 'user_id', userId, errors),
      safeDelete(admin, 'bank_sync_log', 'user_id', userId, errors),
      safeDelete(admin, 'bank_transactions', 'user_id', userId, errors),
    ]);

    // ---------------------------------------------------------------
    // Phase 2: Mid-level parents (bank_connections, telegram, detected_issues, etc.)
    // ---------------------------------------------------------------
    await Promise.all([
      safeDelete(admin, 'bank_connections', 'user_id', userId, errors),
      safeDelete(admin, 'telegram_pending_actions', 'user_id', userId, errors),
      safeDelete(admin, 'telegram_message_log', 'user_id', userId, errors),
      safeDelete(admin, 'telegram_sessions', 'user_id', userId, errors),
      safeDelete(admin, 'telegram_link_codes', 'user_id', userId, errors),
      safeDelete(admin, 'telegram_alert_preferences', 'user_id', userId, errors),
      safeDelete(admin, 'detected_issues', 'user_id', userId, errors),
      safeDelete(admin, 'verified_savings', 'user_id', userId, errors),
      safeDelete(admin, 'price_increase_alerts', 'user_id', userId, errors),
      safeDelete(admin, 'subscription_comparisons', 'user_id', userId, errors),
    ]);

    // ---------------------------------------------------------------
    // Phase 3: Core domain tables (subscriptions, disputes, money hub, etc.)
    // ---------------------------------------------------------------
    await Promise.all([
      safeDelete(admin, 'subscriptions', 'user_id', userId, errors),
      safeDelete(admin, 'disputes', 'user_id', userId, errors),
      safeDelete(admin, 'money_hub_budgets', 'user_id', userId, errors),
      safeDelete(admin, 'money_hub_assets', 'user_id', userId, errors),
      safeDelete(admin, 'money_hub_liabilities', 'user_id', userId, errors),
      safeDelete(admin, 'money_hub_savings_goals', 'user_id', userId, errors),
      safeDelete(admin, 'money_hub_alerts', 'user_id', userId, errors),
      safeDelete(admin, 'money_hub_category_overrides', 'user_id', userId, errors),
    ]);

    // ---------------------------------------------------------------
    // Phase 4: Engagement, rewards, support, chatbot, email/outlook tokens
    // ---------------------------------------------------------------
    await Promise.all([
      safeDelete(admin, 'user_challenges', 'user_id', userId, errors),
      safeDelete(admin, 'user_points', 'user_id', userId, errors),
      safeDelete(admin, 'referrals', 'user_id', userId, errors),
      safeDelete(admin, 'support_tickets', 'user_id', userId, errors),
      // ticket_messages has no user_id column — cascade deleted when support_tickets rows are removed
      safeDelete(admin, 'chatbot_question_log', 'user_id', userId, errors),
      safeDelete(admin, 'nps_responses', 'user_id', userId, errors),
      safeDelete(admin, 'gmail_tokens', 'user_id', userId, errors),
      safeDelete(admin, 'outlook_tokens', 'user_id', userId, errors),
      safeDelete(admin, 'usage_logs', 'user_id', userId, errors),
    ]);

    // ---------------------------------------------------------------
    // Phase 5: Waitlist (matched by email, not user_id)
    // ---------------------------------------------------------------
    if (userEmail) {
      await safeDelete(admin, 'waitlist_signups', 'email', userEmail, errors);
    }

    // ---------------------------------------------------------------
    // Phase 6: Top-level tables (tasks, agent_runs)
    // ---------------------------------------------------------------
    await Promise.all([
      safeDelete(admin, 'tasks', 'user_id', userId, errors),
      safeDelete(admin, 'agent_runs', 'user_id', userId, errors),
    ]);

    // ---------------------------------------------------------------
    // Phase 7: Profile row (must come after everything that references it)
    // ---------------------------------------------------------------
    await safeDelete(admin, 'profiles', 'id', userId, errors);

    // ---------------------------------------------------------------
    // Phase 8: Delete auth.users entry (must be last)
    // ---------------------------------------------------------------
    try {
      const { error: authError } = await admin.auth.admin.deleteUser(userId);
      if (authError) {
        console.error('GDPR delete: failed to delete auth user:', authError.message);
        errors.push(`auth.users: ${authError.message}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('GDPR delete: exception deleting auth user:', msg);
      errors.push(`auth.users: ${msg}`);
    }

    // ---------------------------------------------------------------
    // Sign the user out (best-effort — auth user is already deleted)
    // ---------------------------------------------------------------
    try {
      await supabase.auth.signOut();
    } catch {
      // User session may already be invalid after auth.users deletion
    }

    if (errors.length > 0) {
      console.warn('GDPR delete completed with errors:', errors);
    }

    return NextResponse.json({
      success: true,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GDPR account deletion failed:', message);
    return NextResponse.json(
      { error: 'Account deletion failed', detail: message },
      { status: 500 }
    );
  }
}
