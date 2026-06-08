/**
 * P5-6 — A/B testing substrate for the intelligence layer.
 *
 * Pattern: callers wrap a list of variants in `pickVariant(userId,
 * experimentName, variants)`. The same user always lands in the same
 * arm (sticky), so a per-user behavioural change is attributed cleanly
 * to one variant.
 *
 * The variant tag flows through to `recordAction` via
 * `metadata.variant`. The daily rollup groups by (scope, variant) so
 * per-variant precision falls out for free in the dashboard.
 *
 * Choosing winners:
 *   - The aggregator surfaces variants with ≥100 emits each in the
 *     last 30 days.
 *   - A variant whose precision exceeds the other by ≥5 percentage
 *     points AND has a Wald 95% CI that doesn't overlap is the
 *     winner. Below those thresholds we keep both variants live.
 *
 * NOTE: this is the substrate. Live experiments are defined as small
 * config blocks that callers pass into `pickVariant`. We don't include
 * any live experiment in this file — it's purely the picker + the
 * `withVariant` helper that tags an emit context.
 */

import type { IntelligenceContext } from './index';

export interface Variant<T> {
  /** Stable identifier for this arm — used in the metadata tag. */
  id: string;
  /** Caller-defined payload (prompt text, copy line, threshold, etc.). */
  payload: T;
  /**
   * Optional weight. 1.0 = equal share. Use to control rollout — e.g.
   * weight=0.1 for a 10% experimental arm against weight=0.9 control.
   * Defaults to equal share across all variants.
   */
  weight?: number;
}

/**
 * Stable hash → 0..1 from (userId, experimentName). FNV-1a 32-bit.
 * Deterministic across deploys so the same user keeps their assignment.
 */
function stableHash(userId: string, experimentName: string): number {
  const s = `${experimentName}:${userId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

/**
 * Pick a variant for the given user + experiment. Returns null if
 * variants is empty. Sticky: the same (userId, experimentName) always
 * yields the same variant id across runs.
 */
export function pickVariant<T>(
  userId: string | null | undefined,
  experimentName: string,
  variants: Array<Variant<T>>,
): Variant<T> | null {
  if (variants.length === 0) return null;
  if (!userId) {
    // No user → always control (first variant). Avoids spraying
    // anonymous traffic across all arms and muddying the signal.
    return variants[0];
  }
  const weights = variants.map((v) => (v.weight ?? 1.0));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return variants[0];
  const roll = stableHash(userId, experimentName) * total;
  let acc = 0;
  for (let i = 0; i < variants.length; i++) {
    acc += weights[i];
    if (roll < acc) return variants[i];
  }
  return variants[variants.length - 1];
}

/**
 * Merge a variant id into an IntelligenceContext's metadata so the
 * downstream `recordAction` emit carries it. Adding the same `variant`
 * key twice in metadata is harmless — the later one wins.
 *
 *   const variant = pickVariant(userId, 'chat_reply_cta_v1', VARIANTS);
 *   const ctx = withVariant(intelCtx, 'chat_reply_cta_v1', variant?.id);
 *   await recordAction(ctx);
 */
export function withVariant(
  ctx: IntelligenceContext,
  experimentName: string,
  variantId: string | null | undefined,
): IntelligenceContext {
  if (!variantId) return ctx;
  return {
    ...ctx,
    metadata: {
      ...(ctx.metadata ?? {}),
      experiment: experimentName,
      variant: variantId,
    },
  };
}
