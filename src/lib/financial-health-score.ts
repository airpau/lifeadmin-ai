/**
 * Financial Health Score v2
 * Based on FinHealth Score framework: Spend, Save, Borrow, Plan
 */

export interface ScoreInput {
  monthlyIncome: number;
  monthlyOutgoings: number;
  budgets: Array<{ monthly_limit: number; spent: number }>;
  monthlyTrends: Array<{ income: number; outgoings: number }>;
  liquidSavings: number;
  goals: Array<{ target_amount: number; current_amount: number }>;
  totalMonthlyDebtPayments: number;
  totalDebt: number;
  previousMonthDebt: number;
  creditCardBalance: number;
  creditCardLimit: number;
  expectedBillsPaid: number;
  expectedBillsTotal: number;
  contractsTracked: number;
  contractsTotal: number;
  alertsActioned: number;
  alertsTotal: number;
}

export interface PillarMetric {
  name: string;
  score: number;
  weight: number;
  tip: string;
}

export interface PillarScore {
  score: number;
  label: string;
  metrics: PillarMetric[];
}

export interface HealthScore {
  overall: number;
  tier: 'vulnerable' | 'coping' | 'healthy';
  pillars: {
    spend: PillarScore;
    save: PillarScore;
    borrow: PillarScore;
    plan: PillarScore;
  };
}

export function calculateHealthScore(input: ScoreInput): HealthScore {
  const spend = calculateSpendPillar(input);
  const save = calculateSavePillar(input);
  const borrow = calculateBorrowPillar(input);
  const plan = calculatePlanPillar(input);

  const overall = Math.round(spend.score * 0.25 + save.score * 0.25 + borrow.score * 0.25 + plan.score * 0.25);
  const tier = overall >= 80 ? 'healthy' : overall >= 40 ? 'coping' : 'vulnerable';

  return { overall, tier, pillars: { spend, save, borrow, plan } };
}

function calculateSpendPillar(input: ScoreInput): PillarScore {
  // Savings rate (40%)
  let savingsRateScore = 50;
  let savingsRateTip = 'Connect your bank to track income and spending';
  if (input.monthlyIncome > 0) {
    const rate = (input.monthlyIncome - input.monthlyOutgoings) / input.monthlyIncome;
    if (rate >= 0.2) savingsRateScore = 100;
    else if (rate >= 0.1) savingsRateScore = 50 + Math.round(((rate - 0.1) / 0.1) * 50);
    else if (rate >= 0) savingsRateScore = Math.round((rate / 0.1) * 50);
    else savingsRateScore = Math.max(0, Math.round(25 + rate * 50));
    const pct = Math.round(rate * 100);
    if (pct < 10) savingsRateTip = `Savings rate is ${pct}%. Aim for at least 10%.`;
    else if (pct < 20) savingsRateTip = `${pct}% savings rate — good! Push for 20%.`;
    else savingsRateTip = `Excellent ${pct}% savings rate.`;
  }

  // Budget adherence (30%)
  let budgetScore = 50;
  let budgetTip = 'Set budgets for your top spending categories.';
  if (input.budgets.length > 0) {
    const onTrack = input.budgets.filter((b) => b.spent <= b.monthly_limit).length;
    budgetScore = Math.round((onTrack / input.budgets.length) * 100);
    const over = input.budgets.length - onTrack;
    budgetTip = over > 0 ? `${over} budget${over > 1 ? 's' : ''} over limit.` : 'All budgets on track!';
  }

  // Spending volatility (30%)
  let volScore = 60;
  let volTip = 'More data needed to assess stability.';
  if (input.monthlyTrends.length >= 3) {
    const outs = input.monthlyTrends.map((t) => t.outgoings).filter((o) => o > 0);
    if (outs.length >= 3) {
      const mean = outs.reduce((a, b) => a + b, 0) / outs.length;
      const variance = outs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / outs.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      volScore = Math.round(Math.max(0, Math.min(100, (1 - cv * 2) * 100)));
      volTip = cv > 0.3 ? 'Spending varies a lot. Try to stabilise.' : cv > 0.15 ? 'Moderately stable spending.' : 'Very consistent spending.';
    }
  }

  return {
    score: Math.round(savingsRateScore * 0.4 + budgetScore * 0.3 + volScore * 0.3),
    label: 'Spend',
    metrics: [
      { name: 'Savings Rate', score: savingsRateScore, weight: 40, tip: savingsRateTip },
      { name: 'Budget Adherence', score: budgetScore, weight: 30, tip: budgetTip },
      { name: 'Spending Stability', score: volScore, weight: 30, tip: volTip },
    ],
  };
}

function calculateSavePillar(input: ScoreInput): PillarScore {
  // Emergency fund (50%)
  let efScore = 50;
  let efTip = 'Add savings accounts to track your emergency fund.';
  if (input.monthlyOutgoings > 0) {
    const months = input.liquidSavings / input.monthlyOutgoings;
    if (months >= 6) efScore = 100;
    else if (months >= 3) efScore = 75 + Math.round(((months - 3) / 3) * 25);
    else efScore = Math.round((months / 3) * 75);
    efTip =
      months < 1
        ? 'Less than 1 month saved. Aim for 3.'
        : months < 3
          ? `${months.toFixed(1)} months. Goal is 3-6.`
          : months < 6
            ? `${months.toFixed(1)} months — solid!`
            : `${months.toFixed(1)} months covered. Excellent!`;
  }

  // Goals progress (30%)
  let goalsScore = 40;
  let goalsTip = 'Create a savings goal to start tracking.';
  if (input.goals.length > 0) {
    const avg = input.goals.reduce((s, g) => s + Math.min(1, g.target_amount > 0 ? g.current_amount / g.target_amount : 0), 0) / input.goals.length;
    goalsScore = Math.round(avg * 100);
    goalsTip = avg < 0.25 ? 'Goals are early stage. Keep going!' : avg < 0.75 ? 'Good progress on goals.' : 'Goals nearly complete!';
  }

  // Net worth trend (20%)
  let trendScore = 60;
  let trendTip = 'More months of data needed.';
  if (input.monthlyTrends.length >= 3) {
    const nets = input.monthlyTrends.slice(-3).map((t) => t.income - t.outgoings);
    const avg = nets.reduce((a, b) => a + b, 0) / nets.length;
    trendScore =
      avg > 0
        ? Math.min(100, 60 + Math.round((avg / (input.monthlyIncome || 1000)) * 100))
        : Math.max(20, 60 + Math.round((avg / (input.monthlyIncome || 1000)) * 100));
    trendTip = avg > 0 ? 'Financial position trending upward.' : 'Outgoings exceeding income recently.';
  }

  return {
    score: Math.round(efScore * 0.5 + goalsScore * 0.3 + trendScore * 0.2),
    label: 'Save',
    metrics: [
      { name: 'Emergency Fund', score: efScore, weight: 50, tip: efTip },
      { name: 'Goals Progress', score: goalsScore, weight: 30, tip: goalsTip },
      { name: 'Net Worth Trend', score: trendScore, weight: 20, tip: trendTip },
    ],
  };
}

function calculateBorrowPillar(input: ScoreInput): PillarScore {
  // DTI (50%)
  let dtiScore = 100;
  let dtiTip = 'No debt detected.';
  if (input.totalMonthlyDebtPayments > 0 && input.monthlyIncome > 0) {
    const dti = input.totalMonthlyDebtPayments / input.monthlyIncome;
    if (dti <= 0.2) dtiScore = 100 - Math.round((dti / 0.2) * 30);
    else if (dti <= 0.4) dtiScore = 70 - Math.round(((dti - 0.2) / 0.2) * 50);
    else dtiScore = Math.max(0, 20 - Math.round((dti - 0.4) * 50));
    const pct = Math.round(dti * 100);
    dtiTip = pct > 40 ? `${pct}% of income to debt — high.` : pct > 20 ? `${pct}% DTI. Try to reduce below 20%.` : `Healthy ${pct}% debt ratio.`;
  }

  // Debt direction (30%)
  let debtDir = 60;
  let debtTip = 'Track debt to see trend.';
  if (input.totalDebt === 0) {
    debtDir = 100;
    debtTip = 'Debt free!';
  } else if (input.previousMonthDebt > 0) {
    debtDir = input.totalDebt < input.previousMonthDebt ? 100 : input.totalDebt === input.previousMonthDebt ? 60 : 20;
    debtTip = input.totalDebt < input.previousMonthDebt ? 'Debt decreasing!' : input.totalDebt === input.previousMonthDebt ? 'Debt stable.' : 'Debt increasing.';
  }

  // Credit utilisation (20%)
  let creditScore = 80;
  let creditTip = 'No credit cards tracked.';
  if (input.creditCardLimit > 0) {
    const util = input.creditCardBalance / input.creditCardLimit;
    creditScore =
      util <= 0.3
        ? 100
        : util <= 0.7
          ? Math.round(100 - ((util - 0.3) / 0.4) * 60)
          : Math.max(0, Math.round(40 - ((util - 0.7) / 0.3) * 40));
    const pct = Math.round(util * 100);
    creditTip = pct > 70 ? `${pct}% utilisation — very high.` : pct > 30 ? `${pct}% — aim for under 30%.` : `${pct}% — well managed.`;
  }

  return {
    score: Math.round(dtiScore * 0.5 + debtDir * 0.3 + creditScore * 0.2),
    label: 'Borrow',
    metrics: [
      { name: 'Debt-to-Income', score: dtiScore, weight: 50, tip: dtiTip },
      { name: 'Debt Direction', score: debtDir, weight: 30, tip: debtTip },
      { name: 'Credit Utilisation', score: creditScore, weight: 20, tip: creditTip },
    ],
  };
}

function calculatePlanPillar(input: ScoreInput): PillarScore {
  let billsScore = 50;
  let billsTip = 'Connect your bank to track bills.';
  if (input.expectedBillsTotal > 0) {
    billsScore = Math.round((input.expectedBillsPaid / input.expectedBillsTotal) * 100);
    const unpaid = input.expectedBillsTotal - input.expectedBillsPaid;
    billsTip = unpaid > 0 ? `${unpaid} bill${unpaid > 1 ? 's' : ''} pending.` : 'All bills paid!';
  }

  let contractScore = 50;
  let contractTip = 'Add contract details to score higher.';
  if (input.contractsTotal > 0) {
    contractScore = Math.round((input.contractsTracked / input.contractsTotal) * 100);
    contractTip = contractScore < 70 ? 'Some payments lack contract details.' : 'Great contract tracking!';
  }

  let actionsScore = 50;
  let actionsTip = 'Take action on alerts to boost this.';
  if (input.alertsTotal > 0) {
    actionsScore = Math.round((input.alertsActioned / input.alertsTotal) * 100);
    actionsTip = actionsScore < 50 ? 'Unactioned alerts. Review them.' : 'Good engagement!';
  } else {
    actionsScore = 70;
    actionsTip = 'No alerts — finances look clean.';
  }

  return {
    score: Math.round(billsScore * 0.4 + contractScore * 0.3 + actionsScore * 0.3),
    label: 'Plan',
    metrics: [
      { name: 'Bills Managed', score: billsScore, weight: 40, tip: billsTip },
      { name: 'Contract Tracking', score: contractScore, weight: 30, tip: contractTip },
      { name: 'Actions Taken', score: actionsScore, weight: 30, tip: actionsTip },
    ],
  };
}
