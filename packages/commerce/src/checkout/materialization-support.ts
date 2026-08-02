// agent-quality: file-size exception -- owner: commerce; the checkout
// materialization-support helpers are one cohesive family (allocations,
// travelers, supplier/date/title resolution) extracted together to preserve
// behavior; splitting would scatter a single snapshot→booking bridge.
import { buildBookingRouteRuntime, createBookingPiiService } from "@voyant-travel/bookings"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { DraftPayload, MaterializationSnapshot } from "./materialization.js"
import type { CheckoutModuleOptions } from "./options.js"

interface MaterializedBooking {
  id: string
  status: string
  startDate: string | null
  endDate: string | null
}

interface InsertedBookingItem {
  id: string
  quantity?: number | null
  optionId?: string | null
  optionUnitId?: string | null
}

export async function materializeBookingAllocations(
  db: PostgresJsDatabase,
  booking: MaterializedBooking,
  insertedItems: ReadonlyArray<InsertedBookingItem>,
  draftPayload: DraftPayload,
  snapshot: MaterializationSnapshot,
): Promise<void> {
  const slotId = pickString(draftPayload.configure?.departureSlotId)
  if (!slotId || insertedItems.length === 0) return

  const { bookingAllocations } = await import("@voyant-travel/bookings/schema")
  const existing = await db
    .select({ id: bookingAllocations.id })
    .from(bookingAllocations)
    .where(eq(bookingAllocations.bookingId, booking.id))
    .limit(1)
  if (existing.length > 0) return

  const productId = snapshot.entity_module === "products" ? snapshot.entity_id : null
  const status: "held" | "confirmed" =
    booking.status === "confirmed" ||
    booking.status === "in_progress" ||
    booking.status === "completed"
      ? "confirmed"
      : "held"
  const confirmedAt = status === "confirmed" ? new Date() : null

  await db.insert(bookingAllocations).values(
    insertedItems.map((item) => ({
      bookingId: booking.id,
      bookingItemId: item.id,
      productId,
      optionId: item.optionId ?? null,
      optionUnitId: item.optionUnitId ?? null,
      availabilitySlotId: slotId,
      quantity: item.quantity ?? 1,
      status,
      confirmedAt,
    })),
  )
}

export function inferSnapshotTaxFacts(snapshot: MaterializationSnapshot) {
  const content = snapshot.frozen_payload?.content
  const accommodationCountries = extractAccommodationCountries(content)
  return {
    hasAccommodation: accommodationCountries.length > 0,
    accommodationCountries,
  }
}

function extractAccommodationCountries(value: unknown): string[] {
  const countries = new Set<string>()
  collectAccommodationCountries(value, countries, 0)
  return [...countries]
}

function collectAccommodationCountries(value: unknown, countries: Set<string>, depth: number) {
  if (depth > 6 || value == null) return
  if (Array.isArray(value)) {
    for (const item of value) collectAccommodationCountries(item, countries, depth + 1)
    return
  }
  if (typeof value !== "object") return

  const record = value as Record<string, unknown>
  const typeValue = pickString(record.type, record.kind, record.serviceType, record.service_type)
  const looksLikeAccommodation =
    typeValue?.toLowerCase().includes("accommodation") ||
    typeValue?.toLowerCase().includes("hotel") ||
    typeValue?.toLowerCase().includes("lodging")
  if (looksLikeAccommodation) {
    const country = pickString(record.countryCode, record.country_code, record.country)
    if (country && /^[a-z]{2}$/i.test(country)) countries.add(country.toUpperCase())
  }

  for (const child of Object.values(record)) {
    collectAccommodationCountries(child, countries, depth + 1)
  }
}

export async function materializeTravelerTravelDetails(
  db: PostgresJsDatabase,
  insertedTravelers: Array<{ id: string }>,
  draftTravelers: NonNullable<DraftPayload["travelers"]>,
  env: Record<string, unknown>,
): Promise<void> {
  const runtime = buildBookingRouteRuntime(env)
  const pii = createBookingPiiService({ kms: await runtime.getKmsProvider() })

  for (const [index, traveler] of insertedTravelers.entries()) {
    const draftTraveler = draftTravelers[index]
    if (!draftTraveler) continue

    const details = extractDraftTravelerTravelDetails(draftTraveler, index)
    if (!hasTravelDetails(details)) continue

    await pii.upsertTravelerTravelDetails(db, traveler.id, details, "system")
  }
}

function extractDraftTravelerTravelDetails(
  traveler: NonNullable<DraftPayload["travelers"]>[number],
  index: number,
) {
  const documents = traveler.documents ?? {}
  const documentType = pickIdentityDocumentType(
    traveler.documentType,
    documents.documentType,
    documents.document_type,
  )
  return {
    nationality: pickString(traveler.nationality, documents.nationality, documents.country),
    documentType,
    documentNumber: pickString(
      traveler.documentNumber,
      traveler.passportNumber,
      documents.documentNumber,
      documents.passportNumber,
      documents.passport_number,
      documents.document_number,
      documents.passport,
    ),
    documentExpiry: pickString(
      traveler.documentExpiry,
      traveler.passportExpiry,
      traveler.passportExpiresAt,
      documents.documentExpiry,
      documents.passportExpiry,
      documents.passport_expiry,
      documents.document_expiry,
      documents.passportExpiresAt,
    ),
    dateOfBirth: pickString(
      traveler.dateOfBirth,
      documents.dateOfBirth,
      documents.date_of_birth,
      documents.dob,
    ),
    dietaryRequirements: pickString(
      traveler.dietaryRequirements,
      documents.dietaryRequirements,
      documents.dietary,
    ),
    accessibilityNeeds: pickString(
      traveler.accessibilityNeeds,
      documents.accessibilityNeeds,
      documents.accessibility,
    ),
    isLeadTraveler: traveler.isLeadTraveler ?? traveler.isPrimary ?? index === 0,
  }
}

function hasTravelDetails(input: ReturnType<typeof extractDraftTravelerTravelDetails>): boolean {
  return (
    Boolean(input.nationality) ||
    Boolean(input.documentType) ||
    Boolean(input.documentNumber) ||
    Boolean(input.documentExpiry) ||
    Boolean(input.dateOfBirth) ||
    Boolean(input.dietaryRequirements) ||
    Boolean(input.accessibilityNeeds) ||
    input.isLeadTraveler
  )
}

/**
 * Resolve supplier info for the booking from the catalog snapshot.
 * Pulls from:
 *   1. `catalog_sourced_entries.projection.supplierId` — supplier
 *      name/id captured at sync time (covers Bokun, demo adapter, etc.).
 *   2. The frozen payload's `upstream_payload.supplierId` — fallback
 *      when the sourced-entries row is missing (legacy bookings).
 *   3. `frozen_payload.reserve.orderId` — used as `supplierReference`
 *      so operators can match up against the upstream provider's
 *      booking reference.
 *
 * Returns null when no supplier can be resolved — the caller treats
 * that as "skip auto-fill, leave blank for manual entry".
 */
export async function resolveSupplierFromSnapshot(
  db: PostgresJsDatabase,
  snapshot: MaterializationSnapshot,
): Promise<{
  serviceName: string
  supplierReference: string | null
  supplierServiceId: string | null
  upstreamCostCents: number | null
} | null> {
  let supplierName: string | null = null
  let serviceName: string | null = null
  let upstreamCostCents: number | null = null

  // Layer 1: sourced entry projection.
  try {
    const { catalogSourcedEntriesTable } = await import("@voyant-travel/catalog")
    const [sourcedEntry] = await db
      .select({ projection: catalogSourcedEntriesTable.projection })
      .from(catalogSourcedEntriesTable)
      .where(
        and(
          eq(catalogSourcedEntriesTable.entity_module, snapshot.entity_module),
          eq(catalogSourcedEntriesTable.entity_id, snapshot.entity_id),
        ),
      )
      .limit(1)
    if (sourcedEntry?.projection) {
      const p = sourcedEntry.projection as Record<string, unknown>
      supplierName = pickString(p.supplierName, p.supplier_name, p.supplierId)
      serviceName = pickString(p.name, p.title)
      const cost = p.upstreamCostCents ?? p.netPriceCents ?? p.costCents
      if (typeof cost === "number" && Number.isFinite(cost)) upstreamCostCents = cost
    }
  } catch {
    // continue
  }

  // Layer 2: frozen upstream payload.
  if (!supplierName || !serviceName) {
    const upstream = (snapshot.frozen_payload?.quote as Record<string, unknown> | undefined)
      ?.upstream_payload as Record<string, unknown> | undefined
    if (upstream) {
      supplierName = supplierName ?? pickString(upstream.supplierName, upstream.supplierId)
      serviceName = serviceName ?? pickString(upstream.name, upstream.title)
    }
  }

  // Layer 3: fallback labels.
  if (!serviceName) serviceName = `${snapshot.entity_module} booking`

  // Reserve.orderId is the upstream provider's reference for this
  // booking — operators reconcile against it when the supplier
  // sends a confirmation. Falls back to the snapshot's source_ref.
  const reserve = snapshot.frozen_payload?.reserve as Record<string, unknown> | undefined
  const supplierReference =
    pickString(reserve?.orderId, reserve?.upstream_ref) ?? snapshot.source_ref

  // Compose the human label: "$serviceName" if no supplier name,
  // "$supplierName · $serviceName" otherwise — gives operators the
  // most useful one-line scan in the supplier statuses table.
  const composedName = supplierName ? `${supplierName} · ${serviceName}` : serviceName

  return {
    serviceName: composedName,
    supplierReference,
    supplierServiceId: null,
    upstreamCostCents,
  }
}

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) if (typeof c === "string" && c.length > 0) return c
  return null
}

function pickIdentityDocumentType(
  ...candidates: unknown[]
): "passport" | "id_card" | "driver_license" | "visa" | "other" | null {
  const value = pickString(...candidates)
  if (
    value === "passport" ||
    value === "id_card" ||
    value === "driver_license" ||
    value === "visa" ||
    value === "other"
  ) {
    return value
  }
  return null
}

/**
 * Resolve booking-level dates from the draft and frozen source data.
 * `start_date`/`end_date` drive the admin booking header, while item
 * dates drive the line table. A storefront product selection usually
 * carries only `departureSlotId`, so we resolve that id against the
 * quote/reserve/content payload before falling back to free-form dates.
 */
export function extractBookingDates(
  snapshot: Pick<MaterializationSnapshot, "frozen_payload">,
  draftPayload: DraftPayload,
): { startDate: string | null; endDate: string | null } {
  const range = draftPayload.configure?.dateRange
  if (range?.checkIn) {
    return {
      startDate: range.checkIn.slice(0, 10),
      endDate: range.checkOut ? range.checkOut.slice(0, 10) : null,
    }
  }

  const selectedDeparture = findSelectedDeparture(snapshot, draftPayload)
  if (selectedDeparture?.startsRaw) {
    return {
      startDate: selectedDeparture.startsRaw.slice(0, 10),
      endDate: selectedDeparture.endsRaw ? selectedDeparture.endsRaw.slice(0, 10) : null,
    }
  }

  if (typeof draftPayload.configure?.departureDate === "string") {
    return {
      startDate: draftPayload.configure.departureDate.slice(0, 10),
      endDate: null,
    }
  }

  return { startDate: null, endDate: null }
}

/**
 * Pull start/end dates for a booking-item from the most reliable
 * source available. Order:
 *   1. The selected `departureSlotId` resolved against reserve /
 *      quote / captured content payloads.
 *   2. `frozen_payload.quote.upstream_payload.metadata.days[]` —
 *      Bokun-style itinerary captured at quote time, gives us per-day
 *      dates with full timezone fidelity.
 *   3. Draft `configure.dateRange.checkIn`/`checkOut` — what the
 *      customer selected on the storefront before booking.
 *   4. Draft `configure.departureDate` — single-day tour selection.
 *   5. Booking row's own `start_date` / `end_date` columns — the
 *      caller already populated these from the same draft when
 *      writing the booking row, so this is a final safety net.
 *
 * Returns nulls when nothing resolves — the caller treats that as
 * "no date data, leave NULL" rather than fabricating one.
 */
export function extractItemDates(
  snapshot: MaterializationSnapshot,
  draftPayload: DraftPayload,
  booking: MaterializedBooking,
): { serviceDate: string | null; startsAt: Date | null; endsAt: Date | null } {
  // Layer 1: concrete selected departure/sailing.
  const selectedDeparture = findSelectedDeparture(snapshot, draftPayload)
  if (selectedDeparture?.startsRaw) {
    const startsAt = new Date(selectedDeparture.startsRaw)
    const endsAt = selectedDeparture.endsRaw ? new Date(selectedDeparture.endsRaw) : null
    if (Number.isFinite(startsAt.getTime())) {
      return {
        serviceDate: selectedDeparture.startsRaw.slice(0, 10),
        startsAt,
        endsAt: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt : null,
      }
    }
  }

  // Layer 2: upstream metadata.days[] — flat array of {date, ...} or
  // {startAt/endAt} entries.
  const days = (
    (snapshot.frozen_payload?.quote as Record<string, unknown> | undefined)?.upstream_payload as
      | Record<string, unknown>
      | undefined
  )?.metadata as Record<string, unknown> | undefined
  const daysArray = (days?.days ?? days) as Array<Record<string, unknown>> | undefined
  if (Array.isArray(daysArray) && daysArray.length > 0) {
    const first = daysArray[0]
    const last = daysArray[daysArray.length - 1]
    const startsRaw = pickString(first?.startAt, first?.startsAt, first?.date)
    const endsRaw = pickString(last?.endAt, last?.endsAt, last?.date)
    if (startsRaw) {
      const startsAt = new Date(startsRaw)
      const endsAt = endsRaw ? new Date(endsRaw) : null
      if (Number.isFinite(startsAt.getTime())) {
        return {
          serviceDate: startsRaw.slice(0, 10),
          startsAt,
          endsAt: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt : null,
        }
      }
    }
  }

  // Layer 3: draft date range.
  const range = draftPayload.configure?.dateRange
  if (range?.checkIn) {
    const startsAt = new Date(range.checkIn)
    const endsAt = range.checkOut ? new Date(range.checkOut) : null
    if (Number.isFinite(startsAt.getTime())) {
      return {
        serviceDate: range.checkIn.slice(0, 10),
        startsAt,
        endsAt: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt : null,
      }
    }
  }

  // Layer 4: single-day tour.
  if (typeof draftPayload.configure?.departureDate === "string") {
    const startsAt = new Date(draftPayload.configure.departureDate)
    if (Number.isFinite(startsAt.getTime())) {
      return {
        serviceDate: draftPayload.configure.departureDate.slice(0, 10),
        startsAt,
        endsAt: null,
      }
    }
  }

  // Layer 5: booking row dates (already populated from the draft).
  if (booking.startDate) {
    return {
      serviceDate: booking.startDate,
      startsAt: new Date(booking.startDate),
      endsAt: booking.endDate ? new Date(booking.endDate) : null,
    }
  }

  return { serviceDate: null, startsAt: null, endsAt: null }
}

function findSelectedDeparture(
  snapshot: Pick<MaterializationSnapshot, "frozen_payload">,
  draftPayload: DraftPayload,
): { startsRaw: string | null; endsRaw: string | null } | null {
  const slotId = pickString(draftPayload.configure?.departureSlotId)
  const frozen = snapshot.frozen_payload ?? {}
  const reserve = frozen.reserve as Record<string, unknown> | null | undefined
  const quote = frozen.quote as Record<string, unknown> | null | undefined
  const quotePayload = quote?.upstream_payload as Record<string, unknown> | null | undefined
  const content = frozen.content as Record<string, unknown> | null | undefined

  const direct = departureDatesFromRecord(
    asRecord(reserve?.departure) ?? asRecord(quotePayload?.departure),
  )
  if (direct?.startsRaw && (!slotId || direct.id === slotId)) {
    return direct
  }

  if (!slotId) return direct?.startsRaw ? direct : null

  const candidates = [
    content?.departures,
    (content?.product as Record<string, unknown> | undefined)?.departures,
    quotePayload?.departures,
    (quotePayload?.metadata as Record<string, unknown> | undefined)?.departures,
  ]

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    for (const item of candidate) {
      const row = asRecord(item)
      if (!row || row.id !== slotId) continue
      const dates = departureDatesFromRecord(row)
      if (dates?.startsRaw) return dates
    }
  }

  return null
}

function departureDatesFromRecord(
  row: Record<string, unknown> | undefined,
): { id: string | null; startsRaw: string | null; endsRaw: string | null } | null {
  if (!row) return null
  const startsRaw = pickString(
    row.starts_at,
    row.startsAt,
    row.start_at,
    row.startAt,
    row.start_date,
    row.startDate,
    row.date,
  )
  if (!startsRaw) return null
  return {
    id: pickString(row.id),
    startsRaw,
    endsRaw: pickString(row.ends_at, row.endsAt, row.end_at, row.endAt, row.end_date, row.endDate),
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Pull a description for the booking item from the upstream payload.
 * Sourced products typically carry rich descriptions on the upstream
 * entry; surfacing a short snippet on the item helps operators scan
 * a multi-item booking without clicking into each line.
 */
export function extractItemDescription(snapshot: MaterializationSnapshot): string | null {
  const upstream = (snapshot.frozen_payload?.quote as Record<string, unknown> | undefined)
    ?.upstream_payload as Record<string, unknown> | undefined
  const desc = pickString(upstream?.description, upstream?.summary, upstream?.short_description)
  if (!desc) return null
  // Cap at 600 chars — anything longer belongs in the catalog source
  // sheet rather than on every booking-item row.
  return desc.length > 600 ? `${desc.slice(0, 597)}…` : desc
}

/**
 * Look up the upstream cost (net rate the operator pays the supplier)
 * for a sourced entity. Returns null when the adapter doesn't expose
 * a net/gross split — caller falls back to sell-as-cost (zero-markup
 * default).
 */
export async function resolveUpstreamCostCents(
  db: PostgresJsDatabase,
  snapshot: MaterializationSnapshot,
): Promise<number | null> {
  try {
    const { catalogSourcedEntriesTable } = await import("@voyant-travel/catalog")
    const [sourced] = await db
      .select({ projection: catalogSourcedEntriesTable.projection })
      .from(catalogSourcedEntriesTable)
      .where(
        and(
          eq(catalogSourcedEntriesTable.entity_module, snapshot.entity_module),
          eq(catalogSourcedEntriesTable.entity_id, snapshot.entity_id),
        ),
      )
      .limit(1)
    if (sourced?.projection) {
      const p = sourced.projection as Record<string, unknown>
      const cost = p.upstreamCostCents ?? p.netPriceCents ?? p.costCents
      if (typeof cost === "number" && Number.isFinite(cost)) return cost
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Resolve a human title for the booking line item. Tries:
 *   1. `catalog_sourced_entries.projection.name` — sourced products
 *      (demo, Bokun, …) all carry the upstream title there.
 *   2. The injected `getOwnedProductName` — owned products from this
 *      deployment's products module (injected because inventory
 *      depends on commerce; a static import would cycle).
 *   3. A generic "$module booking" fallback.
 *
 * Errors fall through quietly — a title is purely cosmetic, the
 * booking-item row should always insert successfully.
 */
export async function resolveLineItemTitle(
  db: PostgresJsDatabase,
  snapshot: { entity_module: string; entity_id: string },
  options: Pick<CheckoutModuleOptions, "getOwnedProductName">,
): Promise<string> {
  try {
    const { catalogSourcedEntriesTable } = await import("@voyant-travel/catalog")
    const [sourcedEntry] = await db
      .select({ projection: catalogSourcedEntriesTable.projection })
      .from(catalogSourcedEntriesTable)
      .where(
        and(
          eq(catalogSourcedEntriesTable.entity_module, snapshot.entity_module),
          eq(catalogSourcedEntriesTable.entity_id, snapshot.entity_id),
        ),
      )
      .limit(1)
    if (sourcedEntry?.projection) {
      const projection = sourcedEntry.projection as Record<string, unknown>
      const candidate = projection.name ?? projection.title
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate
      }
    }
  } catch {
    // continue to owned-products fallback
  }

  if (snapshot.entity_module === "products") {
    try {
      const name = await options.getOwnedProductName(db, snapshot.entity_module, snapshot.entity_id)
      if (name) return name
    } catch {
      // continue to generic fallback
    }
  }

  return `${snapshot.entity_module} booking`
}

export function travelerBandToCategory(
  band: string | undefined,
): "adult" | "child" | "infant" | "senior" | "other" {
  if (band === "child" || band === "infant" || band === "senior") return band
  return "adult"
}
