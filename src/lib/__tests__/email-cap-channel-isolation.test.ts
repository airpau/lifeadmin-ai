// src/lib/__tests__/email-cap-channel-isolation.test.ts
//
// Pins the invariant that PR#532 restored: the global daily EMAIL cap must
// mute the email only, never the Pocket Agent channels.
//
// The bug: contract-expiry-alerts called canSendEmail() and then `continue`d
// past the whole sendNotification() call when the cap was hit. Telegram,
// WhatsApp and push were suppressed by a limit that has no say over them.
// With MAX_MARKETING_EMAILS_PER_DAY = 1 and several crons in the 08:00 block,
// a user who had already received one marketing email got no contract-renewal
// warning on any channel at all.
//
// Why a source-level test rather than a behavioural one: the defect is control
// flow inside a Next.js route handler that needs a live Supabase client, a
// notification dispatcher and a mail provider before a single line executes.
// Mocking that stack would test the mocks. The invariant is structural, so we
// assert it structurally: in a cron that dispatches to more than one channel,
// a failed rate check must not short-circuit the dispatch.
//
// The correct shape (see price-increases, contract-expiry-alerts):
//
//     const rateCheck = await canSendEmail(...);
//     const emailAllowed = isPaid && rateCheck.allowed;
//     await sendNotification(supabase, {
//       email: emailAllowed ? { subject, html } : undefined,   // gated
//       telegram: { ... },                                     // always
//     });
//
// The broken shape:
//
//     const rateCheck = await canSendEmail(...);
//     if (!rateCheck.allowed) continue;   // <-- mutes telegram/whatsapp/push
//     await sendNotification(supabase, { ... });
//
// Run with:
//   node --experimental-strip-types --test \
//     src/lib/__tests__/email-cap-channel-isolation.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CRON_DIR = join(process.cwd(), 'src/app/api/cron');

// Every cron that both consults the email cap AND dispatches to more than one
// channel. Email-only crons are deliberately excluded: for them a `continue`
// on a hit cap is correct, because email is the only thing there is to skip.
const MULTI_CHANNEL_CAP_CRONS = [
  'contract-expiry-alerts', // fixed by PR#532 — this is the regression pin
  'price-increases', // reference implementation of the correct shape
  'renewal-reminders',
  'daily-digest',
  'deal-alerts',
] as const;

function readCron(name: string): string {
  const path = join(CRON_DIR, name, 'route.ts');
  assert.ok(existsSync(path), `expected cron route to exist: ${path}`);
  return readFileSync(path, 'utf8');
}

/**
 * Find a short-circuit (`continue` / `return`) guarded on a failed rate check.
 * Matches the guard however it is spelled: braced or bare, with or without
 * bookkeeping statements before the jump.
 *
 *   if (!rateCheck.allowed) continue;
 *   if (!rateCheck.allowed) { skipped++; continue; }
 *   if (!rate.allowed) { results.push(...); continue; }
 */
function findCapShortCircuit(source: string): string | null {
  const guard = /if\s*\(\s*!\s*(\w+)\.allowed\s*\)\s*/g;
  for (const match of source.matchAll(guard)) {
    const bodyStart = match.index! + match[0].length;
    const body =
      source[bodyStart] === '{'
        ? readBalancedBlock(source, bodyStart) // brace-counted: object literals inside are safe
        : source.slice(bodyStart, source.indexOf(';', bodyStart) + 1);

    if (/\b(continue|return)\b/.test(body)) {
      return `${match[0]}${body}`.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

/**
 * Read a `{...}` block from `start`, counting nesting so that object literals
 * in the body (`results.push({ ... })`) do not terminate it early. A naive
 * `\{[^}]*\}` stops at the first inner brace and silently misses the jump.
 */
function readBalancedBlock(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/** A cron dispatches multi-channel if it routes through the unified dispatcher. */
function dispatchesMultiChannel(source: string): boolean {
  return /sendNotification\s*\(/.test(source) || /dispatchPocketAgentAlert\s*\(/.test(source);
}

/** Non-email channels present in the dispatch payload. */
function nonEmailChannels(source: string): string[] {
  return ['telegram', 'whatsapp', 'push'].filter((ch) =>
    new RegExp(`\\n\\s*${ch}\\s*:`, 'm').test(source),
  );
}

describe('email cap must not mute non-email channels', () => {
  // The regression pin for PR#532. This test fails against the commit that
  // introduced the bug and passes against master.
  test('contract-expiry-alerts gates the email payload, not the dispatch', () => {
    const source = readCron('contract-expiry-alerts');

    assert.ok(
      source.includes('canSendEmail('),
      'contract-expiry-alerts should consult the email cap',
    );
    assert.ok(
      dispatchesMultiChannel(source),
      'contract-expiry-alerts should dispatch through sendNotification',
    );

    const shortCircuit = findCapShortCircuit(source);
    assert.equal(
      shortCircuit,
      null,
      `contract-expiry-alerts short-circuits the dispatch on a hit cap: ${shortCircuit}\n` +
        'A hit email cap must suppress the email payload only. Gate the email ' +
        'field on the dispatch call instead of jumping past it.',
    );

    const channels = nonEmailChannels(source);
    assert.ok(
      channels.length > 0,
      'expected contract-expiry-alerts to carry non-email channels in its dispatch',
    );
  });

  // The same invariant across every multi-channel cron that reads the cap.
  for (const cron of MULTI_CHANNEL_CAP_CRONS) {
    test(`${cron} does not short-circuit its dispatch on a hit email cap`, () => {
      const source = readCron(cron);

      if (!source.includes('canSendEmail(')) return; // not cap-aware, nothing to pin
      if (!dispatchesMultiChannel(source)) return; // email-only, `continue` is correct

      const shortCircuit = findCapShortCircuit(source);
      assert.equal(
        shortCircuit,
        null,
        `${cron} suppresses ${nonEmailChannels(source).join('/') || 'other channels'} ` +
          `when the EMAIL cap is hit: ${shortCircuit}`,
      );
    });
  }
});

describe('email cap wiring', () => {
  // The dispatcher declares `rateLimited` but never enforces it, so gating the
  // email payload is the caller's job. If that ever changes, these tests are
  // the wrong shape and should be revisited.
  test('sendNotification still does not enforce rateLimited itself', () => {
    const dispatcher = join(process.cwd(), 'src/lib/notifications/dispatch.ts');
    if (!existsSync(dispatcher)) return;
    const source = readFileSync(dispatcher, 'utf8');
    if (!/rateLimited/.test(source)) return;

    const enforced = /if\s*\(\s*(input\.)?rateLimited\s*\)/.test(source);
    assert.equal(
      enforced,
      false,
      'The dispatcher now enforces rateLimited. Callers gate the email payload ' +
        'themselves, so enforcing it here would double-gate. Reconcile the two.',
    );
  });
});
