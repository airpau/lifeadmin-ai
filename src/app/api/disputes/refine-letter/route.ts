/**
 * POST /api/disputes/refine-letter
 *
 * Takes an existing dispute letter and a natural-language instruction
 * ("make it more polite", "add the £85 figure", "shorten to 3
 * paragraphs", etc.) and returns the refined letter.
 *
 * Body:
 *   { letter: string; instruction: string; disputeId?: string }
 *
 * Returns:
 *   { letter: string; usage?: { input_tokens, output_tokens } }
 *
 * Constraints:
 *   - Same plan + Claude rate limits as letter generation. Counts as a
 *     'complaint_generated' usage tick because it's a creative call,
 *     same cost shape.
 *   - Preserves the legal-citation footer + the standard disclaimer.
 *     The system prompt explicitly forbids inventing fake statutes.
 *   - Won't truncate the letter beyond ~8000 chars output. The prompt
 *     constrains the model to keep the structure familiar so the
 *     existing PDF / Copy / Telegram surfaces don't break.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall } from '@/lib/claude-rate-limit';

export const maxDuration = 60;

const REFINE_MODEL = 'claude-sonnet-4-6';

const REFINE_SYSTEM_PROMPT = `You are a UK consumer rights adviser refining an existing dispute letter at the user's request.

RULES:
1. Keep the structure (sender block, recipient, date, subject, body, sign-off) intact.
2. Apply the user's instruction faithfully. If they say "shorter", shorten. If they say "more assertive", change tone. If they say "add the £85 figure", weave it in where it fits.
3. NEVER invent or fabricate statutes, case names, regulator references, ombudsman names, or section numbers. If the original letter cited Consumer Rights Act 2015 s49, keep that exact citation; do not embellish to "s49(2)(a)" unless the user explicitly asked for that level of detail.
4. NEVER remove the legal-disclaimer footer if it was present in the input.
5. Output ONLY the refined letter — no preamble, no explanation, no markdown wrapping. The user pastes/sends the output directly.
6. UK English spelling and punctuation throughout.
7. Date stays as the original letter unless the user explicitly asks to update it.
8. Recipient and sender details stay the same unless the user explicitly asks to change them.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const letter: string = (body?.letter ?? '').toString();
    const instruction: string = (body?.instruction ?? '').toString().trim();

    if (!letter || letter.length < 50) {
      return NextResponse.json(
        { error: 'A letter is required (at least 50 characters).' },
        { status: 400 },
      );
    }
    if (!instruction || instruction.length < 3) {
      return NextResponse.json(
        { error: 'Tell us what to change — e.g. "make it more polite" or "add the £85 figure".' },
        { status: 400 },
      );
    }
    if (instruction.length > 500) {
      return NextResponse.json(
        { error: 'Instruction is too long — keep it under 500 characters.' },
        { status: 400 },
      );
    }

    // Plan + Claude rate limits. Refining counts as a complaint_generated
    // tick because it's a creative call with the same cost profile.
    const isAdmin = user.email === 'aireypaul@googlemail.com';
    if (!isAdmin) {
      const usage = await checkUsageLimit(user.id, 'complaint_generated');
      if (!usage.allowed) {
        return NextResponse.json(
          { error: 'You\'ve hit your monthly letter limit. Upgrade for unlimited.', upgradeRequired: true, used: usage.used, limit: usage.limit },
          { status: 403 },
        );
      }
      const rate = await checkClaudeRateLimit(user.id, usage.tier);
      if (!rate.allowed) {
        return NextResponse.json({ error: 'Rate limit exceeded — try again in a moment.' }, { status: 429 });
      }
    }

    // Cap the input letter at 8k chars so we don't blow the context.
    // 8k is enough for the longest letters we generate (typically 1.5k-3k).
    const truncatedLetter = letter.length > 8000 ? letter.slice(0, 8000) : letter;

    const userPrompt = `INSTRUCTION FROM USER: ${instruction}

ORIGINAL LETTER:
${truncatedLetter}

Apply the instruction. Output ONLY the refined letter, no commentary.`;

    logClaudeCall({
      userId: user.id,
      route: '/api/disputes/refine-letter',
      model: REFINE_MODEL,
      estimatedInputTokens: Math.round((REFINE_SYSTEM_PROMPT.length + userPrompt.length) / 4),
      estimatedOutputTokens: Math.round(truncatedLetter.length / 3.5), // refined letter typically same shape
    });

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: REFINE_MODEL,
      max_tokens: 4096,
      system: REFINE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = message.content[0];
    if (content?.type !== 'text') {
      return NextResponse.json({ error: 'Empty response from model.' }, { status: 502 });
    }

    if (!isAdmin) {
      const tier = (await checkUsageLimit(user.id, 'complaint_generated')).tier;
      await recordClaudeCall(user.id, tier);
      await incrementUsage(user.id, 'complaint_generated');
    }

    return NextResponse.json({
      letter: content.text.trim(),
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[refine-letter] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
