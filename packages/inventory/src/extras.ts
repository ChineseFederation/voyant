import type { Module } from "@voyant-travel/core"
import type { ApiModule } from "@voyant-travel/hono/module"

import { inventoryExtrasRoutes } from "./extras/routes.js"
import { inventoryExtrasService } from "./extras/service.js"

export { extrasCatalogPolicy } from "./extras/catalog-policy.js"
export {
  EXTRAS_CONTENT_SCHEMA_VERSION,
  type ExtraContent,
  type ExtraMediaItem,
  type ExtraOption,
  type ExtraPolicy,
  type ExtraSummary,
  extraContentSchema,
  extraMediaItemSchema,
  extraOptionSchema,
  extraPolicySchema,
  extraSummarySchema,
  mergeOverlaysIntoExtraContent,
  validateExtraContent,
} from "./extras/content-shape.js"
export {
  type BuildExtraDraftShapeOptions,
  buildExtraDraftShape,
} from "./extras/draft-shape.js"
export type { InventoryExtrasRoutes } from "./extras/routes.js"
export type {
  NewOptionExtraConfig,
  NewProductExtra,
  OptionExtraConfig,
  ProductExtra,
} from "./extras/schema.js"
export {
  EXTRAS_CONTENT_MARKET_ANY,
  extraCollectionModeEnum,
  extraPricingModeEnum,
  extraSelectionTypeEnum,
  extrasSourcedContentTable,
  type InsertExtrasSourcedContent,
  optionExtraConfigs,
  optionExtraConfigsRelations,
  productExtras,
  productExtrasRelations,
  type SelectExtrasSourcedContent,
} from "./extras/schema.js"
// `createExtraDocumentBuilder` / `createExtraDocumentEmitter` were removed:
// an Extra is Product-owned and never independently indexed or searchable, so
// there is no extras slice for a document to be written into. Snapshot and
// provenance helpers stay — they are how the owning Product freezes what it
// sold.
export {
  buildExtraSnapshotInput,
  type CaptureSnapshotInput,
  type DocumentBuilder,
  type DocumentEmitter,
  getResolvedExtraById,
  type IndexerDocument,
  type IndexerSlice,
  listResolvedExtras,
  type PricingBasis,
  type ProductExtraCatalogContext,
  type Provenance,
  productExtraProvenance,
  productExtraRowToProjection,
  type ResolvedView,
  type ResolverScope,
} from "./extras/service-catalog-plane.js"
export {
  type ExtraContentScope,
  type GetExtraContentOptions,
  getExtraContent,
  type ResolvedExtraContent,
} from "./extras/service-content.js"
export {
  type SynthesizedExtraContent,
  type SynthesizeExtraContentOptions,
  synthesizeExtraContent,
  synthesizeExtraContentFromDb,
} from "./extras/service-content-synthesizer.js"
export {
  extraCollectionModeSchema,
  extraPricingModeSchema,
  extraSelectionTypeSchema,
  insertOptionExtraConfigSchema,
  insertProductExtraSchema,
  optionExtraConfigCoreSchema,
  optionExtraConfigListQuerySchema,
  productExtraCoreSchema,
  productExtraListQuerySchema,
  updateOptionExtraConfigSchema,
  updateProductExtraSchema,
} from "./extras/validation.js"
export { inventoryExtrasRoutes, inventoryExtrasService }

export const operatedExtrasService = inventoryExtrasService

export const inventoryExtrasModule: Module = {
  name: "extras",
}

export const inventoryExtrasApiModule: ApiModule = {
  module: inventoryExtrasModule,
  adminRoutes: inventoryExtrasRoutes,
}
