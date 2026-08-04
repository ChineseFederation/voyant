/**
 * Materialize a departure's operable service lines from the FROZEN Product
 * Version snapshot it was sold against (voyant#4035).
 *
 * The point of the RFC is immutability: a departure operates the definition
 * that was frozen when it was created, and a later Product edit must never
 * silently rewrite an already-materialized departure's run sheet. That falls
 * out of reading `product_versions.snapshot` — which no code re-hydrated until
 * now — rather than the live `product_day_services` rows.
 *
 * Idempotent on `(slot_id, source_day_service_id)`: re-running never duplicates
 * a line, and because the source is the frozen snapshot, re-running never
 * changes one either.
 *
 * No availability table is imported here. The slot is read through
 * `getSlotById`, the frozen snapshot through the local `product_versions`
 * reference — keeping this new file clear of the operations→availability
 * table-privacy ratchet.
 */
import {
  defaultItineraryDaysFromSnapshot,
  parseProductVersionSnapshot,
  type SnapshotDayService,
} from "@voyant-travel/products-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { loadProductVersionSnapshot } from "./products-ref.js"
import {
  departureServiceOperations,
  type NewDepartureServiceOperation,
} from "./schema-departure-operations.js"
import { getSlotById } from "./service-core.js"
import { localToInstant } from "./slot-timezone.js"

export interface MaterializeDepartureServiceOperationsResult {
  /** Lines newly inserted by this call. */
  created: number
  /** Lines that already existed (idempotent no-op). */
  skippedExisting: number
  /** Days walked from the snapshot's default itinerary. */
  daysMaterialized: number
  /** Why nothing was materialized, when `created` is 0 and no lines existed. */
  reason?: "slot_not_found" | "no_product_version" | "no_snapshot" | "no_services"
}

export interface MaterializeDepartureServiceOperationsOptions {
  /**
   * Resolve the frozen snapshot for a Product Version. Defaults to reading
   * `product_versions.snapshot`; injectable for tests and alternate wiring.
   */
  loadSnapshot?: (productVersionId: string) => Promise<unknown | null>
}

const EMPTY = { created: 0, skippedExisting: 0, daysMaterialized: 0 } as const

/** Add whole calendar days to a `YYYY-MM-DD` local date, timezone-independent. */
function addLocalDays(dateLocal: string, days: number): string {
  const [year, month, day] = dateLocal.split("-").map((part) => Number.parseInt(part, 10))
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) + days * 86_400_000)
  const yyyy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(shifted.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Resolve a line's UTC instants from its local time in the departure timezone.
 * A service with no start time yields a line with no clock — an all-day item on
 * that day. `endTimeLocal` wins over `durationMinutes` when both are present.
 */
function resolveTimes(
  dateLocal: string,
  timezone: string,
  service: SnapshotDayService,
): { startsAt: Date | null; endsAt: Date | null } {
  if (!service.startTimeLocal) return { startsAt: null, endsAt: null }

  const startsAt = new Date(
    localToInstant({ date: dateLocal, time: service.startTimeLocal, timezone }),
  )
  let endsAt: Date | null = null
  if (service.endTimeLocal) {
    endsAt = new Date(localToInstant({ date: dateLocal, time: service.endTimeLocal, timezone }))
  } else if (typeof service.durationMinutes === "number" && service.durationMinutes > 0) {
    endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
  }
  return { startsAt, endsAt }
}

/**
 * Materialize (or idempotently re-materialize) the departure service operations
 * for one slot from its bound Product Version snapshot. A slot with no bound
 * version, or a version with no snapshot, materializes nothing — that is
 * recorded via `reason`, not guessed.
 */
export async function materializeDepartureServiceOperations(
  db: PostgresJsDatabase,
  slotId: string,
  options: MaterializeDepartureServiceOperationsOptions = {},
): Promise<MaterializeDepartureServiceOperationsResult> {
  const slot = await getSlotById(db, slotId)
  if (!slot) return { ...EMPTY, reason: "slot_not_found" }
  if (!slot.productVersionId) return { ...EMPTY, reason: "no_product_version" }

  const raw = options.loadSnapshot
    ? await options.loadSnapshot(slot.productVersionId)
    : await loadProductVersionSnapshot(db, slot.productVersionId)
  if (raw == null) return { ...EMPTY, reason: "no_snapshot" }

  // Throws ProductVersionSnapshotError on a shape we cannot read — a departure
  // materialized from an unreadable snapshot is a bug we must see, not swallow.
  const snapshot = parseProductVersionSnapshot(raw)
  const days = defaultItineraryDaysFromSnapshot(snapshot)

  const rows: NewDepartureServiceOperation[] = []
  for (const day of days) {
    const dateLocal = addLocalDays(slot.dateLocal, day.dayNumber - 1)
    let sequence = 0
    for (const service of day.services) {
      const { startsAt, endsAt } = resolveTimes(dateLocal, slot.timezone, service)
      rows.push({
        slotId: slot.id,
        productVersionId: slot.productVersionId,
        sourceDayId: day.id,
        sourceDayServiceId: service.id,
        dayNumber: day.dayNumber,
        dateLocal,
        startsAt,
        endsAt,
        timezone: slot.timezone,
        sequence,
        facilityId: service.facilityId ?? null,
        supplierId: service.supplierId ?? null,
        supplierServiceId: service.supplierServiceId ?? null,
        serviceType: service.serviceType,
        name: service.name,
        inclusionRole: service.inclusionRole,
        travelerScope: service.travelerScope,
      })
      sequence += 1
    }
  }

  if (rows.length === 0) {
    return { created: 0, skippedExisting: 0, daysMaterialized: days.length, reason: "no_services" }
  }

  const inserted = await db
    .insert(departureServiceOperations)
    .values(rows)
    .onConflictDoNothing({
      target: [departureServiceOperations.slotId, departureServiceOperations.sourceDayServiceId],
    })
    .returning({ id: departureServiceOperations.id })

  return {
    created: inserted.length,
    skippedExisting: rows.length - inserted.length,
    daysMaterialized: days.length,
  }
}
