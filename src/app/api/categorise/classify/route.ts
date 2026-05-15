// POST /api/categorise/classify
//
// AI-powered transaction categoriser. Takes a merchant name, description,
// amount, and whether the account is a business account, and returns the
// best-fit category. Results are cached in merchant_category_wisdom.
//
// Designed to be called:
//   a) From the bank sync route for uncategorised transactions (batched)
//   b) From the UI when the user wants a suggested category

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { categoryListFormatted } from '@/lib/categories';
import { auto_categorise_business_transaction } from '@/lib/money-hub-classification';
import { detectFallbackSpendingCategory } from '@/lib/money-hub-classification';

export const runtime = 'nodejs';
export const maxDuration = 30;

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalisePattern(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .substring(0, 60);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const {
    merchant_name,
    description,
    amount,
    is_business_account = false,
    transaction_id,
  } = body as {
    merchant_name?: string;
    description?: string;
    amount?: number;
    is_business_account?: boolean;
    transaction_id?: string;
  };

  if (!merchant_name && !description) {
    return NextResponse.json({ error: 'merchant_name or description required' }, { status: 400 });
  }

  const admin = getAdmin();
  const combinedDesc = [merchant_name, description].filter(Boolean).join(' ');
  const pattern = normalisePattern(merchant_name || description || '');

  // ── 1. Check wisdom table first ───────────────────────────────────────────
  const { data: wisdom } = await admin
    .from('merchant_category_wisdom')
    .select('suggested_category, confidence, vote_count')
    .eq('merchant_pattern', pattern)
    .maybeSingle();

  if (wisdom && wisdom.confidence >= 0.7 && wisdom.vote_count >= 3) {
    return NextResponse.json({
      category: wisdom.suggested_category,
      confidence: wisdom.confidence,
      source: 'wisdom',
      auto_applied: true,
    });
  }

  if (wisdom && wisdom.confidence >= 0.4) {
    // Suggestion only — not auto-applied
    return NextResponse.json({
      category: wisdom.suggested_category,
      confidence: wisdom.confidence,
      source: 'wisdom_suggestion',
      auto_applied: false,
    });
  }

  // ── 2. Try keyword rules (fast, free) ────────────────────────────────────
  if (is_business_account && amount !== undefined) {
    const bizCat = auto_categorise_business_transaction(combinedDesc, amount);
    if (bizCat) {
      // Cache this as a system entry in wisdom
      await admin.rpc('upsert_merchant_wisdom', {
        p_pattern: pattern,
        p_category: bizCat,
        p_source: 'system',
      });
      return NextResponse.json({
        category: bizCat,
        confidence: 0.8,
        source: 'keyword_business',
        auto_applied: true,
      });
    }
  }

  const keywordCat = detectFallbackSpendingCategory(combinedDesc);
  if (keywordCat && keywordCat !== 'other') {
    await admin.rpc('upsert_merchant_wisdom', {
      p_pattern: pattern,
      p_category: keywordCat,
      p_source: 'system',
    });
    return NextResponse.json({
      category: keywordCat,
      confidence: 0.75,
      source: 'keyword',
      auto_applied: true,
    });
  }

  // ── 3. AI classification (Claude haiku) ──────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ category: 'other', confidence: 0.1, source: 'fallback', auto_applied: false });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const context = is_business_account
      ? 'This transaction is from a BUSINESS bank account. Prefer business categories (wages, business_rates, professional_services, accountancy, legal_fees, equipment, marketing, vat_payment, corporation_tax, business_insurance, business_income, client_payment, director_salary, dividend) when appropriate.'
      : 'This transaction is from a personal bank account.';

    const prompt = `Categorise this UK bank transaction. Return ONLY the category ID (one word/phrase from the list), nothing else.

${context}

Transaction:
- Merchant/Payee: ${merchant_name || 'unknown'}
- Description: ${description || 'unknown'}
- Amount: ${amount !== undefined ? (amount > 0 ? `+£${Math.abs(amount)}` : `-£${Math.abs(amount ?? 0)}`) : 'unknown'}

Available categories:
${categoryListFormatted()}

Return only the category ID, e.g.: groceries`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (msg.content[0] as { type: string; text?: string })?.text?.trim().toLowerCase() || 'other';
    // Clean up any extra words
    const category = raw.split(/\s+/)[0].replace(/[^a-z_]/g, '') || 'other';

    // Cache in wisdom table
    await admin.rpc('upsert_merchant_wisdom', {
      p_pattern: pattern,
      p_category: category,
      p_source: 'ai',
    });

    return NextResponse.json({
      category,
      confidence: 0.6,
      source: 'ai',
      auto_applied: false, // AI results are suggestions unless wisdom confirms
    });
  } catch (err) {
    console.error('[classify] AI error:', err);
    return NextResponse.json({ category: 'other', confidence: 0.1, source: 'fallback', auto_applied: false });
  }
}
