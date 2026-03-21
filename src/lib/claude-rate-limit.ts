/**
 * Claude API rate limiting and usage logging.
 *
 * Uses an in-memory store (module-level Map) which persists for the lifetime
 * of a serverless function instance. Not perfectly distributed but provides
 * meaningful per-user throttling within a running instance.
 */

const MAX_CALLS_PER_HOUR = 10;

// userId -> array of call timestamps (ms)
const rateStore = new Map<string, number[]>();

/**
 * Check whether a user is within their Claude API rate limit.
 * Call this BEFORE making a Claude API call.
 */
export function checkClaudeRateLimit(userId: string): { allowed: boolean; used: number } {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  const calls = (rateStore.get(userId) ?? []).filter((t) => t > oneHourAgo);
  rateStore.set(userId, calls);

  return { allowed: calls.length < MAX_CALLS_PER_HOUR, used: calls.length };
}

/**
 * Record a Claude API call for rate limiting.
 * Call this immediately AFTER a successful Claude API call.
 */
export function recordClaudeCall(userId: string): void {
  const calls = rateStore.get(userId) ?? [];
  calls.push(Date.now());
  rateStore.set(userId, calls);
}

/**
 * Log a Claude API call to the console with key telemetry.
 * Call before the API call with estimated token counts.
 */
export function logClaudeCall(params: {
  userId: string;
  route: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}): void {
  const inputCost = (params.estimatedInputTokens / 1_000_000) * costPerMToken(params.model, 'input');
  const outputCost = (params.estimatedOutputTokens / 1_000_000) * costPerMToken(params.model, 'output');
  const totalCost = (inputCost + outputCost).toFixed(4);

  console.log(
    `[Claude API] user=${params.userId} route=${params.route} model=${params.model} ` +
    `~input=${params.estimatedInputTokens}tok ~output=${params.estimatedOutputTokens}tok ~cost=$${totalCost}`
  );
}

function costPerMToken(model: string, type: 'input' | 'output'): number {
  // Approximate pricing in USD per million tokens
  if (model.includes('haiku')) {
    return type === 'input' ? 0.80 : 4.00;
  }
  if (model.includes('sonnet')) {
    return type === 'input' ? 3.00 : 15.00;
  }
  if (model.includes('opus')) {
    return type === 'input' ? 15.00 : 75.00;
  }
  return type === 'input' ? 3.00 : 15.00;
}
