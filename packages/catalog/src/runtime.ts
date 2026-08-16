import type { BookingsRelationshipsRuntime } from "@voyant-travel/bookings/runtime-port"
import { validateEmbeddingCompatibility } from "@voyant-travel/catalog/embeddings/model-registry"
import { type CatalogIndexer, resolveCatalogIndexer } from "@voyant-travel/catalog/indexer/provider"
import { CATALOG_PRESENTATION_SUBJECT_MODULES } from "@voyant-travel/catalog/presentation-subjects"
import type { CatalogSearchRuntime } from "@voyant-travel/catalog/search/routes"
import { createReferencedSubjectReindexFanout } from "@voyant-travel/catalog/services/indexer"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { AnalyticsPort } from "@voyant-travel/core/analytics"
import type { FinanceServiceRuntime, PaymentAdapter } from "@voyant-travel/finance"
import type { FinanceOperatorSettingsRuntime } from "@voyant-travel/finance/runtime-port"
import type { Context } from "hono"
import type { BookingSessionCompositeHandler } from "./booking-engine/index.js"
import {
  ensureBookingEngineRegistry,
  getBookingEngineRegistryFromContext,
  getOwnedBookingHandlerRegistry,
  getOwnedBookingHandlerRegistryFromContext,
} from "./runtime/booking-engine-runtime.js"
import { createOperatorCatalogBookingRouteModuleOptions } from "./runtime/booking-runtime.js"
import { isSourcedEntryPublicApiListable } from "./runtime/catalog-listability.js"
import {
  buildEmbeddingProvider,
  createCatalogDocumentBuilder,
  createProductsDocumentBuilder,
  DEFAULT_SLICES,
  getFieldPolicyRegistries,
  loadCatalogSlices,
  withEmbedding,
  withoutCatalogScopeChannel,
} from "./runtime/catalog-runtime.js"
import { configureCatalogRuntimeHost } from "./runtime/host.js"
import { createOperatorCatalogOffersRouteModuleOptions } from "./runtime/offers-runtime.js"
import {
  createOperatorCatalogBookingSnapshotRuntime,
  createOperatorCatalogProjectionRuntime,
} from "./runtime/subscriber-runtime.js"
import {
  type CatalogRuntimeExtensions,
  type CatalogRuntimeServices,
  installCatalogRuntimeServices,
} from "./runtime-contracts.js"
import type { CatalogRuntimePortContribution } from "./runtime-contributor.js"
import { createOwnedAvailabilitySearchHandlerRegistry } from "./search/owned-search-handler.js"

/** Build the complete Catalog runtime from generic host resources. */
export function createCatalogRuntime(
  primitives: VoyantRuntimeHostPrimitives,
  extensions: CatalogRuntimeExtensions,
  settings: FinanceOperatorSettingsRuntime,
  options: {
    indexer?: CatalogIndexer
    resolveBookingsRelationshipsRuntime?: () => Promise<BookingsRelationshipsRuntime | null>
    resolveFinanceServiceRuntime?: (context: unknown) => FinanceServiceRuntime
    resolvePaymentAdapter?: () => PaymentAdapter | null | Promise<PaymentAdapter | null>
    /** Host-bound product analytics. Unbound is the default and emits nothing. */
    analytics?: AnalyticsPort
  } = {},
): CatalogRuntimePortContribution {
  configureCatalogRuntimeHost(primitives, extensions)
  let indexer: ReturnType<typeof resolveCatalogIndexer> | undefined
  let vectorDimensions: number | null | undefined
  const resolveIndexer = (embeddings: ReturnType<typeof buildEmbeddingProvider>) => {
    if (options.indexer === undefined) return undefined
    const nextVectorDimensions = embeddings?.capabilities.dimensions ?? null
    if (indexer && vectorDimensions !== nextVectorDimensions) {
      throw new Error(
        `Catalog indexer was initialized with ${vectorDimensions ?? "no"} vector dimensions and cannot be recreated with ${nextVectorDimensions ?? "no"}.`,
      )
    }
    if (!indexer) {
      const adapter = resolveCatalogIndexer(options.indexer, {
        vectorDimensions: nextVectorDimensions,
        registries: getFieldPolicyRegistries(),
      })
      if (embeddings) {
        validateEmbeddingCompatibility(embeddings.capabilities, adapter.capabilities)
      }
      vectorDimensions = nextVectorDimensions
      indexer = adapter
    }
    return indexer
  }
  const projectionRuntimes = new WeakMap<
    object,
    | ReturnType<typeof createOperatorCatalogProjectionRuntime>
    | Promise<ReturnType<typeof createOperatorCatalogProjectionRuntime>>
  >()
  const ownedAvailabilitySearchHandlers = createOwnedAvailabilitySearchHandlerRegistry()
  let compositeBookingSessionHandler: BookingSessionCompositeHandler | undefined
  extensions.accommodations.registerOwnedAvailabilitySearchHandler(ownedAvailabilitySearchHandlers)
  // Built before `services` because `services.previewOffer` resolves the same
  // Booking Session module the mounted session routes use — one lifecycle, not
  // a server-side copy of it.
  const booking = createOperatorCatalogBookingRouteModuleOptions({
    settings,
    resolveBookingsRelationshipsRuntime: options.resolveBookingsRelationshipsRuntime,
    resolveFinanceServiceRuntime: options.resolveFinanceServiceRuntime,
    resolvePaymentAdapter: options.resolvePaymentAdapter,
    ...(options.analytics ? { analytics: options.analytics } : {}),
  })
  const presentAvailabilityCandidate = extensions.accommodations.presentAvailabilityCandidate
  const services: CatalogRuntimeServices = {
    defaultSlices: DEFAULT_SLICES,
    ensureSourceRegistry: (env) => ensureBookingEngineRegistry(env as never),
    getSourceRegistryFromContext: (context) =>
      getBookingEngineRegistryFromContext(context as never),
    getOwnedHandlers: (env) => getOwnedBookingHandlerRegistry(env as never),
    getOwnedHandlersFromContext: (context) =>
      getOwnedBookingHandlerRegistryFromContext(context as never),
    getOwnedAvailabilitySearchHandlers: () => ownedAvailabilitySearchHandlers,
    ...(presentAvailabilityCandidate
      ? {
          presentAvailabilityCandidate: (input) => presentAvailabilityCandidate(input),
        }
      : {}),
    registerCompositeBookingSessionHandler(handler) {
      if (compositeBookingSessionHandler && compositeBookingSessionHandler !== handler) {
        throw new Error("A composite Booking Session handler is already registered")
      }
      compositeBookingSessionHandler = handler
    },
    getCompositeBookingSessionHandler: () => compositeBookingSessionHandler,
    buildEmbeddingProvider: (env) => buildEmbeddingProvider(env as never),
    buildIndexer: (_env, embeddings) => resolveIndexer(embeddings),
    loadSlices: loadCatalogSlices,
    fieldPolicyRegistries: getFieldPolicyRegistries,
    reindexReferencedSubjectOverlayChange: async (db, event, reindex) => {
      await createReferencedSubjectReindexFanout({
        readers: [
          {
            subjectModule: CATALOG_PRESENTATION_SUBJECT_MODULES.CRUISE_SHIPS,
            listReferencingEntries: (subjectId) =>
              extensions.cruises.listCruisesReferencingShip(db, subjectId),
          },
          {
            subjectModule: CATALOG_PRESENTATION_SUBJECT_MODULES.ACCOMMODATION_PROPERTIES,
            async listReferencingEntries(subjectId) {
              const [products, accommodationOffers] = await Promise.all([
                extensions.inventory.listProductsReferencingAccommodationProperty(db, subjectId),
                extensions.accommodations.listAccommodationOffersReferencingProperty(db, subjectId),
              ])
              return [...products, ...accommodationOffers]
            },
          },
        ],
        reindexSubject: (subject, scope) =>
          reindex({
            entityModule: subject.entityModule,
            entityId: subject.entityId,
            ...scope,
          }),
        reindexReferencingEntry: (reference, scope) =>
          reindex({
            entityModule: reference.entityModule,
            entityId: reference.entityId,
            ...scope,
          }),
      })(event)
    },
    createProductsDocumentBuilder,
    createCatalogDocumentBuilder,
    isSourcedEntryListable: ({ db, slice, provenance }) =>
      isSourcedEntryPublicApiListable({
        audience: slice.audience,
        channel: slice.channel,
        isEffectivelyPublished: () =>
          extensions.distribution.hasEffectiveSourcePublication(db, provenance, slice.channel),
      }),
    withEmbedding,
    previewOffer: (context, input) => {
      const sessions = booking.bookingSessions
      if (!sessions?.resolveAccess) {
        throw new Error("catalog_booking_session_runtime_required")
      }
      const c = context as Context
      return sessions.resolveModule(c).previewOffer(input, sessions.resolveAccess(c, "staff"))
    },
  }
  installCatalogRuntimeServices(services)
  return {
    search: {
      resolveRuntime: (context) => createCatalogSearchRuntime(context, resolveIndexer),
    },
    booking,
    offers: createOperatorCatalogOffersRouteModuleOptions(
      (context) => withoutCatalogScopeChannel(resolveCatalogDefaultScope(context)),
      (context) => {
        const env = context.env as Record<string, unknown>
        return resolveIndexer(buildEmbeddingProvider(env as never))
      },
    ),
    content: { resolveRegistry: getBookingEngineRegistryFromContext },
    projection: {
      createRuntime(bindings) {
        if (!bindings || typeof bindings !== "object") {
          throw new Error("Catalog projection runtime requires concrete deployment bindings.")
        }
        let projectionRuntime = projectionRuntimes.get(bindings)
        if (!projectionRuntime) {
          projectionRuntime = createOperatorCatalogProjectionRuntime(bindings, services)
          projectionRuntimes.set(bindings, projectionRuntime)
        }
        return projectionRuntime
      },
    },
    bookingSnapshot: { createRuntime: createOperatorCatalogBookingSnapshotRuntime },
    services,
  }
}

function createCatalogSearchRuntime(
  context: unknown,
  resolveIndexer: (
    embeddings: ReturnType<typeof buildEmbeddingProvider>,
  ) => ReturnType<typeof resolveCatalogIndexer> | undefined,
): CatalogSearchRuntime {
  const env = (context as { env: Record<string, unknown> }).env
  const embeddings = buildEmbeddingProvider(env)
  const defaultScope = resolveCatalogDefaultScope(context)
  return {
    indexer: resolveIndexer(embeddings),
    embeddings,
    defaultScope,
  }
}

function resolveCatalogDefaultScope(context: unknown): CatalogSearchRuntime["defaultScope"] {
  const requestContext = context as { env: Record<string, unknown>; var?: { actor?: string } }
  const env = requestContext.env
  const actor = requestContext.var?.actor ?? "staff"
  const audience: CatalogSearchRuntime["defaultScope"]["audience"] =
    actor === "staff" ? "staff" : (actor as CatalogSearchRuntime["defaultScope"]["audience"])
  return {
    locale: stringValue(env.DEFAULT_LOCALE) ?? "en-GB",
    audience,
    market: stringValue(env.DEFAULT_MARKET) ?? "default",
    // Renamed with the storefront entity (voyant#4624). The OLD spelling is
    // still accepted, unlike the renamed request headers, because this one
    // fails SILENTLY: an unset variable resolves to the deployment's Direct
    // channel, so a deployment that had deliberately pinned another channel
    // would quietly re-route its sales instead of getting a loud 401.
    channel:
      stringValue(env.VOYANT_PUBLIC_API_CHANNEL_ID) ??
      stringValue(env.VOYANT_STOREFRONT_CHANNEL_ID),
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}
