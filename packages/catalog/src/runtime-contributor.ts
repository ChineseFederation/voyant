import {
  type BookingsRelationshipsRuntime,
  bookingsRelationshipsRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { CatalogSearchRuntimeOptions } from "@voyant-travel/catalog/api-runtime-ports"
import {
  catalogBookingRuntimePort,
  catalogOffersRuntimePort,
  catalogSearchRuntimePort,
} from "@voyant-travel/catalog/api-runtime-ports"
import { createSelfServiceBookingSourceProvider } from "@voyant-travel/catalog/booking-engine"
import type { CatalogBookingRouteModuleOptions } from "@voyant-travel/catalog/booking-engine/operator-routes"
import {
  type CatalogIndexer,
  catalogIndexerProviderPort,
  validateCatalogIndexer,
} from "@voyant-travel/catalog/indexer/provider"
import type { CatalogOffersRouteModuleOptions } from "@voyant-travel/catalog/offers"
import {
  type CatalogContentRuntime,
  catalogContentRuntimePort,
} from "@voyant-travel/catalog/runtime-port"
import {
  type CatalogBookingSnapshotRuntimeProvider,
  type CatalogProjectionRuntimeProvider,
  catalogBookingSnapshotRuntimePort,
  catalogProjectionRuntimePort,
} from "@voyant-travel/catalog/subscriber-runtime-ports"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  type FinanceOperatorSettingsRuntime,
  financeOperatorSettingsRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import { financeSelfServiceBookingSourceRuntimePort } from "@voyant-travel/finance/self-service-booking-source"
import { sql } from "drizzle-orm"
import { catalogDraftReaperJobRuntimePort } from "./draft-reaper-job-runtime-port.js"
import {
  type CatalogReindexCheckpoint,
  type CatalogReindexClaim,
  catalogReindexJobRuntimePort,
} from "./reindex-job-runtime-port.js"
import { refreshBookingEngineConnectSources } from "./runtime/booking-engine-runtime.js"
import { createCatalogRuntime } from "./runtime.js"
import {
  type CatalogAccommodationsRuntimeExtension,
  type CatalogChartersRuntimeExtension,
  type CatalogCommerceRuntimeExtension,
  type CatalogCruisesRuntimeExtension,
  type CatalogDistributionRuntimeExtension,
  type CatalogInventoryRuntimeExtension,
  type CatalogOperationsRuntimeExtension,
  type CatalogRuntimeServices,
  catalogAccommodationsRuntimeExtensionPort,
  catalogChartersRuntimeExtensionPort,
  catalogCommerceRuntimeExtensionPort,
  catalogCruisesRuntimeExtensionPort,
  catalogDistributionRuntimeExtensionPort,
  catalogInventoryRuntimeExtensionPort,
  catalogOperationsRuntimeExtensionPort,
  catalogRuntimeServicesPort,
} from "./runtime-contracts.js"
import {
  type CatalogSourcesSyncJobRuntime,
  catalogSourcesSyncJobRuntimePort,
} from "./sources-sync-job-runtime-port.js"

type RuntimePortValue<T> = T | Promise<T>
// Importing Cruises here would create a Catalog <-> Cruises package cycle.
const cruisesRoutesRuntimePortReference = { id: "cruises.routes-runtime" } as const

export interface CatalogRuntimePortContribution {
  search: RuntimePortValue<CatalogSearchRuntimeOptions>
  booking: RuntimePortValue<CatalogBookingRouteModuleOptions>
  offers: RuntimePortValue<CatalogOffersRouteModuleOptions>
  content: RuntimePortValue<CatalogContentRuntime>
  projection: RuntimePortValue<CatalogProjectionRuntimeProvider>
  bookingSnapshot: RuntimePortValue<CatalogBookingSnapshotRuntimeProvider>
  services: RuntimePortValue<CatalogRuntimeServices>
}

export interface CatalogRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

export function createCatalogRuntimePortContribution(
  host: CatalogRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const hasIndexerPort = host.hasRuntimePort?.(catalogIndexerProviderPort) === true
  const dependencies = Promise.resolve().then(() =>
    Promise.all([
      host.getRuntimePort<CatalogAccommodationsRuntimeExtension>(
        catalogAccommodationsRuntimeExtensionPort,
      ),
      host.getRuntimePort<CatalogChartersRuntimeExtension>(catalogChartersRuntimeExtensionPort),
      host.getRuntimePort<CatalogCommerceRuntimeExtension>(catalogCommerceRuntimeExtensionPort),
      host.getRuntimePort<CatalogDistributionRuntimeExtension>(
        catalogDistributionRuntimeExtensionPort,
      ),
      host.getRuntimePort<CatalogCruisesRuntimeExtension>(catalogCruisesRuntimeExtensionPort),
      host.getRuntimePort<CatalogInventoryRuntimeExtension>(catalogInventoryRuntimeExtensionPort),
      host.getRuntimePort<CatalogOperationsRuntimeExtension>(catalogOperationsRuntimeExtensionPort),
      host.getRuntimePort<FinanceOperatorSettingsRuntime>(financeOperatorSettingsRuntimePort),
      hasIndexerPort ? host.getRuntimePort<unknown>(catalogIndexerProviderPort) : undefined,
    ]),
  )
  const contribution = dependencies.then(
    ([
      accommodations,
      charters,
      commerce,
      distribution,
      cruises,
      inventory,
      operations,
      settings,
      indexer,
    ]) => {
      let catalogIndexer: CatalogIndexer | undefined
      if (hasIndexerPort) {
        validateCatalogIndexer(indexer)
        catalogIndexer = indexer
      }
      return createCatalogRuntime(
        host.primitives,
        {
          accommodations,
          charters,
          commerce,
          distribution,
          cruises,
          inventory,
          operations,
        },
        settings,
        { indexer: catalogIndexer },
      )
    },
  )
  const cruisesRoutes = {
    resolveSourceAdapterRegistry: async (bindings: unknown) => {
      const runtime = await contribution
      const services = await runtime.services
      return services.ensureSourceRegistry(host.primitives.env(bindings))
    },
  }
  return {
    [catalogSearchRuntimePort.id]: contribution.then((runtime) => runtime.search),
    [catalogBookingRuntimePort.id]: contribution.then((runtime) => runtime.booking),
    [catalogOffersRuntimePort.id]: contribution.then((runtime) => runtime.offers),
    [catalogContentRuntimePort.id]: contribution.then((runtime) => runtime.content),
    [catalogProjectionRuntimePort.id]: contribution.then((runtime) => runtime.projection),
    [catalogBookingSnapshotRuntimePort.id]: contribution.then((runtime) => runtime.bookingSnapshot),
    [catalogRuntimeServicesPort.id]: contribution.then((runtime) => runtime.services),
    // Gates Finance's self-service create action.
    [financeSelfServiceBookingSourceRuntimePort.id]: createSelfServiceBookingSourceProvider({
      async resolveOwnedHandlers() {
        const runtime = await contribution
        const services = await runtime.services
        return services.getOwnedHandlers(host.primitives.env(undefined))
      },
      // Verifies the draft capability. Absent secrets mean the capability
      // cannot be checked, and booking is refused rather than allowed.
      resolveEnv: () => host.primitives.env(undefined) as Record<string, string | undefined>,
      // A verified guest has no account, so the booking's billing party is
      // resolved from the contact they proved control of. `upsertPersonFromContact`
      // matches on email then phone, so a retry reuses the same person rather
      // than creating another. Absent the port, only authenticated customers
      // can book — they already are the billing party.
      //
      // The port check happens HERE, on call, not while this contributor is
      // being built. Contributors load in alphabetical order by package name,
      // and `bookings.relationships.runtime` is provided by
      // @voyant-travel/relationships — which sorts after @voyant-travel/catalog
      // and therefore cannot ever have run yet. Deciding at build time read the
      // port as permanently absent and dropped this method from every runtime,
      // so `resolveBilling` returned null and every guest self-service booking
      // was refused with `incomplete_draft`. By the time a request calls this,
      // every contributor has run.
      async resolveBillingPerson(contact, provenance) {
        if (host.hasRuntimePort?.(bookingsRelationshipsRuntimePort) !== true) return null
        const relationships = await host.getRuntimePort<BookingsRelationshipsRuntime>(
          bookingsRelationshipsRuntimePort,
        )
        const person = await relationships.upsertPersonFromContact(
          host.primitives.database.resolve(undefined) as never,
          { ...contact, preferredLanguage: null },
          { source: provenance.source, sourceRef: provenance.sourceRef },
        )
        return person?.id ?? null
      },
    }),
    [catalogDraftReaperJobRuntimePort.id]: {
      async withDb<T>(operation: (db: AnyDrizzleDb) => Promise<T>) {
        return operation(host.primitives.database.resolve(undefined))
      },
      async resolveSourceRegistry() {
        const runtime = await contribution
        const services = await runtime.services
        return services.ensureSourceRegistry(host.primitives.env(undefined))
      },
      async resolveOwnedHandlers() {
        const runtime = await contribution
        const services = await runtime.services
        return services.getOwnedHandlers(host.primitives.env(undefined))
      },
      reportFailure(error: unknown, details: { draftId: string; op: string }) {
        console.error("[catalog-draft-reaper] operation failed", { error, ...details })
      },
    },
    [catalogSourcesSyncJobRuntimePort.id]: {
      async withDb<T>(operation: (db: AnyDrizzleDb) => Promise<T>) {
        return operation(host.primitives.database.resolve(undefined))
      },
      async resolveServices() {
        const runtime = await contribution
        return runtime.services
      },
      resolveEnv() {
        return host.primitives.env(undefined)
      },
      async refreshSourceRegistry() {
        return refreshBookingEngineConnectSources(
          host.primitives.env(undefined) as Parameters<
            typeof refreshBookingEngineConnectSources
          >[0],
        )
      },
      reportProgress(event) {
        console.info("[catalog-sources-sync]", event)
      },
    } satisfies CatalogSourcesSyncJobRuntime,
    [catalogReindexJobRuntimePort.id]: {
      async createRuntime(bindings: unknown) {
        if (!bindings || typeof bindings !== "object") {
          throw new Error("Catalog product reindex requires concrete deployment job bindings.")
        }
        if (!hasIndexerPort) {
          throw new Error("Catalog product reindex requires a configured catalog indexer.")
        }
        const tenantId = stringValue(Reflect.get(bindings, "TENANT_ID"))
        if (!tenantId) {
          throw new Error("Catalog product reindex requires TENANT_ID in deployment bindings.")
        }
        const [, , , , , inventory] = await dependencies
        const catalog = await contribution
        const projectionProvider = await catalog.projection
        const projection = await projectionProvider.createRuntime(bindings)
        const withDb = <T>(operation: (db: AnyDrizzleDb) => Promise<T>) =>
          host.primitives.database.transaction(bindings, (database) =>
            operation(database as AnyDrizzleDb),
          )

        return {
          requestGeneration: () =>
            withDb(async (db) => {
              const result = await db.execute(sql`
                INSERT INTO catalog_product_reindex_state (
                  tenant_id, reindex_key, requested_generation, completed_generation
                )
                VALUES (${tenantId}, 'products', 1, 0)
                ON CONFLICT (tenant_id, reindex_key) DO UPDATE
                SET requested_generation = CASE
                      WHEN catalog_product_reindex_state.requested_generation >
                           catalog_product_reindex_state.completed_generation
                        THEN catalog_product_reindex_state.requested_generation
                      ELSE catalog_product_reindex_state.requested_generation + 1
                    END,
                    updated_at = now()
                RETURNING requested_generation
              `)
              return integerValue(firstRow(result)?.requested_generation)
            }),
          claimWork: (leaseOwner: string) =>
            withDb(async (db) => {
              const result = await db.execute(sql`
                UPDATE catalog_product_reindex_state
                SET claimed_generation = COALESCE(claimed_generation, requested_generation),
                    cursor_after_id = CASE
                      WHEN claimed_generation IS NULL THEN NULL
                      ELSE cursor_after_id
                    END,
                    batches = CASE WHEN claimed_generation IS NULL THEN 0 ELSE batches END,
                    scanned = CASE WHEN claimed_generation IS NULL THEN 0 ELSE scanned END,
                    indexed = CASE WHEN claimed_generation IS NULL THEN 0 ELSE indexed END,
                    retries = CASE WHEN claimed_generation IS NULL THEN 0 ELSE retries END,
                    lease_owner = ${leaseOwner},
                    lease_until = now() + interval '2 minutes',
                    updated_at = now()
                WHERE tenant_id = ${tenantId}
                  AND reindex_key = 'products'
                  AND requested_generation > completed_generation
                  AND (lease_until IS NULL OR lease_until < now())
                RETURNING claimed_generation, cursor_after_id, batches, scanned, indexed, retries
              `)
              const row = firstRow(result)
              return row ? claimFromRow(tenantId, leaseOwner, row) : null
            }),
          renewLease: (claim: CatalogReindexClaim) =>
            withDb(async (db) => {
              const result = await db.execute(sql`
                UPDATE catalog_product_reindex_state
                SET lease_until = now() + interval '2 minutes', updated_at = now()
                WHERE tenant_id = ${claim.tenantId}
                  AND reindex_key = 'products'
                  AND claimed_generation = ${claim.generation}
                  AND lease_owner = ${claim.leaseOwner}
                  AND lease_until > now()
                RETURNING tenant_id
              `)
              return Boolean(firstRow(result))
            }),
          checkpoint: (claim: CatalogReindexClaim, checkpoint: CatalogReindexCheckpoint) =>
            withDb(async (db) => {
              const result = await db.execute(sql`
                UPDATE catalog_product_reindex_state
                SET cursor_after_id = ${checkpoint.afterId ?? null},
                    batches = ${checkpoint.batches},
                    scanned = ${checkpoint.scanned},
                    indexed = ${checkpoint.indexed},
                    retries = ${checkpoint.retries},
                    lease_until = now() + interval '2 minutes',
                    updated_at = now()
                WHERE tenant_id = ${claim.tenantId}
                  AND reindex_key = 'products'
                  AND claimed_generation = ${claim.generation}
                  AND lease_owner = ${claim.leaseOwner}
                  AND lease_until > now()
                RETURNING tenant_id
              `)
              return Boolean(firstRow(result))
            }),
          complete: (claim: CatalogReindexClaim, checkpoint: CatalogReindexCheckpoint) =>
            withDb(async (db) => {
              const result = await db.execute(sql`
                UPDATE catalog_product_reindex_state
                SET completed_generation = ${claim.generation},
                    claimed_generation = NULL,
                    cursor_after_id = NULL,
                    batches = ${checkpoint.batches},
                    scanned = ${checkpoint.scanned},
                    indexed = ${checkpoint.indexed},
                    retries = ${checkpoint.retries},
                    lease_owner = NULL,
                    lease_until = NULL,
                    completed_at = now(),
                    updated_at = now()
                WHERE tenant_id = ${claim.tenantId}
                  AND reindex_key = 'products'
                  AND claimed_generation = ${claim.generation}
                  AND lease_owner = ${claim.leaseOwner}
                  AND lease_until > now()
                RETURNING tenant_id
              `)
              return Boolean(firstRow(result))
            }),
          releaseLease: (claim: CatalogReindexClaim) =>
            withDb(async (db) => {
              await db.execute(sql`
                UPDATE catalog_product_reindex_state
                SET lease_owner = NULL, lease_until = NULL, updated_at = now()
                WHERE tenant_id = ${claim.tenantId}
                  AND reindex_key = 'products'
                  AND claimed_generation = ${claim.generation}
                  AND lease_owner = ${claim.leaseOwner}
              `)
            }),
          listProductIdsPage: (input: { afterId?: string; limit: number }) =>
            withDb((db) => inventory.listCanonicalProductIds(db, input)),
          reindexProduct: (productId: string) =>
            projection.reindexEntity({ entityModule: "products", entityId: productId }),
          reportProgress(progress: unknown) {
            console.info("[catalog-reindex-products]", progress)
          },
        }
      },
    },
    [cruisesRoutesRuntimePortReference.id]: cruisesRoutes,
  }
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Record<string, unknown>[] })?.rows ?? [])
  return rows[0] as Record<string, unknown> | undefined
}

function integerValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Catalog product reindex received an invalid database counter: ${value}.`)
  }
  return parsed
}

function claimFromRow(
  tenantId: string,
  leaseOwner: string,
  row: Record<string, unknown>,
): CatalogReindexClaim {
  const afterId = stringValue(row.cursor_after_id)
  return {
    tenantId,
    leaseOwner,
    generation: integerValue(row.claimed_generation),
    ...(afterId ? { afterId } : {}),
    batches: integerValue(row.batches),
    scanned: integerValue(row.scanned),
    indexed: integerValue(row.indexed),
    retries: integerValue(row.retries),
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
