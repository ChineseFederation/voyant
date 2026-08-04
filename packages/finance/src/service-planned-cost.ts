/**
 * Departure planned-cost resolver (voyant#4037).
 *
 * The profitability read model has always taken planned cost from
 * `booking_items.totalCostAmountCents`, which is seeded from the live, mutable
 * `products.costAmountCents` in the product's SELL currency — not the frozen
 * day-service cost. This resolver replaces that for any departure bound to a
 * Product Version: it reads the frozen `product_versions.snapshot`, pulls each
 * day service's declared `plannedCost` block (basis + driver + rate + currency),
 * and multiplies the rate by the departure's own authoritative quantities — pax
 * from booked travellers, rooms/vehicles from `allocation_resources`, nights
 * from `availability_slots`. Where the #4035 spine has materialized operation
 * lines it resolves PER LINE, keyed by `(slot_id, source_day_service_id)`, so
 * attribution and variance-by-service stay meaningful; a version-bound departure
 * that has not been materialized yet falls back to resolving every day service
 * in its version's snapshot.
 *
 * A departure with NO `product_version_id` gets nothing here — the caller keeps
 * the `booking_items` figure as a documented fallback and flags it as a
 * completeness caveat rather than silently mixing the two sources.
 *
 * Cross-module tables (`availability_slots`, `product_versions`,
 * `departure_service_operations`, `allocation_resources`, `booking_allocations`)
 * are read through the finance boundary-SQL seam, exactly like the existing
 * label lookups — no cross-package table symbol import, so this stays invisible
 * to the table-privacy ratchet and never recomputes money in another module.
 */
import {
  type DepartureQuantities,
  parseProductVersionSnapshot,
  resolvePlannedCost,
  type SnapshotPlannedCost,
} from "@voyant-travel/products-contracts/product-version-snapshot"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { executeBoundaryRows, sqlList } from "./service-boundary-sql.js"

/** One frozen day service to cost against a departure, keyed by its version. */
export interface PlannedCostLine {
  departureId: string
  productVersionId: string
  sourceDayServiceId: string
}

/** The resolved planned cost for one departure, grouped per source currency. */
export interface DeparturePlannedCost {
  /** Cost currency → summed planned cents. Never crosses currencies (no FX). */
  byCurrency: Map<string, number>
  /**
   * Cost currency → the fixed (non-pax-driven) portion of planned cost. A cost
   * whose driver does not scale with pax (`fixed`, `rooms`, `nights`,
   * `vehicles`, `service_units`) is fixed relative to load, so it is the fixed
   * term in a break-even calculation (voyant#4037, item 7).
   */
  fixedByCurrency: Map<string, number>
  /**
   * Cost currency → the per-pax variable rate (blocks whose `driver` is `pax`).
   * This is the marginal cost of one more traveller — the variable term in a
   * break-even calculation — and is independent of the departure's current pax.
   */
  perPaxRateByCurrency: Map<string, number>
  /** Operation/day-service lines the resolver costed. */
  lineCount: number
  /** Lines whose source day service carried no declared cost block. */
  linesMissingCostBlock: number
}

/** Blocks indexed for O(1) line lookup: version id → (day-service id → block). */
export type BlocksByVersion = Map<string, Map<string, SnapshotPlannedCost>>

const num = (value: unknown): number => Number(value ?? 0)

function emptyResult(): DeparturePlannedCost {
  return {
    byCurrency: new Map(),
    fixedByCurrency: new Map(),
    perPaxRateByCurrency: new Map(),
    lineCount: 0,
    linesMissingCostBlock: 0,
  }
}

function addTo(map: Map<string, number>, currency: string, cents: number): void {
  if (cents === 0) return
  map.set(currency, (map.get(currency) ?? 0) + cents)
}

/**
 * Pure aggregation core — no database. Costs each line against its version's
 * frozen block and its departure's quantities, summing per currency. Isolated so
 * the multiply-and-group logic is exhaustively unit-testable with plain inputs.
 */
export function aggregateDeparturePlannedCost(
  lines: readonly PlannedCostLine[],
  blocksByVersion: BlocksByVersion,
  quantitiesByDeparture: Map<string, DepartureQuantities>,
): Map<string, DeparturePlannedCost> {
  const out = new Map<string, DeparturePlannedCost>()
  const ensure = (departureId: string): DeparturePlannedCost => {
    let entry = out.get(departureId)
    if (!entry) {
      entry = emptyResult()
      out.set(departureId, entry)
    }
    return entry
  }

  for (const line of lines) {
    const entry = ensure(line.departureId)
    entry.lineCount += 1
    const block = blocksByVersion.get(line.productVersionId)?.get(line.sourceDayServiceId)
    if (!block) {
      entry.linesMissingCostBlock += 1
      continue
    }
    const resolved = resolvePlannedCost(block, quantitiesByDeparture.get(line.departureId) ?? {})
    addTo(entry.byCurrency, resolved.currency, resolved.amountCents)
    // Break-even split: a `pax`-driven cost is variable in load (record its
    // per-pax rate, even when current pax is 0); everything else is fixed
    // relative to load. The two always reconstruct the total: fixed + rate·pax.
    if (block.driver === "pax") {
      addTo(entry.perPaxRateByCurrency, resolved.currency, block.rateCents)
    } else {
      addTo(entry.fixedByCurrency, resolved.currency, resolved.amountCents)
    }
  }

  return out
}

interface SlotRow {
  id: string
  product_version_id: string | null
  nights: number | null
}

interface OperationLineRow {
  slot_id: string
  product_version_id: string | null
  source_day_service_id: string
}

/**
 * Index a parsed snapshot's day services by id → declared cost block. Day
 * services predating the block (legacy snapshots) are skipped, which surfaces
 * downstream as `linesMissingCostBlock`.
 */
function indexSnapshotBlocks(raw: unknown): Map<string, SnapshotPlannedCost> {
  const snapshot = parseProductVersionSnapshot(raw)
  const map = new Map<string, SnapshotPlannedCost>()
  for (const itinerary of snapshot.itineraries) {
    for (const day of itinerary.days) {
      for (const service of day.services) {
        if (service.plannedCost) map.set(service.id, service.plannedCost)
      }
    }
  }
  return map
}

/**
 * Resolve planned cost for the version-bound subset of `departureIds`. Returns a
 * map keyed only by departures that carry a `product_version_id`; the rest are
 * absent, signalling the caller to keep its `booking_items` fallback.
 *
 * Fires no cross-module query when none of `departureIds` is version-bound, so a
 * report over legacy (unbound) departures costs exactly one cheap slot lookup.
 */
export async function resolveDeparturePlannedCosts(
  db: PostgresJsDatabase,
  departureIds: readonly string[],
): Promise<Map<string, DeparturePlannedCost>> {
  if (departureIds.length === 0) return new Map()

  // agent-quality: raw-sql reviewed -- owner: finance; ids are parameter-bound via sqlList; availability is a read-only planned-cost source.
  const slotRows = await executeBoundaryRows<SlotRow>(
    db,
    sql`
      SELECT id, product_version_id, nights
      FROM availability_slots
      WHERE id IN (${sqlList(departureIds)}) AND product_version_id IS NOT NULL
    `,
  )
  if (slotRows.length === 0) return new Map()

  const versionBoundIds = slotRows.map((slot) => slot.id)
  const nightsByDeparture = new Map<string, number | null>(
    slotRows.map((slot) => [slot.id, slot.nights]),
  )
  const versionByDeparture = new Map<string, string>(
    slotRows.flatMap((slot) =>
      slot.product_version_id ? [[slot.id, slot.product_version_id] as const] : [],
    ),
  )

  // Materialized operation lines (the #4035 spine) — the per-service grain that
  // makes variance-by-service meaningful. A version-bound slot with no lines yet
  // is costed over its whole snapshot below.
  // agent-quality: raw-sql reviewed -- owner: finance; ids are parameter-bound via sqlList; operations is a read-only planned-cost source.
  const operationRows = await executeBoundaryRows<OperationLineRow>(
    db,
    sql`
      SELECT slot_id, product_version_id, source_day_service_id
      FROM departure_service_operations
      WHERE slot_id IN (${sqlList(versionBoundIds)})
    `,
  )
  const slotsWithLines = new Set(operationRows.map((row) => row.slot_id))

  const [resourceRows, paxRows] = await Promise.all([
    // Room/vehicle counts. `vehicle_seat` children are NOT vehicles.
    // agent-quality: raw-sql reviewed -- owner: finance; ids are parameter-bound via sqlList; availability is a read-only quantity source.
    executeBoundaryRows<{ slot_id: string; kind: string; n: number }>(
      db,
      sql`
        SELECT slot_id, kind, count(*)::int AS n
        FROM allocation_resources
        WHERE slot_id IN (${sqlList(versionBoundIds)})
        GROUP BY slot_id, kind
      `,
    ),
    // Booked pax per departure. `<> 'cancelled'` is a coarse active filter; a
    // booking spanning two departures contributes its whole pax to each, the
    // same known attribution limit the operations capacity read carries.
    // agent-quality: raw-sql reviewed -- owner: finance; ids are parameter-bound via sqlList; bookings is a read-only quantity source.
    executeBoundaryRows<{ slot_id: string; pax: number }>(
      db,
      sql`
        SELECT ba.availability_slot_id AS slot_id, COALESCE(SUM(b.pax), 0)::int AS pax
        FROM booking_allocations ba
        JOIN bookings b ON b.id = ba.booking_id
        WHERE ba.availability_slot_id IN (${sqlList(versionBoundIds)}) AND ba.status <> 'cancelled'
        GROUP BY ba.availability_slot_id
      `,
    ),
  ])

  const roomsByDeparture = new Map<string, number>()
  const vehiclesByDeparture = new Map<string, number>()
  for (const row of resourceRows) {
    if (row.kind === "room") roomsByDeparture.set(row.slot_id, num(row.n))
    else if (row.kind === "vehicle") vehiclesByDeparture.set(row.slot_id, num(row.n))
  }
  const paxByDeparture = new Map(paxRows.map((row) => [row.slot_id, num(row.pax)]))

  const quantitiesByDeparture = new Map<string, DepartureQuantities>(
    versionBoundIds.map((id) => [
      id,
      {
        pax: paxByDeparture.get(id) ?? 0,
        rooms: roomsByDeparture.get(id) ?? 0,
        vehicles: vehiclesByDeparture.get(id) ?? 0,
        nights: nightsByDeparture.get(id) ?? 0,
      },
    ]),
  )

  // Load and index every relevant version snapshot once.
  const versionIds = [...new Set(versionByDeparture.values())]
  const blocksByVersion: BlocksByVersion = new Map()
  if (versionIds.length > 0) {
    // agent-quality: raw-sql reviewed -- owner: finance; ids are parameter-bound via sqlList; product_versions.snapshot is the frozen cost contract.
    const versionRows = await executeBoundaryRows<{ id: string; snapshot: unknown }>(
      db,
      sql`SELECT id, snapshot FROM product_versions WHERE id IN (${sqlList(versionIds)})`,
    )
    for (const row of versionRows) {
      blocksByVersion.set(row.id, indexSnapshotBlocks(row.snapshot))
    }
  }

  // Build the line set: materialized lines where the spine has them, else one
  // synthetic line per day service in the version's snapshot.
  const lines: PlannedCostLine[] = []
  for (const row of operationRows) {
    const versionId = row.product_version_id ?? versionByDeparture.get(row.slot_id)
    if (!versionId) continue
    lines.push({
      departureId: row.slot_id,
      productVersionId: versionId,
      sourceDayServiceId: row.source_day_service_id,
    })
  }
  for (const slot of slotRows) {
    if (slotsWithLines.has(slot.id)) continue
    const versionId = versionByDeparture.get(slot.id)
    if (!versionId) continue
    const blocks = blocksByVersion.get(versionId)
    if (!blocks) continue
    for (const dayServiceId of blocks.keys()) {
      lines.push({
        departureId: slot.id,
        productVersionId: versionId,
        sourceDayServiceId: dayServiceId,
      })
    }
  }

  return aggregateDeparturePlannedCost(lines, blocksByVersion, quantitiesByDeparture)
}
