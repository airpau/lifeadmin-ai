import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

async function safeSelect(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  value: string,
): Promise<any[]> {
  try {
    const { data, error } = await admin.from(table).select('*').eq(column, value);
    if (error) {
      console.error(`GDPR export: failed on ${table}:`, error.message);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const userId = user.id;

    // Fetch all user data in parallel, mirroring the tables from account/delete
    const [
      profile,
      bankTransactions,
      bankConnections,
      subscriptions,
      disputes,
      correspondence,
      contractExtractions,
      budgets,
      assets,
      liabilities,
      savingsGoals,
      categoryOverrides,
      alerts,
      challenges,
      points,
      referrals,
      supportTickets,
      ticketMessages,
      chatbotLog,
      npsResponses,
      tasks,
      detectedIssues,
      priceAlerts,
      subscriptionComparisons,
      verifiedSavings,
    ] = await Promise.all([
      safeSelect(admin, 'profiles', 'id', userId),
      safeSelect(admin, 'bank_transactions', 'user_id', userId),
      safeSelect(admin, 'bank_connections', 'user_id', userId),
      safeSelect(admin, 'subscriptions', 'user_id', userId),
      safeSelect(admin, 'disputes', 'user_id', userId),
      safeSelect(admin, 'correspondence', 'user_id', userId),
      safeSelect(admin, 'contract_extractions', 'user_id', userId),
      safeSelect(admin, 'money_hub_budgets', 'user_id', userId),
      safeSelect(admin, 'money_hub_assets', 'user_id', userId),
      safeSelect(admin, 'money_hub_liabilities', 'user_id', userId),
      safeSelect(admin, 'money_hub_savings_goals', 'user_id', userId),
      safeSelect(admin, 'money_hub_category_overrides', 'user_id', userId),
      safeSelect(admin, 'money_hub_alerts', 'user_id', userId),
      safeSelect(admin, 'user_challenges', 'user_id', userId),
      safeSelect(admin, 'user_points', 'user_id', userId),
      safeSelect(admin, 'referrals', 'user_id', userId),
      safeSelect(admin, 'support_tickets', 'user_id', userId),
      safeSelect(admin, 'ticket_messages', 'user_id', userId),
      safeSelect(admin, 'chatbot_question_log', 'user_id', userId),
      safeSelect(admin, 'nps_responses', 'user_id', userId),
      safeSelect(admin, 'tasks', 'user_id', userId),
      safeSelect(admin, 'detected_issues', 'user_id', userId),
      safeSelect(admin, 'price_increase_alerts', 'user_id', userId),
      safeSelect(admin, 'subscription_comparisons', 'user_id', userId),
      safeSelect(admin, 'verified_savings', 'user_id', userId),
    ]);

    // Strip sensitive fields from bank connections (tokens, secrets)
    const sanitisedConnections = bankConnections.map(({ access_token, refresh_token, token_expires_at, ...rest }) => rest);

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      email: user.email,
      profile: profile[0] || null,
      bank_transactions: bankTransactions,
      bank_connections: sanitisedConnections,
      subscriptions,
      disputes,
      correspondence,
      contract_extractions: contractExtractions,
      money_hub: {
        budgets,
        assets,
        liabilities,
        savings_goals: savingsGoals,
        category_overrides: categoryOverrides,
        alerts,
      },
      engagement: {
        challenges,
        points,
        referrals,
      },
      support: {
        tickets: supportTickets,
        messages: ticketMessages,
      },
      chatbot_history: chatbotLog,
      nps_responses: npsResponses,
      tasks,
      detected_issues: detectedIssues,
      price_increase_alerts: priceAlerts,
      subscription_comparisons: subscriptionComparisons,
      verified_savings: verifiedSavings,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="paybacker-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GDPR data export failed:', message);
    return NextResponse.json(
      { error: 'Data export failed', detail: message },
      { status: 500 },
    );
  }
}
