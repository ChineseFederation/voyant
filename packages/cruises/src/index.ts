import { OpenAPIHono } from "@hono/zod-openapi"
import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import type { LinkableDefinition, Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { Hono } from "hono"

import { cruiseAdminRoutes } from "./routes.js"
import { cruisePublicRoutes } from "./routes-public.js"
import { cruisesRoutesRuntimePort } from "./runtime-port.js"

export {
  type CompatibilityMappingResult,
  type ConnectCabinRoomType,
  type ConnectCruiseType,
  type ConnectEnrichmentKind,
  type ConnectInclusionKind,
  type ConnectPriceComponentKind,
  mapConnectCabinRoomType,
  mapConnectCruiseType,
  mapConnectEnrichmentKind,
  mapConnectInclusionKind,
  mapConnectPriceComponentKind,
} from "./adapters/connect-compat.js"
// Adapter contract + registry — re-exported so templates can import everything
// from `@voyant-travel/cruises` without reaching into sub-paths. Sub-path
// `@voyant-travel/cruises/adapters` remains the lighter import for adapter-only
// implementations.
export type {
  AdapterCallContext,
  CreateExternalBookingInput,
  CruiseAdapter,
  CruiseAdapterCompatibilityCheck,
  CruiseAdapterCompatibilityCheckName,
  CruiseAdapterCompatibilityFixture,
  CruiseAdapterCompatibilityReport,
  CruiseSearchProjectionEntry,
  ExternalBookingResult,
  ExternalBookingTerms,
  ExternalCabinCategory,
  ExternalContactInput,
  ExternalCruise,
  ExternalCruiseSummary,
  ExternalDeck,
  ExternalItineraryDay,
  ExternalPassengerComposition,
  ExternalPassengerInput,
  ExternalPriceComponent,
  ExternalPriceRow,
  ExternalSailing,
  ExternalShip,
  ListEntriesOptions,
  ListEntriesResult,
  SourceRef,
} from "./adapters/index.js"
export {
  assertCruiseAdapterCompatibility,
  validateCruiseAdapterCompatibility,
} from "./adapters/index.js"
export { type MemoizeOptions, memoizeCruiseAdapter } from "./adapters/memoize.js"
export { MockCruiseAdapter, type MockCruiseAdapterOptions } from "./adapters/mock.js"
export {
  clearCruiseAdapters,
  hasCruiseAdapter,
  listCruiseAdapters,
  registerCruiseAdapter,
  resolveCruiseAdapter,
  unregisterCruiseAdapter,
} from "./adapters/registry.js"
export {
  type BookingCruiseDetail,
  type BookingGroupCruiseDetail,
  bookingCruiseDetails,
  bookingCruiseDetailsService,
  bookingGroupCruiseDetails,
  bookingGroupCruiseDetailsService,
  cruiseBookingModeEnum,
  cruisesBookingExtension,
  cruisesBookingExtensionRoutes,
  type NewBookingCruiseDetail,
  type NewBookingGroupCruiseDetail,
} from "./booking-extension.js"
export {
  CABIN_ACCESSIBILITY_FEATURES,
  CABIN_BED_CONFIGURATIONS,
  CABIN_VIEW_TYPES,
  type CabinAccessibilityFeature,
  type CabinBedConfiguration,
  type CabinViewType,
} from "./cabin-features.js"
export {
  CRUISE_CABIN_CATEGORY_FIELD_POLICY,
  CRUISE_CABIN_FACETS_FIELD_POLICY,
  CRUISE_DECK_FIELD_POLICY,
  cruiseCabinCategoryCatalogPolicy,
  cruiseCabinFacetsCatalogPolicy,
  cruiseDeckCatalogPolicy,
} from "./catalog-policy-cabins.js"
export {
  CRUISE_SHIP_FIELD_POLICY,
  CRUISE_SHIP_REFERENCE_FIELD_POLICY,
  cruiseShipCatalogPolicy,
} from "./catalog-policy-ships.js"
export {
  CRUISE_CREATED_EVENT,
  CRUISE_DELETED_EVENT,
  CRUISE_UPDATED_EVENT,
  type CruiseLifecycleEvent,
  type CruiseLifecycleEventName,
  emitCruiseLifecycleEvent,
  emitCruiseShipOverlayChanged,
} from "./events.js"
export type { CruiseAdminRoutes } from "./routes.js"
export { cruiseAdminRoutes } from "./routes.js"
export type { CruisePublicRoutes } from "./routes-public.js"
export { cruisePublicRoutes } from "./routes-public.js"
export type { CruiseMutationRuntime, EffectiveItineraryDay } from "./service.js"
export { cruisesService } from "./service.js"
export {
  type CruiseCabinFacetJoinRow,
  createCruiseCabinFacetProjectionExtension,
  projectCruiseCabinFacetRows,
} from "./service-catalog-plane-cabins.js"
export { detachExternalCruise } from "./service-detach.js"
export {
  type ExternalCruiseCatalogRefreshOptions,
  type ExternalCruiseCatalogRefreshResult,
  refreshExternalCruiseCatalog,
} from "./service-external-refresh.js"
export {
  assertOverlayableShipField,
  type ClearCruiseShipOverlayInput,
  CRUISE_SHIP_SUBJECT_MODULE,
  type CruiseShipOverlayScope,
  type CruiseShipOverlayTarget,
  type CruiseShipSourceReferenceInput,
  clearCruiseShipOverlay,
  createCruiseShipDocumentBuilder,
  findExistingExternalCruiseShipSubject,
  listCruiseShipOverlayHistory,
  listCruisesReferencingShip,
  readCruiseShipOverlayState,
  readPublicCruiseShipProjection,
  resolveSourcedCruiseShipReference,
  type WriteCruiseShipOverlayInput,
  writeCruiseShipOverlay,
} from "./service-presentation-subjects.js"
export {
  type ComposeQuoteInput,
  composeQuote,
  type GridCell,
  type LowestPriceResult,
  pricingService,
  type Quote,
  type QuoteComponent,
} from "./service-pricing.js"

// Linkable definitions for cross-module links from a template's links/ directory.
export const cruiseLinkable: LinkableDefinition = {
  module: "cruises",
  entity: "cruise",
  table: "cruises",
  idPrefix: "cru",
}

export const cruiseVoyageGroupLinkable: LinkableDefinition = {
  module: "cruises",
  entity: "cruise_voyage_group",
  table: "cruise_voyage_groups",
  idPrefix: "crvg",
}

export const cruiseSailingLinkable: LinkableDefinition = {
  module: "cruises",
  entity: "cruise_sailing",
  table: "cruise_sailings",
  idPrefix: "crsl",
}

export const cruiseShipLinkable: LinkableDefinition = {
  module: "cruises",
  entity: "cruise_ship",
  table: "cruise_ships",
  idPrefix: "crsh",
}

export const cruisesModule: Module = {
  name: "cruises",
  linkable: {
    cruise: cruiseLinkable,
    cruise_voyage_group: cruiseVoyageGroupLinkable,
    cruise_sailing: cruiseSailingLinkable,
    cruise_ship: cruiseShipLinkable,
  },
  requiresTransactionalDb: true,
}

export interface CreateCruisesApiModuleOptions {
  adminRoutes?: ApiModule["adminRoutes"]
  publicRoutes?: ApiModule["publicRoutes"]
  lazyAdminRoutes?: ApiModule["lazyAdminRoutes"]
  lazyPublicRoutes?: ApiModule["lazyPublicRoutes"]
  anonymous?: ApiModule["anonymous"]
}

/**
 * Assemble the cruise module while preserving deployment-owned registry
 * middleware through injected route bundles or lazy loaders.
 */
export function createCruisesApiModule(options: CreateCruisesApiModuleOptions = {}): ApiModule {
  return {
    module: cruisesModule,
    ...(options.lazyAdminRoutes
      ? { lazyAdminRoutes: options.lazyAdminRoutes }
      : { adminRoutes: options.adminRoutes ?? cruiseAdminRoutes }),
    ...(options.lazyPublicRoutes
      ? { lazyPublicRoutes: options.lazyPublicRoutes }
      : { publicRoutes: options.publicRoutes ?? cruisePublicRoutes }),
    ...(options.anonymous !== undefined ? { anonymous: options.anonymous } : {}),
  }
}

export const cruisesApiModule: ApiModule = createCruisesApiModule()

// biome-ignore lint/suspicious/noExplicitAny: package route bundles have distinct Env generics -- owner: cruises.
type CruiseRouteBundle = Hono<any> | OpenAPIHono<any>

function withSourceAdapterRegistry(
  routes: CruiseRouteBundle,
  resolveSourceAdapterRegistry: (bindings: unknown) => Promise<SourceAdapterRegistry>,
) {
  // biome-ignore lint/suspicious/noExplicitAny: wrapper accepts both package route Env shapes -- owner: cruises.
  const wrapped: OpenAPIHono<any> = new OpenAPIHono()
  wrapped.use("*", async (c, next) => {
    c.set("sourceAdapterRegistry", await resolveSourceAdapterRegistry(c.env))
    await next()
  })
  wrapped.route("/", routes)
  return wrapped
}

/** Package-owned adapter from graph ports to registry-aware Cruise routes. */
export const createCruisesVoyantRuntime = defineGraphRuntimeFactory(async ({ api, getPort }) => {
  const runtime = await getPort(cruisesRoutesRuntimePort)
  return {
    module: cruisesModule,
    ...(api.some(({ surface }) => surface === "admin")
      ? {
          adminRoutes: withSourceAdapterRegistry(
            cruiseAdminRoutes,
            runtime.resolveSourceAdapterRegistry,
          ),
        }
      : {}),
    ...(api.some(({ surface }) => surface === "public")
      ? {
          publicRoutes: withSourceAdapterRegistry(
            cruisePublicRoutes,
            runtime.resolveSourceAdapterRegistry,
          ),
        }
      : {}),
  }
})

export type { CruisesRoutesRuntime } from "./runtime-port.js"
export { cruisesRoutesRuntimePort } from "./runtime-port.js"

export type {
  CruiseCabin,
  CruiseCabinCategory,
  CruiseDeck,
  CruiseShip,
  NewCruiseCabin,
  NewCruiseCabinCategory,
  NewCruiseDeck,
  NewCruiseShip,
} from "./schema-cabins.js"
export {
  cruiseCabinCategories,
  cruiseCabins,
  cruiseDecks,
  cruiseShips,
} from "./schema-cabins.js"
export type {
  CruiseEnrichmentProgram,
  CruiseInclusion,
  CruiseMedia,
  NewCruiseEnrichmentProgram,
  NewCruiseInclusion,
  NewCruiseMedia,
} from "./schema-content.js"
export {
  cruiseEnrichmentPrograms,
  cruiseInclusions,
  cruiseMedia,
} from "./schema-content.js"
// Schema and validation re-exports — keep these in sync with package.json `exports`.
export type {
  Cruise,
  CruiseSailing,
  CruiseVoyageGroup,
  CruiseVoyageGroupSegment,
  NewCruise,
  NewCruiseSailing,
  NewCruiseVoyageGroup,
  NewCruiseVoyageGroupSegment,
} from "./schema-core.js"
export {
  cruiseSailings,
  cruises,
  cruiseVoyageGroupSegments,
  cruiseVoyageGroups,
} from "./schema-core.js"
export type {
  CruiseDay,
  CruiseSailingDay,
  NewCruiseDay,
  NewCruiseSailingDay,
} from "./schema-itinerary.js"
export {
  cruiseDays,
  cruiseSailingDays,
} from "./schema-itinerary.js"
export type {
  CruisePrice,
  CruisePriceComponent,
  NewCruisePrice,
  NewCruisePriceComponent,
} from "./schema-pricing.js"
export {
  cruisePriceComponents,
  cruisePrices,
} from "./schema-pricing.js"
export type {
  CruiseSearchIndexRow,
  NewCruiseSearchIndexRow,
} from "./schema-search.js"
export { cruiseSearchIndex } from "./schema-search.js"
export {
  cabinRoomTypeEnum,
  cruiseInclusionKindEnum,
  cruiseMediaTypeEnum,
  cruiseSailingDirectionEnum,
  cruiseSourceEnum,
  cruiseStatusEnum,
  cruiseTypeEnum,
  cruiseVoyageGroupKindEnum,
  cruiseVoyageSegmentKindEnum,
  cruiseVoyageSegmentRoleEnum,
  enrichmentProgramKindEnum,
  priceAvailabilityEnum,
  priceComponentDirectionEnum,
  priceComponentKindEnum,
  priceFareVariantEnum,
  sailingSalesStatusEnum,
  shipTypeEnum,
} from "./schema-shared.js"
