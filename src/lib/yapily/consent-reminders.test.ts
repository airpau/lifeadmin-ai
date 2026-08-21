// src/lib/yapily/consent-reminders.test.ts
//
// Run: node --test --experimental-strip-types src/lib/yapily/consent-reminders.test.ts
//
// These exist because this flow is otherwise untestable without waiting
// 90 days — which is how it shipped broken and stayed broken. Across
// the entire history of the system the reminder path had sent one
// email, the "already stopped" variant, and no user had ever received
// an advance warning.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysUntil,
  shouldRemindToday,
  reminderStage,
  reminderDeadline,
  pickReminderChannel,
  whatsappCopyIsTruthful,
  reminderChannelChain,
  isUrgentReminder,
  reminderReferenceKey,
  reminderSchedule,
  FIRST_REMINDER_DAYS_BEFORE,
  REMINDER_DAYS_AFTER,
} from './consent-reminders.ts';

const NOW = new Date('2026-08-21T09:00:00.000Z');
const DAY = 86_400_000;
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

describe('daysUntil', () => {
  it('rounds up so the last day still counts as a day', () => {
    // Expiring at 23:00 tonight must read as 1 day left, not 0. The
    // user still has today to act; telling them it has gone is wrong.
    const tonight = new Date('2026-08-21T23:00:00.000Z').toISOString();
    assert.equal(daysUntil(tonight, NOW), 1);
  });

  it('goes negative once the deadline is past', () => {
    assert.equal(daysUntil(inDays(-2), NOW), -2);
  });

  it('returns NaN for an unparseable date', () => {
    assert.ok(Number.isNaN(daysUntil('not-a-date', NOW)));
  });
});

describe('reminderDeadline', () => {
  it("prefers Yapily's reconfirm_by over our locally computed expiry", () => {
    // consent_expires_at is `now + 90d` computed by us and is a guess.
    // reconfirm_by is Yapily's own answer and is what actually gates
    // data access.
    const d = reminderDeadline({
      consent_reconfirm_by: '2026-11-01T00:00:00.000Z',
      consent_expires_at: '2026-11-19T00:00:00.000Z',
    });
    assert.equal(d, '2026-11-01T00:00:00.000Z');
  });

  it('falls back to consent_expires_at on older connections', () => {
    const d = reminderDeadline({
      consent_reconfirm_by: null,
      consent_expires_at: '2026-11-19T00:00:00.000Z',
    });
    assert.equal(d, '2026-11-19T00:00:00.000Z');
  });

  it('returns null when neither is set', () => {
    assert.equal(reminderDeadline({ consent_reconfirm_by: null, consent_expires_at: null }), null);
  });
});

describe('shouldRemindToday', () => {
  it('is silent before the window opens', () => {
    assert.equal(shouldRemindToday(30), false);
    assert.equal(shouldRemindToday(8), false);
  });

  it('fires on every day from T-7 through T+3', () => {
    // The regression this guards: the old cron built its candidate list
    // from rows whose STATUS changed on that run, so a connection could
    // only ever be messaged twice — once at T-7 and once at T-0 — with
    // nothing in between, despite dedup keys that implied a daily
    // cadence.
    const days = [];
    for (let d = FIRST_REMINDER_DAYS_BEFORE; d >= -REMINDER_DAYS_AFTER; d--) {
      if (shouldRemindToday(d)) days.push(d);
    }
    assert.deepEqual(days, [7, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3]);
    assert.equal(days.length, 11);
  });

  it('goes quiet after the grace period', () => {
    assert.equal(shouldRemindToday(-4), false);
    assert.equal(shouldRemindToday(-90), false);
  });

  it('never fires on a NaN day count', () => {
    assert.equal(shouldRemindToday(Number.NaN), false);
  });
});

describe('reminderStage', () => {
  it('separates advance, final and lapsed', () => {
    assert.equal(reminderStage(7), 'advance');
    assert.equal(reminderStage(1), 'advance');
    assert.equal(reminderStage(0), 'final');
    assert.equal(reminderStage(-1), 'lapsed');
  });
});

describe('pickReminderChannel', () => {
  // daysLeft 0 by default: WhatsApp is only eligible from the deadline
  // onward, because its approved template says "has expired". These
  // tests are about the tier and linkage rules, so they sit on a day
  // where WhatsApp is on the table at all.
  const base = {
    tier: 'free',
    isPro: false,
    daysLeft: 0,
    whatsappPhone: null,
    telegramChatId: null,
    email: null,
  };

  it('prefers WhatsApp for a Pro user with a linked number', () => {
    const c = pickReminderChannel({
      ...base,
      tier: 'pro',
      isPro: true,
      whatsappPhone: '+447700900000',
      telegramChatId: 123,
      email: 'a@b.com',
    });
    assert.equal(c?.channel, 'whatsapp');
  });

  it('does NOT use WhatsApp below Pro even with a linked number', () => {
    // The gate that was never enforced. The old cron called the
    // low-level sendWhatsAppTemplate facade directly, which reads
    // suppression, caps and quiet hours but never tier — so the
    // registry's `proOnly` flag was decorative and free users on a
    // linked number were being messaged at our cost.
    const c = pickReminderChannel({
      ...base,
      tier: 'essential',
      isPro: false,
      whatsappPhone: '+447700900000',
      telegramChatId: 123,
      email: 'a@b.com',
    });
    assert.equal(c?.channel, 'telegram');
  });

  it('falls back to email when WhatsApp is ineligible and there is no Telegram', () => {
    const c = pickReminderChannel({
      ...base,
      whatsappPhone: '+447700900000',
      email: 'a@b.com',
    });
    assert.equal(c?.channel, 'email');
    assert.match(c!.reason, /below Pro/);
  });

  it('uses Telegram on any tier', () => {
    const c = pickReminderChannel({ ...base, telegramChatId: 999, email: 'a@b.com' });
    assert.equal(c?.channel, 'telegram');
  });

  it('returns exactly one channel, never a list', () => {
    // Migle asked us to focus on the primary preferred channel. The old
    // code deliberately sent WhatsApp AND email for the same event on
    // the same day, via two disjoint dedup keys.
    const c = pickReminderChannel({
      tier: 'pro',
      isPro: true,
      daysLeft: 0,
      whatsappPhone: '+447700900000',
      telegramChatId: 123,
      email: 'a@b.com',
    });
    assert.equal(typeof c?.channel, 'string');
  });

  it('returns null when the user has no channel at all', () => {
    assert.equal(pickReminderChannel(base), null);
  });
});

describe('whatsappCopyIsTruthful', () => {
  it('is false while the connection still works', () => {
    // The approved template body is frozen by Meta:
    //   "Your {{1}} connection has expired. Reconnect here: {{2}}
    //    — alerts pause until you do."
    // Sending that at T-7 tells someone with a week of working bank
    // feed left that it has already stopped. Caught on 2026-08-21 by
    // firing a real test send and reading the message that arrived.
    assert.equal(whatsappCopyIsTruthful(7), false);
    assert.equal(whatsappCopyIsTruthful(1), false);
  });

  it('is true from the deadline onward', () => {
    assert.equal(whatsappCopyIsTruthful(0), true);
    assert.equal(whatsappCopyIsTruthful(-2), true);
  });

  it('is conservative when the caller is not day-aware', () => {
    assert.equal(whatsappCopyIsTruthful(undefined), false);
  });
});

describe('reminderChannelChain', () => {
  it('offers a fallback so a blocked channel does not lose the day', () => {
    // A deadline passes once. If WhatsApp refuses at send time — its own
    // suppression list, a marketing opt-in check — dropping the day's
    // reminder is worse than trying the next channel.
    const chain = reminderChannelChain({
      tier: 'pro',
      isPro: true,
      daysLeft: 0,
      whatsappPhone: '+447700900000',
      telegramChatId: 123,
      email: 'a@b.com',
    });
    assert.deepEqual(chain.map((c) => c.channel), ['whatsapp', 'telegram', 'email']);
  });

  it('does NOT use WhatsApp for advance warnings, however eligible the user', () => {
    // Pro, linked, opted in — and still no WhatsApp at T-5, because the
    // only approved template would tell them the connection has already
    // expired. Telegram and email let us say "expires in 5 days".
    const chain = reminderChannelChain({
      tier: 'pro',
      isPro: true,
      daysLeft: 5,
      whatsappPhone: '+447700900000',
      telegramChatId: 123,
      email: 'a@b.com',
    });
    assert.deepEqual(chain.map((c) => c.channel), ['telegram', 'email']);
    assert.match(chain[0].reason, /has expired/);
  });

  it('omits WhatsApp entirely below Pro', () => {
    const chain = reminderChannelChain({
      tier: 'free',
      isPro: false,
      daysLeft: 0,
      whatsappPhone: '+447700900000',
      telegramChatId: 123,
      email: 'a@b.com',
    });
    assert.deepEqual(chain.map((c) => c.channel), ['telegram', 'email']);
  });

  it('is empty when the user has no channel', () => {
    assert.deepEqual(
      reminderChannelChain({
        tier: 'free', isPro: false, daysLeft: 0,
        whatsappPhone: null, telegramChatId: null, email: null,
      }),
      [],
    );
  });
});

describe('isUrgentReminder', () => {
  it('spends the quiet-hours and daily-cap bypass only at the very end', () => {
    // Those caps exist to stop us training people to ignore us. At T-7
    // the user has a week; burning the bypass then is not justified.
    assert.equal(isUrgentReminder(7), false);
    assert.equal(isUrgentReminder(2), false);
    assert.equal(isUrgentReminder(1), true);
    assert.equal(isUrgentReminder(0), true);
    assert.equal(isUrgentReminder(-3), true);
  });
});

describe('reminderReferenceKey', () => {
  it('is one key per connection per day, independent of channel', () => {
    // Channel is deliberately absent from the key. Including it is what
    // let the same person be messaged twice for one event.
    const a = reminderReferenceKey('conn-1', '2026-08-21T09:00:00.000Z');
    const b = reminderReferenceKey('conn-1', '2026-08-21T23:59:00.000Z');
    assert.equal(a, b);
    assert.equal(a, 'consent_reminder_conn-1_2026-08-21');
  });

  it('differs across days and across connections', () => {
    assert.notEqual(
      reminderReferenceKey('conn-1', '2026-08-21T09:00:00.000Z'),
      reminderReferenceKey('conn-1', '2026-08-22T09:00:00.000Z'),
    );
    assert.notEqual(
      reminderReferenceKey('conn-1', '2026-08-21T09:00:00.000Z'),
      reminderReferenceKey('conn-2', '2026-08-21T09:00:00.000Z'),
    );
  });
});

describe('reminderSchedule', () => {
  it('describes 11 consecutive days ending three past the deadline', () => {
    const s = reminderSchedule();
    assert.equal(s.length, 11);
    assert.equal(s[0].daysLeft, 7);
    assert.equal(s[s.length - 1].daysLeft, -3);
    assert.equal(s.filter((x) => x.stage === 'advance').length, 7);
    assert.equal(s.filter((x) => x.stage === 'final').length, 1);
    assert.equal(s.filter((x) => x.stage === 'lapsed').length, 3);
  });
});
