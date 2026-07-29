import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { queryRows } from "./reminder-test-helpers"
import {
  createNotificationsTestContext,
  createTestDurableProvider,
  DB_AVAILABLE,
  json,
} from "./test-helpers"

describe.skipIf(!DB_AVAILABLE)("Queued reminder delivery", () => {
  const ctx = createNotificationsTestContext()

  it("queues per-channel and uses the stage channel's template at delivery time", async () => {
    // Two templates: one is the rule's default fallback that should NEVER be
    // used, the other lives on the stage channel and is the one we expect to
    // hit the wire.
    const ruleDefaultTplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "rule-default-do-not-use",
        name: "Rule default (must not be used)",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "WRONG",
        textTemplate: "WRONG",
      }),
    })
    const { data: ruleDefaultTpl } = await ruleDefaultTplRes.json()

    const stageChannelTplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "stage-channel-correct",
        name: "Stage channel template",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Stage payment due {{ bookingNumber }}",
        textTemplate: "Stage delivery — due {{ dueDate }}",
      }),
    })
    const { data: stageChannelTpl } = await stageChannelTplRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (id, booking_number, person_id, status, sell_currency, sell_amount_cents)
      VALUES ('book_q_1', 'BK-Q-1', 'person_q_1', 'awaiting_payment', 'EUR', 30000)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_q_1', 'book_q_1', 'Cara', 'Queue', 'cara@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES ('bkps_q_1', 'book_q_1', 'balance', 'pending', DATE '2026-04-12', 'EUR', 18000)
    `)

    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "queued-balance-rule",
        name: "Queued balance rule",
        status: "active",
        targetType: "booking_payment_schedule",
        channel: "email",
        provider: "local",
        templateId: ruleDefaultTpl.id,
      }),
    })
    const { data: rule } = await ruleRes.json()

    const stageRes = await ctx.request(`/reminder-rules/${rule.id}/stages`, {
      method: "POST",
      ...json({
        orderIndex: 0,
        anchor: "due_date",
        windowStartDays: -7,
        windowEndDays: 0,
        cadenceKind: "once",
        respectQuietHours: false,
      }),
    })
    const { data: stage } = await stageRes.json()

    await ctx.request(`/reminder-rules/${rule.id}/stages/${stage.id}/channels`, {
      method: "POST",
      ...json({
        orderIndex: 0,
        channel: "email",
        provider: "local",
        templateId: stageChannelTpl.id,
        recipientKind: "primary",
      }),
    })

    const { queueDueReminders, deliverReminderRun } = await import("../../src/service-reminders.js")
    const { createNotificationService } = await import("../../src/service.js")

    const enqueued: { reminderRunId: string }[] = []
    const queueResult = await queueDueReminders(
      ctx.db as never,
      { now: "2026-04-09T09:00:00.000Z" },
      async (job) => {
        enqueued.push(job)
      },
    )
    expect(queueResult.queued).toBe(1)
    expect(enqueued).toHaveLength(1)

    const queuedRows = await ctx.db.execute(sql`
      SELECT status, metadata FROM notification_reminder_runs
      WHERE reminder_rule_id = ${rule.id}
    `)
    const queuedRowsAny = queryRows(queuedRows)
    expect(queuedRowsAny.length).toBe(1)
    expect(queuedRowsAny[0]!.status).toBe("queued")
    const queuedMeta = queuedRowsAny[0]!.metadata as Record<string, unknown>
    expect(queuedMeta.stageChannelId).toBeTruthy()

    const recordedSends: Array<Record<string, unknown>> = []
    const { drainDurableNotificationSends } = await import("../../src/service-durable-send.js")
    const localProvider = createTestDurableProvider({
      sink: (payload) => recordedSends.push(payload as Record<string, unknown>),
    })
    const localDispatcher = createNotificationService([localProvider])
    const delivered = await deliverReminderRun(ctx.db as never, localDispatcher, {
      reminderRunId: enqueued[0]!.reminderRunId,
    })
    expect(delivered?.status).toBe("queued")
    expect(recordedSends).toHaveLength(0)

    await drainDurableNotificationSends(ctx.db, [localProvider])

    expect(recordedSends).toHaveLength(1)
    const sent = recordedSends[0]!
    expect(sent.subject).toContain("Stage payment due")
    expect(sent.text).toContain("Stage delivery")
    expect(sent.to).toBe("cara@example.com")
  })

  it("skips queued payment schedule reminder runs when the booking was cancelled before delivery", async () => {
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "queued-cancelled-template",
        name: "Queued cancelled template",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Payment due",
        textTemplate: "Payment due",
      }),
    })
    const { data: template } = await tmplRes.json()

    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "queued-cancelled-rule",
        name: "Queued cancelled rule",
        status: "active",
        targetType: "booking_payment_schedule",
        channel: "email",
        provider: "local",
        templateId: template.id,
      }),
    })
    const { data: rule } = await ruleRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency)
      VALUES ('book_queued_cancelled_1', 'BK-Q-CAN-1', 'cancelled', 'EUR')
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_queued_cancelled_1', 'book_queued_cancelled_1', 'Quinn', 'Cancelled', 'quinn@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES ('bkps_queued_cancelled_1', 'book_queued_cancelled_1', 'balance', 'due', DATE '2026-04-12', 'EUR', 18000)
    `)
    await ctx.db.execute(sql`
      INSERT INTO notification_reminder_runs (
        id, reminder_rule_id, target_type, target_id, dedupe_key, booking_id, status, recipient, scheduled_for
      )
      VALUES (
        'nrr_queued_cancelled_1',
        ${rule.id},
        'booking_payment_schedule',
        'bkps_queued_cancelled_1',
        'queued-cancelled-dedupe',
        'book_queued_cancelled_1',
        'queued',
        'quinn@example.com',
        TIMESTAMPTZ '2026-04-09T09:00:00.000Z'
      )
    `)

    const { deliverReminderRun } = await import("../../src/service-reminders.js")
    const { createNotificationService } = await import("../../src/service.js")
    const recordedSends: Array<Record<string, unknown>> = []
    const localDispatcher = createNotificationService([
      createTestDurableProvider({
        sink: (payload) => recordedSends.push(payload as Record<string, unknown>),
      }),
    ])

    const delivered = await deliverReminderRun(ctx.db as never, localDispatcher, {
      reminderRunId: "nrr_queued_cancelled_1",
    })
    expect(delivered?.status).toBe("skipped")
    expect(delivered?.errorMessage).toBe("booking_status_cancelled")
    expect(recordedSends).toHaveLength(0)
  })

  it("skips queued payment reminders when booking notifications were suppressed after queueing", async () => {
    const templateRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "queued-suppressed-template",
        name: "Queued suppressed template",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Payment due",
        textTemplate: "Payment due",
      }),
    })
    const { data: template } = await templateRes.json()
    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "queued-suppressed-rule",
        name: "Queued suppressed rule",
        status: "active",
        targetType: "booking_payment_schedule",
        channel: "email",
        provider: "local",
        templateId: template.id,
      }),
    })
    const { data: rule } = await ruleRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (
        id, booking_number, status, sell_currency, notifications_suppressed
      ) VALUES (
        'book_queued_suppressed_1', 'BK-Q-SUP-1', 'awaiting_payment', 'EUR', true
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (
        id, booking_id, first_name, last_name, email, participant_type, is_primary
      ) VALUES (
        'bkpt_queued_suppressed_1', 'book_queued_suppressed_1',
        'Sonia', 'Suppressed', 'sonia@example.com', 'traveler', true
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      ) VALUES (
        'bkps_queued_suppressed_1', 'book_queued_suppressed_1',
        'balance', 'due', DATE '2026-04-12', 'EUR', 18000
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO notification_reminder_runs (
        id, reminder_rule_id, target_type, target_id, dedupe_key, booking_id,
        status, recipient, scheduled_for
      ) VALUES (
        'nrr_queued_suppressed_1', ${rule.id}, 'booking_payment_schedule',
        'bkps_queued_suppressed_1', 'queued-suppressed-dedupe',
        'book_queued_suppressed_1', 'queued', 'sonia@example.com',
        TIMESTAMPTZ '2026-04-09T09:00:00.000Z'
      )
    `)

    const { deliverReminderRun } = await import("../../src/service-reminders.js")
    const { createNotificationService } = await import("../../src/service.js")
    const recordedSends: Array<Record<string, unknown>> = []
    const localDispatcher = createNotificationService([
      createTestDurableProvider({
        sink: (payload) => recordedSends.push(payload as Record<string, unknown>),
      }),
    ])

    const delivered = await deliverReminderRun(ctx.db as never, localDispatcher, {
      reminderRunId: "nrr_queued_suppressed_1",
    })
    expect(delivered?.status).toBe("skipped")
    expect(delivered?.errorMessage).toBe("Booking notifications are suppressed")
    expect(recordedSends).toHaveLength(0)
  })

  it("skips queued invoice reminders when booking notifications were suppressed after queueing", async () => {
    const templateRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "queued-invoice-suppressed-template",
        name: "Queued invoice suppressed template",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Invoice due",
        textTemplate: "Invoice due",
      }),
    })
    const { data: template } = await templateRes.json()
    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "queued-invoice-suppressed-rule",
        name: "Queued invoice suppressed rule",
        status: "active",
        targetType: "invoice",
        channel: "email",
        provider: "local",
        templateId: template.id,
      }),
    })
    const { data: rule } = await ruleRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (
        id, booking_number, status, sell_currency, notifications_suppressed
      ) VALUES (
        'book_queued_invoice_suppressed_1', 'BK-Q-INV-SUP-1', 'confirmed', 'EUR', false
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO invoices (
        id, invoice_number, invoice_type, booking_id, status, currency,
        issue_date, due_date
      ) VALUES (
        'invc_queued_invoice_suppressed_1', 'INV-Q-SUP-1', 'invoice',
        'book_queued_invoice_suppressed_1', 'issued', 'EUR',
        DATE '2026-04-01', DATE '2026-04-12'
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO notification_reminder_runs (
        id, reminder_rule_id, target_type, target_id, dedupe_key, booking_id,
        status, recipient, scheduled_for
      ) VALUES (
        'nrr_queued_invoice_suppressed_1', ${rule.id}, 'invoice',
        'invc_queued_invoice_suppressed_1', 'queued-invoice-suppressed-dedupe',
        'book_queued_invoice_suppressed_1', 'queued', 'iris@example.com',
        TIMESTAMPTZ '2026-04-09T09:00:00.000Z'
      )
    `)
    await ctx.db.execute(sql`
      UPDATE bookings
      SET notifications_suppressed = true
      WHERE id = 'book_queued_invoice_suppressed_1'
    `)

    const { deliverReminderRun } = await import("../../src/service-reminders.js")
    const { createNotificationService } = await import("../../src/service.js")
    const recordedSends: Array<Record<string, unknown>> = []
    const localDispatcher = createNotificationService([
      createTestDurableProvider({
        sink: (payload) => recordedSends.push(payload as Record<string, unknown>),
      }),
    ])

    const delivered = await deliverReminderRun(ctx.db as never, localDispatcher, {
      reminderRunId: "nrr_queued_invoice_suppressed_1",
    })
    expect(delivered?.status).toBe("skipped")
    expect(delivered?.errorMessage).toBe("Booking notifications are suppressed")
    expect(recordedSends).toHaveLength(0)
  })

  it("does not requeue failed one-shot reminder runs on later sweeps", async () => {
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "missing-provider-reminder",
        name: "Missing provider reminder",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Payment due",
        textTemplate: "Payment due",
      }),
    })
    expect(tmplRes.status).toBe(201)
    const { data: template } = await tmplRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (id, booking_number, person_id, status, sell_currency, sell_amount_cents, start_date)
      VALUES ('book_failed_retry_1', 'BK-FAILED-RETRY-1', 'person_failed_retry_1', 'awaiting_payment', 'EUR', 45000, DATE '2026-05-01')
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_failed_retry_1', 'book_failed_retry_1', 'Dana', 'Retry', 'dana@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES ('bkps_failed_retry_1', 'book_failed_retry_1', 'balance', 'pending', DATE '2026-04-10', 'EUR', 25000)
    `)

    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "failed-retry-rule",
        name: "Failed retry rule",
        status: "active",
        targetType: "booking_payment_schedule",
        channel: "email",
        provider: "local",
      }),
    })
    expect(ruleRes.status).toBe(201)
    const { data: rule } = await ruleRes.json()

    const stageRes = await ctx.request(`/reminder-rules/${rule.id}/stages`, {
      method: "POST",
      ...json({
        orderIndex: 0,
        anchor: "due_date",
        windowStartDays: -7,
        windowEndDays: 0,
        cadenceKind: "once",
        maxSendsInStage: 1,
        respectQuietHours: false,
      }),
    })
    expect(stageRes.status).toBe(201)
    const { data: stage } = await stageRes.json()

    await ctx.request(`/reminder-rules/${rule.id}/stages/${stage.id}/channels`, {
      method: "POST",
      ...json({
        orderIndex: 0,
        channel: "email",
        provider: "unselected-external-email",
        templateId: template.id,
        recipientKind: "primary",
      }),
    })

    const { queueDueReminders, deliverReminderRun } = await import("../../src/service-reminders.js")
    const { createNotificationService } = await import("../../src/service.js")

    const enqueued: { reminderRunId: string }[] = []
    const firstQueue = await queueDueReminders(
      ctx.db as never,
      { now: "2026-04-08T09:00:00.000Z" },
      async (job) => {
        enqueued.push(job)
      },
    )
    expect(firstQueue.processed).toBe(1)
    expect(firstQueue.queued).toBe(1)
    expect(enqueued).toHaveLength(1)

    const localDispatcher = createNotificationService([
      createTestDurableProvider({ sink: () => undefined }),
    ])
    const failed = await deliverReminderRun(ctx.db as never, localDispatcher, {
      reminderRunId: enqueued[0]!.reminderRunId,
    })
    expect(failed?.status).toBe("failed")
    expect(failed?.errorMessage).toContain(
      'No notification provider registered with name "unselected-external-email"',
    )

    const sameDayQueue = await queueDueReminders(
      ctx.db as never,
      { now: "2026-04-08T18:00:00.000Z" },
      async (job) => {
        enqueued.push(job)
      },
    )
    expect(sameDayQueue.processed).toBe(0)
    expect(sameDayQueue.queued).toBe(0)

    const nextDayQueue = await queueDueReminders(
      ctx.db as never,
      { now: "2026-04-09T09:00:00.000Z" },
      async (job) => {
        enqueued.push(job)
      },
    )
    expect(nextDayQueue.processed).toBe(0)
    expect(nextDayQueue.queued).toBe(0)
    expect(enqueued).toHaveLength(1)

    const rowsResult = await ctx.db.execute(sql`
      SELECT status, error_message
      FROM notification_reminder_runs
      WHERE reminder_rule_id = ${rule.id}
    `)
    const rows = queryRows(rowsResult)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("failed")

    const deliveryCountResult = await ctx.db.execute(sql`
      SELECT count(*)::int AS count
      FROM notification_deliveries
      WHERE target_id = 'bkps_failed_retry_1'
    `)
    const deliveryCountRows = queryRows(deliveryCountResult)
    expect(deliveryCountRows[0]!.count).toBe(0)
  })
})
