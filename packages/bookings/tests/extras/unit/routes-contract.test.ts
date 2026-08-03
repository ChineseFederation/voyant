import { listResponseSchema } from "@voyant-travel/types"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { __test__ } from "../../../src/extras/routes.js"
import type { BookingExtra, ExtraParticipantSelection } from "../../../src/extras/schema.js"

/**
 * Contract tests for the booking-extras admin wire shapes (voyant#2114).
 * The handlers serialize Drizzle rows whose `timestamp` columns are `Date`s;
 * `c.json(...)` turns them into ISO strings on the wire. These tests assert the
 * authored OpenAPI response row schemas match the serialized wire form
 * (§17 Date→string) via a JSON round-trip, that the canonical
 * `listResponseSchema(...)` envelope wraps the booking-extra row, and that the
 * bespoke slot manifest composite (slot + extras + travelers + selections)
 * accepts a serialized manifest.
 */

const {
  bookingExtraSchema,
  extraParticipantSelectionSchema,
  slotExtraManifestSchema,
  manifestSlotSchema,
  manifestExtraSchema,
  manifestTravelerSchema,
  manifestSelectionSchema,
  manifestSummarySchema,
} = __test__

/** Reproduce the wire form: JSON serialize then re-parse (Date → ISO string). */
function toWire<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

const createdAt = new Date("2026-05-15T10:00:00.000Z")
const updatedAt = new Date("2026-05-15T11:00:00.000Z")

const bookingExtra: BookingExtra = {
  id: "bkx_1",
  bookingId: "bkg_1",
  productExtraId: "pex_1",
  optionExtraConfigId: null,
  name: "Airport transfer",
  description: null,
  status: "selected",
  pricingMode: "per_booking",
  pricedPerPerson: false,
  quantity: 1,
  sellCurrency: "EUR",
  unitSellAmountCents: 2500,
  totalSellAmountCents: 2500,
  costCurrency: null,
  unitCostAmountCents: null,
  totalCostAmountCents: null,
  notes: null,
  metadata: { source: "manifest" },
  createdAt,
  updatedAt,
}

const selection: ExtraParticipantSelection = {
  id: "eps_1",
  bookingId: "bkg_1",
  bookingItemId: "bki_1",
  travelerId: "btr_1",
  productExtraId: "pex_1",
  optionExtraConfigId: null,
  status: "selected",
  collectionMode: "booking_total",
  collectionStatus: "not_required",
  collectionCurrency: "EUR",
  collectionAmountCents: 2500,
  collectedAt: null,
  collectedBy: null,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const manifestSlot = {
  id: "avs_1",
  productId: "prod_1",
  optionId: null,
  facilityId: null,
  availabilityRuleId: null,
  startTimeId: null,
  dateLocal: "2026-06-01",
  startsAt: createdAt,
  endsAt: null,
  timezone: "Europe/Bucharest",
  status: "open" as const,
  unlimited: false,
  initialPax: 10,
  remainingPax: 8,
  initialPickups: null,
  remainingPickups: null,
  remainingResources: null,
  pastCutoff: false,
  tooEarly: false,
  nights: null,
  days: null,
  notes: null,
  createdAt,
  updatedAt,
}

const manifestExtra = {
  id: "pex_1",
  productId: "prod_1",
  supplierId: null,
  code: null,
  name: "Airport transfer",
  description: null,
  selectionType: "optional" as const,
  pricingMode: "per_booking" as const,
  pricedPerPerson: false,
  collectionMode: "booking_total" as const,
  showOnSlotManifest: true,
  minQuantity: null,
  maxQuantity: null,
  defaultQuantity: null,
  active: true,
  sortOrder: 0,
  metadata: null,
  createdAt,
  updatedAt,
}

const manifestTraveler = {
  id: "btr_1",
  bookingId: "bkg_1",
  bookingNumber: "BKG-0001",
  bookingStatus: "confirmed",
  participantType: "traveler",
  travelerCategory: null,
  firstName: "Ada",
  lastName: "Lovelace",
  email: null,
  phone: null,
  isPrimary: true,
  createdAt,
  fullName: "Ada Lovelace",
}

const manifestSelectionRow = {
  bookingId: "bkg_1",
  travelerId: "btr_1",
  productExtraId: "pex_1",
  optionExtraConfigId: null,
  bookingItemId: "bki_1",
  status: "selected",
  selected: true,
  collectionMode: "booking_total" as const,
  collectionStatus: "not_required",
  collectionCurrency: "EUR",
  collectionAmountCents: 2500,
  collectedAt: null,
  collectedBy: null,
  notes: null,
  metadata: null,
  source: "selection" as const,
  quantity: 1,
}

const manifestSummaryRow = {
  productExtraId: "pex_1",
  name: "Airport transfer",
  code: null,
  supplierId: null,
  selectionType: "optional",
  pricingMode: "per_booking",
  pricedPerPerson: false,
  collectionMode: "booking_total" as const,
  eligibleTravelerCount: 1,
  selectedTravelerCount: 1,
  totalQuantity: 1,
  fulfilledTravelerCount: 0,
  cancelledTravelerCount: 0,
  noShowTravelerCount: 0,
  collection: { notRequired: 1, pending: 0, collected: 0, waived: 0, refunded: 0 },
  collectionCurrency: "EUR",
  collectionAmountCents: 2500,
  outstandingCollectionCount: 0,
  fulfillmentComplete: false,
}

describe("booking-extras admin contract", () => {
  it("booking-extra row schema accepts a serialized row (§17 dates→strings)", () => {
    const parsed = bookingExtraSchema.parse(toWire(bookingExtra))
    expect(parsed.id).toBe("bkx_1")
    expect(parsed.status).toBe("selected")
    expect(typeof parsed.createdAt).toBe("string")
    expect(parsed.createdAt).toBe("2026-05-15T10:00:00.000Z")
    expect(parsed.metadata).toEqual({ source: "manifest" })
    expect(parsed.optionExtraConfigId).toBeNull()
  })

  it("participant-selection row schema accepts a serialized row", () => {
    const parsed = extraParticipantSelectionSchema.parse(toWire(selection))
    expect(parsed.id).toBe("eps_1")
    expect(parsed.collectionMode).toBe("booking_total")
    expect(parsed.collectedAt).toBeNull()
    expect(parsed.collectionAmountCents).toBe(2500)
  })

  it("manifest slot/extra/traveler/selection sub-schemas accept serialized rows", () => {
    expect(manifestSlotSchema.parse(toWire(manifestSlot)).status).toBe("open")
    expect(manifestExtraSchema.parse(toWire(manifestExtra)).selectionType).toBe("optional")
    const traveler = manifestTravelerSchema.parse(toWire(manifestTraveler))
    expect(traveler.fullName).toBe("Ada Lovelace")
    expect(traveler.travelerCategory).toBeNull()
    const sel = manifestSelectionSchema.parse(toWire(manifestSelectionRow))
    expect(sel.selected).toBe(true)
    expect(sel.source).toBe("selection")
    expect(sel.quantity).toBe(1)
    const summary = manifestSummarySchema.parse(toWire(manifestSummaryRow))
    expect(summary.totalQuantity).toBe(1)
    expect(summary.collection.notRequired).toBe(1)
    expect(summary.fulfillmentComplete).toBe(false)
  })

  it("slot manifest composite schema accepts a full serialized manifest", () => {
    const parsed = slotExtraManifestSchema.parse(
      toWire({
        slot: manifestSlot,
        extras: [manifestExtra],
        travelers: [manifestTraveler],
        selections: [manifestSelectionRow],
        summaries: [manifestSummaryRow],
      }),
    )
    expect(parsed.slot.id).toBe("avs_1")
    expect(parsed.extras).toHaveLength(1)
    expect(parsed.travelers[0]?.fullName).toBe("Ada Lovelace")
    expect(parsed.selections[0]?.productExtraId).toBe("pex_1")
    expect(parsed.summaries[0]?.selectedTravelerCount).toBe(1)
  })

  it("wraps booking-extra rows in the canonical listResponseSchema envelope", () => {
    const envelope = listResponseSchema(bookingExtraSchema)
    const parsed = envelope.parse(toWire({ data: [bookingExtra], total: 1, limit: 50, offset: 0 }))
    expect(parsed.data).toHaveLength(1)
    expect(parsed.data[0]?.id).toBe("bkx_1")
    expect(parsed.total).toBe(1)
    expect(parsed.limit).toBe(50)
    expect(parsed.offset).toBe(0)
  })

  it("rejects a row missing required columns (schema is a real contract)", () => {
    const { id: _omit, ...withoutId } = toWire(bookingExtra) as Record<string, unknown>
    expect(() => bookingExtraSchema.parse(withoutId)).toThrow(z.ZodError)
  })
})
