/**
 * The single place inventory reaches into Availability's `availability_slots`.
 *
 * Slots are owned by Availability, but inventory legitimately needs two things
 * from them: the product list's departure facets, and the publish gate's
 * "does this product have a future open departure" check. Rather than let that
 * reach-in spread across files, every inventory read of the table goes through
 * here — one documented boundary crossing, counted once by the table-privacy
 * checker.
 *
 * Anything richer than these reads belongs in Availability behind a service
 * call, not here.
 */

import { availabilitySlots } from "@voyant-travel/operations"
import { and, eq, gte, type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { products } from "./schema.js"

/**
 * `exists` predicate for "this product has an upcoming open departure",
 * optionally bounded to a date window. Used by the product-list departure
 * facet.
 *
 * Returned as a composed fragment rather than exposing the table, so callers
 * never name an Availability table themselves.
 */
export function upcomingDepartureExists(from?: string, to?: string): SQL {
  const fromBound = from ? sql`and ${availabilitySlots.startsAt}::date >= ${from}::date` : sql``
  const toBound = to ? sql`and ${availabilitySlots.startsAt}::date <= ${to}::date` : sql``

  // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  return sql`exists (select 1 from ${availabilitySlots}
      where ${availabilitySlots.productId} = ${products.id}
        and ${availabilitySlots.status} = 'open'
        and ${availabilitySlots.startsAt} >= now()
        ${fromBound} ${toBound})`
}

/** Earliest upcoming open departure for the product, or null when none. */
export function nextDepartureAt(): SQL<Date | null> {
  return sql<Date | null>`(
      select min(${availabilitySlots.startsAt})
      from ${availabilitySlots}
      where ${availabilitySlots.productId} = ${products.id}
        and ${availabilitySlots.status} = 'open'
        and ${availabilitySlots.startsAt} >= now()
    )`
}

export interface FutureOpenSlotFacts {
  /** How many future open slots the product has (capped by `limit`). */
  count: number
  /** True when at least one of them declares a capacity. */
  hasCapacity: boolean
}

/**
 * Read the future open departures a publish decision depends on.
 *
 * Capped rather than counted exhaustively: readiness only needs "is there at
 * least one" and "does any declare capacity", so scanning the whole future is
 * wasted work on a product with years of generated slots.
 */
export async function readFutureOpenSlotFacts(
  db: PostgresJsDatabase,
  productId: string,
  limit = 50,
): Promise<FutureOpenSlotFacts> {
  const rows = await db
    .select({
      id: availabilitySlots.id,
      initialPax: availabilitySlots.initialPax,
      unlimited: availabilitySlots.unlimited,
    })
    .from(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.productId, productId),
        eq(availabilitySlots.status, "open"),
        gte(availabilitySlots.startsAt, new Date()),
      ),
    )
    .limit(limit)

  return {
    count: rows.length,
    hasCapacity: rows.some(
      (slot) => slot.unlimited || (slot.initialPax != null && slot.initialPax > 0),
    ),
  }
}
