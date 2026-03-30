/**
 * Financial Health Score calculator.
 *
 * Produces a composite 0-100 score from five weighted components:
 *   - Profile completeness      (25%)
 *   - Subscription optimisation  (25%)
 *   - Price increase awareness   (20%)
 *   - Dispute activity           (15%)
 *   - Bank account connectivity  (15%)
 */

export interface ScoreComponent {
  name: string;
  score: number;       // 0-100 for this component
  maxScore: number;    // always 100
  weight: number;      // 0-1
  description: string;
}

export type ScoreTier = 'needs_attention' | 'getting_there' | 'good' | 'excellent';

export interface FinancialHealthResult {
  overallScore: number;
  tier: ScoreTier;
  tierLabel: string;
  tierColor: string;       // tailwind text colour class
  tierBgColor: string;     // tailwind bg colour class
  ringColor: string;       // hex for SVG ring
  components: ScoreComponent[];
}

interface ScoreInput {
  // Profile
  profileFields: { name: boolean; phone: boolean; address: boolean; postcode: boolean; email: boolean };

  // Subscriptions
  totalActiveSubscriptions: number;
  subscriptionsWithCheaperDeal: number;

  // Price alerts
  totalPriceAlerts: number;
  actionedPriceAlerts: number;

  // Disputes
  totalDisputes: number;
  // How many "opportunities" were available (action items / scanner findings)
  totalOpportunities: number;

  // Bank
  connectedBankAccounts: number;

  // Email
  connectedEmailAccounts: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTier(score: number): { tier: ScoreTier; label: string; color: string; bgColor: string; ring: string } {
  if (score >= 81) return { tier: 'excellent', label: 'Excellent', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', ring: '#34D399' };
  if (score >= 61) return { tier: 'good', label: 'Good', color: 'text-green-400', bgColor: 'bg-green-400/10', ring: '#4ADE80' };
  if (score >= 31) return { tier: 'getting_there', label: 'Getting There', color: 'text-amber-400', bgColor: 'bg-amber-400/10', ring: '#FBBF24' };
  return { tier: 'needs_attention', label: 'Needs Attention', color: 'text-red-400', bgColor: 'bg-red-400/10', ring: '#F87171' };
}

export function calculateFinancialHealthScore(input: ScoreInput): FinancialHealthResult {
  // 1. Profile completeness (25%)
  const profileFieldValues = Object.values(input.profileFields);
  const filledFields = profileFieldValues.filter(Boolean).length;
  const profileScore = Math.round((filledFields / profileFieldValues.length) * 100);

  // 2. Subscription optimisation (25%)
  // If no active subscriptions => 100 (nothing to optimise)
  // Otherwise: % of subs that DON'T have a cheaper alternative = optimised
  let subOptScore = 100;
  if (input.totalActiveSubscriptions > 0) {
    const optimised = input.totalActiveSubscriptions - input.subscriptionsWithCheaperDeal;
    subOptScore = Math.round((optimised / input.totalActiveSubscriptions) * 100);
  }

  // 3. Price increase awareness (20%)
  // If no price alerts => 100 (nothing to worry about)
  // Otherwise: % of alerts actioned
  let priceAwarenessScore = 100;
  if (input.totalPriceAlerts > 0) {
    priceAwarenessScore = Math.round((input.actionedPriceAlerts / input.totalPriceAlerts) * 100);
  }

  // 4. Dispute activity (15%)
  // If there are opportunities: score based on % pursued (filed disputes / opportunities)
  // If no opportunities: give full score (nothing to dispute)
  // Cap at 100 — if they've filed more disputes than opportunities, great
  let disputeScore = 100;
  if (input.totalOpportunities > 0) {
    disputeScore = clamp(Math.round((input.totalDisputes / input.totalOpportunities) * 100), 0, 100);
  } else if (input.totalDisputes > 0) {
    // They have disputes but we don't know about opportunities — proactive = good
    disputeScore = 100;
  }

  // 5. Bank connectivity (15%)
  // At least one bank = full score. Email connection gives a bonus within the score.
  let connectivityScore = 0;
  if (input.connectedBankAccounts > 0) {
    connectivityScore = 70; // bank connected = 70
    if (input.connectedBankAccounts >= 2) connectivityScore = 85;
  }
  if (input.connectedEmailAccounts > 0) {
    connectivityScore += 30; // email connected adds 30
  }
  connectivityScore = clamp(connectivityScore, 0, 100);

  const components: ScoreComponent[] = [
    {
      name: 'Profile Completeness',
      score: profileScore,
      maxScore: 100,
      weight: 0.25,
      description: `${filledFields}/${profileFieldValues.length} fields completed`,
    },
    {
      name: 'Subscription Optimisation',
      score: subOptScore,
      maxScore: 100,
      weight: 0.25,
      description: input.totalActiveSubscriptions > 0
        ? `${input.totalActiveSubscriptions - input.subscriptionsWithCheaperDeal}/${input.totalActiveSubscriptions} on best deals`
        : 'No active subscriptions to optimise',
    },
    {
      name: 'Price Increase Awareness',
      score: priceAwarenessScore,
      maxScore: 100,
      weight: 0.20,
      description: input.totalPriceAlerts > 0
        ? `${input.actionedPriceAlerts}/${input.totalPriceAlerts} alerts actioned`
        : 'No price increases detected',
    },
    {
      name: 'Dispute Activity',
      score: disputeScore,
      maxScore: 100,
      weight: 0.15,
      description: input.totalDisputes > 0
        ? `${input.totalDisputes} dispute${input.totalDisputes !== 1 ? 's' : ''} filed`
        : 'No disputes filed yet',
    },
    {
      name: 'Account Connectivity',
      score: connectivityScore,
      maxScore: 100,
      weight: 0.15,
      description: [
        input.connectedBankAccounts > 0 ? `${input.connectedBankAccounts} bank${input.connectedBankAccounts !== 1 ? 's' : ''} connected` : 'No bank connected',
        input.connectedEmailAccounts > 0 ? 'email connected' : '',
      ].filter(Boolean).join(', '),
    },
  ];

  const overallScore = Math.round(
    components.reduce((sum, c) => sum + c.score * c.weight, 0)
  );

  const tierInfo = getTier(overallScore);

  return {
    overallScore,
    tier: tierInfo.tier,
    tierLabel: tierInfo.label,
    tierColor: tierInfo.color,
    tierBgColor: tierInfo.bgColor,
    ringColor: tierInfo.ring,
    components,
  };
}
