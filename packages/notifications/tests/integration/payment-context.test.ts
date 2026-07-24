import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { notificationDeliveries } from "../../src/schema.js"
import { createNotificationsTestContext, DB_AVAILABLE, json } from "./test-helpers"

describe.skipIf(!DB_AVAILABLE)("Notification payment context routes", () => {
  const ctx = createNotificationsTestContext()

  it("sends a payment session notification with resolved recipient and payment link context", async () => {
    const createTemplateRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "payment-link",
        name: "Payment Link",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Pay {{ paymentSession.amountCents }} {{ paymentSession.currency }}",
        textTemplate: "Use {{ paymentSession.redirectUrl }} for {{ booking.bookingNumber }}",
      }),
    })
    const { data: template } = await createTemplateRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (id, booking_number, person_id, sell_currency, sell_amount_cents)
      VALUES ('book_collect', 'BK-COLLECT-1', 'person_2', 'EUR', 60000)
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_collect', 'book_collect', 'Mara', 'Client', 'mara@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO payment_sessions (
        id,
        target_type,
        target_id,
        booking_id,
        status,
        provider,
        currency,
        amount_cents,
        payer_email,
        redirect_url,
        external_reference
      )
      VALUES (
        'pmss_collect',
        'booking',
        'book_collect',
        'book_collect',
        'requires_redirect',
        'netopia',
        'EUR',
        30000,
        null,
        'https://pay.example.com/session/pmss_collect',
        'REF-1'
      )
    `)

    const sendRes = await ctx.request("/payment-sessions/pmss_collect/send", {
      method: "POST",
      ...json({
        idempotencyKey: "payment-session-collect-1",
        templateId: template.id,
      }),
    })
    expect(sendRes.status).toBe(201)
    const { data } = await sendRes.json()
    expect(data.status).toBe("pending")
    expect(data.paymentSessionId).toBe("pmss_collect")
    expect(data.toAddress).toBe("mara@example.com")
    expect(data.textBody).toContain("https://pay.example.com/session/pmss_collect")
    await expect(ctx.drain()).resolves.toMatchObject({ sent: 1 })
    expect(
      (
        await ctx.db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, data.id))
      )[0]?.status,
    ).toBe("sent")
  })

  it("sends an invoice notification and includes linked payment session context", async () => {
    const createTemplateRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "invoice-send",
        name: "Invoice Send",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Invoice {{ invoice.invoiceNumber }}",
        textTemplate:
          "Invoice {{ invoice.invoiceNumber }} balance {{ invoice.balanceDueCents }} {{ invoice.currency }} pay {{ paymentSession.redirectUrl }}",
      }),
    })
    const { data: template } = await createTemplateRes.json()

    await ctx.db.execute(sql`
      INSERT INTO bookings (
        id,
        booking_number,
        person_id,
        contact_first_name,
        contact_last_name,
        contact_email,
        sell_currency,
        sell_amount_cents
      )
      VALUES (
        'book_invoice',
        'BK-INV-1',
        'person_3',
        'Ioana',
        'Client',
        'ioana@example.com',
        'EUR',
        80000
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, first_name, last_name, email, participant_type, is_primary)
      VALUES ('bkpt_invoice', 'book_invoice', 'Ioana', 'Client', 'ioana@example.com', 'traveler', true)
    `)
    await ctx.db.execute(sql`
      INSERT INTO invoices (
        id,
        invoice_number,
        invoice_type,
        booking_id,
        person_id,
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
        'inv_test',
        'INV-1001',
        'invoice',
        'book_invoice',
        'person_3',
        'issued',
        'EUR',
        70000,
        10000,
        80000,
        20000,
        60000,
        DATE '2026-04-08',
        DATE '2026-04-15'
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO payment_sessions (
        id,
        target_type,
        target_id,
        booking_id,
        invoice_id,
        status,
        provider,
        currency,
        amount_cents,
        payer_email,
        redirect_url
      )
      VALUES (
        'pmss_invoice',
        'invoice',
        'inv_test',
        'book_invoice',
        'inv_test',
        'requires_redirect',
        'netopia',
        'EUR',
        60000,
        null,
        'https://pay.example.com/session/pmss_invoice'
      )
    `)

    const sendRes = await ctx.request("/invoices/inv_test/send", {
      method: "POST",
      ...json({
        idempotencyKey: "invoice-notification-1",
        templateId: template.id,
      }),
    })
    expect(sendRes.status).toBe(201)
    const { data } = await sendRes.json()
    expect(data.status).toBe("pending")
    expect(data.invoiceId).toBe("inv_test")
    expect(data.paymentSessionId).toBe("pmss_invoice")
    expect(data.toAddress).toBe("ioana@example.com")
    expect(data.textBody).toContain("INV-1001")
    expect(data.textBody).toContain("https://pay.example.com/session/pmss_invoice")
    await expect(ctx.drain()).resolves.toMatchObject({ sent: 1 })
  })
})
