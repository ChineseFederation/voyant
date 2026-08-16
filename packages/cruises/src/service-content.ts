/**
 * Cruise content service — `getCruiseContent` with owned-vs-sourced
 * dispatch, locale-resolved cache reads, SWR refresh, and synthesizer fallback.
 *
 * Mirrors `service-content.ts` in the products package but cruise-
 * shaped. The cruise content aggregate (§3.2 / §E) is `{ cruise, ship,
 * sailings[], cabin_categories[], itinerary_stops[], policies[] }` —
 * one payload returned by a single getContent. The cruise adapter's
 * existing internal multi-method API
 * (`fetchCruise/fetchSailing/fetchShip/fetchItinerary`) composes
 * internally to produce this blob; the public catalog SourceAdapter
 * contract gets one method, not five.
 *
 * See `docs/architecture/catalog-sourced-content.md` §3.3, §3.4, §3.6.
 */

import {
  type ContentLocaleResolution,
  createInvalidateOnDrift,
  fetchOverlaysForEntity,
  type GetContentRequest,
  type GetContentResult,
  type InvalidateOnDrift,
  isStale,
  type ProvenanceReadResult,
  pickBestCachedLocale,
  readSourcedEntry,
  type SourceAdapter,
  type SourceAdapterContext,
  withContentRefreshLock,
} from "@voyant-travel/catalog"
import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq } from "drizzle-orm"

import type { CruiseAdapter, ExternalPriceRow, SourceRef } from "./adapters/index.js"
import {
  CRUISES_CONTENT_SCHEMA_VERSION,
  type CruiseContent,
  cruiseContentSchema,
  mergeOverlaysIntoCruiseContent,
  validateCruiseContent,
} from "./content-shape.js"
import { resolveCruiseSourceAdapter } from "./lib/adapter-resolution.js"
import {
  CRUISES_CONTENT_MARKET_ANY,
  cruisesSourcedContentTable,
  type SelectCruisesSourcedContent,
} from "./schema-sourced-content.js"
import { buildOwnedCruiseContent } from "./service-content-owned.js"
import {
  type SynthesizedCruiseContent,
  synthesizeCruiseContent,
} from "./service-content-synthesizer.js"

const CRUISES_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24h, per §3.4

export interface CruiseContentScope {
  preferredLocales: ReadonlyArray<string>
  market?: string
  currency?: string
  acceptMachineTranslated?: boolean
}

export interface GetCruiseContentOptions {
  registry: SourceAdapterRegistry
  buildAdapterContext?: (adapter: SourceAdapter) => SourceAdapterContext
  onOverlayError?: (event: { field_path: string; reason: string }) => void
  /**
   * Called when the adapter's `getContent` fails and the read degrades to the
   * synthesizer. Defaults to `console.warn`; the read still succeeds.
   */
  onContentFetchError?: (event: { entity_id: string; reason: string }) => void
}

export interface ResolvedCruiseContent {
  content: CruiseContent
  resolution: ContentLocaleResolution<{ locale: string; payload: CruiseContent }>
  provenance: ResolvedCruiseContentProvenance
  source: "sourced-cache" | "sourced-fresh" | "synthesized" | "owned"
  served_stale: boolean
  synthesized: boolean
  machine_translated: boolean
}

export interface ResolvedCruiseContentProvenance {
  source_kind: string
  source_provider?: string
  source_connection_id?: string
  source_ref?: string
}

export async function getCruiseContent(
  db: AnyDrizzleDb,
  entityId: string,
  scope: CruiseContentScope,
  options: GetCruiseContentOptions,
): Promise<ResolvedCruiseContent | null> {
  const sourcedEntry = await readSourcedEntry(db, "cruises", entityId)
  if (!sourcedEntry) {
    const owned = await buildOwnedCruiseContent(db, entityId, {
      preferredLocales: scope.preferredLocales,
    })
    if (!owned) return null
    const overlays = await fetchOverlaysForEntity(db, "cruises", entityId)
    const merged = mergeOverlaysIntoCruiseContent(
      owned.content,
      overlays.map((o) => ({ field_path: o.field_path, value: o.value })),
      {
        onOverlayError: options.onOverlayError
          ? (e) =>
              options.onOverlayError!({
                field_path: e.overlay.field_path,
                reason: e.reason,
              })
          : undefined,
      },
    )
    return {
      content: merged,
      resolution: {
        candidate: { locale: owned.servedLocale, payload: merged },
        served_locale: owned.servedLocale,
        match_kind: owned.matchKind,
      },
      provenance: { source_kind: "owned" },
      source: "owned",
      served_stale: false,
      synthesized: false,
      machine_translated: false,
    }
  }

  const provenance: Extract<ProvenanceReadResult, { kind: "sourced" }> = {
    kind: "sourced",
    provenance: {
      source_kind: sourcedEntry.source_kind,
      source_provider: sourcedEntry.source_provider ?? undefined,
      source_connection_id: sourcedEntry.source_connection_id ?? undefined,
      source_ref: sourcedEntry.source_ref ?? undefined,
      source_freshness: sourcedEntry.source_freshness,
      last_sourced_at: sourcedEntry.last_sourced_at ?? undefined,
    },
    entry_id: sourcedEntry.id,
    status: sourcedEntry.status,
    projection: sourcedEntry.projection,
    projection_etag: sourcedEntry.projection_etag,
    projection_seen_at: sourcedEntry.projection_seen_at,
    first_seen_at: sourcedEntry.first_seen_at,
    last_seen_at: sourcedEntry.last_seen_at,
  }
  const resultProvenance = sourcedEntryToContentProvenance(sourcedEntry)

  const adapter = resolveCruiseSourceAdapter(
    options.registry,
    sourcedEntry.source_kind,
    sourcedEntry.source_connection_id,
  )
  const adapterCtx: SourceAdapterContext = options.buildAdapterContext?.(adapter!) ?? {
    connection_id: sourcedEntry.source_connection_id ?? sourcedEntry.source_kind,
  }
  const market = scope.market ?? CRUISES_CONTENT_MARKET_ANY
  const acceptMT = scope.acceptMachineTranslated ?? true
  const ownsContentCache = adapter?.capabilities.ownsContentCache === true

  if (ownsContentCache) {
    if (!adapter?.getContent) {
      throw new Error(
        `cruises adapter for ${entityId} declares ownsContentCache but does not implement getContent`,
      )
    }
    const fresh = await fetchPassThroughContent(adapter, adapterCtx, {
      entity_module: "cruises",
      entity_id: entityId,
      locale: scope.preferredLocales[0] ?? "en-GB",
      market,
      currency: scope.currency,
    })
    return finalizeFresh(db, entityId, fresh, scope, options, resultProvenance)
  }

  const cachedRows = await fetchCacheCandidates(db, entityId, market)
  const eligibleRows = acceptMT ? cachedRows : cachedRows.filter((r) => !r.machine_translated)

  const best = pickBestCachedLocale(
    eligibleRows.map((row) => ({ ...row, locale: row.locale })),
    scope.preferredLocales,
  )

  if (best && !isStale(best.candidate)) {
    return finalizeFromCache(db, entityId, best, false, options, resultProvenance)
  }

  if (best && isStale(best.candidate)) {
    if (adapter?.getContent) {
      void scheduleRefresh(db, adapter, adapterCtx, {
        entity_module: "cruises",
        entity_id: entityId,
        locale: scope.preferredLocales[0] ?? best.candidate.locale,
        market,
        currency: scope.currency,
      })
    }
    return finalizeFromCache(db, entityId, best, true, options, resultProvenance)
  }

  if (!adapter?.getContent) {
    const overlays = await fetchOverlaysForEntity(db, "cruises", entityId)
    const synthesized = synthesizeCruiseContent(
      { locale: scope.preferredLocales[0] ?? "en-GB" },
      {
        provenance,
        overlays: overlays.map((o) => ({ field_path: o.field_path, value: o.value })),
      },
    )
    return wrapSynthesized(synthesized, scope, false, resultProvenance)
  }

  const fresh = await fetchFreshContent(
    db,
    adapter,
    adapterCtx,
    {
      entity_module: "cruises",
      entity_id: entityId,
      locale: scope.preferredLocales[0] ?? "en-GB",
      market,
      currency: scope.currency,
    },
    options.onContentFetchError,
  )
  if (!fresh) {
    const overlays = await fetchOverlaysForEntity(db, "cruises", entityId)
    const synthesized = synthesizeCruiseContent(
      { locale: scope.preferredLocales[0] ?? "en-GB" },
      {
        provenance,
        overlays: overlays.map((o) => ({ field_path: o.field_path, value: o.value })),
      },
    )
    return wrapSynthesized(synthesized, scope, false, resultProvenance)
  }

  return finalizeFresh(db, entityId, fresh, scope, options, resultProvenance)
}

export interface CruiseSailingPricingRow {
  /** Upstream cabin-category external id (e.g. `<ship>_<grade>`). */
  cabinExternalId: string
  occupancy: number
  fareCode: string | null
  fareName: string | null
  currency: string
  /** Major-unit price string as the adapter returns it (e.g. "12959.00"). */
  pricePerPerson: string
  availability: string
}

/**
 * Live per-sailing cabin pricing for a sourced cruise. Pricing is volatile-live
 * (architecture §5.4) so it is fetched fresh from the adapter per call rather
 * than baked into the cached content — the catalog detail sheet calls this
 * lazily when a departure row is expanded.
 *
 * Returns `null` when the entity has no sourced row or the registered adapter
 * can't price sailings (e.g. a thin adapter without `fetchSailingPricing`).
 */
export async function getCruiseSailingPricing(
  db: AnyDrizzleDb,
  entityId: string,
  sailingExternalId: string,
  options: { registry: SourceAdapterRegistry },
): Promise<CruiseSailingPricingRow[] | null> {
  const sourcedEntry = await readSourcedEntry(db, "cruises", entityId)
  if (!sourcedEntry) return null

  const adapter = resolveCruiseSourceAdapter(
    options.registry,
    sourcedEntry.source_kind,
    sourcedEntry.source_connection_id,
  )

  // The catalog SourceAdapter for cruises is the `cruiseAdapterToSourceAdapter`
  // shim, which exposes the underlying multi-method `CruiseAdapter`. Pricing
  // isn't part of the catalog SourceAdapter surface, so reach through to it.
  const cruiseAdapter = (adapter as { cruiseAdapter?: CruiseAdapter } | undefined)?.cruiseAdapter
  if (!cruiseAdapter?.fetchSailingPricing) return null

  const sailingRef: SourceRef = {
    connectionId: sourcedEntry.source_connection_id ?? undefined,
    externalId: sailingExternalId,
  }
  const rows = await cruiseAdapter.fetchSailingPricing(sailingRef)
  return rows.map((row: ExternalPriceRow) => ({
    cabinExternalId: row.cabinCategoryRef.externalId,
    occupancy: row.occupancy,
    fareCode: row.fareCode ?? null,
    fareName: row.fareCodeName ?? null,
    currency: row.currency,
    pricePerPerson: row.pricePerPerson,
    availability: row.availability,
  }))
}

async function fetchCacheCandidates(
  db: AnyDrizzleDb,
  entityId: string,
  market: string,
): Promise<SelectCruisesSourcedContent[]> {
  return db
    .select()
    .from(cruisesSourcedContentTable)
    .where(
      and(
        eq(cruisesSourcedContentTable.entity_id, entityId),
        eq(cruisesSourcedContentTable.market, market),
        eq(cruisesSourcedContentTable.content_schema_version, CRUISES_CONTENT_SCHEMA_VERSION),
      ),
    )
}

/**
 * Fetch content from the adapter, or resolve `null` so the caller can fall back
 * to the synthesizer.
 *
 * A throw here used to escape `getCruiseContent` and 500 the detail route, which
 * is the wrong answer twice over: we hold a durable sourced-entry projection for
 * this cruise, and §3.6 defines the synthesizer as exactly the degraded read for
 * when the adapter can't serve content. Blanking the page with a 500 because an
 * upstream lookup missed loses data we already have.
 *
 * It is not hypothetical — `resolveCruiseRow` in `@voyant-travel/connect-adapter`
 * throws `Connect cruise content not found` for cruises discovery has indexed,
 * and on sandbox that turned into a 500 on every concurrent detail open. The
 * failure is still reported through `onContentFetchError` so an upstream outage
 * stays visible instead of silently degrading every cruise to a stub.
 */
async function fetchFreshContent(
  db: AnyDrizzleDb,
  adapter: SourceAdapter,
  ctx: SourceAdapterContext,
  request: GetContentRequest,
  onContentFetchError?: (event: { entity_id: string; reason: string }) => void,
): Promise<GetContentResult | null> {
  try {
    const result = await withContentRefreshLock(
      db,
      {
        entityModule: request.entity_module,
        entityId: request.entity_id,
        locale: request.locale,
        market: request.market,
      },
      async () => {
        const got = await adapter.getContent!(ctx, request)
        const validation = validateCruiseContent(got.content)
        if (!validation.valid) {
          throw new Error(
            `cruises getContent for ${request.entity_id} failed validation: ${validation.reason}`,
          )
        }
        await writeCacheRow(db, request, got)
        return got
      },
    )
    return result ?? null
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (onContentFetchError) {
      onContentFetchError({ entity_id: request.entity_id, reason })
    } else {
      console.warn(`[cruises] getContent failed for ${request.entity_id}: ${reason}`)
    }
    return null
  }
}

async function fetchPassThroughContent(
  adapter: SourceAdapter,
  ctx: SourceAdapterContext,
  request: GetContentRequest,
): Promise<GetContentResult> {
  const got = await adapter.getContent!(ctx, request)
  const validation = validateCruiseContent(got.content)
  if (!validation.valid) {
    throw new Error(
      `cruises getContent for ${request.entity_id} failed validation: ${validation.reason}`,
    )
  }
  return got
}

function scheduleRefresh(
  db: AnyDrizzleDb,
  adapter: SourceAdapter,
  ctx: SourceAdapterContext,
  request: GetContentRequest,
): void {
  void withContentRefreshLock(
    db,
    {
      entityModule: request.entity_module,
      entityId: request.entity_id,
      locale: request.locale,
      market: request.market,
    },
    async () => {
      const got = await adapter.getContent!(ctx, request)
      const validation = validateCruiseContent(got.content)
      if (!validation.valid) return
      await writeCacheRow(db, request, got)
    },
  ).catch(() => {
    // intentional swallow — see §3.4 SWR refresh contract
  })
}

async function writeCacheRow(
  db: AnyDrizzleDb,
  request: GetContentRequest,
  result: GetContentResult,
): Promise<void> {
  const market = request.market ?? CRUISES_CONTENT_MARKET_ANY
  const now = new Date()
  // Coerce JSON-string dates to Date — see products writeCacheRow.
  const sourceUpdatedAt = toDateOrNull(result.source_updated_at)
  const freshUntil =
    toDateOrNull(result.fresh_until) ?? new Date(now.getTime() + CRUISES_DEFAULT_TTL_MS)

  await db
    .insert(cruisesSourcedContentTable)
    .values({
      entity_id: request.entity_id,
      locale: request.locale,
      market,
      payload: result.content as Record<string, unknown>,
      content_schema_version: result.content_schema_version,
      returned_locale: result.returned_locale,
      machine_translated: result.machine_translated ?? false,
      source_updated_at: sourceUpdatedAt,
      fetched_at: now,
      fresh_until: freshUntil,
      etag: result.etag ?? null,
      fetch_status: "ok",
      fetch_error: null,
    })
    .onConflictDoUpdate({
      target: [
        cruisesSourcedContentTable.entity_id,
        cruisesSourcedContentTable.locale,
        cruisesSourcedContentTable.market,
      ],
      set: {
        payload: result.content as Record<string, unknown>,
        content_schema_version: result.content_schema_version,
        returned_locale: result.returned_locale,
        machine_translated: result.machine_translated ?? false,
        source_updated_at: sourceUpdatedAt,
        fetched_at: now,
        fresh_until: freshUntil,
        etag: result.etag ?? null,
        fetch_status: "ok",
        fetch_error: null,
      },
    })
}

async function finalizeFromCache(
  db: AnyDrizzleDb,
  entityId: string,
  best: NonNullable<ReturnType<typeof pickBestCachedLocale<SelectCruisesSourcedContent>>>,
  servedStale: boolean,
  options: GetCruiseContentOptions,
  provenance: ResolvedCruiseContentProvenance,
): Promise<ResolvedCruiseContent> {
  const validation = validateCruiseContent(best.candidate.payload)
  if (!validation.valid) {
    throw new Error(
      `cruises cache row for ${entityId} (${best.candidate.locale}) failed validation: ${validation.reason}`,
    )
  }
  const overlays = await fetchOverlaysForEntity(db, "cruises", entityId)
  const merged = mergeOverlaysIntoCruiseContent(
    validation.content,
    overlays.map((o) => ({ field_path: o.field_path, value: o.value })),
    {
      onOverlayError: options.onOverlayError
        ? (e) =>
            options.onOverlayError!({
              field_path: e.overlay.field_path,
              reason: e.reason,
            })
        : undefined,
    },
  )
  return {
    content: merged,
    resolution: {
      candidate: { locale: best.candidate.locale, payload: merged },
      served_locale: best.candidate.returned_locale,
      match_kind: best.match_kind,
    },
    provenance,
    source: "sourced-cache",
    served_stale: servedStale,
    synthesized: false,
    machine_translated: best.candidate.machine_translated,
  }
}

async function finalizeFresh(
  db: AnyDrizzleDb,
  entityId: string,
  fresh: GetContentResult,
  scope: CruiseContentScope,
  options: GetCruiseContentOptions,
  provenance: ResolvedCruiseContentProvenance,
): Promise<ResolvedCruiseContent> {
  const cachedContent = cruiseContentSchema.parse(fresh.content)
  const overlays = await fetchOverlaysForEntity(db, "cruises", entityId)
  const merged = mergeOverlaysIntoCruiseContent(
    cachedContent,
    overlays.map((o) => ({ field_path: o.field_path, value: o.value })),
    {
      onOverlayError: options.onOverlayError
        ? (e) =>
            options.onOverlayError!({
              field_path: e.overlay.field_path,
              reason: e.reason,
            })
        : undefined,
    },
  )
  return {
    content: merged,
    resolution: {
      candidate: { locale: scope.preferredLocales[0] ?? fresh.returned_locale, payload: merged },
      served_locale: fresh.returned_locale,
      match_kind: scope.preferredLocales[0] === fresh.returned_locale ? "exact" : "language_match",
    },
    provenance,
    source: "sourced-fresh",
    served_stale: false,
    synthesized: false,
    machine_translated: fresh.machine_translated ?? false,
  }
}

function wrapSynthesized(
  synthesized: SynthesizedCruiseContent,
  scope: CruiseContentScope,
  servedStale: boolean,
  provenance: ResolvedCruiseContentProvenance,
): ResolvedCruiseContent {
  return {
    content: synthesized.content,
    resolution: {
      candidate: { locale: synthesized.served_locale, payload: synthesized.content },
      served_locale: synthesized.served_locale,
      match_kind: scope.preferredLocales[0] === synthesized.served_locale ? "exact" : "any",
    },
    provenance,
    source: "synthesized",
    served_stale: servedStale,
    synthesized: true,
    machine_translated: false,
  }
}

function sourcedEntryToContentProvenance(sourcedEntry: {
  source_kind: string
  source_provider?: string | null
  source_connection_id?: string | null
  source_ref?: string | null
}): ResolvedCruiseContentProvenance {
  return {
    source_kind: sourcedEntry.source_kind,
    ...(sourcedEntry.source_provider ? { source_provider: sourcedEntry.source_provider } : {}),
    ...(sourcedEntry.source_connection_id
      ? { source_connection_id: sourcedEntry.source_connection_id }
      : {}),
    ...(sourcedEntry.source_ref ? { source_ref: sourcedEntry.source_ref } : {}),
  }
}

/**
 * Drift event consumer for the cruises content cache. Per sourced-
 * content §3.4.1.
 */
export const invalidateCruiseContentOnDrift: InvalidateOnDrift = createInvalidateOnDrift(
  cruisesSourcedContentTable,
  { entityModule: "cruises" },
)

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
