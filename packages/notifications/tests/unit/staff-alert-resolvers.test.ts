import { bookingInquiriesService, bookingsService } from "@voyant-travel/bookings"
import { relationshipsService } from "@voyant-travel/relationships"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterEach, describe, expect, it, vi } from "vitest"

import { staffAlertContextResolvers } from "../../src/staff-alert-resolvers.js"

/**
 * These tests exist because reading the wrong column name does not throw — it
 * yields `undefined`, and the alert renders "Unknown customer" with no total.
 * The fixtures below use the REAL column names from `bookings` and `invoices`,
 * so renaming a column or mistyping one here fails loudly instead of quietly
 * shipping an empty email.
 */
const bookingRow = {
  id: "bk_1",
  bookingNumber: "VOY-1042",
  contactFirstName: "Ana",
  contactLastName: "Popescu",
  contactEmail: "ana@example.com",
  sellAmountCents: 249900,
  sellCurrency: "EUR",
  startDate: "2027-03-12",
  endDate: "2027-03-19",
  pax: 2,
}

const db = {} as PostgresJsDatabase

afterEach(() => {
  vi.restoreAllMocks()
})

describe("staff alert resolvers", () => {
  it("routes Inquiry alerts to the registered detail destination and assignee", async () => {
    vi.spyOn(relationshipsService, "getInquiry").mockResolvedValue({
      id: "inq_1",
      subject: "Private tour",
      contactSnapshot: { email: "ana@example.com" },
      ownerId: "usr_current",
      source: "storefront",
      status: "triaged",
      firstResponseDueAt: new Date("2026-08-18T10:00:00.000Z"),
    } as Awaited<ReturnType<typeof relationshipsService.getInquiry>>)

    const context = await staffAlertContextResolvers["staff.inquiry.assigned"]?.resolve({
      db,
      payload: { id: "inq_1", actorId: "usr_2", ownerId: "usr_event" },
      resolveAdminDestination: (destination, params) =>
        destination === "inquiry.detail" ? `/solicitari/${params.inquiryId}` : "/",
    })

    expect(context).toMatchObject({
      inquiryId: "inq_1",
      adminPath: "/solicitari/inq_1",
      assigneeUserId: "usr_event",
      actorUserId: "usr_2",
      contact: { name: "ana@example.com", email: "ana@example.com" },
      firstResponseDueAt: "2026-08-18T10:00:00.000Z",
    })
  })

  it("suppresses an Inquiry alert when its selected destination is unavailable", async () => {
    vi.spyOn(relationshipsService, "getInquiry").mockResolvedValue({
      id: "inq_1",
      subject: "Private tour",
      contactSnapshot: { email: "ana@example.com" },
      ownerId: null,
      source: "storefront",
      status: "new",
      firstResponseDueAt: null,
    } as Awaited<ReturnType<typeof relationshipsService.getInquiry>>)

    await expect(
      staffAlertContextResolvers["staff.inquiry.created"]?.resolve({
        db,
        payload: { id: "inq_1" },
        resolveAdminDestination: () => null,
      }),
    ).resolves.toBeNull()
  })

  it("fills a booking alert from the columns bookings actually has", async () => {
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(
      bookingRow as Awaited<ReturnType<typeof bookingsService.getBookingById>>,
    )

    const context = await staffAlertContextResolvers["staff.booking.confirmed"]?.resolve({
      db,
      payload: { bookingId: "bk_1", bookingNumber: "VOY-1042", actorId: "user_1" },
    })

    expect(context).toMatchObject({
      bookingId: "bk_1",
      bookingNumber: "VOY-1042",
      customer: { name: "Ana Popescu", email: "ana@example.com" },
      total: { amountCents: 249900, currency: "EUR" },
      travelStartDate: "2027-03-12",
      travelEndDate: "2027-03-19",
      travelerCount: 2,
      adminPath: "/bookings/bk_1",
    })
    // The actor is excluded from recipients downstream, so it has to survive.
    expect(context?.actorUserId).toBe("user_1")
  })

  it("skips a booking alert when the booking is gone", async () => {
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(null)
    const context = await staffAlertContextResolvers["staff.booking.confirmed"]?.resolve({
      db,
      payload: { bookingId: "bk_gone" },
    })
    expect(context).toBeNull()
  })

  it("resolves a durable booking inquiry for staff triage", async () => {
    vi.spyOn(bookingInquiriesService, "getById").mockResolvedValue({
      id: "bkin_1",
      contactFirstName: "Ana",
      contactLastName: "Popescu",
      contactEmail: "ana@example.com",
      contactPhone: "+40700000000",
      productId: "prod_1",
      departureId: "departure_1",
      locale: "ro",
      message: "Mai sunt locuri?",
    } as Awaited<ReturnType<typeof bookingInquiriesService.getById>>)

    const context = await staffAlertContextResolvers["staff.booking.inquiry-created"]?.resolve({
      db,
      payload: { inquiryId: "bkin_1" },
    })

    expect(context).toMatchObject({
      inquiryId: "bkin_1",
      contact: { name: "Ana Popescu", email: "ana@example.com" },
      productId: "prod_1",
      departureId: "departure_1",
      adminPath: "/bookings/inquiries/bkin_1",
    })
  })

  it("carries the enquiry's assignee, the one alert with real assignment data", async () => {
    vi.spyOn(relationshipsService, "getCustomerSignal").mockResolvedValue({
      id: "csig_1",
      personId: "per_1",
      kind: "inquiry",
      source: "form",
      priority: "high",
      notes: "March departure",
      assignedToUserId: "user_9",
    } as Awaited<ReturnType<typeof relationshipsService.getCustomerSignal>>)
    vi.spyOn(relationshipsService, "getPersonById").mockResolvedValue({
      firstName: "Ana",
      lastName: "Popescu",
      email: "ana@example.com",
    } as Awaited<ReturnType<typeof relationshipsService.getPersonById>>)

    const context = await staffAlertContextResolvers["staff.customer-signal.created"]?.resolve({
      db,
      payload: { id: "csig_1" },
    })

    expect(context).toMatchObject({
      signalId: "csig_1",
      assigneeUserId: "user_9",
      person: { name: "Ana Popescu" },
      kind: "inquiry",
      priority: "high",
    })
  })

  it("names the contract signer from CRM, since the event carries only an id", async () => {
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(
      bookingRow as Awaited<ReturnType<typeof bookingsService.getBookingById>>,
    )
    vi.spyOn(relationshipsService, "getPersonById").mockResolvedValue({
      firstName: "Ana",
      lastName: "Popescu",
    } as Awaited<ReturnType<typeof relationshipsService.getPersonById>>)

    const context = await staffAlertContextResolvers["staff.contract.signed"]?.resolve({
      db,
      payload: {
        contractId: "lct_1",
        contractNumber: "C-2027-1",
        bookingId: "bk_1",
        personId: "per_1",
        occurredAt: "2027-01-14T09:24:00.000Z",
      },
    })

    expect(context).toMatchObject({
      contractId: "lct_1",
      signerName: "Ana Popescu",
      signedAt: "2027-01-14T09:24:00.000Z",
      bookingNumber: "VOY-1042",
    })
  })

  it("reads a payment alert straight from the event, which already carries the money", async () => {
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(
      bookingRow as Awaited<ReturnType<typeof bookingsService.getBookingById>>,
    )

    const context = await staffAlertContextResolvers["staff.payment.completed"]?.resolve({
      db,
      payload: {
        paymentSessionId: "ps_1",
        bookingId: "bk_1",
        amountCents: 74970,
        currency: "EUR",
        provider: "netopia",
      },
    })

    expect(context).toMatchObject({
      paymentSessionId: "ps_1",
      amount: { amountCents: 74970, currency: "EUR" },
      provider: "netopia",
      customer: { name: "Ana Popescu" },
      // Unknown from this event, and rendered as silence rather than a guess.
      paidInFull: null,
    })
  })

  it("skips a payment alert with no amount rather than mailing a blank figure", async () => {
    const context = await staffAlertContextResolvers["staff.payment.completed"]?.resolve({
      db,
      payload: { paymentSessionId: "ps_1", provider: "netopia" },
    })
    expect(context).toBeNull()
  })
})
