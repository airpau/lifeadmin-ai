export type NormalizedTier = 'free' | 'essential' | 'pro';

export function normalizeTier(tier: string | null | undefined): NormalizedTier {
  switch ((tier ?? '').toLowerCase()) {
    case 'pro':
    case 'plus': // legacy name — treat as pro
      return 'pro';
    case 'essential':
      return 'essential';
    default:
      return 'free';
  }
}

export function tierDisplayName(tier: string | null | undefined): string {
  switch (normalizeTier(tier)) {
    case 'pro': return 'Pro';
    case 'essential': return 'Essential';
    default: return 'Free';
  }
}
