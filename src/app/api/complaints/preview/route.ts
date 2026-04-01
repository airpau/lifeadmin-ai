import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Simple in-memory rate limiting: 3 previews per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const SAMPLES: Record<string, string> = {
  energy:
    'I am writing to formally dispute the recent increase to my energy tariff, which I believe is unlawful under the Consumer Rights Act 2015 and Ofgem\'s Standards of Conduct. On [date], I was charged £[amount] — an increase of X% applied without the contractual notice period required. Under Condition 31 of the Standard Licence Conditions, you are obligated to provide a minimum of 30 days\' written notice before any price change. You failed to do so...',
  broadband:
    'I am writing to formally dispute the sustained degradation of service I have experienced since [date], and to request resolution or contract termination without penalty under Ofcom\'s General Conditions and the Consumer Rights Act 2015. Under Section 11 of the Consumer Rights Act, services must be provided with reasonable care and skill. The broadband speeds I have received have consistently fallen below the minimum guaranteed speed in my contract...',
  flight_delay:
    'I am writing to claim compensation under UK Regulation 261/2004, retained in UK law post-Brexit, for a delay of [X] hours experienced on flight [number] on [date]. Under Article 7 of this Regulation, I am entitled to £[220/350/520] compensation for a delay exceeding three hours at the final destination. The delay was not caused by extraordinary circumstances as defined under Article 5(3)...',
  subscription:
    'I am writing to formally request the cancellation of my subscription and a refund of all charges applied after my initial cancellation request on [date], pursuant to my rights under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 and the Consumer Rights Act 2015. Despite my clear written instruction to cancel, you have continued to charge my account. This constitutes an unauthorised transaction under the Payment Services Regulations 2017...',
  refund:
    'I am writing to formally demand a full refund of £[amount] paid on [date] for [item/service], which has failed to meet the standards required by the Consumer Rights Act 2015. Specifically, the [product/service] is not of satisfactory quality as required by Section 9, not fit for the purpose made known to you under Section 10, and not as described under Section 11. I exercised my statutory right to reject within 30 days of purchase...',
  council_tax:
    'I am writing to formally challenge my council tax banding, which I believe is incorrect based on comparable property values in my street. Under Section 24 of the Local Government Finance Act 1992, I have the right to make a proposal to alter the valuation list. Evidence I have gathered shows that [number] neighbouring properties of similar size and type are placed in Band [X], whereas my property is incorrectly placed in Band [Y]...',
  mobile:
    'I am writing to dispute the out-of-contract price increase applied to my tariff on [date] and to give notice of my intention to terminate my contract without early exit fees under Ofcom\'s General Conditions (Condition C1.3). Following your notification of a mid-contract price increase in excess of inflation, I am entitled under Ofcom rules to exit my contract without penalty. I gave notice on [date] within the required 30-day window...',
  parking:
    'I am writing to formally appeal against Parking Charge Notice [reference] issued on [date] at [location]. I respectfully submit that this charge is unenforceable for the following reasons: the signage at the site did not meet the requirements set out in the BPA Code of Practice / IPC Code of Practice, and the charge amount of £[X] is not a genuine pre-estimate of loss as required under Parking Eye Ltd v Beavis [2015] UKSC 67...',
  insurance:
    'I am writing to formally dispute the rejection of my insurance claim [reference] submitted on [date] and to request that you review this decision under your internal complaints procedure. You have cited [exclusion/reason] as the basis for rejection; however, I contend this interpretation is incorrect and unreasonable under the Consumer Insurance (Disclosure and Representations) Act 2012 and the FCA\'s Insurance Conduct of Business Sourcebook (ICOBS)...',
};

function getSample(category: string): string {
  return SAMPLES[category] ?? SAMPLES.refund;
}

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const existing = rateLimitMap.get(ip);

  if (existing) {
    if (now < existing.resetAt) {
      if (existing.count >= 3) {
        return NextResponse.json(
          { error: 'Too many previews. Sign up free to generate unlimited letters.' },
          { status: 429 },
        );
      }
      existing.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
  }

  let body: { category?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { category, description } = body;
  if (!category) {
    return NextResponse.json({ error: 'Category required' }, { status: 400 });
  }

  // Try real generation if API key available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && description && description.trim().length > 10) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        messages: [
          {
            role: 'user',
            content: `Write ONLY the opening paragraph of a formal UK consumer complaint letter. Issue: "${description}". Category: ${category}. Be assertive, cite a specific UK law or regulation, and make it feel real and personalised. End with "..." to indicate more follows. Output the paragraph only — no greeting, no header, no sign-off.`,
          },
        ],
      });

      const preview =
        message.content[0].type === 'text' ? message.content[0].text : '';
      if (preview.length > 50) {
        return NextResponse.json({ preview, generated: true });
      }
    } catch {
      // Fall through to sample
    }
  }

  // Return high-quality sample
  return NextResponse.json({ preview: getSample(category), generated: false });
}
