// agent-quality: file-size exception -- owner: catalog; one generated-runtime contributor map centralizes the package's lazy port factories and shared host primitives.

import {
  type BookingActionSourceRuntime,
  type BookingsRelationshipsRuntime,
  type BookingsSupplierAmendmentRuntime,
  bookingActionSourceRuntimePort,
  bookingsRelationshipsRuntimePort,
  bookingsSupplierAmendmentRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { CatalogSearchRuntimeOptions } from "@voyant-travel/catalog/api-runtime-ports"
import {
  catalogBookingRuntimePort,
  catalogOffersRuntimePort,
  catalogSearchRuntimePort,
} from "@voyant-travel/catalog/api-runtime-ports"
import { createProductionBookingSessionModule } from "@voyant-travel/catalog/booking-engine"
import type { CatalogBookingRouteModuleOptions } from "@voyant-travel/catalog/booking-engine/operator-routes"
import { createDrizzleBookingSessionRepository } from "@voyant-travel/catalog/booking-engine/sessions-drizzle"
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
import {
  type AnalyticsPort,
  analyticsPort,
  createDeferredAnalytics,
} from "@voyant-travel/core/analytics"
import type { VoyantPort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PaymentAdapter } from "@voyant-travel/finance"
import {
  type FinanceOperatorSettingsRuntime,
  financeOperatorSettingsRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { catalogBookingActionSource } from "./booking-action-source.js"
import { createCatalogBookingAmendmentRuntime } from "./booking-engine/amendment-runtime.js"
import { DEFAULT_BOOKING_SESSION_TERMINAL_RETENTION_MS } from "./booking-session-maintenance-job.js"
import {
  type CatalogBookingSessionMaintenanceJobRuntime,
  catalogBookingSessionMaintenanceJobRuntimePort,
} from "./booking-session-maintenance-job-runtime-port.js"
import {
  type CatalogBookingSessionSettlementRuntime,
  catalogBookingSessionSettlementRuntimePort,
} from "./booking-session-settlement-runtime-port.js"
import {
  type CatalogCompositeBookingSessionRuntime,
  catalogCompositeBookingSessionRuntimePort,
} from "./composite-booking-session-runtime-port.js"
import {
  type PersonalBuyerPersonRuntime,
  personalBuyerPersonRuntimePort,
} from "./personal-buyer-person-runtime-port.js"
import {
  type CatalogReindexCheckpoint,
  type CatalogReindexClaim,
  catalogReindexJobRuntimePort,
} from "./reindex-job-runtime-port.js"
import { refreshBookingEngineConnectSources } from "./runtime/booking-engine-runtime.js"
import { createBookingSessionServiceRuntimes } from "./runtime/booking-runtime.js"
import { createCatalogRuntime } from "./runtime.js"
import {
  type CatalogAccommodationsRuntimeExtension,
  type CatalogChartersRuntimeExtension,
  type CatalogCommerceRuntimeExtension,
  type CatalogCruisesRuntimeExtension,
  type CatalogDistributionRuntimeExtension,
  type CatalogInventoryRuntimeExtension,
  type CatalogLegalRuntimeExtension,
  type CatalogOperationsRuntimeExtension,
  type CatalogRuntimeServices,
  type CatalogSourcesRuntimeExtension,
  catalogAccommodationsRuntimeExtensionPort,
  catalogChartersRuntimeExtensionPort,
  catalogCommerceRuntimeExtensionPort,
  catalogCruisesRuntimeExtensionPort,
  catalogDistributionRuntimeExtensionPort,
  catalogInventoryRuntimeExtensionPort,
  catalogLegalRuntimeExtensionPort,
  catalogOperationsRuntimeExtensionPort,
  catalogRuntimeServicesPort,
  catalogSourcesRuntimeExtensionPort,
} from "./runtime-contracts.js"
import {
  type CatalogSourcesSyncJobRuntime,
  catalogSourcesSyncJobRuntimePort,
} from "./sources-sync-job-runtime-port.js"

type RuntimePortValue<T> = T | Promise<T>
// Importing Cruises here would create a Catalog <-> Cruises package cycle.
const cruisesRoutesRuntimePortReference = { id: "cruises.routes-runtime" } as const
const paymentAdapterRuntimePortReference = { id: "payments.adapter.runtime" } as const
// Same reason: Commerce depends on Catalog, so the operator-settings runtime it
// provides is referenced by id rather than imported.
const commerceOperatorSettingsRuntimePortReference = {
  id: "commerce.operator-settings.runtime",
} as const

interface CommerceBankTransferInstructionsRuntime {
  resolveBankTransferInstructions(
    db: PostgresJsDatabase,
    env: Record<string, string | undefined>,
  ): Promise<{ beneficiary: string; iban: string; bankName: string }>
}

/**
 * The operator's own account, or nothing.
 *
 * The settings provider fills unset fields with an em dash so an operator
 * screen has something to render. That is a placeholder, not an account, and a
 * bank-transfer document naming it would tell the shopper to wire money to
 * "—". Treat it as unconfigured, which is what stops the Commit issuing
 * instructions nobody can act on (voyant#4743).
 */
function configuredBankTransferDetails(instructions: {
  beneficiary: string
  iban: string
  bankName: string
}): { beneficiary: string; iban: string; bankName: string | null } | null {
  const configured = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    return trimmed && trimmed !== "—" && trimmed !== "-" ? trimmed : null
  }
  const beneficiary = configured(instructions.beneficiary)
  const iban = configured(instructions.iban)
  if (!beneficiary || !iban) return null
  return { beneficiary, iban, bankName: configured(instructions.bankName) }
}

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
  const hasSourcesPort = host.hasRuntimePort?.(catalogSourcesRuntimeExtensionPort) === true
  // Bound synchronously even though the host resolves the port lazily:
  // `createDeferredAnalytics` queues emission behind the pending provider, so
  // the Sessions a process serves before the binding settles are recorded
  // rather than silently dropped.
  const analytics =
    host.hasRuntimePort?.(analyticsPort) === true
      ? createDeferredAnalytics(Promise.resolve(host.getRuntimePort<AnalyticsPort>(analyticsPort)))
      : undefined
  const bookingSessionServiceRuntimes = {
    // An optional provider may be contributed after Catalog is constructed.
    // Availability must be read when a Session needs the port, not snapshotted
    // while Catalog contributes its own ports.
    async resolveBookingsRelationshipsRuntime() {
      if (host.hasRuntimePort?.(bookingsRelationshipsRuntimePort) !== true) return null
      return host.getRuntimePort<BookingsRelationshipsRuntime>(bookingsRelationshipsRuntimePort)
    },
    async resolvePersonalBuyerPersonRuntime() {
      if (host.hasRuntimePort?.(personalBuyerPersonRuntimePort) !== true) return null
      return host.getRuntimePort<PersonalBuyerPersonRuntime>(personalBuyerPersonRuntimePort)
    },
    resolveFinanceServiceRuntime(context: unknown) {
      const eventBus = (context as { var?: { eventBus?: unknown } } | undefined)?.var?.eventBus
      return eventBus ? { eventBus: eventBus as never } : {}
    },
  }
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
      host.getRuntimePort<CatalogLegalRuntimeExtension>(catalogLegalRuntimeExtensionPort),
      host.getRuntimePort<CatalogOperationsRuntimeExtension>(catalogOperationsRuntimeExtensionPort),
      host.getRuntimePort<FinanceOperatorSettingsRuntime>(financeOperatorSettingsRuntimePort),
      hasIndexerPort ? host.getRuntimePort<unknown>(catalogIndexerProviderPort) : undefined,
      hasSourcesPort
        ? host.getRuntimePort<CatalogSourcesRuntimeExtension>(catalogSourcesRuntimeExtensionPort)
        : undefined,
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
      legal,
      operations,
      settings,
      indexer,
      sources,
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
          legal,
          operations,
          ...(sources ? { sources } : {}),
        },
        settings,
        {
          indexer: catalogIndexer,
          ...bookingSessionServiceRuntimes,
          async resolvePaymentAdapter() {
            if (host.hasRuntimePort?.(paymentAdapterRuntimePortReference) !== true) return null
            return host.getRuntimePort<PaymentAdapter>(paymentAdapterRuntimePortReference)
          },
          ...(analytics ? { analytics } : {}),
        },
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
  const resolveBookingSessionModule = async (dbOverride?: AnyDrizzleDb) => {
    const db = (dbOverride ?? host.primitives.database.resolve(undefined)) as PostgresJsDatabase
    const runtime = await contribution
    const services = await runtime.services
    const [, , commerce, distribution, , inventory, , , settings] = await dependencies
    return createProductionBookingSessionModule({
      db,
      ...createBookingSessionServiceRuntimes(bookingSessionServiceRuntimes, undefined),
      ...(analytics ? { analytics } : {}),
      resolvePromotionEvaluator: (sessionDb) => commerce.createPromotionEvaluator?.(sessionDb),
      ...(commerce.resolveAncillaryOffers
        ? { resolveAncillaryOffers: commerce.resolveAncillaryOffers }
        : {}),
      repository: createDrizzleBookingSessionRepository(db),
      resolveOwnedHandlers: () => services.getOwnedHandlers(host.primitives.env(undefined)),
      resolveSourceRegistry: () => services.ensureSourceRegistry(host.primitives.env(undefined)),
      resolveCompositeHandler: () => services.getCompositeBookingSessionHandler?.(),
      payments: {
        inventory,
        distribution,
        settings,
        // Everything a Session can target that is not a single product:
        // accommodations, cruise cabins and sourced entries all resolve their
        // policy through this cascade (voyant#4745).
        ...(commerce.entityPaymentPolicy ? { entityPolicy: commerce.entityPaymentPolicy } : {}),
        async resolvePaymentAdapter() {
          if (host.hasRuntimePort?.(paymentAdapterRuntimePortReference) !== true) return null
          return host.getRuntimePort<PaymentAdapter>(paymentAdapterRuntimePortReference)
        },
        async resolveBankTransferInstructions(paymentsDb) {
          if (host.hasRuntimePort?.(commerceOperatorSettingsRuntimePortReference) !== true) {
            return null
          }
          const operatorSettings =
            await host.getRuntimePort<CommerceBankTransferInstructionsRuntime>(
              commerceOperatorSettingsRuntimePortReference,
            )
          return configuredBankTransferDetails(
            await operatorSettings.resolveBankTransferInstructions(
              paymentsDb,
              host.primitives.env(undefined) as Record<string, string | undefined>,
            ),
          )
        },
        paymentAdapterContext: {
          env: host.primitives.env(undefined) as Readonly<Record<string, unknown>>,
        },
      },
    })
  }
  return {
    [bookingActionSourceRuntimePort.id]:
      catalogBookingActionSource satisfies BookingActionSourceRuntime,
    [catalogSearchRuntimePort.id]: contribution.then((runtime) => runtime.search),
    [catalogBookingRuntimePort.id]: contribution.then((runtime) => runtime.booking),
    [catalogOffersRuntimePort.id]: contribution.then((runtime) => runtime.offers),
    [catalogContentRuntimePort.id]: contribution.then((runtime) => runtime.content),
    [catalogProjectionRuntimePort.id]: contribution.then((runtime) => runtime.projection),
    [catalogBookingSnapshotRuntimePort.id]: contribution.then((runtime) => runtime.bookingSnapshot),
    [catalogBookingSessionSettlementRuntimePort.id]: {
      async commitPaidSession(input) {
        return (await resolveBookingSessionModule()).commitPaidSession(input)
      },
    } satisfies CatalogBookingSessionSettlementRuntime,
    [catalogCompositeBookingSessionRuntimePort.id]: {
      async createValidatedTripSnapshotSession(input) {
        const module = await resolveBookingSessionModule(input.db)
        return module.createCompositeSession(
          {
            idempotencyKey: input.idempotencyKey,
            target: {
              kind: "trip_snapshot",
              tripSnapshotId: input.tripSnapshotId,
              tripEnvelopeId: input.tripEnvelopeId,
            },
            scope: input.scope,
          },
          compositeSessionAccess(input),
        )
      },
    } satisfies CatalogCompositeBookingSessionRuntime,
    [catalogRuntimeServicesPort.id]: contribution.then((runtime) => runtime.services),
    [bookingsSupplierAmendmentRuntimePort.id]: createCatalogBookingAmendmentRuntime({
      async resolveRegistry() {
        const runtime = await contribution
        const services = await runtime.services
        return services.ensureSourceRegistry(host.primitives.env(undefined))
      },
    }) satisfies BookingsSupplierAmendmentRuntime,
    [catalogBookingSessionMaintenanceJobRuntimePort.id]: {
      resolveModule() {
        return resolveBookingSessionModule()
      },
      resolveRetentionMs: () => resolveBookingSessionRetentionMs(host.primitives.env(undefined)),
      reportFailure(error, details) {
        console.error("[catalog-booking-session-maintenance] operation failed", {
          error,
          ...details,
        })
      },
    } satisfies CatalogBookingSessionMaintenanceJobRuntime,
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

function resolveBookingSessionRetentionMs(env: Readonly<Record<string, unknown>>): number {
  const configuredDays = env.BOOKING_SESSION_TERMINAL_RETENTION_DAYS
  if (configuredDays === undefined || configuredDays === "") {
    return DEFAULT_BOOKING_SESSION_TERMINAL_RETENTION_MS
  }
  const days = Number(configuredDays)
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("BOOKING_SESSION_TERMINAL_RETENTION_DAYS must be a non-negative number.")
  }
  return days * 24 * 60 * 60 * 1000
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

/**
 * How a composite Trip Session identifies its creator.
 *
 * A customer-owned Session must carry a Buyer Account, so claiming
 * `actorKind: "customer"` on the strength of a user id alone produces a Session
 * the access rules then refuse — which would fail every authenticated Trip
 * checkout before a Session existed at all.
 *
 * A personal Buyer Account is `personal:<principal>` by construction, so the
 * whole context is derivable here. A business account is not: it additionally
 * needs the auth organization, its CRM counterpart, and the caller's
 * membership, and this port carries none of them. Rather than fabricate a
 * membership the caller never proved, that case creates the Session against the
 * capability it already supplies. The Trip still books; the Booking is claimed
 * rather than owned outright, which is the same answer a guest gets.
 */
function compositeSessionAccess(input: {
  capability: string
  ownerUserId: string | null
  ownerBuyerAccountId?: string | null
  channel: { channelId: string }
}) {
  const principalId = input.ownerUserId?.trim()
  const buyerAccountId = input.ownerBuyerAccountId?.trim()
  if (principalId && buyerAccountId === `personal:${principalId}`) {
    return {
      actorKind: "customer" as const,
      principalId,
      buyerAccountId,
      buyerAccountKind: "personal" as const,
      publicApiOrigin: input.channel,
    }
  }
  return {
    actorKind: "anonymous" as const,
    capability: input.capability,
    publicApiOrigin: input.channel,
  }
}
