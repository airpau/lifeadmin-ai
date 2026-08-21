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
  it('uses email when the profile has one', () => {
    const c = pickReminderChannel({ email: 'a@b.com' });
    assert.equal(c?.channel, 'email');
  });

  it('returns null with no email address', () => {
    assert.equal(pickReminderChannel({ email: null }), null);
  });

  it('is a single channel, not a fan-out', () => {
    // Migle asked us to focus on one preferred channel. The original
    // code deliberately sent WhatsApp AND email for the same event on
    // the same day, via two disjoint dedup keys.
    //
    // We then tried a WhatsApp/Telegram/email chain, which a live test
    // send killed: our one approved WhatsApp template has a frozen body
    // reading "your connection has expired", so at T-7 it would tell
    // someone with a working bank feed that it had already stopped.
    // Email is the channel whose words we actually write.
    const c = pickReminderChannel({ email: 'a@b.com' });
    assert.equal(typeof c?.channel, 'string');
    assert.equal(c?.channel, 'email');
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
