import { listResponseSchema } from "@voyant-travel/types"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { __test__ } from "../../../src/routes-admin.js"
import type {
  Booking,
  BookingActivity,
  BookingAllocation,
  BookingDocument,
  BookingFulfillment,
  BookingItem,
  BookingItemTraveler,
  BookingNote,
  BookingRedemptionEvent,
  BookingSupplierStatus,
  BookingTraveler,
} from "../../../src/schema.js"

/**
 * Contract tests for the bookings core admin wire shapes (voyant#2114).
 * The handlers serialize Drizzle rows whose `timestamp`/`date` columns are
 * `Date`s (or date strings); `c.json(...)` turns `Date`s into ISO strings on
 * the wire. These tests assert the authored OpenAPI response row schemas match
 * the serialized wire form (§17 Date→string) via a JSON round-trip, that the
 * canonical `listResponseSchema(...)` envelope wraps the booking row, and that
 * the bespoke `aggregates` composite accepts a serialized payload.
 */

const {
  bookingSchema,
  bookingTravelerSchema,
  bookingItemSchema,
  bookingItemTravelerSchema,
  bookingAllocationSchema,
  bookingSupplierStatusSchema,
  bookingFulfillmentSchema,
  bookingRedemptionEventSchema,
  bookingActivitySchema,
  bookingNoteSchema,
  bookingDocumentSchema,
  bookingDetailSchema,
  bookingAggregatesSchema,
  sharingGroupSummarySchema,
} = __test__

/** Reproduce the wire form: JSON serialize then re-parse (Date → ISO string). */
function toWire<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

const createdAt = new Date("2026-05-15T10:00:00.000Z")
const updatedAt = new Date("2026-05-15T11:00:00.000Z")
const confirmedAt = new Date("2026-05-15T12:00:00.000Z")

const booking: Booking = {
  id: "bkg_1",
  bookingNumber: "BK-0001",
  revision: 1,
  status: "confirmed",
  personId: "per_1",
  organizationId: null,
  sourceType: "manual",
  externalBookingRef: null,
  communicationLanguage: "en",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  contactPartyType: null,
  contactTaxId: null,
  contactEmail: "ada@example.com",
  contactPhone: null,
  contactPreferredLanguage: null,
  contactCountry: null,
  contactRegion: null,
  contactCity: null,
  contactAddressLine1: null,
  contactAddressLine2: null,
  contactPostalCode: null,
  sellCurrency: "EUR",
  baseCurrency: null,
  fxRateSetId: null,
  sellAmountCents: 120000,
  baseSellAmountCents: null,
  costAmountCents: 80000,
  baseCostAmountCents: null,
  marginPercent: 33,
  startDate: "2026-06-01",
  endDate: "2026-06-08",
  pax: 2,
  internalNotes: null,
  notificationsSuppressed: false,
  documentsSuppressed: false,
  customerPaymentPolicy: null,
  priceOverride: null,
  customFields: { custom: { source: "intake" } },
  acceptedAt: confirmedAt,
  confirmedAt,
  cancelledAt: null,
  completedAt: null,
  redeemedAt: null,
  createdAt,
  updatedAt,
}

// The traveler list/create/update endpoints serialize the `toTravelerResponse`
// projection, which omits `personId`. The schema strips the extra `personId`
// from the raw `$inferSelect` row on parse.
const traveler: BookingTraveler = {
  id: "btr_1",
  bookingId: "bkg_1",
  personId: "per_1",
  participantType: "traveler",
  travelerCategory: "adult",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: null,
  preferredLanguage: null,
  specialRequests: null,
  isPrimary: true,
  notes: null,
  createdAt,
  updatedAt,
}

const item: BookingItem = {
  id: "bki_1",
  bookingId: "bkg_1",
  title: "City tour",
  description: null,
  itemType: "unit",
  status: "confirmed",
  serviceDate: "2026-06-01",
  startsAt: createdAt,
  endsAt: null,
  quantity: 2,
  sellCurrency: "EUR",
  unitSellAmountCents: 60000,
  totalSellAmountCents: 120000,
  costCurrency: "EUR",
  unitCostAmountCents: 40000,
  totalCostAmountCents: 80000,
  notes: null,
  productId: "prod_1",
  optionId: null,
  optionUnitId: null,
  pricingCategoryId: null,
  availabilitySlotId: null,
  productNameSnapshot: "City tour",
  optionNameSnapshot: null,
  unitNameSnapshot: null,
  departureLabelSnapshot: null,
  sourceSnapshotId: null,
  sourceOfferId: null,
  metadata: { lane: "vip" },
  createdAt,
  updatedAt,
}

const itemTraveler: BookingItemTraveler = {
  id: "bit_1",
  bookingItemId: "bki_1",
  travelerId: "btr_1",
  role: "traveler",
  isPrimary: true,
  createdAt,
}

const allocation: BookingAllocation = {
  id: "bal_1",
  bookingId: "bkg_1",
  bookingItemId: "bki_1",
  productId: "prod_1",
  optionId: null,
  optionUnitId: null,
  pricingCategoryId: null,
  availabilitySlotId: "aslot_1",
  quantity: 2,
  allocationType: "unit",
  status: "confirmed",
  holdExpiresAt: null,
  confirmedAt,
  releasedAt: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const supplierStatus: BookingSupplierStatus = {
  id: "bss_1",
  bookingId: "bkg_1",
  supplierServiceId: null,
  supplierId: "sup_1",
  serviceName: "Transfer",
  status: "confirmed",
  supplierReference: "REF-9",
  costCurrency: "EUR",
  costAmountCents: 5000,
  supplierInvoiceLineId: null,
  notes: null,
  confirmedAt,
  createdAt,
  updatedAt,
}

const fulfillment: BookingFulfillment = {
  id: "bfu_1",
  bookingId: "bkg_1",
  bookingItemId: "bki_1",
  travelerId: "btr_1",
  fulfillmentType: "service_voucher",
  deliveryChannel: "email",
  status: "issued",
  artifactUrl: "https://example.com/v.pdf",
  payload: { ref: "abc" },
  issuedAt: confirmedAt,
  revokedAt: null,
  createdAt,
  updatedAt,
}

const redemption: BookingRedemptionEvent = {
  id: "bre_1",
  bookingId: "bkg_1",
  bookingItemId: "bki_1",
  travelerId: "btr_1",
  redeemedAt: confirmedAt,
  redeemedBy: "usr_1",
  location: "Gate A",
  method: "scan",
  metadata: null,
  createdAt,
}

const activity: BookingActivity = {
  id: "bac_1",
  bookingId: "bkg_1",
  actorId: "usr_1",
  activityType: "booking_confirmed",
  description: "Booking confirmed",
  metadata: null,
  createdAt,
}

const note: BookingNote = {
  id: "bno_1",
  bookingId: "bkg_1",
  authorId: "usr_1",
  content: "Called the customer",
  createdAt,
}

const document: BookingDocument = {
  id: "bdo_1",
  bookingId: "bkg_1",
  travelerId: "btr_1",
  type: "visa",
  fileName: "visa.pdf",
  fileUrl: "https://example.com/visa.pdf",
  issuedBy: null,
  issuedSeries: null,
  issuedNumber: null,
  issuedAt: null,
  expiresAt: null,
  notes: null,
  createdAt,
}

/** A document issued outside Voyant and recorded against the booking. */
const recordedInvoice: BookingDocument = {
  id: "bdo_2",
  bookingId: "bkg_1",
  travelerId: null,
  type: "invoice",
  fileName: "VYT-1042.pdf",
  fileUrl: "https://example.com/VYT-1042.pdf",
  issuedBy: "Contabilitate SRL",
  issuedSeries: "VYT",
  issuedNumber: "1042",
  issuedAt: new Date("2026-03-04T00:00:00.000Z"),
  expiresAt: null,
  notes: null,
  createdAt,
}

describe("bookings core admin contract", () => {
  it("booking row schema accepts a serialized row (§17 dates→strings)", () => {
    const parsed = bookingSchema.parse(toWire(booking))
    expect(parsed.id).toBe("bkg_1")
    expect(parsed.status).toBe("confirmed")
    expect(typeof parsed.createdAt).toBe("string")
    expect(parsed.confirmedAt).toBe("2026-05-15T12:00:00.000Z")
    expect(parsed.cancelledAt).toBeNull()
    expect(parsed.customFields).toEqual({ custom: { source: "intake" } })
    expect(parsed.startDate).toBe("2026-06-01")
  })

  it("traveler row schema accepts the projected wire shape (no personId)", () => {
    const parsed = bookingTravelerSchema.parse(toWire(traveler))
    expect(parsed.firstName).toBe("Ada")
    expect(parsed.isPrimary).toBe(true)
    expect("personId" in parsed).toBe(false)
  })

  it("item row schema accepts metadata jsonb + nullable columns", () => {
    const parsed = bookingItemSchema.parse(toWire(item))
    expect(parsed.itemType).toBe("unit")
    expect(parsed.metadata).toEqual({ lane: "vip" })
    expect(parsed.optionId).toBeNull()
    expect(parsed.serviceDate).toBe("2026-06-01")
  })

  it("item-traveler link row schema accepts a serialized row", () => {
    const parsed = bookingItemTravelerSchema.parse(toWire(itemTraveler))
    expect(parsed.role).toBe("traveler")
    expect(parsed.travelerId).toBe("btr_1")
  })

  it("allocation row schema accepts a serialized row", () => {
    const parsed = bookingAllocationSchema.parse(toWire(allocation))
    expect(parsed.status).toBe("confirmed")
    expect(parsed.availabilitySlotId).toBe("aslot_1")
    expect(parsed.confirmedAt).toBe("2026-05-15T12:00:00.000Z")
  })

  it("supplier-status row schema accepts a serialized row", () => {
    const parsed = bookingSupplierStatusSchema.parse(toWire(supplierStatus))
    expect(parsed.status).toBe("confirmed")
    expect(parsed.costAmountCents).toBe(5000)
  })

  it("fulfillment row schema accepts payload jsonb + nullable columns", () => {
    const parsed = bookingFulfillmentSchema.parse(toWire(fulfillment))
    expect(parsed.fulfillmentType).toBe("service_voucher")
    expect(parsed.deliveryChannel).toBe("email")
    expect(parsed.payload).toEqual({ ref: "abc" })
    expect(parsed.revokedAt).toBeNull()
  })

  it("redemption row schema accepts a serialized row", () => {
    const parsed = bookingRedemptionEventSchema.parse(toWire(redemption))
    expect(parsed.method).toBe("scan")
    expect(parsed.redeemedAt).toBe("2026-05-15T12:00:00.000Z")
  })

  it("activity row schema accepts a serialized row", () => {
    const parsed = bookingActivitySchema.parse(toWire(activity))
    expect(parsed.activityType).toBe("booking_confirmed")
    expect(parsed.metadata).toBeNull()
  })

  it("note row schema accepts a serialized row", () => {
    const parsed = bookingNoteSchema.parse(toWire(note))
    expect(parsed.content).toBe("Called the customer")
    expect(typeof parsed.createdAt).toBe("string")
  })

  it("document row schema accepts a serialized row", () => {
    const parsed = bookingDocumentSchema.parse(toWire(document))
    expect(parsed.type).toBe("visa")
    expect(parsed.expiresAt).toBeNull()
    expect(parsed.issuedNumber).toBeNull()
  })

  it("document row schema carries the identity of an externally issued document", () => {
    const parsed = bookingDocumentSchema.parse(toWire(recordedInvoice))
    expect(parsed.type).toBe("invoice")
    expect(parsed.issuedBy).toBe("Contabilitate SRL")
    expect(parsed.issuedSeries).toBe("VYT")
    expect(parsed.issuedNumber).toBe("1042")
    expect(parsed.issuedAt).toBe("2026-03-04T00:00:00.000Z")
  })

  it("detail schema hydrates the bookings-owned child collections (items/travelers/documents)", () => {
    // The `GET /{id}` detail read now composes the flat booking row with its
    // owned child collections so a single fetch exposes the records that exist
    // for the booking (regression cover for the null nested collections bug).
    const parsed = bookingDetailSchema.parse(
      toWire({ ...booking, items: [item], travelers: [traveler], documents: [document] }),
    )
    expect(parsed.id).toBe("bkg_1")
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]?.id).toBe("bki_1")
    expect(parsed.travelers).toHaveLength(1)
    expect(parsed.travelers[0]?.firstName).toBe("Ada")
    expect(parsed.documents).toHaveLength(1)
    expect(parsed.documents[0]?.type).toBe("visa")
  })

  it("detail schema requires the child collections (they can never be null/absent)", () => {
    // A flat booking row with no nested collections must fail — the detail
    // contract guarantees the arrays are always present (empty when no rows).
    expect(() => bookingDetailSchema.parse(toWire(booking))).toThrow(z.ZodError)
    const empty = bookingDetailSchema.parse(
      toWire({ ...booking, items: [], travelers: [], documents: [] }),
    )
    expect(empty.items).toEqual([])
    expect(empty.travelers).toEqual([])
    expect(empty.documents).toEqual([])
  })

  it("wraps booking rows in the canonical listResponseSchema envelope", () => {
    const envelope = listResponseSchema(bookingSchema)
    const parsed = envelope.parse(toWire({ data: [booking], total: 1, limit: 50, offset: 0 }))
    expect(parsed.data).toHaveLength(1)
    expect(parsed.data[0]?.id).toBe("bkg_1")
    expect(parsed.total).toBe(1)
    expect(parsed.limit).toBe(50)
    expect(parsed.offset).toBe(0)
  })

  it("aggregates composite schema accepts a serialized payload", () => {
    const aggregates = {
      total: 3,
      totalPax: 7,
      countsByStatus: [{ status: "confirmed" as const, count: 2 }],
      monthlyCounts: [{ yearMonth: "2026-05", count: 3 }],
      monthlyRevenue: [{ yearMonth: "2026-05", currency: "EUR", sellAmountCents: 120000 }],
      upcomingDepartures: {
        count: 1,
        items: [
          {
            id: "bkg_1",
            bookingNumber: "BK-0001",
            status: "confirmed" as const,
            startDate: "2026-06-01",
            endDate: "2026-06-08",
            pax: 2,
            sellCurrency: "EUR",
            sellAmountCents: 120000,
          },
        ],
      },
    }
    const parsed = bookingAggregatesSchema.parse(toWire(aggregates))
    expect(parsed.total).toBe(3)
    expect(parsed.upcomingDepartures.items[0]?.bookingNumber).toBe("BK-0001")
  })

  it("sharing-group summary schema accepts a serialized row", () => {
    const summary = {
      id: "grp_1",
      label: "Room 101",
      occupancy: 2,
      roomTypeId: null,
      bookingIds: ["bkg_1", "bkg_2"],
    }
    const parsed = sharingGroupSummarySchema.parse(toWire(summary))
    expect(parsed.occupancy).toBe(2)
    expect(parsed.bookingIds).toEqual(["bkg_1", "bkg_2"])
  })

  it("rejects a booking row missing required columns (schema is a real contract)", () => {
    const { id: _omit, ...withoutId } = toWire(booking) as Record<string, unknown>
    expect(() => bookingSchema.parse(withoutId)).toThrow(z.ZodError)
  })
})
