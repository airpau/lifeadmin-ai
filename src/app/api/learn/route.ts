import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { learnFromCorrection } from '@/lib/learning-engine';

export const runtime = 'nodejs';

/**
 * POST /api/learn
 *
 * Accepts user corrections to transaction categorisation and feeds them
 * into the self-learning engine. Each correction creates or updates a
 * merchant_rules row that is then applied across all users.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { rawName, displayName, category, providerType, isSubscription, isTransfer, incomeType, amount } = body;

    if (!rawName) {
      return NextResponse.json({ error: 'rawName is required' }, { status: 400 });
    }

    const rule = await learnFromCorrection({
      rawName,
      displayName,
      category,
      providerType,
      isSubscription,
      isTransfer,
      incomeType,
      amount: amount !== undefined ? parseFloat(amount) : undefined,
      userId: user.id,
    });

    if (!rule) {
      return NextResponse.json({ error: 'Failed to save rule' }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule });
  } catch (err: any) {
    console.error('Learn API error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
