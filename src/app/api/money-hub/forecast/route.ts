import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { predictMonthlyIncome } from '@/lib/income-prediction';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;

    // Parallel: income prediction + expected bills + current month actuals + last 3 months avg daily discretionary
    const [incomeForecast, billsRes, actualIncomeRes, actualSpendingRes, avgDailyRes] =
      await Promise.all([
        predictMonthlyIncome(user.id, year, month),
        admin.rpc('get_expected_bills', {
          p_user_id: user.id,
          p_year: year,
          p_month: month,
        }),
        admin.rpc('get_monthly_income_total', {
          p_user_id: user.id,
          p_year: year,
          p_month: month,
        }),
        admin.rpc('get_monthly_spending_total', {
          p_user_id: user.id,
          p_year: year,
          p_month: month,
        }),
        // Get last 3 months spending for daily average calculation
        Promise.all(
          [1, 2, 3].map((i) => {
            const d = new Date(year, month - 1 - i, 1);
            return admin.rpc('get_monthly_spending_total', {
              p_user_id: user.id,
              p_year: d.getFullYear(),
              p_month: d.getMonth() + 1,
            });
          })
        ),
      ]);

    const actualIncome = parseFloat(actualIncomeRes.data) || 0;
    const actualSpending = parseFloat(actualSpendingRes.data) || 0;

    // Process expected bills
    const rawBills = (billsRes.data || []).filter(
      (b: any) => b.occurrence_count >= 2 && b.occurrence_count <= 30
    );

    // Check which bills are paid
    const startOfMonth = new Date(year, month - 1, 1).toISOString();
    const { data: thisMonthTxns } = await admin
      .from('bank_transactions')
      .select('merchant_name, description, amount')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth);

    const paidMerchants = (thisMonthTxns || []).map((t) =>
      (t.merchant_name || t.description || '')
        .substring(0, 30)
        .toLowerCase()
    );

    const bills = rawBills.map((b: any) => {
      const name = (b.provider_name || '').toLowerCase().substring(0, 15);
      const paid = paidMerchants.some(
        (pm) => pm.includes(name) || name.includes(pm.substring(0, 8))
      );
      return {
        name: b.provider_name,
        amount: parseFloat(b.expected_amount) || 0,
        billing_day: b.billing_day,
        paid,
      };
    });

    const totalBillsExpected = bills.reduce((s: number, b: any) => s + b.amount, 0);
    const totalBillsPaid = bills
      .filter((b: any) => b.paid)
      .reduce((s: number, b: any) => s + b.amount, 0);
    const totalBillsRemaining = totalBillsExpected - totalBillsPaid;

    // Discretionary spending estimate (avg daily from last 3 months, minus recurring bills)
    const last3Totals = avgDailyRes
      .map((r) => parseFloat(r.data) || 0)
      .filter((v) => v > 0);
    const avgMonthlySpend =
      last3Totals.length > 0
        ? last3Totals.reduce((a, b) => a + b, 0) / last3Totals.length
        : actualSpending;
    const avgDailyDiscretionary =
      avgMonthlySpend > totalBillsExpected
        ? (avgMonthlySpend - totalBillsExpected) / 30
        : avgMonthlySpend / 30;
    const projectedDiscretionary = avgDailyDiscretionary * daysRemaining;

    // Projected end of month
    const projectedIncome = actualIncome + incomeForecast.totalStillExpected;
    const projectedSpending =
      actualSpending + totalBillsRemaining + projectedDiscretionary;
    const projectedNetPosition = projectedIncome - projectedSpending;

    // Get bank balance
    const { data: bankConns } = await admin
      .from('bank_connections')
      .select('current_balance, available_balance')
      .eq('user_id', user.id)
      .eq('status', 'active');
    const currentBalance = (bankConns || []).reduce(
      (s, c) => s + (parseFloat(String(c.current_balance)) || 0),
      0
    );

    // Get last month's data at same point for comparison
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const [prevIncomeRes, prevSpendingRes] = await Promise.all([
      admin.rpc('get_monthly_income_total', {
        p_user_id: user.id,
        p_year: prevYear,
        p_month: prevMonth,
      }),
      admin.rpc('get_monthly_spending_total', {
        p_user_id: user.id,
        p_year: prevYear,
        p_month: prevMonth,
      }),
    ]);

    // Scale previous month to same day for fair comparison
    const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
    const prevIncome = (parseFloat(prevIncomeRes.data) || 0) * (dayOfMonth / prevDaysInMonth);
    const prevSpending = (parseFloat(prevSpendingRes.data) || 0) * (dayOfMonth / prevDaysInMonth);

    return NextResponse.json({
      // Current actuals
      actualIncome: Math.round(actualIncome * 100) / 100,
      actualSpending: Math.round(actualSpending * 100) / 100,
      currentBalance: Math.round(currentBalance * 100) / 100,

      // Projections
      projectedIncome: Math.round(projectedIncome * 100) / 100,
      projectedSpending: Math.round(projectedSpending * 100) / 100,
      projectedNetPosition: Math.round(projectedNetPosition * 100) / 100,
      projectedDiscretionary: Math.round(projectedDiscretionary * 100) / 100,

      // Expected items
      incomeForecast: incomeForecast.predictions,
      expectedBills: bills,
      totalBillsRemaining: Math.round(totalBillsRemaining * 100) / 100,

      // Month progress
      dayOfMonth,
      daysInMonth,
      daysRemaining,
      monthProgress: Math.round((dayOfMonth / daysInMonth) * 100),

      // Comparisons to last month (at same point)
      vsLastMonth: {
        incomeChange:
          prevIncome > 0 ? Math.round(((actualIncome - prevIncome) / prevIncome) * 100) : null,
        spendingChange:
          prevSpending > 0
            ? Math.round(((actualSpending - prevSpending) / prevSpending) * 100)
            : null,
      },
    });
  } catch (err: any) {
    console.error('Forecast error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
