import {
  type BookingSelectionV1,
  bookingSelectionV1,
  type TravelerEntryV1,
} from "@voyant-travel/catalog/booking-engine/contracts"

import type { TripComponent } from "./schema.js"
import { TripsInvariantError } from "./service.js"

export interface CatalogComponentBookingDraftOverrides {
  configure?: Partial<BookingSelectionV1["configure"]>
  billing?: Partial<BookingSelectionV1["billing"]>
  travelers?: TravelerEntryV1[]
  accommodation?: BookingSelectionV1["accommodation"]
  addons?: BookingSelectionV1["addons"]
  payment?: Partial<BookingSelectionV1["payment"]>
  promotionCode?: string
  internalNotes?: string
  customerNotes?: string
}

type CatalogDraftComponent = Parameters<typeof toBookingSelectionV1>[0] & {
  id?: string
  metadata: Record<string, unknown>
}

export function isCatalogBackedTripComponent(
  component: Pick<TripComponent, "kind" | "entityModule" | "entityId" | "sourceKind">,
): boolean {
  return Boolean(
    component.kind === "catalog_booking" &&
      component.entityModule &&
      component.entityId &&
      component.sourceKind,
  )
}

export function toBookingSelectionV1(
  component: Pick<
    TripComponent,
    "kind" | "entityModule" | "entityId" | "sourceKind" | "sourceConnectionId" | "sourceRef"
  >,
  overrides: CatalogComponentBookingDraftOverrides = {},
): BookingSelectionV1 {
  if (!isCatalogBackedTripComponent(component)) {
    throw new TripsInvariantError(
      "Trip component cannot be mapped to a booking draft without catalog entity refs",
    )
  }

  return bookingSelectionV1.parse({
    entity: {
      module: component.entityModule,
      id: component.entityId,
      sourceKind: component.sourceKind,
      sourceConnectionId: component.sourceConnectionId ?? undefined,
      sourceRef: component.sourceRef ?? undefined,
    },
    configure: {
      pax: {},
      ...overrides.configure,
    },
    billing: overrides.billing,
    travelers: overrides.travelers,
    accommodation: overrides.accommodation,
    addons: overrides.addons,
    payment: overrides.payment,
    promotionCode: overrides.promotionCode,
    internalNotes: overrides.internalNotes,
    customerNotes: overrides.customerNotes,
  })
}

export function bookingDraftFromComponent(
  component: CatalogDraftComponent,
  overrides: CatalogComponentBookingDraftOverrides = {},
): BookingSelectionV1 {
  const candidate = component.metadata.bookingDraftV1 ?? component.metadata.bookingDraft
  const base =
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? bookingSelectionV1.parse(candidate)
      : toBookingSelectionV1(component)

  return bookingSelectionV1.parse({
    ...base,
    configure: {
      ...base.configure,
      ...overrides.configure,
    },
    billing: overrides.billing ? { ...base.billing, ...overrides.billing } : base.billing,
    travelers: overrides.travelers ?? base.travelers,
    accommodation: overrides.accommodation ?? base.accommodation,
    addons: overrides.addons ?? base.addons,
    payment: overrides.payment ? { ...base.payment, ...overrides.payment } : base.payment,
    promotionCode: overrides.promotionCode ?? base.promotionCode,
    internalNotes: overrides.internalNotes ?? base.internalNotes,
    customerNotes: overrides.customerNotes ?? base.customerNotes,
  })
}

export function assertCatalogComponentBookingDraftReady(
  component: CatalogDraftComponent,
  draft: BookingSelectionV1 = bookingDraftFromComponent(component),
): void {
  if (component.entityModule !== "accommodations") return

  const range = draft.configure.dateRange
  if (!validStayDateRange(range?.checkIn, range?.checkOut)) {
    const componentId = component.id ?? component.entityId ?? "unknown"
    throw new TripsInvariantError(
      `Accommodation trip component ${componentId} requires a valid check-in/check-out date range`,
    )
  }
}

function validStayDateRange(checkIn: string | undefined, checkOut: string | undefined): boolean {
  const start = isoDateMs(checkIn)
  const end = isoDateMs(checkOut)
  return start !== null && end !== null && end > start
}

function isoDateMs(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null
}
