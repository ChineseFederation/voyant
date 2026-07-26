/**
 * Search-index service for mixed local/external cruise browse rows.
 * `cruise_search_index` is optional; storefront deployments populate it
 * from local projection hooks and adapter `searchProjection()` streams.
 */

import { listResponse } from "@voyant-travel/types"
import { and, asc, eq, gte, ilike, lte, notInArray, or, type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { CruiseAdapter, SourceRef } from "./adapters/index.js"
import { listCruiseAdapters } from "./adapters/registry.js"
import { cruiseShips } from "./schema-cabins.js"
import { type Cruise, cruiseSailings, cruises } from "./schema-core.js"
import { cruisePrices } from "./schema-pricing.js"
import {
  type CruiseSearchIndexRow,
  cruiseSearchIndex,
  type NewCruiseSearchIndexRow,
} from "./schema-search.js"
import type {
  BulkSearchIndexEntry,
  ExternalAdapterRefreshResult,
  RebuildResult,
  SearchIndexQueryResult,
} from "./service-search-types.js"
import type { SearchIndexQuery } from "./validation-search.js"

export type { ExternalAdapterRefreshResult } from "./service-search-types.js"

export const cruisesSearchService = {
  // ---------- queries ----------

  async query(db: PostgresJsDatabase, query: SearchIndexQuery): Promise<SearchIndexQueryResult> {
    const conditions: SQL[] = []
    if (query.cruiseType) conditions.push(eq(cruiseSearchIndex.cruiseType, query.cruiseType))
    if (query.source) conditions.push(eq(cruiseSearchIndex.source, query.source))
    if (query.region) {
      // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      conditions.push(sql`${cruiseSearchIndex.regions} @> ${JSON.stringify([query.region])}::jsonb`)
    }
    if (query.regionId) {
      conditions.push(
        // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`${cruiseSearchIndex.regionIds} @> ${JSON.stringify([query.regionId])}::jsonb`,
      )
    }
    if (query.waterwayId) {
      conditions.push(
        // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`${cruiseSearchIndex.waterwayIds} @> ${JSON.stringify([query.waterwayId])}::jsonb`,
      )
    }
    if (query.portId) {
      // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      conditions.push(sql`${cruiseSearchIndex.portIds} @> ${JSON.stringify([query.portId])}::jsonb`)
    }
    if (query.countryIso) {
      conditions.push(
        // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`${cruiseSearchIndex.countryIso} @> ${JSON.stringify([query.countryIso])}::jsonb`,
      )
    }
    if (query.theme) {
      // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      conditions.push(sql`${cruiseSearchIndex.themes} @> ${JSON.stringify([query.theme])}::jsonb`)
    }
    if (query.dateFrom) conditions.push(gte(cruiseSearchIndex.earliestDeparture, query.dateFrom))
    if (query.dateTo) conditions.push(lte(cruiseSearchIndex.latestDeparture, query.dateTo))
    if (query.priceMaxCents !== undefined) {
      // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      conditions.push(sql`${cruiseSearchIndex.lowestPriceCents} <= ${query.priceMaxCents}`)
    }
    if (query.embarkPortCanonicalPlaceId) {
      conditions.push(
        eq(cruiseSearchIndex.embarkPortCanonicalPlaceId, query.embarkPortCanonicalPlaceId),
      )
    }
    if (query.disembarkPortCanonicalPlaceId) {
      conditions.push(
        eq(cruiseSearchIndex.disembarkPortCanonicalPlaceId, query.disembarkPortCanonicalPlaceId),
      )
    }
    if (query.portCanonicalPlaceId) {
      const portClause = or(
        eq(cruiseSearchIndex.embarkPortCanonicalPlaceId, query.portCanonicalPlaceId),
        eq(cruiseSearchIndex.disembarkPortCanonicalPlaceId, query.portCanonicalPlaceId),
      )
      if (portClause) conditions.push(portClause)
    }
    if (query.search) {
      const term = `%${query.search}%`
      const searchClause = or(
        ilike(cruiseSearchIndex.name, term),
        ilike(cruiseSearchIndex.lineName, term),
        ilike(cruiseSearchIndex.shipName, term),
      )
      if (searchClause) conditions.push(searchClause)
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(cruiseSearchIndex)
        .where(where)
        .orderBy(
          asc(cruiseSearchIndex.earliestDeparture),
          // NULLS LAST must follow ASC/DESC — `asc(sql\`… NULLS LAST\`)` emits
          // `"col" NULLS LAST asc`, which Postgres rejects.
          // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${cruiseSearchIndex.lowestPriceCents} ASC NULLS LAST`,
          asc(cruiseSearchIndex.name),
        )
        .limit(query.limit)
        .offset(query.offset),
      db.select({ value: sql<number>`count(*)::int` }).from(cruiseSearchIndex).where(where),
    ])
    return listResponse(rows, {
      total: totalRows[0]?.value ?? 0,
      limit: query.limit,
      offset: query.offset,
    })
  },

  async getBySlug(db: PostgresJsDatabase, slug: string): Promise<CruiseSearchIndexRow | null> {
    const [row] = await db
      .select()
      .from(cruiseSearchIndex)
      .where(eq(cruiseSearchIndex.slug, slug))
      .limit(1)
    return row ?? null
  },

  // ---------- writes ----------

  async upsertEntry(
    db: PostgresJsDatabase,
    entry: BulkSearchIndexEntry,
  ): Promise<CruiseSearchIndexRow> {
    const payload: NewCruiseSearchIndexRow = {
      source: entry.source,
      sourceProvider: entry.sourceProvider ?? null,
      sourceRef: entry.sourceRef ?? null,
      localCruiseId: entry.localCruiseId ?? null,
      slug: entry.slug,
      name: entry.name,
      cruiseType: entry.cruiseType,
      lineName: entry.lineName,
      shipName: entry.shipName,
      nights: entry.nights,
      embarkPortName: entry.embarkPortName ?? null,
      embarkPortCanonicalPlaceId: entry.embarkPortCanonicalPlaceId ?? null,
      disembarkPortName: entry.disembarkPortName ?? null,
      disembarkPortCanonicalPlaceId: entry.disembarkPortCanonicalPlaceId ?? null,
      regionIds: entry.regionIds ?? [],
      waterwayIds: entry.waterwayIds ?? [],
      portIds: entry.portIds ?? [],
      countryIso: entry.countryIso ?? [],
      regions: entry.regions ?? [],
      waterways: entry.waterways ?? [],
      ports: entry.ports ?? [],
      countries: entry.countries ?? [],
      themes: entry.themes ?? [],
      earliestDeparture: entry.earliestDeparture ?? null,
      latestDeparture: entry.latestDeparture ?? null,
      departureCount: entry.departureCount ?? null,
      lowestPriceCents: entry.lowestPriceCents ?? null,
      lowestPriceCurrency: entry.lowestPriceCurrency ?? null,
      salesStatus: entry.salesStatus ?? null,
      heroImageUrl: entry.heroImageUrl ?? null,
      refreshedAt: new Date(),
    }

    const existing = await findExisting(db, entry)
    if (existing) {
      const [row] = await db
        .update(cruiseSearchIndex)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(cruiseSearchIndex.id, existing.id))
        .returning()
      if (!row) throw new Error("Failed to update search index entry")
      return row
    }

    const [row] = await db.insert(cruiseSearchIndex).values(payload).returning()
    if (!row) throw new Error("Failed to insert search index entry")
    return row
  },

  async bulkUpsert(
    db: PostgresJsDatabase,
    entries: BulkSearchIndexEntry[],
  ): Promise<{ upserted: number }> {
    let upserted = 0
    // Run in a transaction so a partial run can roll back. Adapters typically
    // call this in chunks; the chunk size is the adapter's choice.
    await db.transaction(async (tx) => {
      for (const entry of entries) {
        await this.upsertEntry(tx, entry)
        upserted++
      }
    })
    return { upserted }
  },

  async removeEntry(db: PostgresJsDatabase, id: string): Promise<boolean> {
    const result = await db
      .delete(cruiseSearchIndex)
      .where(eq(cruiseSearchIndex.id, id))
      .returning({ id: cruiseSearchIndex.id })
    return result.length > 0
  },

  async removeBySource(
    db: PostgresJsDatabase,
    sourceProvider: string,
  ): Promise<{ removed: number }> {
    const result = await db
      .delete(cruiseSearchIndex)
      .where(
        and(
          eq(cruiseSearchIndex.source, "external"),
          eq(cruiseSearchIndex.sourceProvider, sourceProvider),
        ),
      )
      .returning({ id: cruiseSearchIndex.id })
    return { removed: result.length }
  },

  async removeExternalByIdsExcept(
    db: PostgresJsDatabase,
    sourceProvider: string,
    keepIds: ReadonlyArray<string>,
    sourceConnectionId?: string | null,
  ): Promise<{ removed: number }> {
    const conditions: SQL[] = [
      eq(cruiseSearchIndex.source, "external"),
      eq(cruiseSearchIndex.sourceProvider, sourceProvider),
      sourceConnectionId == null
        ? // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`coalesce(${cruiseSearchIndex.sourceRef}->>'connectionId', '') = ''`
        : // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${cruiseSearchIndex.sourceRef}->>'connectionId' = ${sourceConnectionId}`,
    ]
    if (keepIds.length > 0) {
      conditions.push(notInArray(cruiseSearchIndex.id, [...keepIds]))
    }
    const result = await db
      .delete(cruiseSearchIndex)
      .where(and(...conditions))
      .returning({ id: cruiseSearchIndex.id })
    return { removed: result.length }
  },

  async listExternalConnectionIds(
    db: PostgresJsDatabase,
    sourceProvider: string,
  ): Promise<Array<string | null>> {
    const connectionId = sql<
      string | null
    >`nullif(${cruiseSearchIndex.sourceRef}->>'connectionId', '')`
    const rows = await db
      .select({ connectionId })
      .from(cruiseSearchIndex)
      .where(
        and(
          eq(cruiseSearchIndex.source, "external"),
          eq(cruiseSearchIndex.sourceProvider, sourceProvider),
        ),
      )
      .groupBy(connectionId)
    return rows.map((row) => row.connectionId)
  },

  // ---------- projection from local cruises ----------

  /**
   * Re-project a single local cruise into the search index. Called from the
   * cruisesService mutation hooks so the index stays fresh without a separate
   * scheduled job. Computes the lowest available price across the cruise's
   * sailings and the earliest/latest departure dates.
   *
   * If the cruise's status is 'archived' the entry is removed instead — archived
   * cruises shouldn't appear on the storefront.
   */
  async projectLocalCruise(
    db: PostgresJsDatabase,
    cruiseId: string,
  ): Promise<CruiseSearchIndexRow | null> {
    const [cruise] = await db.select().from(cruises).where(eq(cruises.id, cruiseId)).limit(1)
    if (!cruise) {
      // Cruise was deleted — drop any matching index row.
      await db.delete(cruiseSearchIndex).where(eq(cruiseSearchIndex.localCruiseId, cruiseId))
      return null
    }
    if (cruise.status === "archived") {
      await db.delete(cruiseSearchIndex).where(eq(cruiseSearchIndex.localCruiseId, cruiseId))
      return null
    }

    const entry = await buildLocalEntry(db, cruise)
    if (!entry) return null
    return this.upsertEntry(db, entry)
  },

  /**
   * Drop and rebuild every local cruise entry. Useful after schema changes
   * or operator-triggered "rebuild storefront index" actions.
   */
  async rebuildLocal(db: PostgresJsDatabase): Promise<{ upserted: number }> {
    // Remove all local entries first so deleted cruises don't linger.
    await db.delete(cruiseSearchIndex).where(eq(cruiseSearchIndex.source, "local"))
    // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    const allCruises = await db.select().from(cruises).where(sql`${cruises.status} <> 'archived'`)
    let upserted = 0
    for (const cruise of allCruises) {
      const entry = await buildLocalEntry(db, cruise)
      if (!entry) continue
      await this.upsertEntry(db, entry)
      upserted++
    }
    return { upserted }
  },

  /**
   * Drain `searchProjection()` from a single adapter and bulk-upsert. Useful
   * for ad-hoc "refresh from upstream" actions; production deployments
   * typically have the adapter push deltas continuously instead.
   */
  async rebuildExternalForAdapter(
    db: PostgresJsDatabase,
    adapter: CruiseAdapter,
  ): Promise<{ upserted: number }> {
    const result = await this.refreshExternalForAdapter(db, adapter)
    return { upserted: result.upserted }
  },

  /**
   * Drain `searchProjection()` from a single adapter and reconcile the local
   * external search-index rows for that provider. Existing rows stay intact
   * until the adapter stream completes; only then are missing rows removed.
   */
  async refreshExternalForAdapter(
    db: PostgresJsDatabase,
    adapter: CruiseAdapter,
  ): Promise<ExternalAdapterRefreshResult> {
    let upserted = 0
    const keptIdsByConnection = new Map<string | null, string[]>()
    const pruneConnectionIds = new Set<string | null>(
      await this.listExternalConnectionIds(db, adapter.name),
    )
    for await (const entry of adapter.searchProjection()) {
      const row = await this.upsertEntry(db, {
        source: "external",
        sourceProvider: adapter.name,
        sourceRef: entry.sourceRef,
        slug: entry.slug,
        name: entry.name,
        cruiseType: entry.cruiseType,
        lineName: entry.lineName,
        shipName: entry.shipName,
        nights: entry.nights,
        embarkPortName: entry.embarkPortName ?? null,
        embarkPortCanonicalPlaceId: entry.embarkPortCanonicalPlaceId ?? null,
        disembarkPortName: entry.disembarkPortName ?? null,
        disembarkPortCanonicalPlaceId: entry.disembarkPortCanonicalPlaceId ?? null,
        regionIds: entry.regionIds ?? [],
        waterwayIds: entry.waterwayIds ?? [],
        portIds: entry.portIds ?? [],
        countryIso: entry.countryIso ?? [],
        regions: entry.regions ?? [],
        waterways: entry.waterways ?? [],
        ports: entry.ports ?? [],
        countries: entry.countries ?? [],
        themes: entry.themes ?? [],
        earliestDeparture: entry.earliestDeparture ?? null,
        latestDeparture: entry.latestDeparture ?? null,
        departureCount: entry.departureCount ?? null,
        lowestPriceCents: entry.lowestPriceCents ?? null,
        lowestPriceCurrency: entry.lowestPriceCurrency ?? null,
        salesStatus: entry.salesStatus ?? null,
        heroImageUrl: entry.heroImageUrl ?? null,
      })
      const connectionId = sourceRefConnectionId(entry.sourceRef)
      const keptIds = keptIdsByConnection.get(connectionId) ?? []
      keptIds.push(row.id)
      keptIdsByConnection.set(connectionId, keptIds)
      pruneConnectionIds.add(connectionId)
      upserted++
    }

    let removed = 0
    for (const connectionId of pruneConnectionIds) {
      const keptIds = keptIdsByConnection.get(connectionId) ?? []
      const result = await this.removeExternalByIdsExcept(db, adapter.name, keptIds, connectionId)
      removed += result.removed
    }
    return { upserted, removed }
  },

  /**
   * Full rebuild — local cruises + every registered adapter.
   * Per-adapter errors are collected so one bad adapter doesn't block the rest.
   */
  async rebuildAll(db: PostgresJsDatabase): Promise<RebuildResult> {
    const localResult = await this.rebuildLocal(db)
    const externalErrors: RebuildResult["externalErrors"] = []
    let externalUpserted = 0
    let externalRemoved = 0
    for (const adapter of listCruiseAdapters()) {
      try {
        const result = await this.refreshExternalForAdapter(db, adapter)
        externalUpserted += result.upserted
        externalRemoved += result.removed
      } catch (err) {
        externalErrors.push({ adapter: adapter.name, error: (err as Error).message })
      }
    }
    return {
      localUpserted: localResult.upserted,
      externalUpserted,
      externalRemoved,
      externalErrors,
    }
  },
}

// ---------- helpers ----------

async function findExisting(
  db: PostgresJsDatabase,
  entry: BulkSearchIndexEntry,
): Promise<CruiseSearchIndexRow | null> {
  if (entry.source === "local" && entry.localCruiseId) {
    const [row] = await db
      .select()
      .from(cruiseSearchIndex)
      .where(eq(cruiseSearchIndex.localCruiseId, entry.localCruiseId))
      .limit(1)
    if (row) return row
  }
  if (entry.source === "external" && entry.sourceProvider && entry.sourceRef) {
    const [row] = await db
      .select()
      .from(cruiseSearchIndex)
      .where(
        and(
          eq(cruiseSearchIndex.source, "external"),
          eq(cruiseSearchIndex.sourceProvider, entry.sourceProvider),
          // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${cruiseSearchIndex.sourceRef} = ${sourceRefIdentityJson(entry.sourceRef)}::jsonb`,
        ),
      )
      .limit(1)
    if (row) return row
  }
  // Fallback: match by slug (slug is unique across the index).
  const [bySlug] = await db
    .select()
    .from(cruiseSearchIndex)
    .where(eq(cruiseSearchIndex.slug, entry.slug))
    .limit(1)
  return bySlug ?? null
}

export function sourceRefIdentityJson(sourceRef: SourceRef): string {
  return JSON.stringify(sortValue(sourceRef))
}

function sourceRefConnectionId(sourceRef: SourceRef): string | null {
  return typeof sourceRef.connectionId === "string" ? sourceRef.connectionId : null
}

function moneyStringToCents(value: string | null | undefined): number | null {
  if (!value) return null
  const major = Number.parseFloat(value)
  if (!Number.isFinite(major)) return null
  return Math.round(major * 100)
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    out[key] = sortValue((value as Record<string, unknown>)[key])
  }
  return out
}

async function buildLocalEntry(
  db: PostgresJsDatabase,
  cruise: Cruise,
): Promise<BulkSearchIndexEntry | null> {
  // Resolve ship name. Falls back to "—" when no default ship is set; storefront
  // can hide rows without a ship if it cares, but most local cruises have one.
  let shipName = "—"
  if (cruise.defaultShipId) {
    const [ship] = await db
      .select({ name: cruiseShips.name })
      .from(cruiseShips)
      .where(eq(cruiseShips.id, cruise.defaultShipId))
      .limit(1)
    if (ship) shipName = ship.name
  }

  // Aggregate over sailings + prices in two parallel queries.
  const [dateAgg] = await db
    .select({
      earliest: sql<string | null>`MIN(${cruiseSailings.departureDate})`,
      latest: sql<string | null>`MAX(${cruiseSailings.departureDate})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(cruiseSailings)
    .where(eq(cruiseSailings.cruiseId, cruise.id))

  const [priceAgg] = await db
    .select({
      lowestCents: sql<
        number | null
      >`MIN(ROUND(${cruisePrices.pricePerPerson}::numeric * 100))::int`,
      currency: sql<
        string | null
      >`(ARRAY_AGG(${cruisePrices.currency} ORDER BY ${cruisePrices.pricePerPerson}::numeric ASC))[1]`,
    })
    .from(cruisePrices)
    .innerJoin(cruiseSailings, eq(cruisePrices.sailingId, cruiseSailings.id))
    .where(
      // agent-quality: raw-sql reviewed -- owner: cruises; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      and(eq(cruiseSailings.cruiseId, cruise.id), sql`${cruisePrices.availability} <> 'sold_out'`),
    )

  // Sales status is a coarse roll-up: if any sailing is open, the cruise is open.
  const [salesAgg] = await db
    .select({
      hasOpen: sql<boolean>`bool_or(${cruiseSailings.salesStatus} = 'open')`,
    })
    .from(cruiseSailings)
    .where(eq(cruiseSailings.cruiseId, cruise.id))

  const salesStatus = salesAgg?.hasOpen ? "open" : "closed"

  return {
    source: "local",
    sourceProvider: null,
    sourceRef: null,
    localCruiseId: cruise.id,
    slug: cruise.slug,
    name: cruise.name,
    cruiseType: cruise.cruiseType,
    lineName: cruise.lineSupplierId ?? "—",
    shipName,
    nights: cruise.nights,
    embarkPortCanonicalPlaceId: cruise.embarkPortCanonicalPlaceId ?? null,
    disembarkPortCanonicalPlaceId: cruise.disembarkPortCanonicalPlaceId ?? null,
    regionIds: cruise.regionIds ?? [],
    waterwayIds: cruise.waterwayIds ?? [],
    portIds: cruise.portIds ?? [],
    countryIso: cruise.countryIso ?? [],
    regions: cruise.regions ?? [],
    waterways: cruise.waterways ?? [],
    ports: cruise.ports ?? [],
    countries: cruise.countries ?? [],
    themes: cruise.themes ?? [],
    earliestDeparture: dateAgg?.earliest ?? null,
    latestDeparture: dateAgg?.latest ?? null,
    departureCount: dateAgg?.count ?? null,
    lowestPriceCents:
      priceAgg?.lowestCents ?? moneyStringToCents(cruise.lowestPriceCached ?? null) ?? null,
    lowestPriceCurrency: priceAgg?.currency ?? cruise.lowestPriceCurrencyCached ?? null,
    salesStatus,
    heroImageUrl: cruise.heroImageUrl ?? null,
  }
}
