/**
 * `@voyant-travel/catalog/booking-engine` — cross-vertical booking lifecycle
 * on top of the Phase 1 `SourceAdapter` contract.
 *
 * See `docs/architecture/catalog-booking-engine.md` for the full design.
 *
 * Lifecycle:
 *   1. `quoteEntity` → write to `catalog_quotes`, return short-lived quote.
 *   2. `cancelEntity` → call `adapter.cancel`, snapshot stays for audit.
 *
 * Catalog booking creation is intentionally unavailable until a durable
 * admitted vertical command owns the mutation.
 *
 * Reads:
 *   - `listOrders` / `getOrderById` — surface snapshot rows cross-vertically.
 *
 * Adapters:
 *   - Templates wire a `SourceAdapterRegistry` at process start. The
 *     engine consults it on every dispatch.
 */

export type { PricingBasis } from "../snapshot/schema.js"
export {
  type CancelEntityDeps,
  type CancelEntityRequest,
  type CancelEntityResult,
  cancelEntity,
} from "./cancel.js"
export {
  type CheckoutFinalizeDeps,
  type CheckoutFinalizeInput,
  type CheckoutFinalizeStepRecorder,
  checkoutFinalizeSaga,
  runCheckoutFinalize,
} from "./checkout-finalize.js"
export {
  accommodationSubStepV1,
  addonGroupV1,
  addonOfferV1,
  type BookingDraftShapeV1,
  type BookingDraftV1,
  type BookRequestV1,
  type BookResponseV1,
  bookingDraftShapeV1,
  bookingDraftV1,
  bookingFieldRequirementV1,
  bookRequestV1,
  bookResponseV1,
  cabinCategoryOptionV1,
  cabinNumberOptionV1,
  configureSubStepV1,
  ENGINE_CONTRACT_V1,
  type EngineContractVersion,
  extensionOptionV1,
  type HoldExtendRequestV1,
  type HoldReleaseRequestV1,
  holdExtendRequestV1,
  holdReleaseRequestV1,
  type PaxBandCode,
  type PaxBandSpecV1,
  type PricingBreakdownV1,
  paxBandCodeSchema,
  paxBandSpecV1,
  pricingBreakdownV1,
  pricingLineV1,
  pricingTaxV1,
  type QuoteRequestV1,
  type QuoteResponseV1,
  quoteRequestV1,
  quoteResponseV1,
  quoteScopeV1,
  roomOptionV1,
  type TravelerEntryV1,
  travelerEntryV1,
  travelerFieldRequirementV1,
} from "./contracts.js"
export {
  type AccommodationSubStep,
  type AddonGroup,
  type AddonOffer,
  type BookingDraftShape,
  type BookingFieldRequirement,
  type CabinCategoryOption,
  type CabinNumberOption,
  type ConfigureSubStep,
  DEFAULT_PAX_BANDS,
  DEFAULT_PAX_TOTAL,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultDraftShapeFlags,
  defaultTravelerFields,
  type ExtensionOption,
  type PaxBandDependency,
  type PaxBandSpec,
  type ProductVariantOption,
  type ProductVariantUnitOption,
  paxBandsAllowedTotalFrom,
  type RatePlanOption,
  type RoomOption,
  type TravelerFieldRequirement,
} from "./draft-shape.js"
export {
  bookingDraftsTable,
  type InsertBookingDraft,
  type SelectBookingDraft,
} from "./drafts-schema.js"
export {
  createBookingDraft,
  DEFAULT_DRAFT_TTL_MS,
  deleteBookingDraft,
  findExpiredDrafts,
  getBookingDraft,
  markDraftConsumed,
  type UpdateDraftPatch,
  type UpsertDraftInput,
  updateBookingDraft,
} from "./drafts-service.js"
export {
  BookingEngineError,
  type BookingEngineErrorCode,
  NO_ADAPTER_REGISTERED,
  NO_HANDLER_REGISTERED,
  NoAdapterRegisteredError,
  NoOwnedHandlerRegisteredError,
  ORDER_ALREADY_CANCELLED,
  ORDER_NOT_FOUND,
  QUOTE_EXPIRED,
  QUOTE_NOT_FOUND,
  QuoteExpiredError,
} from "./errors.js"
export {
  type CatalogAvailabilitySlotsScope,
  type CatalogBookingMountTarget,
  type CatalogBookingRouteModuleOptions,
  type CatalogOwnedProductSummary,
  type CatalogProductContentReadContext,
  type CatalogProductContentScope,
  type CatalogResolvedDeparture,
  type CatalogResolvedProductContent,
  catalogBookingRoutePaths,
  catalogBookingTransactionalPaths,
  createCatalogBookingEngineApiModule,
  createCatalogBookingOrdersRoutes,
  mountCatalogBookingRoutes,
  type SlotRow,
} from "./operator-routes.js"
export {
  getOrderById,
  type ListOrdersQuery,
  type ListOrdersResult,
  listOrders,
} from "./orders.js"
export {
  type ComputeQuoteBatchResult,
  type ComputeQuoteBatchSelection,
  type ComputeQuoteRequest,
  type ComputeQuoteResult,
  type ComputeQuotesRequest,
  createOwnedBookingHandlerRegistry,
  type DeriveSelfServiceCommandRequest,
  type DeriveSelfServiceCommandResult,
  type HoldRequest,
  type HoldResult,
  OWNED_SOURCE_KIND,
  type OwnedBookingHandler,
  type OwnedBookingHandlerRegistry,
  type OwnedHandlerContext,
  type OwnedQuoteScope,
  type SelfServiceBillingParty,
  type SelfServiceCommandRejection,
} from "./owned-handler.js"
export type {
  AppliedOffer,
  CodeStatus,
  PromotionEvaluationInput,
  PromotionEvaluationOutput,
} from "./promotions-contract.js"
export {
  DEFAULT_QUOTE_TTL_MS,
  type QuoteContentEnricher,
  type QuoteContentEnrichmentInput,
  type QuoteEntityBatchRequest,
  type QuoteEntityBatchResult,
  type QuoteEntityDeps,
  type QuoteEntityRequest,
  type QuoteEntityResult,
  type QuoteScope,
  quoteEntitiesBatch,
  quoteEntity,
} from "./quote.js"
export {
  createSourceAdapterRegistry,
  type SourceAdapterRegistry,
} from "./registry.js"
export {
  type CatalogBookingAdapterContextInput,
  type CatalogBookingBatchQuoteBody,
  type CatalogBookingBatchQuoteSelection,
  type CatalogBookingBatchQuoteTransformInput,
  type CatalogBookingDraftBody,
  type CatalogBookingHoldPlaceBody,
  type CatalogBookingHoldReleaseBody,
  type CatalogBookingHoldTtlInput,
  type CatalogBookingProvenance,
  type CatalogBookingProvenanceInput,
  type CatalogBookingQuoteBody,
  type CatalogBookingQuoteTransformInput,
  type CatalogBookingRoutesOptions,
  createCatalogBookingApiModule,
  createCatalogBookingRoutes,
  engineParametersFromDraft,
  serializeQuoteResult,
} from "./routes.js"
export {
  catalogQuotesTable,
  type InsertCatalogQuote,
  type SelectCatalogQuote,
} from "./schema.js"
export {
  createSelfServiceBookingSourceProvider,
  type ResolveSelfServiceBillingPerson,
  type SelfServiceBookingSourceProviderDeps,
} from "./self-service-source.js"
export {
  createInMemoryBookingSessionRepository,
  createInMemoryOwnedInventoryPorts,
  type InMemoryBookingSessionRepository,
  type InMemoryOwnedInventoryPorts,
} from "./sessions-memory.js"
export {
  createProductionBookingSessionPaymentPorts,
  type ProductionBookingSessionPaymentDeps,
} from "./sessions-payment-production.js"
export {
  createProductionBookingSessionModule,
  type ProductionBookingSessionModuleDeps,
} from "./sessions-production.js"
export {
  type BookingSessionRoutesOptions,
  createBookingSessionApiModule,
  createBookingSessionRoutes,
} from "./sessions-routes.js"
export {
  bookingSessionAuditEventsTable,
  bookingSessionCommitsTable,
  bookingSessionHoldsTable,
  bookingSessionOperationsTable,
  bookingSessionQuotesTable,
  bookingSessionsTable,
  type InsertBookingSession,
  type InsertBookingSessionAuditEvent,
  type InsertBookingSessionCommit,
  type InsertBookingSessionHold,
  type InsertBookingSessionOperation,
  type InsertBookingSessionQuote,
  type SelectBookingSession,
  type SelectBookingSessionAuditEvent,
  type SelectBookingSessionCommit,
  type SelectBookingSessionHold,
  type SelectBookingSessionOperation,
  type SelectBookingSessionQuote,
} from "./sessions-schema.js"
export {
  type BookingCommitInternalRecord,
  type BookingHoldInternalRecord,
  type BookingQuoteInternalRecord,
  type BookingSessionAccessContext,
  type BookingSessionAuditRecord,
  type BookingSessionCompositeHandler,
  type BookingSessionInternalRecord,
  type BookingSessionModule,
  type BookingSessionModuleOptions,
  type BookingSessionModulePorts,
  type BookingSessionRepository,
  type CommitCompositeBookingInput,
  type CommitCompositeBookingResult,
  type CommitOwnedBookingInput,
  type CommitSourcedBookingInput,
  type CommitSourcedBookingResult,
  type ComposeBookingQuoteInput,
  type CompositeBookingCommitment,
  createBookingSessionModule,
} from "./sessions-service.js"
export {
  createSupplierOperationWorkflow,
  type DispatchSupplierReservationInput,
  type SupplierOperationWorkflow,
  type SupplierOperationWorkflowOutcome,
} from "./supplier-operation-workflow.js"
export {
  type CreateSupplierOperationResult,
  createDrizzleSupplierOperationRepository,
  createSupplierOperationRecord,
  type SupplierOperationInternalRecord,
  type SupplierOperationRepository,
  serializeSupplierOperation,
} from "./supplier-operations.js"
export {
  createSupplierOperationOperatorService,
  type SupplierOperationOperatorService,
} from "./supplier-operations-operator.js"
export {
  type InsertSupplierOperation,
  type SelectSupplierOperation,
  supplierOperationsTable,
} from "./supplier-operations-schema.js"
export {
  type SyncAdapterSummary,
  type SyncProgressEvent,
  type SyncSourcesOptions,
  type SyncSourcesSummary,
  syncSources,
} from "./sync.js"
