// src/lib/whatsapp/daily-digest.test.ts
//
// Unit tests for the once-a-day WhatsApp digest batching logic. Run with
// Node's built-in test runner (matches the other *.test.ts files):
//
//   node --experimental-strip-types --test src/lib/whatsapp/daily-digest.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMorningDigestSection,
  buildUrgentDebitsBody,
  classifyWhatsAppSend,
  compactDigestLine,
  foldDigestIntoBrief,
  isSingleDailyDigestEnabled,
  nextMorningDigestSlot,
  rankDigestRows,
  urgentDebitThresholdGbp,
  MORNING_MAX_ITEMS,
  MORNING_MAX_LINE_CHARS,
} from './daily-digest.ts';

type Row = Parameters<typeof rankDigestRows>[0][number];

let seq = 0;
function row(
  line: string,
  section: string,
  amount?: number,
  extra: Record<string, unknown> = {},
): Row {
  seq += 1;
  return {
    id: `r${seq}`,
    user_id: 'u1',
    event_type: 'payment_outgoing',
    template_name: null,
    payload: { line, section, amount: amount ?? null, ...extra },
  } as Row;
}

describe('isSingleDailyDigestEnabled', () => {
  it('is off by default', () => {
    assert.equal(isSingleDailyDigestEnabled({}), false);
    assert.equal(isSingleDailyDigestEnabled({ WHATSAPP_SINGLE_DAILY_DIGEST: '' }), false);
    assert.equal(isSingleDailyDigestEnabled({ WHATSAPP_SINGLE_DAILY_DIGEST: '0' }), false);
    assert.equal(isSingleDailyDigestEnabled({ WHATSAPP_SINGLE_DAILY_DIGEST: 'false' }), false);
  });
  it('accepts the usual truthy spellings', () => {
    for (const v of ['1', 'true', 'TRUE', 'on', 'yes', ' 1 ']) {
      assert.equal(isSingleDailyDigestEnabled({ WHATSAPP_SINGLE_DAILY_DIGEST: v }), true, v);
    }
  });
});

describe('nextMorningDigestSlot', () => {
  it('lands on today 07:00 UTC when queued before 07:00', () => {
    const slot = nextMorningDigestSlot(new Date('2026-10-14T06:00:00Z'));
    assert.equal(slot.toISOString(), '2026-10-14T07:00:00.000Z');
  });
  it('rolls to tomorrow 07:00 UTC once 07:00 has passed', () => {
    assert.equal(
      nextMorningDigestSlot(new Date('2026-10-14T07:00:00Z')).toISOString(),
      '2026-10-15T07:00:00.000Z',
    );
    assert.equal(
      nextMorningDigestSlot(new Date('2026-10-14T18:00:00Z')).toISOString(),
      '2026-10-15T07:00:00.000Z',
    );
  });
  it('rolls over month end', () => {
    assert.equal(
      nextMorningDigestSlot(new Date('2026-10-31T23:59:00Z')).toISOString(),
      '2026-11-01T07:00:00.000Z',
    );
  });
  it('is always before the 07:30 UTC brief cron of the same day', () => {
    const slot = nextMorningDigestSlot(new Date('2026-10-14T02:00:00Z'));
    assert.ok(slot.getTime() < Date.parse('2026-10-14T07:30:00Z'));
  });
});

describe('classifyWhatsAppSend', () => {
  it('keeps OTP instant', () => {
    assert.equal(
      classifyWhatsAppSend({ templateName: 'paybacker_login_code', category: 'AUTHENTICATION' }),
      'instant',
    );
  });
  it('keeps replies to user actions instant', () => {
    assert.equal(
      classifyWhatsAppSend({
        templateName: 'paybacker_pocket_agent_reply',
        category: 'UTILITY',
        transactional: true,
      }),
      'instant',
    );
  });
  it('keeps caller-flagged urgent alerts instant', () => {
    assert.equal(
      classifyWhatsAppSend({
        templateName: 'paybacker_payment_outgoing',
        category: 'UTILITY',
        allowUrgent: true,
      }),
      'instant',
    );
  });
  it('never folds marketing into the utility digest, even if flagged urgent', () => {
    assert.equal(
      classifyWhatsAppSend({
        templateName: 'paybacker_better_deal_found',
        category: 'MARKETING',
        allowUrgent: true,
      }),
      'marketing',
    );
  });
  it('queues ordinary utility alerts', () => {
    for (const t of [
      'paybacker_dispute_agent_action',
      'paybacker_outcome_check',
      'paybacker_complaint_letter_ready',
      'paybacker_dd_warning',
    ]) {
      assert.equal(classifyWhatsAppSend({ templateName: t, category: 'UTILITY' }), 'digest', t);
    }
  });
  it('queues unknown templates rather than sending them', () => {
    assert.equal(classifyWhatsAppSend({ templateName: 'mystery', category: null }), 'digest');
  });
});

describe('compactDigestLine', () => {
  it('flattens newlines and collapses whitespace', () => {
    assert.equal(compactDigestLine('Netflix\n\n  went up   to £18'), 'Netflix · went up to £18');
  });
  it('removes em and en dashes', () => {
    const out = compactDigestLine('Price alert \u2014 Netflix went up \u2013 a 10% rise');
    assert.ok(!/[\u2014\u2013]/.test(out), out);
    assert.equal(out, 'Price alert, Netflix went up, a 10% rise');
  });
  it('drops a trailing Reply KEYWORD call to action', () => {
    assert.equal(
      compactDigestLine('Unusual charge: £40 from Acme. Reply DISPUTE to challenge it or EXPLAIN.'),
      'Unusual charge: £40 from Acme.',
    );
    assert.equal(
      compactDigestLine('Heads up\n\nReply CANCEL if you want to stop it'),
      'Heads up',
    );
  });
  it('keeps a lowercase "reply" in normal prose', () => {
    assert.equal(compactDigestLine('BT sent a reply to your dispute'), 'BT sent a reply to your dispute');
  });
  it('drops a generic dashboard tail', () => {
    assert.equal(
      compactDigestLine('Your letter is ready, open paybacker.co.uk/dashboard/complaints.'),
      'Your letter is ready',
    );
  });
  it('caps long lines with an ellipsis', () => {
    const out = compactDigestLine('x'.repeat(300));
    assert.equal(out.length, MORNING_MAX_LINE_CHARS);
    assert.ok(out.endsWith('…'));
  });
});

describe('rankDigestRows', () => {
  it('orders by section, then largest amount, then queue order', () => {
    const ranked = rankDigestRows([
      row('Renewal A', 'renewals', 5),
      row('Small debit', 'money_out', 20),
      row('Salary', 'money_in', 2000),
      row('Big debit', 'money_out', 300),
      row('Dispute update', 'other'),
      row('Budget', 'budgets', 0),
    ]);
    assert.deepEqual(
      ranked.map((r) => r.line),
      ['Salary', 'Big debit', 'Small debit', 'Budget', 'Renewal A', 'Dispute update'],
    );
  });
  it('drops duplicate lines and empty rows', () => {
    const ranked = rankDigestRows([
      row('£60 to Tesco (groceries)', 'money_out', 60),
      row('£60 to Tesco (groceries)', 'money_out', 60),
      { id: 'x', user_id: 'u1', event_type: null, template_name: null, payload: null } as Row,
    ]);
    assert.equal(ranked.length, 1);
  });
  it('falls back to the event type when a row has no line', () => {
    const ranked = rankDigestRows([
      { id: 'y', user_id: 'u1', event_type: 'outcome_check', template_name: null, payload: {} } as Row,
    ]);
    assert.equal(ranked[0].line, 'outcome check');
    assert.equal(ranked[0].section, 'other');
  });
  it('prefixes the provider when the line does not mention it', () => {
    const ranked = rankDigestRows([row('Renews in 3 days for £9.99', 'renewals', 9.99, { provider: 'Spotify' })]);
    assert.equal(ranked[0].line, 'Spotify: Renews in 3 days for £9.99');
    const again = rankDigestRows([row('Spotify renews in 3 days', 'renewals', 9.99, { provider: 'spotify' })]);
    assert.equal(again[0].line, 'Spotify renews in 3 days');
  });
  it('treats an unknown section as other', () => {
    const ranked = rankDigestRows([row('Hello', 'nonsense')]);
    assert.equal(ranked[0].section, 'other');
  });
});

describe('buildMorningDigestSection', () => {
  it('returns null when nothing is queued', () => {
    assert.equal(buildMorningDigestSection([]), null);
  });
  it('renders a counted header and one bullet per item', () => {
    const out = buildMorningDigestSection([row('£60 to Tesco (groceries)', 'money_out', 60)]);
    assert.equal(out, '*Since yesterday (1 update)*\n• £60 to Tesco (groceries)');
  });
  it('caps the list and points at the dashboard for the rest', () => {
    const rows = Array.from({ length: MORNING_MAX_ITEMS + 3 }, (_, i) =>
      row(`Debit ${i}`, 'money_out', 100 - i),
    );
    const out = buildMorningDigestSection(rows)!;
    const bullets = out.split('\n').filter((l) => l.startsWith('• '));
    assert.equal(bullets.length, MORNING_MAX_ITEMS + 1);
    assert.match(out, /^\*Since yesterday \(8 updates\)\*/);
    assert.match(out, /• \+3 more at paybacker\.co\.uk\/dashboard$/);
  });
  it('fits, with the brief header, inside the 600 char template highlights budget', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`${'y'.repeat(200)} ${i}`, 'other'));
    const out = foldDigestIntoBrief("*Good morning! Here's your daily money briefing:*", rows)!;
    const flattened = out.replace(/\n+/g, ' · ');
    // Everything up to and including the "+N more" bullet survives truncation.
    const end = flattened.indexOf('more at paybacker.co.uk/dashboard') + 'more at paybacker.co.uk/dashboard'.length;
    assert.ok(end > 0 && end <= 600, String(end));
  });
  it('contains no em or en dashes', () => {
    const out = buildMorningDigestSection([
      row('Price alert \u2014 Netflix up \u2013 10%', 'other'),
      row('Heads up \u2014 BT renews soon', 'renewals'),
    ])!;
    assert.ok(!/[\u2014\u2013]/.test(out), out);
  });
});

describe('foldDigestIntoBrief', () => {
  const brief =
    "*Good morning! Here's your daily money briefing:*\n\n*Yesterday*\nYou spent £40.\n\n💡 *Tip of the Day*\nHaggle.";

  it('leaves the brief untouched when nothing is queued', () => {
    assert.equal(foldDigestIntoBrief(brief, []), brief);
    assert.equal(foldDigestIntoBrief(null, []), null);
  });
  it('puts the queued items straight after the header line', () => {
    const out = foldDigestIntoBrief(brief, [row('£60 to Tesco (groceries)', 'money_out', 60)])!;
    const lines = out.split('\n');
    assert.equal(lines[0], "*Good morning! Here's your daily money briefing:*");
    assert.equal(lines[1], '');
    assert.equal(lines[2], '*Since yesterday (1 update)*');
    assert.equal(lines[3], '• £60 to Tesco (groceries)');
    assert.ok(out.includes('*Yesterday*\nYou spent £40.'));
    assert.ok(out.endsWith('Haggle.'));
  });
  it('builds a digest-only body when there is no brief', () => {
    const out = foldDigestIntoBrief(null, [row('BT replied to your dispute', 'other')])!;
    assert.equal(
      out,
      '*Since yesterday (1 update)*\n• BT replied to your dispute\n\nFull detail: paybacker.co.uk/dashboard',
    );
  });
  it('appends to a single-line brief', () => {
    const out = foldDigestIntoBrief('Morning!', [row('Item', 'other')])!;
    assert.equal(out, 'Morning!\n\n*Since yesterday (1 update)*\n• Item');
  });
  it('gives one message however many items were queued', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`Alert ${i}`, 'other'));
    const out = foldDigestIntoBrief(brief, rows)!;
    assert.equal((out.match(/\*Since yesterday/g) ?? []).length, 1);
    assert.equal(typeof out, 'string');
  });
});

describe('urgentDebitThresholdGbp', () => {
  it('defaults to £500', () => {
    assert.equal(urgentDebitThresholdGbp({}), 500);
    assert.equal(urgentDebitThresholdGbp({ WHATSAPP_URGENT_DEBIT_GBP: 'abc' }), 500);
    assert.equal(urgentDebitThresholdGbp({ WHATSAPP_URGENT_DEBIT_GBP: '0' }), 500);
  });
  it('honours an override', () => {
    assert.equal(urgentDebitThresholdGbp({ WHATSAPP_URGENT_DEBIT_GBP: '1000' }), 1000);
  });
});

describe('buildUrgentDebitsBody', () => {
  it('folds several large debits into one message', () => {
    const out = buildUrgentDebitsBody([
      { amount: '£612.00', merchant: 'Landlord Ltd', category: 'rent' },
      { amount: '£899.00', merchant: 'Apple', category: 'shopping' },
    ]);
    assert.match(out, /^\*2 large payments just left your account\*/);
    assert.ok(out.includes('• £612.00 to Landlord Ltd (rent)'));
    assert.ok(out.includes('• £899.00 to Apple (shopping)'));
    assert.ok(!/[\u2014\u2013]/.test(out));
  });
});
