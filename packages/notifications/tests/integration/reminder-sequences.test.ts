import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { queryRows } from "./reminder-test-helpers"
import { createNotificationsTestContext, DB_AVAILABLE, json } from "./test-helpers"

describe.skipIf(!DB_AVAILABLE)("Reminder sequences (stage-based dispatcher)", () => {
  const ctx = createNotificationsTestContext()

  it("queues a stage's channel deliveries when the window matches and dedups across runs", async () => {
    // Seed a template the stage channel will use.
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "payment-reminder-first",
        name: "Payment reminder — first",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Payment due for {{ bookingNumber }}",
        textTemplate: "Due {{ dueDate }} amount {{ amountCents }} {{ currency }}",
      }),
    })
    expect(tmplRes.status).toBe(201)
    const { data: template } = await tmplRes.json()

    // Seed a booking + traveler + open payment schedule due 2026-04-10.
    await ctx.db.execute(sql`
      INSERT INTO bookings (id, booking_number, person_id, status, sell_currency, sell_amount_cents, start_date)
      VALUES ('book_seq_1', 'BK-SEQ-1', 'person_seq_1', 'awaiting_payment', 'EUR', 45000, DATE '2026-05-01')
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_seq_1', 'book_seq_1', 'Ana', 'Traveler', 'ana@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES ('bkps_seq_1', 'book_seq_1', 'balance', 'pending', DATE '2026-04-10', 'EUR', 25000)
    `)

    // Create the rule. With the new model templates are optional at the rule
    // level; the stage's channel carries the actual template.
    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "payment-balance-sequence",
        name: "Payment balance sequence",
        status: "active",
        targetType: "booking_payment_schedule",
        channel: "email",
        provider: "local",
      }),
    })
    expect(ruleRes.status).toBe(201)
    const { data: rule } = await ruleRes.json()

    // Add one stage: anchor due_date, window [-7, 0] days, fire once.
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
    expect(stageRes.status).toBe(201)
    const { data: stage } = await stageRes.json()

    // Attach an email channel that points at the seeded template.
    const channelRes = await ctx.request(`/reminder-rules/${rule.id}/stages/${stage.id}/channels`, {
      method: "POST",
      ...json({
        orderIndex: 0,
        channel: "email",
        provider: "local",
        templateId: template.id,
        recipientKind: "primary",
      }),
    })
    expect(channelRes.status).toBe(201)

    // First sweep at 2026-04-08 — five days before due, inside the [-7, 0] window.
    const firstRes = await ctx.request("/reminders/run-due", {
      method: "POST",
      ...json({ now: "2026-04-08T09:00:00.000Z" }),
    })
    expect(firstRes.status).toBe(200)
    const firstBody = await firstRes.json()
    expect(firstBody.data.processed).toBe(1)
    expect(firstBody.data.sent).toBe(0)
    expect(ctx.sink).not.toHaveBeenCalled()
    await expect(ctx.drain()).resolves.toMatchObject({ sent: 1 })
    expect(ctx.sink).toHaveBeenCalledOnce()
    const sinkPayload = ctx.sink.mock.calls[0]?.[0] as { to?: string } | undefined
    expect(sinkPayload?.to).toBe("ana@example.com")

    // Second sweep on the same calendar day must be a no-op: cadence='once'
    // plus same-day dedupe key prevents a second fire.
    const secondRes = await ctx.request("/reminders/run-due", {
      method: "POST",
      ...json({ now: "2026-04-08T18:00:00.000Z" }),
    })
    expect(secondRes.status).toBe(200)
    const secondBody = await secondRes.json()
    expect(secondBody.data.processed).toBe(0)
    expect(secondBody.data.sent).toBe(0)
    expect(ctx.sink).toHaveBeenCalledOnce()

    // Third sweep the next day — still 'once' cadence and there's already a
    // 'sent' run for this (rule, target), so no new fire.
    const thirdRes = await ctx.request("/reminders/run-due", {
      method: "POST",
      ...json({ now: "2026-04-09T09:00:00.000Z" }),
    })
    expect(thirdRes.status).toBe(200)
    const thirdBody = await thirdRes.json()
    expect(thirdBody.data.sent).toBe(0)
    expect(ctx.sink).toHaveBeenCalledOnce()

    // The stored run has the stage metadata wired through.
    const runs = await ctx.db.execute(sql`
      SELECT status, recipient, metadata
      FROM notification_reminder_runs
      WHERE reminder_rule_id = ${rule.id}
    `)
    const rows = queryRows(runs)
    expect(rows.length).toBe(1)
    expect(rows[0]!.status).toBe("sent")
    expect(rows[0]!.recipient).toBe("ana@example.com")
    const meta = rows[0]!.metadata as Record<string, unknown>
    expect(meta.stageId).toBe(stage.id)
    expect(meta.channel).toBe("email")
    expect(meta.sendCountAtFire).toBe(1)
  })

  it("renders booking payment reminders with advertised booking, traveler, payment, and schedule context", async () => {
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "payment-reminder-context",
        name: "Payment reminder context",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Updated hello {{ traveler.firstName }} from {{ booking.reference }}",
        textTemplate:
          "Pay {{ payment.amount }} {{ payment.currency }} for {{ payment.reference }} via {{ payment.link }} by {{ paymentSchedule.dueDate }} as {{ paymentSchedule.type }} schedule {{ paymentSchedule.amountDue }}",
      }),
    })
    expect(tmplRes.status).toBe(201)
    const { data: template } = await tmplRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (
        id,
        booking_number,
        person_id,
        organization_id,
        status,
        sell_currency,
        sell_amount_cents,
        start_date,
        end_date
      )
      VALUES (
        'book_seq_context_1',
        'BK-CTX-1',
        'person_seq_context_1',
        'org_seq_context_1',
        'awaiting_payment',
        'EUR',
        45000,
        DATE '2026-05-01',
        DATE '2026-05-08'
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (
        id,
        booking_id,
        first_name,
        last_name,
        email,
        participant_type,
        is_primary
      )
      VALUES (
        'bkpt_seq_context_1',
        'book_seq_context_1',
        'Ana',
        'Context',
        'ana-context@example.com',
        'traveler',
        true
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES (
        'bkps_seq_context_1',
        'book_seq_context_1',
        'deposit',
        'pending',
        DATE '2026-04-10',
        'EUR',
        18000
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO invoices (
        id,
        invoice_number,
        invoice_type,
        booking_id,
        person_id,
        organization_id,
        status,
        currency,
        subtotal_cents,
        tax_cents,
        total_cents,
        paid_cents,
        balance_due_cents,
        issue_date,
        due_date
      )
      VALUES (
        'inv_seq_context_1',
        'INV-CTX-1',
        'invoice',
        'book_seq_context_1',
        'person_seq_context_1',
        'org_seq_context_1',
        'issued',
        'EUR',
        45000,
        0,
        45000,
        27000,
        18000,
        DATE '2026-04-01',
        DATE '2026-04-10'
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO payment_sessions (
        id,
        target_type,
        target_id,
        booking_id,
        invoice_id,
        booking_payment_schedule_id,
        status,
        provider,
        currency,
        amount_cents,
        payment_method,
        redirect_url,
        external_reference
      )
      VALUES (
        'pmss_seq_context_1',
        'booking_payment_schedule',
        'bkps_seq_context_1',
        'book_seq_context_1',
        'inv_seq_context_1',
        'bkps_seq_context_1',
        'requires_redirect',
        'netopia',
        'EUR',
        18000,
        'credit_card',
        'https://pay.example.com/session/pmss_seq_context_1',
        'PAY-CTX-1'
      )
    `)

    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "payment-context-sequence",
        name: "Payment context sequence",
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
        respectQuietHours: false,
      }),
    })
    expect(stageRes.status).toBe(201)
    const { data: stage } = await stageRes.json()

    const channelRes = await ctx.request(`/reminder-rules/${rule.id}/stages/${stage.id}/channels`, {
      method: "POST",
      ...json({
        orderIndex: 0,
        channel: "email",
        provider: "local",
        templateId: template.id,
        recipientKind: "primary",
      }),
    })
    expect(channelRes.status).toBe(201)

    const sweepRes = await ctx.request("/reminders/run-due", {
      method: "POST",
      ...json({ now: "2026-04-08T09:00:00.000Z" }),
    })
    expect(sweepRes.status).toBe(200)
    const body = await sweepRes.json()
    expect(body.data.processed).toBe(1)
    expect(body.data.sent).toBe(0)
    expect(ctx.sink).not.toHaveBeenCalled()

    await ctx.drain()
    expect(ctx.sink).toHaveBeenCalledOnce()
    const sinkPayload = ctx.sink.mock.calls[0]?.[0] as
      | { subject?: string; text?: string; data?: Record<string, unknown> }
      | undefined
    expect(sinkPayload?.subject).toBe("Updated hello Ana from BK-CTX-1")
    expect(sinkPayload?.text).toContain("Pay 180 EUR for BK-CTX-1")
    expect(sinkPayload?.text).toContain("https://pay.example.com/session/pmss_seq_context_1")
    expect(sinkPayload?.text).toContain("as deposit schedule 180")

    const payloadData = sinkPayload?.data as Record<string, unknown>
    expect(payloadData.traveler).toMatchObject({ firstName: "Ana" })
    expect(payloadData.booking).toMatchObject({
      bookingNumber: "BK-CTX-1",
      reference: "BK-CTX-1",
    })
    expect(payloadData.payment).toMatchObject({
      amount: 180,
      currency: "EUR",
      reference: "BK-CTX-1",
      link: "https://pay.example.com/session/pmss_seq_context_1",
      payMode: "deposit",
      balanceDue: 180,
    })
    expect(payloadData.paymentSchedule).toMatchObject({
      id: "bkps_seq_context_1",
      amountCents: 18000,
      amountDue: 180,
      currency: "EUR",
      type: "deposit",
      scheduleType: "deposit",
    })

    const deliveries = await ctx.db.execute(sql`
      SELECT payload_data
      FROM notification_deliveries
      WHERE target_id = 'bkps_seq_context_1'
    `)
    const rows = queryRows(deliveries)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.payload_data).toMatchObject({
      traveler: { firstName: "Ana" },
      booking: { reference: "BK-CTX-1" },
      payment: { amount: 180, currency: "EUR" },
      paymentSchedule: { amountDue: 180, type: "deposit" },
    })
  })

  it("does not fire when the stage's window has not opened yet", async () => {
    // Seed a template + booking + open schedule due 2026-06-30.
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "tpl-window-test",
        name: "Window test",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "x",
        textTemplate: "x",
      }),
    })
    const { data: template } = await tmplRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (id, booking_number, sell_currency)
      VALUES ('book_window_1', 'BK-WIN-1', 'EUR')
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_window_1', 'book_window_1', 'Ben', 'Late', 'ben@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES ('bkps_window_1', 'book_window_1', 'balance', 'pending', DATE '2026-06-30', 'EUR', 10000)
    `)

    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "window-rule",
        name: "Window rule",
        status: "active",
        targetType: "booking_payment_schedule",
        channel: "email",
        provider: "local",
      }),
    })
    const { data: rule } = await ruleRes.json()

    const stageRes = await ctx.request(`/reminder-rules/${rule.id}/stages`, {
      method: "POST",
      ...json({
        orderIndex: 0,
        anchor: "due_date",
        // Window opens 7 days before and closes 3 days before. Today
        // (2026-04-08) is well outside — no fire.
        windowStartDays: -7,
        windowEndDays: -3,
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
        templateId: template.id,
        recipientKind: "primary",
      }),
    })

    const sweepRes = await ctx.request("/reminders/run-due", {
      method: "POST",
      ...json({ now: "2026-04-08T09:00:00.000Z" }),
    })
    expect(sweepRes.status).toBe(200)
    const body = await sweepRes.json()
    expect(body.data.processed).toBe(0)
    expect(body.data.sent).toBe(0)
  })

  it("does not fire payment schedule reminders for cancelled bookings", async () => {
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "tpl-cancelled-booking-payment",
        name: "Cancelled booking payment reminder",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Payment due",
        textTemplate: "Payment due",
      }),
    })
    const { data: template } = await tmplRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency)
      VALUES ('book_cancelled_seq_1', 'BK-CAN-1', 'cancelled', 'EUR')
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_cancelled_seq_1', 'book_cancelled_seq_1', 'Ana', 'Cancelled', 'ana-cancelled@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES ('bkps_cancelled_seq_1', 'book_cancelled_seq_1', 'balance', 'due', DATE '2026-04-10', 'EUR', 25000)
    `)

    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "cancelled-payment-balance-sequence",
        name: "Cancelled payment balance sequence",
        status: "active",
        targetType: "booking_payment_schedule",
        channel: "email",
        provider: "local",
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
        templateId: template.id,
        recipientKind: "primary",
      }),
    })

    const sweepRes = await ctx.request("/reminders/run-due", {
      method: "POST",
      ...json({ now: "2026-04-08T09:00:00.000Z" }),
    })
    expect(sweepRes.status).toBe(200)
    const body = await sweepRes.json()
    expect(body.data.processed).toBe(0)
    expect(body.data.sent).toBe(0)
    expect(ctx.sink).not.toHaveBeenCalled()
  })
})
