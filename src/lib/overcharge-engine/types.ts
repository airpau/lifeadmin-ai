export interface OverchargeSignal {
  type: 'price_increase' | 'above_market' | 'contract_expired' | 'category_benchmark';
  weight: number;
  score: number; // 0-100
  detail: string;
  data?: Record<string, unknown>;
}

export interface OverchargeScore {
  score: number; // 0-100 weighted average
  confidence: 'high' | 'medium' | 'low';
  estimatedAnnualSaving: number;
}

export interface OverchargeAssessment {
  userId: string;
  subscriptionId: string;
  merchantName: string;
  category: string | null;
  currentMonthly: number;
  currentAnnual: number;
  marketAvgMonthly: number | null;
  marketBestMonthly: number | null;
  historicalAvgMonthly: number | null;
  overchargeScore: number;
  confidence: 'high' | 'medium' | 'low';
  estimatedAnnualSaving: number;
  signals: OverchargeSignal[];
  bestDealProvider: string | null;
  bestDealUrl: string | null;
  bestDealMonthly: number | null;
  expiresAt: string; // ISO date, 7 days from assessment
}

export interface SubscriptionForAssessment {
  id: string;
  user_id: string;
  provider_name: string;
  category: string | null;
  category_normalized: string | null;
  provider_type: string | null;
  amount: number;
  billing_cycle: string | null;
  contract_end_date: string | null;
  status: string;
}
