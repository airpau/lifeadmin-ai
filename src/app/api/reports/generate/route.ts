import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/get-user-plan';
import { isAtLeastPro } from '@/lib/tier-rank';
import {
  generateAnnualReportData,
  generateOnDemandReportData,
  type AnnualReportData,
} from '@/lib/report-generator';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';
// Report generation runs ~30 DB queries plus one Claude call for the
// executive summary. 60s gives comfortable headroom over Vercel's
// default serverless timeout.
export const maxDuration = 60;

const SUMMARY_MODEL = 'claude-sonnet-4-6';

/**
 * Ask Claude to write the executive summary and 3-5 next actions from
 * the already-generated report data. Best effort: any failure leaves
 * the template summary and data-driven next actions in place.
 */
async function writeAiExecutiveSummary(
  data: AnnualReportData,
  userId: string,
): Promise<{ summary: string; nextActions: string[] } | null> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const facts = {
      window: data.reportWindow?.label || 'the last 12 months',
      totalIncome: data.totalIncome,
      totalSpending: data.totalOutgoings,
      netPosition: data.netPosition,
      savingsRatePct: data.totalIncome > 0
        ? Number((((data.totalIncome - data.totalOutgoings) / data.totalIncome) * 100).toFixed(1))
        : null,
      topSpendingCategories: data.spendingByCategory.slice(0, 3).map(c => ({ label: c.label, total: c.total })),
      activeSubscriptions: data.activeSubscriptions,
      monthlySubscriptionCost: data.monthlySubscriptionCost,
      priceIncreasesDetected: data.priceAlerts.length,
      priceIncreaseAnnualImpact: data.totalPriceIncreaseImpact,
      potentialAnnualSavings: data.potentialAnnualSavings,
      topSavingsActions: data.savingsActions.slice(0, 5).map(a => ({
        action: a.action, provider: a.provider, description: a.description, annualSaving: a.annualSaving,
      })),
      disputes: data.disputesDetail ?? { totalDisputes: data.totalDisputes, totalRecovered: 0 },
      verifiedSavings: data.verifiedSavings ?? null,
      emailFindings: data.emailFindings ?? null,
      upcomingPayments30Days: data.upcomingPayments
        ? { count: data.upcomingPayments.next30DayCount, totalCommitted: data.upcomingPayments.totalCommitted }
        : null,
      netWorth: data.netWorth ?? null,
      projectedAnnualSpend: data.projectedAnnualSpend,
      yearOverYear: data.yoy,
    };

    const prompt = `You are writing the executive summary for a UK consumer's personal financial report in the Paybacker app. Here are the report's facts as JSON:

${JSON.stringify(facts, null, 2)}

Write a JSON object with exactly two keys:
1. "summary": an executive summary of 150-250 words. Plain English, British spelling, warm but factual. Reference concrete numbers from the facts (with £ signs). Cover: overall income vs spending, the savings rate, the biggest spending category, subscriptions, any price increases detected, disputes and money recovered, and the total potential savings identified.
2. "nextActions": an array of 3 to 5 short next actions (each one sentence), drawn only from the facts, most valuable first.

Strict rules:
- General information and generic guidance only. You are NOT a financial adviser and must NOT give regulated financial advice. Never tell the user to switch, move or choose a specific mortgage, pension, investment, or other regulated product. Suggesting they review a subscription, chase a dispute, or compare deals for utilities and media services is fine.
- Do not invent numbers. Only use figures present in the facts.
- Do not use em dashes or en dashes anywhere. Use commas, colons or full stops instead.
- Do not use emojis.
- Respond with the JSON object only, no markdown fences.`;

    const message = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    // Fire-and-forget cost ledger entry (never throws)
    try {
      const { logAnthropicCall } = await import('@/lib/cost-ledger');
      logAnthropicCall({
        model: SUMMARY_MODEL,
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
        endpoint: '/api/reports/generate',
        userId,
        metadata: { purpose: 'annual_report_executive_summary' },
      });
    } catch { /* never throw from cost-ledger */ }

    const content = message.content[0];
    if (content.type !== 'text') return null;
    let raw = content.text.trim();
    // Strip accidental markdown fences
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(raw) as { summary?: unknown; nextActions?: unknown };

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const nextActions = Array.isArray(parsed.nextActions)
      ? parsed.nextActions.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).slice(0, 5)
      : [];

    if (!summary) return null;
    // Belt-and-braces: strip any dashes the model slipped through.
    const clean = (s: string) => s.replace(/—|–/g, ',');
    return { summary: clean(summary), nextActions: nextActions.map(clean) };
  } catch (err) {
    console.warn('[reports/generate] AI executive summary failed, using template fallback:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, year } = await req.json();

    if (!type || !['annual', 'on_demand', 'summary'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "annual", "on_demand", or "summary".' },
        { status: 400 }
      );
    }

    // Pro users only.
    // isAtLeastPro, not !== 'pro' — Household is entitled to this too.
    const plan = await getUserPlan(user.id);
    if (!isAtLeastPro(plan.tier)) {
      return NextResponse.json(
        { error: 'Financial reports are available on the Pro plan.' },
        { status: 403 }
      );
    }

    // Quick Summary / On-demand — same enriched data, not saved to DB
    if (type === 'on_demand' || type === 'summary') {
      const data = await generateOnDemandReportData(user.id);
      return NextResponse.json({ type: 'on_demand', data });
    }

    // Annual report — generate + save to DB
    const reportYear = year || new Date().getFullYear();
    const data = await generateAnnualReportData(user.id, reportYear);

    // AI executive summary + next actions. Falls back to the template
    // summary and data-driven next actions already on `data`.
    const ai = await writeAiExecutiveSummary(data, user.id);
    if (ai) {
      data.executiveSummary = ai.summary;
      if (ai.nextActions.length > 0) data.nextActions = ai.nextActions;
    }

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: saved } = await admin
      .from('annual_reports')
      .insert({
        user_id: user.id,
        report_type: 'annual',
        year: reportYear,
        data,
      })
      .select('id')
      .single();

    return NextResponse.json({ type: 'annual', data, reportId: saved?.id ?? null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Report generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
