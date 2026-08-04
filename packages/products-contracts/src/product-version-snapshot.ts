/**
 * Typed reader for the frozen `product_versions.snapshot` JSONB.
 *
 * `buildProductVersionSnapshot` (inventory) writes a snapshot of the product
 * row plus its options/units, itineraries, days and day services when a version
 * is minted. Until now that blob had ZERO readers — it was written and never
 * re-hydrated. The multi-day tracer (voyant#4035) is the first consumer, and
 * voyant#4189 will be the second, so the shape needs one shared, validated
 * entry point rather than each caller re-deriving `snapshot.itineraries?.[0]`.
 *
 * Two design choices matter:
 *
 *   1. It parses loudly. A snapshot whose top level is not an object, or whose
 *      `itineraries` is not an array of the expected shape, throws
 *      `ProductVersionSnapshotError` rather than silently yielding an empty
 *      itinerary — a departure materialized from a snapshot we could not read
 *      is a bug we must see, not paper over.
 *
 *   2. It is tolerant where it must be. The product row carries dozens of
 *      columns the tracer does not need, and older snapshots predate the
 *      operational day-service fields; the product-level object and each node
 *      pass unknown keys through, and the operational fields default when a
 *      legacy snapshot omits them. Only the structure the tracer walks is
 *      pinned.
 *
 * Pure zod, no Drizzle — this lives in the contracts package so both inventory
 * (which produces the snapshot) and operations (which materializes from it) can
 * depend on it without a schema-layer or cross-module table dependency.
 */
import {
  dayServiceInclusionRoleSchema,
  dayServiceTravelerScopeSchema,
  serviceTypeSchema,
  z,
} from "./validation-shared.js"

/**
 * How a day service's planned-cost rate is expressed — the unit `rateCents` is
 * priced per. Mirrors the inventory `day_service_planned_cost_basis` enum and,
 * through it, the supplier `rate_unit` vocabulary it reuses where they map
 * (`per_person`, `per_night`, `per_vehicle`, `flat`). See voyant#4037.
 */
export const plannedCostBasisSchema = z.enum([
  "flat",
  "per_person",
  "per_room",
  "per_night",
  "per_vehicle",
  "per_service_unit",
])

export type PlannedCostBasis = z.infer<typeof plannedCostBasisSchema>

/**
 * Which authoritative departure quantity multiplies the planned-cost rate.
 * Mirrors the inventory `day_service_quantity_driver` enum. A departure resolver
 * reads the driver to pick the multiplier: `fixed` → 1, `service_units` → the
 * frozen `quantity`, and `pax`/`rooms`/`nights`/`vehicles` from the departure.
 */
export const costQuantityDriverSchema = z.enum([
  "fixed",
  "pax",
  "rooms",
  "nights",
  "vehicles",
  "service_units",
])

export type CostQuantityDriver = z.infer<typeof costQuantityDriverSchema>

/**
 * The declared, versioned planned-cost contract frozen for one day service —
 * the whole point of voyant#4037. It carries the rate and the two things a
 * departure needs to restate it against its own scale without guessing: the
 * `basis` (what the rate is priced per) and the `driver` (which departure
 * quantity multiplies it). `fxRates`/`resolvedAt` are the optional frozen-FX
 * carrier; they are null when the version was minted without an FX runtime, in
 * which case the reader restates at its own issue-date rate (Finance's
 * deliberate design) rather than a stale build-time rate. `version` lets the
 * block evolve without breaking older snapshots.
 */
export const snapshotPlannedCostSchema = z
  .object({
    version: z.literal(1),
    basis: plannedCostBasisSchema,
    driver: costQuantityDriverSchema,
    /** The service's configured quantity — the multiplier for `service_units`. */
    quantity: z.number().int(),
    /** The rate, in minor units of `currency`, priced per the `basis` unit. */
    rateCents: z.number().int(),
    /** The day-service cost currency — NOT the product sell currency. */
    currency: z.string(),
    /** Frozen FX rate set (source currency → base rate), or null. */
    fxRates: z.record(z.string(), z.number()).nullable().default(null),
    /** ISO instant the FX set was resolved at, or null. */
    resolvedAt: z.string().nullable().default(null),
  })
  .passthrough()

export type SnapshotPlannedCost = z.infer<typeof snapshotPlannedCostSchema>

/**
 * One day service as frozen in a version snapshot. `inclusionRole` /
 * `travelerScope` default so a snapshot taken before those columns existed still
 * parses. `plannedCost` is the voyant#4037 declared cost block; it is `nullish`
 * so a snapshot minted before the block existed still parses (the reader treats
 * a missing block as "no version-based planned cost" and falls back).
 *
 * `costCurrency` / `costAmountCents` are the day service's OWN cost columns,
 * frozen verbatim from `product_day_services`. They are deliberately distinct
 * from `plannedCost`: these are the flat, unscaled commitment figures the
 * booking converter (voyant#4189) writes onto `booking_supplier_statuses`,
 * whereas `plannedCost` is the driver-scaled budget block Finance restates
 * against a departure's own quantities. Both are declared because they answer
 * different questions and a reader must not silently substitute one for the
 * other. They are `nullish` so a snapshot predating either still parses.
 */
export const snapshotDayServiceSchema = z
  .object({
    id: z.string(),
    dayId: z.string(),
    serviceType: serviceTypeSchema,
    name: z.string(),
    supplierServiceId: z.string().nullish(),
    supplierId: z.string().nullish(),
    facilityId: z.string().nullish(),
    startTimeLocal: z.string().nullish(),
    endTimeLocal: z.string().nullish(),
    durationMinutes: z.number().int().nullish(),
    inclusionRole: dayServiceInclusionRoleSchema.default("included"),
    travelerScope: dayServiceTravelerScopeSchema.default("all"),
    sortOrder: z.number().int().nullish(),
    costCurrency: z.string().nullish(),
    costAmountCents: z.number().int().nullish(),
    plannedCost: snapshotPlannedCostSchema.nullish(),
  })
  .passthrough()

export type SnapshotDayService = z.infer<typeof snapshotDayServiceSchema>

/** One itinerary day, with its ordered services. */
export const snapshotDaySchema = z
  .object({
    id: z.string(),
    itineraryId: z.string(),
    dayNumber: z.number().int(),
    title: z.string().nullish(),
    services: z.array(snapshotDayServiceSchema).default([]),
  })
  .passthrough()

export type SnapshotDay = z.infer<typeof snapshotDaySchema>

/** One itinerary, with its ordered days. */
export const snapshotItinerarySchema = z
  .object({
    id: z.string(),
    productId: z.string(),
    isDefault: z.boolean(),
    days: z.array(snapshotDaySchema).default([]),
  })
  .passthrough()

export type SnapshotItinerary = z.infer<typeof snapshotItinerarySchema>

/**
 * The whole snapshot. The product columns are passed through (the tracer does
 * not care about marketing copy or media), but `itineraries` — the structure it
 * walks — is pinned. `days` mirrors the default itinerary's days at the top
 * level, exactly as `buildProductVersionSnapshot` writes it.
 */
export const productVersionSnapshotSchema = z
  .object({
    id: z.string(),
    itineraries: z.array(snapshotItinerarySchema),
    days: z.array(snapshotDaySchema).optional(),
  })
  .passthrough()

export type ProductVersionSnapshot = z.infer<typeof productVersionSnapshotSchema>

/** Thrown when a stored snapshot does not match the shape we know how to read. */
export class ProductVersionSnapshotError extends Error {
  constructor(
    message: string,
    readonly issues?: z.ZodIssue[],
  ) {
    super(message)
    this.name = "ProductVersionSnapshotError"
  }
}

/**
 * Parse a raw `product_versions.snapshot` value into a typed snapshot, throwing
 * `ProductVersionSnapshotError` on any shape we do not recognise. Never returns
 * a partial or empty snapshot for an unreadable blob — that failure must be
 * visible to the caller, not swallowed.
 */
export function parseProductVersionSnapshot(raw: unknown): ProductVersionSnapshot {
  const result = productVersionSnapshotSchema.safeParse(raw)
  if (!result.success) {
    throw new ProductVersionSnapshotError(
      "product_versions.snapshot did not match the expected shape",
      result.error.issues,
    )
  }
  return result.data
}

/**
 * The default itinerary's days from a snapshot, ordered by day number. The
 * default itinerary is the one the departure operates from; falls back to the
 * top-level `days` mirror, then the first itinerary, so a snapshot that only
 * populated one of those still yields the operable days.
 */
export function defaultItineraryDaysFromSnapshot(snapshot: ProductVersionSnapshot): SnapshotDay[] {
  const defaultItinerary =
    snapshot.itineraries.find((itinerary) => itinerary.isDefault) ?? snapshot.itineraries[0] ?? null

  const days = defaultItinerary?.days ?? snapshot.days ?? []
  return [...days].sort((a, b) => a.dayNumber - b.dayNumber)
}

// ---------- planned-cost resolution (voyant#4037) ----------

/**
 * The authoritative departure quantities a planned-cost driver reads. Supplied
 * by the caller from the departure itself — pax from booked travellers, rooms
 * and vehicles from `allocation_resources`, nights from `availability_slots`.
 * Null/absent quantities are treated as zero so a driver pointed at a quantity
 * the departure has not established resolves to zero cost, never a guess.
 */
export interface DepartureQuantities {
  pax?: number | null
  rooms?: number | null
  vehicles?: number | null
  nights?: number | null
}

/** One resolved planned-cost figure for a day service, in its own currency. */
export interface ResolvedPlannedCost {
  currency: string
  amountCents: number
  /** The multiplier the driver selected — surfaced so callers can explain it. */
  multiplier: number
}

const nonNegative = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0

/**
 * The multiplier a driver applies. `fixed` is one; `service_units` is the
 * service's frozen configured quantity; the rest read the departure. Kept pure
 * and total so it is exhaustively unit-testable without a database.
 */
export function departureQuantityForDriver(
  driver: CostQuantityDriver,
  quantities: DepartureQuantities,
  serviceQuantity: number,
): number {
  switch (driver) {
    case "fixed":
      return 1
    case "service_units":
      return nonNegative(serviceQuantity)
    case "pax":
      return nonNegative(quantities.pax)
    case "rooms":
      return nonNegative(quantities.rooms)
    case "vehicles":
      return nonNegative(quantities.vehicles)
    case "nights":
      return nonNegative(quantities.nights)
  }
}

/**
 * Resolve a frozen planned-cost block against a departure's authoritative
 * quantities. The rate (`rateCents`, priced per the basis unit) is multiplied by
 * the quantity the `driver` selects. Pure — no FX, no database. Multi-currency
 * is preserved by returning the block's own `currency`; the reader (Finance)
 * restates it into the accounting base at its own issue-date rate.
 */
export function resolvePlannedCost(
  block: SnapshotPlannedCost,
  quantities: DepartureQuantities,
): ResolvedPlannedCost {
  const multiplier = departureQuantityForDriver(block.driver, quantities, block.quantity)
  return {
    currency: block.currency,
    amountCents: Math.round(block.rateCents * multiplier),
    multiplier,
  }
}
