/**
 * Phase 2 sprint 2 — tool-call telemetry.
 *
 * Wraps every Pocket Agent tool invocation so we record:
 *   - emit-side: action_kind='tool_call', subject_kind='tool',
 *                subject_id=<tool_name>, predicted={channel, args_hash}
 *   - outcome:   tool_success | tool_failed, outcome={error_message?, duration_ms}
 *
 * The aggregator rolls this into intelligence_stats with scope_kind='tool',
 * which the auto-downrank cron reads to find consistently failing tools
 * (>30% fail rate, >20 invocations → flag for founder review).
 *
 * Pattern: callers wrap their existing executeToolCall invocation:
 *
 *   const result = await instrumentToolCall(
 *     { userId, channel: 'telegram', toolName: block.name, args: block.input },
 *     () => executeToolCall(block.name, block.input, userId),
 *   );
 *
 * Failures are NEVER swallowed — the wrapper re-throws after telemetry so
 * existing error handling stays in control. Telemetry is fire-and-forget;
 * if the intelligence write fails, the tool call still returns / throws
 * normally.
 */

import { recordAction, recordOutcome } from '@/lib/intelligence';

export interface ToolTelemetryContext {
  userId: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  toolName: string;
  /** Optional — included in `predicted` for debugging. Truncated to 200 chars. */
  argsPreview?: unknown;
}

/**
 * Wrap a tool call. The fn is invoked; whatever it returns is returned to
 * the caller unchanged. Telemetry runs alongside (recordAction before,
 * recordOutcome after). Throws are re-thrown after recording tool_failed.
 *
 * Failures in the telemetry path log a warning and never propagate — the
 * tool call's behaviour is unchanged whether telemetry works or not.
 */
export async function instrumentToolCall<T>(
  ctx: ToolTelemetryContext,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  let eventId: string | null = null;

  // Fire emit BEFORE the call so the row exists even if the tool throws
  // and the outcome write fails for some reason. We don't await it — the
  // outcome write does its own lookup-by-subject so it'll find the row
  // even if the emit hasn't materialised yet.
  try {
    eventId = await recordAction({
      userId: ctx.userId,
      actor: 'ai',
      actionKind: 'tool_call',
      subjectKind: 'tool',
      subjectId: ctx.toolName,
      predicted: {
        channel: ctx.channel,
        args_preview:
          typeof ctx.argsPreview === 'string'
            ? ctx.argsPreview.slice(0, 200)
            : JSON.stringify(ctx.argsPreview ?? null).slice(0, 200),
      },
    });
  } catch (err) {
    console.warn('[intelligence/tool_call.emit] non-fatal:', err);
  }

  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    void recordOutcome({
      eventId: eventId ?? undefined,
      subjectKind: 'tool',
      subjectId: ctx.toolName,
      outcomeKind: 'tool_success',
      outcome: { duration_ms: durationMs, channel: ctx.channel },
    }).catch((err) =>
      console.warn('[intelligence/tool_call.success] non-fatal:', err),
    );
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    void recordOutcome({
      eventId: eventId ?? undefined,
      subjectKind: 'tool',
      subjectId: ctx.toolName,
      outcomeKind: 'tool_failed',
      outcome: {
        duration_ms: durationMs,
        channel: ctx.channel,
        error_message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      },
    }).catch((failErr) =>
      console.warn('[intelligence/tool_call.failed] non-fatal:', failErr),
    );
    throw err; // re-throw — caller's error handling is the source of truth
  }
}
