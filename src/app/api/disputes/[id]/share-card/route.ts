/**
 * GET /api/disputes/[id]/share-card
 *
 * Returns anonymised share copy + per-platform URLs for a won dispute.
 * Used by the "🎉 Share My Win" button on the disputes detail view.
 *
 * Auth: user must own the dispute.
 * Returns 403 unless the dispute outcome is 'won'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SHARE_URL = 'https://paybacker.co.uk/wins';

/** Map a dispute's provider_type / issue_type / category to a noun. */
function categoryToNoun(provider_type?: string | null, issue_type?: string | null): string {
  const raw = `${provider_type ?? ''} ${issue_type ?? ''}`.toLowerCase();
  if (/energy|electricity|gas|fuel/.test(raw)) return 'energy company';
  if (/broadband|internet|fibre|wifi/.test(raw)) return 'broadband provider';
  if (/mobile|phone|sim/.test(raw)) return 'mobile network';
  if (/gym|fitness|sport/.test(raw)) return 'gym';
  if (/insurance/.test(raw)) return 'insurance company';
  if (/streaming|subscription/.test(raw)) return 'subscription service';
  if (/travel|airline|hotel|flight/.test(raw)) return 'travel company';
  if (/council/.test(raw)) return 'local council';
  if (/bank|current_account/.test(raw)) return 'bank';
  return 'company';
}

function formatAmount(recovered: number | null, disputedPence: number | null): string | null {
  let value: number | null = null;
  if (typeof recovered === 'number' && Number.isFinite(recovered) && recovered > 0) {
    value = recovered;
  } else if (typeof disputedPence === 'number' && Number.isFinite(disputedPence) && disputedPence > 0) {
    value = disputedPence / 100;
  }
  if (value == null) return null;
  return `£${Math.round(value).toLocaleString('en-GB')}`;
}

function formatTimeWindow(createdAt: string, outcomeSetAt: string | null): string | null {
  if (!outcomeSetAt) return null;
  const start = new Date(createdAt).getTime();
  const end = new Date(outcomeSetAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const diffDays = (end - start) / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return 'in under 24 hours';
  if (diffDays < 7) return `in ${Math.max(1, Math.round(diffDays))} days`;
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: dispute, error } = await supabase
    .from('disputes')
    .select(
      'id, user_id, provider_type, issue_type, status, outcome, recovered_amount_gbp, money_recovered, disputed_amount, outcome_set_at, resolved_at, created_at',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const isWonOutcome =
    dispute.outcome === 'won' ||
    dispute.status === 'resolved_won' ||
    dispute.status === 'won';
  if (!isWonOutcome) {
    return NextResponse.json({ error: 'Dispute is not a won outcome' }, { status: 403 });
  }

  const noun = categoryToNoun(dispute.provider_type, dispute.issue_type);
  const recovered = dispute.recovered_amount_gbp != null
    ? Number(dispute.recovered_amount_gbp)
    : dispute.money_recovered != null
      ? Number(dispute.money_recovered)
      : null;
  const disputedPence = dispute.disputed_amount != null
    ? Math.round(Number(dispute.disputed_amount) * 100)
    : null;
  const amountText = formatAmount(recovered, disputedPence);

  const closedAt = (dispute.outcome_set_at as string | null) ?? (dispute.resolved_at as string | null) ?? null;
  const timeWindow = formatTimeWindow(dispute.created_at as string, closedAt);

  const moneyClause = amountText ? `${amountText} back` : 'money back';
  const timeClause = timeWindow ? ` and won ${timeWindow}` : ' and won';

  const tweet = `I just got ${moneyClause} from my ${noun}! 🎉 Disputed it with @PaybackerApp${timeClause}. #ConsumerRights #Paybacker`;
  const longBody = `Just used @PaybackerApp to dispute a charge with my ${noun} — and won! Got ${moneyClause}${timeWindow ? ` ${timeWindow}` : ''}. No lawyers, no stress, just a few taps. If you've ever been overcharged, you should try it. #ConsumerRights #Paybacker`;

  const tweetParams = new URLSearchParams({ text: tweet });
  const waParams = new URLSearchParams({ text: `${tweet} ${SHARE_URL}` });
  const liParams = new URLSearchParams({ url: SHARE_URL, summary: longBody });
  const fbParams = new URLSearchParams({ u: SHARE_URL, quote: longBody });

  return NextResponse.json({
    disputeId: id,
    noun,
    amountText,
    timeWindow,
    shareUrl: SHARE_URL,
    tweetCopy: tweet,
    bodyCopy: longBody,
    urls: {
      twitter: `https://twitter.com/intent/tweet?${tweetParams.toString()}`,
      whatsapp: `https://wa.me/?${waParams.toString()}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?${liParams.toString()}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?${fbParams.toString()}`,
    },
  });
}
