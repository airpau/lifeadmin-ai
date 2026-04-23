/**
 * POST /api/opportunities/cancellation-advice
 *
 * Given a supplier/service name (and an optional description hint), returns
 * 4–6 short bullet-point steps on how to cancel or dispute with that
 * supplier in the UK. Backs the "How to cancel" panel in the Opportunity
 * drawer on the Overview page.
 *
 * In-memory cache per Vercel instance keyed by normalised provider — cold
 * starts miss, but steady-state traffic from the drawer hits cache after
 * the first open. Good enough for the launch; revisit with a persisted
 * cache if call volume climbs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface CacheEntry {
  advice: string[];
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, CacheEntry>();

function normalise(provider: string): string {
  return provider
    .toLowerCase()
    .replace(/\s+(ltd|limited|plc|inc|llc|co\.?|uk)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured' },
      { status: 503 },
    );
  }

  let body: { provider?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const provider = (body.provider ?? '').trim();
  if (!provider) {
    return NextResponse.json({ error: 'provider is required' }, { status: 400 });
  }

  const key = normalise(provider);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json({ advice: hit.advice, cached: true });
  }

  const context = body.description ? `\nContext from user's email: ${body.description.slice(0, 500)}` : '';
  const prompt = `You are advising a UK consumer on how to cancel or dispute a service with "${provider}".${context}

Produce 4–6 numbered bullet points giving the clearest, fastest route to cancel. Each bullet should be one sentence, max ~25 words. Cite the specific UK consumer right that applies where relevant (e.g. Consumer Rights Act 2015, Consumer Contracts Regulations 2013 — 14-day cooling-off, Ofcom switching code, Ofgem cooling-off). Prefer concrete instructions: a URL to use, a phone number type to dial, a specific form to send.

Reply with ONLY the bullets, one per line, starting "1. ", "2. ", etc. No preamble, no closing.`;

  try {
    const res = await anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('\n')
      .trim();
    const advice = text
      .split('\n')
      .map((l) => l.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean);

    if (advice.length === 0) {
      return NextResponse.json(
        { error: 'No advice generated' },
        { status: 502 },
      );
    }

    cache.set(key, { advice, expiresAt: Date.now() + TTL_MS });
    return NextResponse.json({ advice, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cancellation-advice] Claude call failed:', msg);
    return NextResponse.json(
      { error: 'Failed to generate advice' },
      { status: 502 },
    );
  }
}
