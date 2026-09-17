import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_REMINDER_DAYS,
  DEFAULT_REMINDER_HOUR_IST,
  IST_OFFSET_MS,
  formatExpiry,
  isDueForReminder,
  msUntilNextRun,
  readReminderSettings,
  reminderCutoff,
  reminderHtml,
  reminderSubject,
} from '../src/lib/apiKeyExpiry.js'

const DAY = 86400000
const NOW = new Date('2026-09-17T06:00:00.000Z')

function key(over: Partial<Parameters<typeof isDueForReminder>[0]> = {}) {
  return {
    status: 'active',
    expires_at: new Date(NOW.getTime() + 1.5 * DAY),
    expiry_reminder_sent_at: null,
    ...over,
  }
}

describe('reminder settings', () => {
  it('falls back to 2 days at 08:00 IST when nothing is set', () => {
    const s = readReminderSettings({})
    assert.equal(s.enabled, true)
    assert.equal(s.days, DEFAULT_REMINDER_DAYS)
    assert.equal(s.hourIst, DEFAULT_REMINDER_HOUR_IST)
  })

  it('is disabled only by the exact string "false"', () => {
    assert.equal(readReminderSettings({ API_KEY_EXPIRY_REMINDER_ENABLED: 'false' }).enabled, false)
    assert.equal(readReminderSettings({ API_KEY_EXPIRY_REMINDER_ENABLED: 'no' }).enabled, true)
    assert.equal(readReminderSettings({ API_KEY_EXPIRY_REMINDER_ENABLED: '' }).enabled, true)
  })

  it('reads a custom number of days and hour', () => {
    const s = readReminderSettings({
      API_KEY_EXPIRY_REMINDER_DAYS: '7',
      API_KEY_EXPIRY_REMINDER_HOUR: '18',
    })
    assert.equal(s.days, 7)
    assert.equal(s.hourIst, 18)
  })

  it('ignores junk, a negative value and an out-of-range value', () => {
    for (const bad of ['abc', '-1', '2.5', '400']) {
      assert.equal(
        readReminderSettings({ API_KEY_EXPIRY_REMINDER_DAYS: bad }).days,
        DEFAULT_REMINDER_DAYS
      )
    }
    assert.equal(
      readReminderSettings({ API_KEY_EXPIRY_REMINDER_HOUR: '24' }).hourIst,
      DEFAULT_REMINDER_HOUR_IST
    )
  })

  it('treats zero days as unset rather than as "warn on the day"', () => {
    assert.equal(
      readReminderSettings({ API_KEY_EXPIRY_REMINDER_DAYS: '0' }).days,
      DEFAULT_REMINDER_DAYS
    )
  })

  it('accepts midnight IST as a valid hour', () => {
    assert.equal(readReminderSettings({ API_KEY_EXPIRY_REMINDER_HOUR: '0' }).hourIst, 0)
  })
})

describe('schedule', () => {
  it('waits until 08:00 IST later the same day', () => {
    const at0230Ist = new Date(Date.UTC(2026, 8, 17, 0, 0) - IST_OFFSET_MS + 2.5 * 3600000)
    assert.equal(msUntilNextRun(at0230Ist, 8), 5.5 * 3600000)
  })

  it('rolls over to tomorrow when 08:00 IST has passed', () => {
    const at0900Ist = new Date(Date.UTC(2026, 8, 17, 9, 0) - IST_OFFSET_MS)
    assert.equal(msUntilNextRun(at0900Ist, 8), 23 * 3600000)
  })

  it('rolls over rather than firing instantly at exactly 08:00 IST', () => {
    const exactly = new Date(Date.UTC(2026, 8, 17, 8, 0) - IST_OFFSET_MS)
    assert.equal(msUntilNextRun(exactly, 8), 24 * 3600000)
  })

  it('never returns a delay outside one day', () => {
    for (let h = 0; h < 24; h++) {
      const wait = msUntilNextRun(new Date(Date.UTC(2026, 8, 17, h, 37)), 8)
      assert.ok(wait > 0 && wait <= 24 * 3600000, `hour ${h} gave ${wait}`)
    }
  })
})

describe('due window', () => {
  it('warns about a key inside the window', () => {
    assert.equal(isDueForReminder(key(), NOW, 2), true)
  })

  it('ignores a key expiring beyond the window', () => {
    assert.equal(
      isDueForReminder(key({ expires_at: new Date(NOW.getTime() + 5 * DAY) }), NOW, 2),
      false
    )
  })

  it('ignores a key that has already expired', () => {
    assert.equal(isDueForReminder(key({ expires_at: new Date(NOW.getTime() - DAY) }), NOW, 2), false)
  })

  it('ignores a key that never expires', () => {
    assert.equal(isDueForReminder(key({ expires_at: null }), NOW, 2), false)
  })

  it('ignores a revoked key', () => {
    assert.equal(isDueForReminder(key({ status: 'revoked' }), NOW, 2), false)
  })

  it('ignores a key that was already reminded', () => {
    assert.equal(isDueForReminder(key({ expiry_reminder_sent_at: NOW }), NOW, 2), false)
  })

  it('treats a key with no reminder field as never reminded', () => {
    const { expiry_reminder_sent_at, ...withoutField } = key()
    assert.equal(isDueForReminder(withoutField as never, NOW, 2), true)
  })

  it('includes a key expiring exactly at the cutoff and excludes one expiring now', () => {
    assert.equal(isDueForReminder(key({ expires_at: reminderCutoff(NOW, 2) }), NOW, 2), true)
    assert.equal(isDueForReminder(key({ expires_at: NOW }), NOW, 2), false)
  })
})

describe('expiry date formatting', () => {
  it('renders the date in IST, not UTC', () => {
    assert.equal(formatExpiry(new Date('2026-09-19T20:00:00.000Z')), '20 September 2026 at 01:30 IST')
  })

  it('pads the hour and minute', () => {
    assert.equal(formatExpiry(new Date('2026-09-19T00:35:00.000Z')), '19 September 2026 at 06:05 IST')
  })
})

describe('reminder email', () => {
  const ctx = {
    keyName: 'Production key',
    keyPrefix: 'csvc_1d72f9ab8f',
    projectName: 'talntx',
    expiresAt: new Date('2026-09-19T10:12:31.000Z'),
    days: 2,
  }

  it('names the project and the window in the subject', () => {
    assert.equal(reminderSubject(ctx), 'Action required: your API key for talntx expires in 2 days')
  })

  it('says "tomorrow" when only one day is left', () => {
    assert.equal(
      reminderSubject({ ...ctx, days: 1 }),
      'Action required: your API key for talntx expires tomorrow'
    )
  })

  it('states the key, the project and the date', () => {
    const html = reminderHtml(ctx)
    assert.ok(html.includes('Production key'))
    assert.ok(html.includes('talntx'))
    assert.ok(html.includes(formatExpiry(ctx.expiresAt)))
  })

  it('asks the reader to regenerate and warns what happens otherwise', () => {
    const html = reminderHtml(ctx)
    assert.ok(html.includes('generate a new API key'))
    assert.ok(html.includes('will stop working'))
  })

  it('shows the prefix, never the key value', () => {
    const html = reminderHtml(ctx)
    assert.ok(html.includes('csvc_1d72f9ab8f'))
    assert.ok(!html.includes('value_encrypted'))
    assert.ok(html.includes('never contains the key itself'))
  })

  it('escapes markup in the key and project names', () => {
    const html = reminderHtml({
      ...ctx,
      keyName: '<script>alert(1)</script>',
      projectName: 'A & B "quoted"',
    })
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;'))
    assert.ok(html.includes('A &amp; B &quot;quoted&quot;'))
  })

  it('leaves the subject line readable without escaping', () => {
    assert.equal(
      reminderSubject({ ...ctx, projectName: 'R&D' }),
      'Action required: your API key for R&D expires in 2 days'
    )
  })
})
