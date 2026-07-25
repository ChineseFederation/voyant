import type { LinkableDefinition, Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"

import { chartersAdminRoutes } from "./routes.js"
import { chartersPublicRoutes } from "./routes-public.js"

// Adapter contract + registry — re-exported so templates can import everything
// from `@voyant-travel/charters` without reaching into sub-paths. Sub-path
// `@voyant-travel/charters/adapters` remains the lighter import for adapter-only
// implementations.
export type {
  AdapterCallContext,
  CharterAdapter,
  CreateExternalPerSuiteBookingInput as AdapterCreatePerSuiteBookingInput,
  CreateExternalWholeYachtBookingInput as AdapterCreateWholeYachtBookingInput,
  ExternalBookingResult,
  ExternalCharterProduct,
  ExternalCharterProductSummary,
  ExternalCharterScheduleDay,
  ExternalCharterSuite,
  ExternalCharterVoyage,
  ExternalCharterYacht,
  ExternalContactInput,
  ExternalGuestInput,
  ListEntriesOptions,
  ListEntriesResult,
  SourceRef,
} from "./adapters/index.js"
export { type MemoizeOptions, memoizeCharterAdapter } from "./adapters/memoize.js"
export { MockCharterAdapter, type MockCharterAdapterOptions } from "./adapters/mock.js"
export {
  clearCharterAdapters,
  hasCharterAdapter,
  listCharterAdapters,
  registerCharterAdapter,
  resolveCharterAdapter,
  unregisterCharterAdapter,
} from "./adapters/registry.js"
// Booking extension (1:1 with bookings — populated when a booking is for a charter).
export {
  type BookingCharterDetail,
  bookingCharterDetails,
  bookingCharterDetailsService,
  type CharterDetailUpsert,
  type CharterSourceRef,
  charterDetailUpsertSchema,
  chartersBookingExtension,
  chartersBookingExtensionRoutes,
  type NewBookingCharterDetail,
} from "./booking-extension.js"
// Routes — admin + public.
export type { ChartersAdminRoutes } from "./routes.js"
export { chartersAdminRoutes } from "./routes.js"
export type { ChartersPublicRoutes } from "./routes-public.js"
export { chartersPublicRoutes } from "./routes-public.js"
export { chartersService } from "./service.js"
// MYBA contract wrapper (DI-shaped, no hard dep on @voyant-travel/legal).
export {
  type CharterContractsService,
  type GenerateMybaContractInput,
  type GenerateMybaContractResult,
  mybaService,
} from "./service-myba.js"
export {
  composePerSuiteQuote,
  composeWholeYachtQuote,
  computeApaAmount,
  type PerSuiteQuote,
  pricingService,
  type WholeYachtQuote,
} from "./service-pricing.js"

// Linkables for cross-module links from a template's links/ directory.
export const charterProductLinkable: LinkableDefinition = {
  module: "charters",
  entity: "charter_product",
  table: "charter_products",
  idPrefix: "chrt",
}

export const charterVoyageLinkable: LinkableDefinition = {
  module: "charters",
  entity: "charter_voyage",
  table: "charter_voyages",
  idPrefix: "chrv",
}

export const charterYachtLinkable: LinkableDefinition = {
  module: "charters",
  entity: "charter_yacht",
  table: "charter_yachts",
  idPrefix: "chry",
}

export const chartersModule: Module = {
  name: "charters",
  linkable: {
    charter_product: charterProductLinkable,
    charter_voyage: charterVoyageLinkable,
    charter_yacht: charterYachtLinkable,
  },
  requiresTransactionalDb: true,
}

export interface CreateChartersApiModuleOptions {
  adminRoutes?: ApiModule["adminRoutes"]
  publicRoutes?: ApiModule["publicRoutes"]
  lazyAdminRoutes?: ApiModule["lazyAdminRoutes"]
  lazyPublicRoutes?: ApiModule["lazyPublicRoutes"]
  anonymous?: ApiModule["anonymous"]
}

/**
 * Assemble the charter module while allowing a deployment to retain lazy route
 * bridges or middleware-wrapped bundles.
 */
export function createChartersApiModule(options: CreateChartersApiModuleOptions = {}): ApiModule {
  return {
    module: chartersModule,
    ...(options.lazyAdminRoutes
      ? { lazyAdminRoutes: options.lazyAdminRoutes }
      : { adminRoutes: options.adminRoutes ?? chartersAdminRoutes }),
    ...(options.lazyPublicRoutes
      ? { lazyPublicRoutes: options.lazyPublicRoutes }
      : { publicRoutes: options.publicRoutes ?? chartersPublicRoutes }),
    ...(options.anonymous !== undefined ? { anonymous: options.anonymous } : {}),
  }
}

export const chartersApiModule: ApiModule = createChartersApiModule()

/** Package-owned adapter from selected graph surfaces to the Charters routes. */
export const createChartersVoyantRuntime = defineGraphRuntimeFactory(({ api }) => ({
  module: chartersModule,
  ...(api.some(({ surface }) => surface === "admin") ? { adminRoutes: chartersAdminRoutes } : {}),
  ...(api.some(({ surface }) => surface === "public")
    ? { publicRoutes: chartersPublicRoutes }
    : {}),
}))

// Unified key parser (admin routes accept TypeIDs or `<provider>:<ref>`).
export { type ParsedKey, parseUnifiedKey } from "./lib/key.js"
// Schema re-exports (mirrors packages/cruises pattern).
export type {
  CharterProduct,
  CharterVoyage,
  NewCharterProduct,
  NewCharterVoyage,
} from "./schema-core.js"
export { charterProducts, charterVoyages } from "./schema-core.js"
export type { CharterScheduleDay, NewCharterScheduleDay } from "./schema-itinerary.js"
export { charterScheduleDays } from "./schema-itinerary.js"
export type { CharterSuite, NewCharterSuite } from "./schema-pricing.js"
export { charterSuites } from "./schema-pricing.js"
export {
  charterBookingModeEnum,
  charterSourceEnum,
  charterStatusEnum,
  suiteAvailabilityEnum,
  suiteCategoryEnum,
  voyageSalesStatusEnum,
  yachtClassEnum,
} from "./schema-shared.js"
export type { CharterYacht, NewCharterYacht } from "./schema-yachts.js"
export { charterYachts } from "./schema-yachts.js"
