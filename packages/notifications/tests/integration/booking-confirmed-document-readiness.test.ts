import { bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { invoiceRenditions, invoices } from "@voyant-travel/finance/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  notificationReminderRules,
  notificationReminderRuns,
  notificationTemplates,
} from "../../src/schema.js"
import type { NotificationService } from "../../src/service.js"
import {
  DOCUMENT_BUNDLE_NOT_READY_PREFIX,
  dispatchReminderEventRules,
} from "../../src/service-reminder-events.js"
import {
  createNotificationsTestContext,
  createTestDurableProvider,
  DB_AVAILABLE,
} from "./test-helpers"

/**
 * voyant#4653. A booking confirmation whose template declares an invoice
 * attachment used to send the instant the booking was confirmed — before the
 * invoice had a rendered document, because that happens asynchronously off the
 * same event. The customer received an email announcing documents and carrying
 * none, and because the run was recorded as delivered, the retry that fires
 * when the document finally arrives could never repair it.
 *
 * Only `payment_complete` had a readiness gate. These tests pin the gate on
 * `booking_confirmed` too, and pin that it is the template's declaration and
 * not the target type that decides.
 */
describe.skipIf(!DB_AVAILABLE)("Booking-confirmed document readiness", () => {
  const ctx = createNotificationsTestContext()

  /**
   * `enqueueNotification` resolves a durable provider and then writes the send
   * row; nothing here drains it, so the run's own status is what we assert.
   */
  const provider = createTestDurableProvider({ sink: () => {} })
  const dispatcher = {
    getProvider: (channel: string) => (channel === "email" ? provider : undefined),
    getProviderByName: (name: string) => (name === provider.name ? provider : undefined),
  } as unknown as NotificationService

  async function seedBooking(suffix: string) {
    const bookingId = `book_ready_${suffix}`
    await ctx.db.insert(bookings).values({
      id: bookingId,
      bookingNumber: `BKG-READY-${suffix}`,
      status: "confirmed",
      contactFirstName: "Ana",
      contactLastName: "Popescu",
      contactEmail: "ana@example.com",
      sellCurrency: "EUR",
      sellAmountCents: 120_000,
    })
    await ctx.db.insert(bookingTravelers).values({
      id: `bp_ready_${suffix}`,
      bookingId,
      firstName: "Ana",
      lastName: "Popescu",
      email: "ana@example.com",
      participantType: "traveler",
      isPrimary: true,
    })
    return bookingId
  }

  async function seedRule(suffix: string, attachments: string[]) {
    const [template] = await ctx.db
      .insert(notificationTemplates)
      .values({
        slug: `booking-confirmed-${suffix}`,
        name: "Booking confirmed",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Booking {{ booking.bookingNumber }} confirmed",
        textTemplate: "Your documents are attached.",
        metadata: { attachments },
      })
      .returning()
    await ctx.db.insert(notificationReminderRules).values({
      id: `rem_ready_${suffix}`,
      slug: `booking-confirmed-${suffix}`,
      name: "Booking confirmed",
      status: "active",
      targetType: "booking_confirmed",
      channel: "email",
      provider: "local",
      templateId: template!.id,
    })
  }

  async function runFor(bookingId: string) {
    const [run] = await ctx.db
      .select()
      .from(notificationReminderRuns)
      .where(eq(notificationReminderRuns.bookingId, bookingId))
    return run
  }

  async function seedReadyInvoiceDocument(
    bookingId: string,
    suffix: string,
    status: "issued" | "draft" = "issued",
  ) {
    await ctx.db.insert(invoices).values({
      id: `inv_ready_${suffix}`,
      invoiceNumber: `INV-READY-${suffix}`,
      invoiceType: "invoice",
      bookingId,
      status,
      currency: "EUR",
      subtotalCents: 120_000,
      taxCents: 0,
      totalCents: 120_000,
      paidCents: 0,
      balanceDueCents: 120_000,
      issueDate: "2026-04-13",
      dueDate: "2026-04-20",
    })
    await ctx.db.insert(invoiceRenditions).values({
      id: `invr_ready_${suffix}`,
      invoiceId: `inv_ready_${suffix}`,
      format: "pdf",
      status: "ready",
      storageKey: `invoices/inv_ready_${suffix}/invoice.pdf`,
      metadata: { url: `https://cdn.example.com/invoices/inv_ready_${suffix}/invoice.pdf` },
    })
  }

  it("defers the confirmation until the invoice it promises exists, then sends it", async () => {
    const bookingId = await seedBooking("defer")
    await seedRule("defer", ["invoice"])

    await dispatchReminderEventRules(ctx.db, dispatcher, {
      targetType: "booking_confirmed",
      bookingId,
    })

    const deferred = await runFor(bookingId)
    expect(deferred).toMatchObject({
      status: "failed",
      notificationDeliveryId: null,
      recipient: null,
    })
    // Named, so an operator reading the run knows what is being waited on.
    expect(deferred?.errorMessage).toBe(`${DOCUMENT_BUNDLE_NOT_READY_PREFIX}invoice`)

    // What `invoice.rendered` produces, and the subscriber then re-drives the
    // same dispatch. The deferred run is the one thing allowed to be retried.
    await seedReadyInvoiceDocument(bookingId, "defer")
    await dispatchReminderEventRules(ctx.db, dispatcher, {
      targetType: "booking_confirmed",
      bookingId,
    })

    expect(await runFor(bookingId)).toMatchObject({
      status: "queued",
      recipient: "ana@example.com",
      errorMessage: null,
    })
  })

  it("never attaches a draft invoice, however ready its document is", async () => {
    // A draft is an invoice that was not issued — including one booking
    // create refused to issue because the buyer was fiscally incomplete. Its
    // document must not reach the customer, so the confirmation keeps
    // waiting rather than mailing the quarantined one.
    const bookingId = await seedBooking("draft")
    await seedRule("draft", ["invoice"])
    await seedReadyInvoiceDocument(bookingId, "draft", "draft")

    await dispatchReminderEventRules(ctx.db, dispatcher, {
      targetType: "booking_confirmed",
      bookingId,
    })

    expect(await runFor(bookingId)).toMatchObject({
      status: "failed",
      errorMessage: `${DOCUMENT_BUNDLE_NOT_READY_PREFIX}invoice`,
    })
  })

  it("sends immediately when the template promises no attachment", async () => {
    // The gate is the template's own declaration. A confirmation that never
    // claimed to carry a document must not start waiting for one.
    const bookingId = await seedBooking("plain")
    await seedRule("plain", [])

    await dispatchReminderEventRules(ctx.db, dispatcher, {
      targetType: "booking_confirmed",
      bookingId,
    })

    expect(await runFor(bookingId)).toMatchObject({
      status: "queued",
      recipient: "ana@example.com",
    })
  })

  it("does not re-send a confirmation that already went out", async () => {
    const bookingId = await seedBooking("once")
    await seedRule("once", [])

    await dispatchReminderEventRules(ctx.db, dispatcher, {
      targetType: "booking_confirmed",
      bookingId,
    })
    const first = await runFor(bookingId)
    await dispatchReminderEventRules(ctx.db, dispatcher, {
      targetType: "booking_confirmed",
      bookingId,
    })

    const rows = await ctx.db
      .select()
      .from(notificationReminderRuns)
      .where(eq(notificationReminderRuns.bookingId, bookingId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.updatedAt).toEqual(first?.updatedAt)
  })
})
