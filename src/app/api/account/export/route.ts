import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper: select all rows from a table matching a column value.
 * On error: logs, appends to warnings, and returns an empty array.
 * Returns 200 with partial data — failures are surfaced in the warnings array.
 */
async function safeSelect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  table: string,
  column: string,
  value: string,
  warnings: string[]
): Promise<unknown[]> {
  try {
    const { data, error } = await supabase.from(table).select('*').eq(column, value);
    if (error) {
      console.error(`GDPR export: failed on ${table}:`, error.message);
      warnings.push(`${table}: ${error.message}`);
      return [];
    }
    return data ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`GDPR export: exception on ${table}:`, msg);
    warnings.push(`${table}: ${msg}`);
    return [];
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    const warnings: string[] = [];

    const [
      subscriptions,
      disputes,
      correspondence,
      bankConnections,
      bankTransactions,
      gmailTokens,
      outlookTokens,
      tasks,
      budgets,
      assets,
      liabilities,
      savingsGoals,
      points,
      referrals,
      npsResponses,
      chatbotLogs,
      usageLogs,
      supportTickets,
    ] = await Promise.all([
      safeSelect(supabase, 'subscriptions', 'user_id', userId, warnings),
      safeSelect(supabase, 'disputes', 'user_id', userId, warnings),
      safeSelect(supabase, 'correspondence', 'user_id', userId, warnings),
      safeSelect(supabase, 'bank_connections', 'user_id', userId, warnings),
      safeSelect(supabase, 'bank_transactions', 'user_id', userId, warnings),
      safeSelect(supabase, 'gmail_tokens', 'user_id', userId, warnings),
      safeSelect(supabase, 'outlook_tokens', 'user_id', userId, warnings),
      safeSelect(supabase, 'tasks', 'user_id', userId, warnings),
      safeSelect(supabase, 'money_hub_budgets', 'user_id', userId, warnings),
      safeSelect(supabase, 'money_hub_assets', 'user_id', userId, warnings),
      safeSelect(supabase, 'money_hub_liabilities', 'user_id', userId, warnings),
      safeSelect(supabase, 'money_hub_savings_goals', 'user_id', userId, warnings),
      safeSelect(supabase, 'user_points', 'user_id', userId, warnings),
      safeSelect(supabase, 'referrals', 'user_id', userId, warnings),
      safeSelect(supabase, 'nps_responses', 'user_id', userId, warnings),
      safeSelect(supabase, 'chatbot_question_log', 'user_id', userId, warnings),
      safeSelect(supabase, 'usage_logs', 'user_id', userId, warnings),
      safeSelect(supabase, 'support_tickets', 'user_id', userId, warnings),
    ]);

    // ticket_messages has no user_id column — query via ticket_id
    let ticketMessages: unknown[] = [];
    if (supportTickets.length > 0) {
      const ticketIds = (supportTickets as { id: string }[]).map(t => t.id);
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .in('ticket_id', ticketIds);
      if (error) {
        console.error('GDPR export: failed on ticket_messages:', error.message);
        warnings.push(`ticket_messages: ${error.message}`);
      } else {
        ticketMessages = data ?? [];
      }
    }

    // Redact OAuth tokens — include metadata but not the secret values
    const redactTokens = (rows: unknown[]) =>
      rows.map(row => ({
        ...(row as Record<string, unknown>),
        access_token: '[REDACTED]',
        refresh_token: '[REDACTED]',
      }));

    const exportData = {
      exported_at: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
      },
      data: {
        subscriptions,
        disputes,
        correspondence,
        bank_connections: bankConnections,
        bank_transactions: bankTransactions,
        gmail_tokens: redactTokens(gmailTokens),
        outlook_tokens: redactTokens(outlookTokens),
        tasks,
        money_hub_budgets: budgets,
        money_hub_assets: assets,
        money_hub_liabilities: liabilities,
        money_hub_savings_goals: savingsGoals,
        user_points: points,
        referrals,
        nps_responses: npsResponses,
        chatbot_question_log: chatbotLogs,
        usage_logs: usageLogs,
        support_tickets: supportTickets,
        ticket_messages: ticketMessages,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    return NextResponse.json(exportData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GDPR export failed:', message);
    return NextResponse.json(
      { error: 'Export failed', detail: message },
      { status: 500 }
    );
  }
}
