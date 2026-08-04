/**
 * Frozen day-service resolution for proposal→booking conversion (voyant#4189).
 *
 * `booking_supplier_statuses` is the operator's record of which supplier
 * services a booking commits to. Conversion used to seed it from the LIVE,
 * mutable `product_day_services`, keyed on `product.id`. That defeats the
 * immutable Product Version RFC #4027 established precisely so a later Product
 * edit cannot silently mutate an already-sold Departure: edit a day service
 * after conversion and the committed supplier statuses correspond to no version
 * at all — not the one sold, not necessarily the current one — so the same
 * product edit produced different commitments depending only on WHEN conversion
 * happened.
 *
 * This resolver reads the frozen `product_versions.snapshot` for any conversion
 * whose departure is version-bound, and keeps the live read only where there is
 * no version to read. Three things are deliberate:
 *
 *   1. It decodes through the SHARED reader
 *      (`@voyant-travel/products-contracts/product-version-snapshot`, built by
 *      voyant#4035, whose own docblock names this consumer). There is exactly
 *      one parser for that blob; this file adds none.
 *
 *   2. It freezes the SAME figures the live read took — the day service's own
 *      `costCurrency` / `costAmountCents` — not the driver-scaled #4037
 *      `plannedCost` block. Those answer different questions: a commitment is a
 *      flat amount owed to a supplier, whereas planned cost is a budget Finance
 *      restates against a departure's own pax/rooms/nights. Swapping one for the
 *      other here would change committed booking economics under the cover of a
 *      freezing fix.
 *
 *   3. The fallback is REPORTED, never silent. Every resolution returns a
 *      `ConvertDayServiceProvenance` naming the source, the version (when any),
 *      and why it fell back — the same discipline `plannedCostCaveat` applies to
 *      planned cost in `packages/finance/src/service-profitability.ts`. The
 *      converter stamps it onto the booking so a reviewer can tell a
 *      version-backed commitment from a legacy one after the fact.
 *
 * `product_versions` is read through a local `*Ref` mirror rather than an
 * Inventory import: bookings is a retail-spine package and may not depend on the
 * Inventory authoring runtime (scripts/check-retail-spine-closure.mjs). The
 * mirror pins the table; the contracts reader pins the blob's shape.
 */
import {
  defaultItineraryDaysFromSnapshot,
  parseProductVersionSnapshot,
  type SnapshotDayService,
} from "@voyant-travel/products-contracts/product-version-snapshot"
import { and, asc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  productDayServicesRef,
  productDaysRef,
  productItinerariesRef,
  productVersionsRef,
} from "./products-ref.js"

/** One supplier commitment to seed onto `booking_supplier_statuses`. */
export interface ConvertDayService {
  supplierServiceId: string | null
  name: string
  costCurrency: string
  costAmountCents: number
}

/** Which source the day services were read from. */
export type ConvertDayServiceSource = "product_version" | "live_product"

/**
 * Why a conversion could not use a frozen Version. Each value is a distinct
 * operational situation, kept separate so the fallback rate can be read as
 * "legacy data" vs "unbound departure" rather than one undifferentiated blob.
 */
export type ConvertDayServiceFallbackReason =
  /** No departure was selected at all — nothing carries a version reference. */
  | "no_departure_selected"
  /** The departure exists but predates version binding (`product_version_id` is null). */
  | "departure_not_version_bound"
  /** The departure names a version whose row is gone, or belongs to another product. */
  | "product_version_missing"

/**
 * The recorded account of where a booking's supplier commitments came from.
 * Modelled on `ProfitabilityPlannedCostCaveat`: a fallback is a fact about the
 * data, so it is surfaced rather than papered over.
 */
export interface ConvertDayServiceProvenance {
  source: ConvertDayServiceSource
  /** The frozen Version the commitments were read from, when there was one. */
  productVersionId: string | null
  /** The departure the version was resolved through, when one was selected. */
  availabilitySlotId: string | null
  /** Null exactly when `source` is `product_version`. */
  fallbackReason: ConvertDayServiceFallbackReason | null
  /** Commitments seeded. */
  serviceCount: number
  /**
   * Frozen services dropped because the snapshot carried no cost columns —
   * `booking_supplier_statuses` requires both, so such a service cannot become a
   * commitment. Counted rather than defaulted to zero, which would invent a
   * free supplier service.
   */
  servicesMissingCost: number
}

export interface ConvertDayServiceResolution {
  dayServices: ConvertDayService[]
  provenance: ConvertDayServiceProvenance
}

/** The departure fields this resolver needs; supplied by the caller. */
export interface ConvertDeparture {
  id: string
  productVersionId: string | null
}

/**
 * Order commitments the way the live query did: globally by `sortOrder` then id,
 * with absent `sortOrder` last (Postgres `ORDER BY ... ASC` puts NULLs last).
 * Preserved verbatim so this change is about WHICH source is read, never about
 * the order commitments land in.
 */
function bySortOrderThenId(a: SnapshotDayService, b: SnapshotDayService): number {
  const left = a.sortOrder ?? Number.MAX_SAFE_INTEGER
  const right = b.sortOrder ?? Number.MAX_SAFE_INTEGER
  if (left !== right) return left - right
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The live, mutable read — the pre-#4189 behaviour, unchanged. Reached only when
 * there is no frozen Version to read, and always reported as such.
 */
async function readLiveDayServices(
  db: PostgresJsDatabase,
  productId: string,
): Promise<ConvertDayService[]> {
  // product_days is keyed by itinerary_id (products re-parented days onto
  // product_itineraries), so the per-product lookup joins through the itinerary.
  const days = await db
    .select({ id: productDaysRef.id })
    .from(productDaysRef)
    .innerJoin(productItinerariesRef, eq(productDaysRef.itineraryId, productItinerariesRef.id))
    .where(eq(productItinerariesRef.productId, productId))
    .orderBy(asc(productDaysRef.dayNumber))

  if (days.length === 0) return []

  return db
    .select({
      supplierServiceId: productDayServicesRef.supplierServiceId,
      name: productDayServicesRef.name,
      costCurrency: productDayServicesRef.costCurrency,
      costAmountCents: productDayServicesRef.costAmountCents,
    })
    .from(productDayServicesRef)
    .where(
      // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`${productDayServicesRef.dayId} IN (
        SELECT ${productDaysRef.id}
        FROM ${productDaysRef}
        INNER JOIN ${productItinerariesRef}
          ON ${productDaysRef.itineraryId} = ${productItinerariesRef.id}
        WHERE ${productItinerariesRef.productId} = ${productId}
      )`,
    )
    .orderBy(asc(productDayServicesRef.sortOrder), asc(productDayServicesRef.id))
}

function fallback(
  dayServices: ConvertDayService[],
  reason: ConvertDayServiceFallbackReason,
  departure: ConvertDeparture | null,
): ConvertDayServiceResolution {
  return {
    dayServices,
    provenance: {
      source: "live_product",
      productVersionId: null,
      availabilitySlotId: departure?.id ?? null,
      fallbackReason: reason,
      serviceCount: dayServices.length,
      servicesMissingCost: 0,
    },
  }
}

/**
 * Resolve the supplier commitments a conversion should seed.
 *
 * Prefers the frozen `product_versions.snapshot` reached through the selected
 * departure's `product_version_id`; falls back to the live product only when
 * there is no version to read, and says so in the returned provenance.
 *
 * ONE departure is consulted, because a conversion targets at most one: the
 * convert command carries a single top-level `slotId` and its `itemLines` carry
 * no per-line departure reference (see `convertProductSchema` in
 * `@voyant-travel/bookings-contracts`). A booking can come to span several
 * departures later, through amendments or group merges, but it cannot be
 * CREATED spanning them — so there is no multi-departure ambiguity to resolve at
 * this seam, and inventing a rule for one would be speculative.
 */
export async function resolveConvertDayServices(
  db: PostgresJsDatabase,
  input: { productId: string; departure: ConvertDeparture | null },
): Promise<ConvertDayServiceResolution> {
  const { productId, departure } = input

  if (!departure) {
    return fallback(await readLiveDayServices(db, productId), "no_departure_selected", null)
  }
  if (!departure.productVersionId) {
    return fallback(
      await readLiveDayServices(db, productId),
      "departure_not_version_bound",
      departure,
    )
  }

  // Match the product too: a departure pointing at another product's version is
  // corrupt data, and seeding a booking from it would be worse than falling back.
  const [version] = await db
    .select({ snapshot: productVersionsRef.snapshot })
    .from(productVersionsRef)
    .where(
      and(
        eq(productVersionsRef.id, departure.productVersionId),
        eq(productVersionsRef.productId, productId),
      ),
    )
    .limit(1)

  if (!version) {
    return fallback(await readLiveDayServices(db, productId), "product_version_missing", departure)
  }

  // Parses loudly: an unreadable snapshot throws rather than yielding an empty
  // commitment set, which would silently book a departure with no supplier
  // obligations at all.
  const snapshot = parseProductVersionSnapshot(version.snapshot)

  // The DEFAULT itinerary is the one a departure operates (the same choice
  // voyant#4035's materializer makes). The live fallback above still reads every
  // itinerary, so unbound conversions keep their existing behaviour exactly.
  const frozenServices = defaultItineraryDaysFromSnapshot(snapshot)
    .flatMap((day) => day.services)
    .sort(bySortOrderThenId)

  const dayServices: ConvertDayService[] = []
  let servicesMissingCost = 0
  for (const service of frozenServices) {
    if (service.costCurrency == null || service.costAmountCents == null) {
      servicesMissingCost += 1
      continue
    }
    dayServices.push({
      supplierServiceId: service.supplierServiceId ?? null,
      name: service.name,
      costCurrency: service.costCurrency,
      costAmountCents: service.costAmountCents,
    })
  }

  return {
    dayServices,
    provenance: {
      source: "product_version",
      productVersionId: departure.productVersionId,
      availabilitySlotId: departure.id,
      fallbackReason: null,
      serviceCount: dayServices.length,
      servicesMissingCost,
    },
  }
}
