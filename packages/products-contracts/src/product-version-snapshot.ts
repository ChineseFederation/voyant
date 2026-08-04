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
 * One day service as frozen in a version snapshot. Costing columns
 * (`costCurrency`, `costAmountCents`, …) are tolerated but not required here;
 * the tracer reads the operational columns. `inclusionRole` / `travelerScope`
 * default so a snapshot taken before those columns existed still parses.
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
