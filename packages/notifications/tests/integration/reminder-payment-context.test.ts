import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createNotificationsTestContext, DB_AVAILABLE, json } from "./test-helpers"

describe.skipIf(!DB_AVAILABLE)("Reminder payment template context", () => {
  const ctx = createNotificationsTestContext()

  it("does not use another schedule's payment session as the booking fallback", async () => {
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "payment-reminder-booking-session-fallback",
        name: "Payment reminder booking session fallback",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "{{ booking.reference }}",
        textTemplate: "{{ payment.link }}",
      }),
    })
    expect(tmplRes.status).toBe(201)
    const { data: template } = await tmplRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (
        id,
        booking_number,
        person_id,
        status,
        sell_currency,
        sell_amount_cents,
        start_date
      )
      VALUES (
        'book_payment_context_fallback_1',
        'BK-FALLBACK-1',
        'person_payment_context_fallback_1',
        'awaiting_payment',
        'EUR',
        50000,
        DATE '2026-05-01'
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
        'bkpt_payment_context_fallback_1',
        'book_payment_context_fallback_1',
        'Ana',
        'Fallback',
        'ana-fallback@example.com',
        'traveler',
        true
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_payment_schedules (
        id, booking_id, schedule_type, status, due_date, currency, amount_cents
      )
      VALUES
        (
          'bkps_payment_context_fallback_active',
          'book_payment_context_fallback_1',
          'deposit',
          'pending',
          DATE '2026-04-10',
          'EUR',
          18000
        ),
        (
          'bkps_payment_context_fallback_other',
          'book_payment_context_fallback_1',
          'balance',
          'pending',
          DATE '2026-06-30',
          'EUR',
          32000
        )
    `)
    await ctx.db.execute(sql`
      INSERT INTO payment_sessions (
        id,
        target_type,
        target_id,
        booking_id,
        booking_payment_schedule_id,
        status,
        provider,
        currency,
        amount_cents,
        payment_method,
        redirect_url,
        external_reference
      )
      VALUES
        (
          'pmss_payment_context_fallback_booking',
          'booking',
          'book_payment_context_fallback_1',
          'book_payment_context_fallback_1',
          NULL,
          'requires_redirect',
          'netopia',
          'EUR',
          50000,
          'credit_card',
          'https://pay.example.com/session/booking-level',
          'PAY-FALLBACK-BOOKING'
        ),
        (
          'pmss_payment_context_fallback_other_schedule',
          'booking_payment_schedule',
          'bkps_payment_context_fallback_other',
          'book_payment_context_fallback_1',
          'bkps_payment_context_fallback_other',
          'requires_redirect',
          'netopia',
          'EUR',
          32000,
          'credit_card',
          'https://pay.example.com/session/wrong-schedule',
          'PAY-FALLBACK-WRONG'
        )
    `)

    const ruleRes = await ctx.request("/reminder-rules", {
      method: "POST",
      ...json({
        slug: "payment-context-fallback-sequence",
        name: "Payment context fallback sequence",
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

    const sinkPayload = ctx.sink.mock.calls[0]?.[0] as
      | { text?: string; data?: Record<string, unknown> }
      | undefined
    expect(sinkPayload?.text).toBe("https://pay.example.com/session/booking-level")
    expect(sinkPayload?.text).not.toContain("wrong-schedule")
    expect(sinkPayload?.data?.payment).toMatchObject({
      link: "https://pay.example.com/session/booking-level",
    })
    expect(sinkPayload?.data?.paymentSession).toMatchObject({
      id: "pmss_payment_context_fallback_booking",
      redirectUrl: "https://pay.example.com/session/booking-level",
    })
  })
})
