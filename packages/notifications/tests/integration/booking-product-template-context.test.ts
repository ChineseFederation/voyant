import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createNotificationsTestContext, DB_AVAILABLE, json } from "./test-helpers"

describe.skipIf(!DB_AVAILABLE)("Booking product template context", () => {
  const ctx = createNotificationsTestContext()

  it("renders the catalog product name, not the first booking item's unit label", async () => {
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "booking-product-title-context",
        name: "Booking product title context",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Rezervarea ta pentru {{ product.title }} este confirmată",
        textTemplate: "{{ product.title }}",
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
        start_date,
        contact_email
      )
      VALUES (
        'book_product_title_1',
        'BK-PRODUCT-TITLE-1',
        'person_product_title_1',
        'confirmed',
        'RON',
        45000,
        DATE '2026-06-15',
        'ana-product-title@example.com'
      )
    `)
    // Oldest row first: this is the one `product.title` resolves from, and its
    // `title` is a unit label written at booking time — the reported defect.
    await ctx.db.execute(sql`
      INSERT INTO booking_items (
        id,
        booking_id,
        title,
        product_name_snapshot,
        status,
        quantity,
        item_type,
        sell_currency,
        unit_sell_amount_cents,
        total_sell_amount_cents,
        created_at
      )
      VALUES
        (
          'bkit_product_title_adult',
          'book_product_title_1',
          'Adult',
          'Excursie de 1 Zi în Bulgaria: Cascadele Krushuna',
          'confirmed',
          2,
          'unit',
          'RON',
          15000,
          30000,
          TIMESTAMPTZ '2026-05-01T09:00:00Z'
        ),
        (
          'bkit_product_title_single',
          'book_product_title_1',
          'Single × 1',
          'Excursie de 1 Zi în Bulgaria: Cascadele Krushuna',
          'confirmed',
          1,
          'unit',
          'RON',
          15000,
          15000,
          TIMESTAMPTZ '2026-05-01T10:00:00Z'
        )
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
        payment_method,
        redirect_url,
        external_reference
      )
      VALUES (
        'pmss_product_title_1',
        'booking',
        'book_product_title_1',
        'book_product_title_1',
        'requires_redirect',
        'netopia',
        'RON',
        45000,
        'credit_card',
        'https://pay.example.com/session/product-title',
        'PAY-PRODUCT-TITLE-1'
      )
    `)

    const sendRes = await ctx.request("/payment-sessions/pmss_product_title_1/send", {
      method: "POST",
      ...json({
        idempotencyKey: "product-title-context-1",
        templateId: template.id,
      }),
    })
    expect(sendRes.status).toBe(201)

    await ctx.drain()

    const sinkPayload = ctx.sink.mock.calls[0]?.[0] as
      | { subject?: string; text?: string }
      | undefined
    expect(sinkPayload?.subject).toBe(
      "Rezervarea ta pentru Excursie de 1 Zi în Bulgaria: Cascadele Krushuna este confirmată",
    )
    expect(sinkPayload?.subject).not.toContain("Adult")
    expect(sinkPayload?.text).toBe("Excursie de 1 Zi în Bulgaria: Cascadele Krushuna")
  })

  it("falls back to the item label when the booking carries no product snapshot", async () => {
    const tmplRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "booking-product-title-fallback",
        name: "Booking product title fallback",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "{{ product.title }}",
        textTemplate: "{{ product.title }}",
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
        start_date,
        contact_email
      )
      VALUES (
        'book_product_title_2',
        'BK-PRODUCT-TITLE-2',
        'person_product_title_2',
        'confirmed',
        'RON',
        12000,
        DATE '2026-06-15',
        'ana-product-fallback@example.com'
      )
    `)
    await ctx.db.execute(sql`
      INSERT INTO booking_items (
        id,
        booking_id,
        title,
        product_name_snapshot,
        status,
        quantity,
        item_type,
        sell_currency,
        unit_sell_amount_cents,
        total_sell_amount_cents
      )
      VALUES (
        'bkit_product_title_legacy',
        'book_product_title_2',
        'Transfer aeroport',
        NULL,
        'confirmed',
        1,
        'service',
        'RON',
        12000,
        12000
      )
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
        payment_method,
        external_reference
      )
      VALUES (
        'pmss_product_title_2',
        'booking',
        'book_product_title_2',
        'book_product_title_2',
        'requires_redirect',
        'netopia',
        'RON',
        12000,
        'credit_card',
        'PAY-PRODUCT-TITLE-2'
      )
    `)

    const sendRes = await ctx.request("/payment-sessions/pmss_product_title_2/send", {
      method: "POST",
      ...json({
        idempotencyKey: "product-title-context-2",
        templateId: template.id,
      }),
    })
    expect(sendRes.status).toBe(201)

    await ctx.drain()

    const sinkPayload = ctx.sink.mock.calls[0]?.[0] as { subject?: string } | undefined
    expect(sinkPayload?.subject).toBe("Transfer aeroport")
  })
})
