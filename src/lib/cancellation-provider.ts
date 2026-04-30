/**
 * Branch-aware cancellation intelligence helper.
 *
 * On subscription creation we fire-and-forget `researchCancellationForProvider`
 * which checks the cache, and if missing, asks Perplexity for the cancellation
 * details. UK chains often have per-branch contacts (gyms in particular), so
 * when a city name is found in the provider string we ask explicitly for the
 * branch contact.
 */

import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js';

// ~30 common UK cities — used to detect branch-specific provider names like
// "PureGym Manchester Deansgate" or "David Lloyd Oxford".
export const UK_CITIES = [
  'london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'liverpool',
  'bristol', 'sheffield', 'edinburgh', 'cardiff', 'belfast', 'newcastle',
  'nottingham', 'southampton', 'portsmouth', 'brighton', 'oxford',
  'cambridge', 'reading', 'winchester', 'bath', 'york', 'leicester',
  'coventry', 'derby', 'plymouth', 'aberdeen', 'dundee', 'norwich',
  'exeter',
];

export function detectUkCity(providerName: string): string | null {
  const lower = providerName.toLowerCase();
  for (const city of UK_CITIES) {
    // Word-boundary match so "Brighton" matches but "Bath" doesn't trigger
    // on "BatHQ" or similar.
    const re = new RegExp(`\\b${city}\\b`, 'i');
    if (re.test(lower)) return city.charAt(0).toUpperCase() + city.slice(1);
  }
  return null;
}

export function providerKey(providerName: string): string {
  return providerName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}

export function buildCancellationPrompt(providerName: string): string {
  const city = detectUkCity(providerName);
  if (city) {
    // Strip the city to get the chain name for the prompt
    const chain = providerName.replace(new RegExp(`\\b${city}\\b`, 'i'), '').trim() || providerName;
    return `Find the cancellation contact for the **${city}** branch of ${chain} specifically — branch email, branch phone, branch URL. Many UK chains have per-branch contacts; corporate-only details are not acceptable. Return JSON: {"method":"...","email":"branch@...","phone":"...","url":"https://...","tips":"...","notice_period_days":30}. Use null where unknown.`;
  }
  return `Find the UK cancellation contact for "${providerName}": cancellation method, email address, phone number, direct cancellation URL, any tips (notice period, exit fees, common gotchas), and notice period in days. Return strict JSON only: {"method":"...","email":"...","phone":"...","url":"...","tips":"...","notice_period_days":null}. Use null for unknown fields.`;
}

interface CancellationLookup {
  method: string | null;
  email: string | null;
  phone: string | null;
  url: string | null;
  tips: string | null;
  notice_period_days: number | null;
}

async function askPerplexity(prompt: string): Promise<CancellationLookup | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('[cancellation-provider] PERPLEXITY_API_KEY not set');
    return null;
  }

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a UK consumer-rights research assistant. Return STRICT JSON only — no markdown, no explanation. If unsure, use null. Verify details from official sources.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      console.error(`[cancellation-provider] Perplexity returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      method: parsed.method ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      url: parsed.url ?? null,
      tips: parsed.tips ?? null,
      notice_period_days: typeof parsed.notice_period_days === 'number' ? parsed.notice_period_days : null,
    };
  } catch (err: any) {
    console.error('[cancellation-provider] Perplexity error:', err?.message || err);
    return null;
  }
}

function getAdminClient(): SupabaseClient {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

/**
 * Idempotent: if a row exists for this provider, returns immediately. Otherwise
 * researches via Perplexity and upserts. Designed to be fired-and-forgotten
 * from the subscription create endpoint.
 */
export async function researchCancellationForProvider(
  providerName: string,
  opts: { dataSource?: string } = {}
): Promise<void> {
  if (!providerName || providerName.toLowerCase() === 'unknown') return;
  const key = providerKey(providerName);
  if (!key) return;

  const admin = getAdminClient();

  try {
    const { data: existing } = await admin
      .from('provider_cancellation_info')
      .select('id')
      .eq('provider_key', key)
      .maybeSingle();
    if (existing) return; // already researched
  } catch (err: any) {
    // If the table doesn't exist yet (migration not applied), bail quietly.
    console.warn('[cancellation-provider] cache lookup failed:', err?.message || err);
    return;
  }

  const prompt = buildCancellationPrompt(providerName);
  const result = await askPerplexity(prompt);
  if (!result) return;

  const city = detectUkCity(providerName);
  const dataSource = opts.dataSource || 'ai-on-create';

  await admin.from('provider_cancellation_info').upsert({
    provider_name: providerName,
    provider_key: key,
    city,
    method: result.method,
    email: result.email,
    phone: result.phone,
    url: result.url,
    tips: result.tips,
    notice_period_days: result.notice_period_days,
    data_source: dataSource,
    confidence: 'medium',
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'provider_key' }).then(({ error }) => {
    if (error) console.error('[cancellation-provider] upsert failed:', error.message);
  });
}
