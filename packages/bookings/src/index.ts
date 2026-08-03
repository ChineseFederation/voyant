import { OpenAPIHono } from "@hono/zod-openapi"
import type { BootstrapContext, Module } from "@voyant-travel/core"
import { customFieldsRuntimePort } from "@voyant-travel/core/custom-fields"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"
import { resolveBookingFinancialLifecycle } from "./financial-lifecycle.js"
import { bookingsLinkable } from "./linkables.js"
import {
  BOOKING_ROUTE_RUNTIME_CONTAINER_KEY,
  type BookingRouteRuntimeOptions,
  buildBookingRouteRuntime,
} from "./route-runtime.js"
import { bookingRoutes } from "./routes.js"
import { bookingAmendmentPublicRoutes } from "./routes-amendments.js"
import { publicBookingRoutes } from "./routes-public.js"
import { createPublicBookingActionRoutes } from "./routes-public-booking-actions.js"
import { createBookingsRuntime } from "./runtime.js"
import {
  type BookingActionProjectionRuntime,
  type BookingsSupplierAmendmentRuntime,
  bookingActionProjectionRuntimePort,
  bookingsAccommodationRuntimePort,
  bookingsFinanceRuntimePort,
  bookingsRelationshipsRuntimePort,
  bookingsSupplierAmendmentRuntimePort,
} from "./runtime-port.js"

export {
  BOOKING_ACTION_LEDGER_CAPABILITIES,
  BOOKING_PII_READ_CAPABILITY,
  BOOKING_STATUS_CAPABILITIES,
  bookingActionLedgerCapabilityRegistry,
} from "./action-ledger-capabilities.js"
export {
  assertMonthlyBookingLimitAvailable,
  BookingMonthlyLimitConfigurationError,
  type BookingMonthlyLimitReachedDetails,
  BookingMonthlyLimitReachedError,
  resolveMonthlyBookingLimit,
  VOYANT_BOOKINGS_MONTHLY_LIMIT_BINDING,
} from "./booking-plan-limit.js"
export { bookingsSupplierExtension } from "./extensions/suppliers.js"
export { bookingLinkable, bookingsLinkable } from "./linkables.js"
export {
  type BookingPiiAuditEvent,
  type BookingPiiService,
  type BookingPiiServiceOptions,
  createBookingPiiService,
  type UpsertBookingTravelerTravelDetailInput,
} from "./pii.js"
export {
  type PiiAccessContext,
  redactBookingContact,
  redactEmail,
  redactPhone,
  redactString,
  redactTravelerIdentity,
  shouldRevealBookingPii,
} from "./pii-redaction.js"
export * from "./requirements/index.js"
export {
  type BookingReservationPlanCompensation,
  type BookingReservationPlanFailure,
  type BookingReservationPlanLine,
  type BookingReservationPlanLineContext,
  type BookingReservationPlanLineKind,
  type BookingReservationPlanLineResult,
  type BookingReservationPlanOrigin,
  type BookingReservationPlanReleaseResult,
  type BookingReservationPlanStatus,
  type SubmitBookingReservationPlanInput,
  type SubmitBookingReservationPlanResult,
  type SubmitBookingReservationPlanRuntime,
  type SubmittedBookingReservationPlanLine,
  submitBookingReservationPlan,
} from "./reservation-plans.js"
export type {
  BookingCancelledEvent,
  BookingConfirmedEvent,
  BookingTravelerSharingGroupMember,
  BookingTravelerSharingGroupSummary,
  ConvertProductData,
  CreateTravelerWithTravelDetailsInput,
  UpdateTravelerWithTravelDetailsInput,
} from "./service.js"
export { bookingsService } from "./service.js"
export {
  type AcceptBookingAmendmentResult,
  type ApplyBookingAmendmentResult,
  type BookingAmendmentCommandContext,
  bookingAmendmentService,
  type PreviewTravelerCorrectionResult,
  type PreviewTravelerRosterChangeResult,
} from "./service-amendments.js"
export {
  type AddBookingGroupMemberInput,
  type BookingGroupListQuery,
  type BookingGroupMemberWithBooking,
  bookingGroupsService,
  type CreateBookingGroupInput,
  listGroupBookingTravelers,
  type UpdateBookingGroupInput,
} from "./service-groups.js"
export {
  type AcceptedProposalBookingOriginInput,
  type CatalogReservationBookingOriginInput,
  type DirectB2CBookingOriginInput,
  type DirectB2CBookingOriginItemInput,
  getBookingOriginByBookingId,
  setAcceptedProposalBookingOrigin,
  toCatalogReservationBookingOriginInput,
  toDirectB2CBookingOriginInput,
  type UpsertBookingOriginInput,
  upsertBookingOrigin,
} from "./service-origin.js"
export {
  type CreateSourcedBookingCommitmentInput,
  type CreateSourcedBookingCommitmentResult,
  createSourcedBookingCommitment,
  type SourcedBookingTravelerInput,
} from "./service-sourced-commitment.js"
export {
  BOOKING_TRANSITIONS,
  type BookingStatus,
  type BookingStatusPatch,
  BookingTransitionError,
  canTransitionBooking,
  transitionBooking,
} from "./state-machine.js"
export {
  BOOKING_RESOURCE_AVAILABILITY_STATUSES,
  BOOKING_RESOURCE_CAPACITY_STATUSES,
  isBookingResourceAvailabilityStatus,
} from "./status.js"
export {
  type BookingStatusDispatchTarget,
  dispatchBookingStatusChange,
} from "./status-dispatch.js"
export { bookingToolDetailSchema } from "./tool-output-schemas.js"

export const bookingsModule: Module = {
  name: "bookings",
  linkable: bookingsLinkable,
  requiresTransactionalDb: true,
}

export interface BookingsApiModuleOptions extends BookingRouteRuntimeOptions {
  bookingActions?: BookingActionProjectionRuntime
}

export function createBookingsApiModule(options: BookingsApiModuleOptions = {}): ApiModule {
  const module: Module = {
    ...bookingsModule,
    bootstrap: ({ bindings, container }) => {
      container.register(
        BOOKING_ROUTE_RUNTIME_CONTAINER_KEY,
        buildBookingRouteRuntime(bindings as Record<string, unknown>, {
          ...options,
          closePaymentSchedulesForBooking:
            options.closePaymentSchedulesForBooking ??
            ((...args) =>
              resolveBookingFinancialLifecycle(container)?.closePaymentSchedulesForBooking(
                ...args,
              )),
          recordCancellationFinancialSettlement:
            options.recordCancellationFinancialSettlement ??
            ((...args) =>
              resolveBookingFinancialLifecycle(container)?.recordCancellationFinancialSettlement(
                ...args,
              )),
        }),
      )
    },
  }

  return {
    module,
    adminRoutes: bookingRoutes,
    publicRoutes: new OpenAPIHono()
      .route("/", publicBookingRoutes)
      .route("/", bookingAmendmentPublicRoutes)
      .route("/", createPublicBookingActionRoutes(options.bookingActions)),
    anonymous: true,
    optionalCustomerAuth: true,
  }
}

export const bookingsApiModule: ApiModule = createBookingsApiModule()

/** Package-owned adapter from graph ports to the complete Bookings runtime. */
export const createBookingsVoyantRuntime = defineGraphRuntimeFactory(
  async ({ api, getPort, hasPort }) => {
    const [accommodation, customFields, finance, relationships] = await Promise.all([
      getPort(bookingsAccommodationRuntimePort),
      getPort(customFieldsRuntimePort),
      getPort(bookingsFinanceRuntimePort),
      getPort(bookingsRelationshipsRuntimePort),
    ])
    const provider = createBookingsRuntime({
      accommodation,
      customFields,
      finance,
      relationships,
    })

    const amendmentSupplier = hasPort(bookingsSupplierAmendmentRuntimePort)
      ? ((await getPort(bookingsSupplierAmendmentRuntimePort)) as BookingsSupplierAmendmentRuntime)
      : undefined
    const bookingActions = hasPort(bookingActionProjectionRuntimePort)
      ? await getPort(bookingActionProjectionRuntimePort)
      : undefined

    const configured = createBookingsApiModule({
      ...provider.options,
      amendmentFinance: finance,
      ...(amendmentSupplier ? { amendmentSupplier } : {}),
      ...(bookingActions ? { bookingActions } : {}),
    })

    const bootstrap = configured.module.bootstrap
    const selected: ApiModule = {
      module: {
        ...configured.module,
        bootstrap: async (context: BootstrapContext) => {
          await bootstrap?.(context)
        },
      },
    }
    if (api.some(({ surface }) => surface === "admin") && configured.adminRoutes) {
      selected.adminRoutes = configured.adminRoutes
    }
    if (api.some(({ surface }) => surface === "public") && configured.publicRoutes) {
      selected.publicRoutes = configured.publicRoutes
      selected.anonymous = configured.anonymous
      selected.optionalCustomerAuth = configured.optionalCustomerAuth
    }
    return selected
  },
)

export {
  BOOKING_FINANCIAL_LIFECYCLE_KEY,
  type BookingFinancialLifecycle,
  registerBookingFinancialLifecycle,
  resolveBookingFinancialLifecycle,
} from "./financial-lifecycle.js"
export type {
  BookingOverviewEnricherItem,
  BookingOverviewItemEnricher,
  BookingPersonResolverContact,
  BookingRouteRuntime,
  BookingRouteRuntimeOptions,
  ClosePaymentSchedulesForBooking,
  RecordCancellationFinancialSettlement,
  ResolveBookingBillingOrganizationById,
  ResolveBookingBillingPerson,
  ResolveBookingBillingPersonById,
  ResolveBookingKmsProvider,
  ResolveBookingTravelerPerson,
  ResolveBookingTravelSnapshot,
} from "./route-runtime.js"
export {
  BOOKING_ROUTE_RUNTIME_CONTAINER_KEY,
  buildBookingRouteRuntime,
} from "./route-runtime.js"
export type { BookingActionLedgerListResponse, BookingRoutes } from "./routes.js"
export type { PublicBookingRoutes } from "./routes-public.js"
export { publicBookingRoutes } from "./routes-public.js"
export type { BookingsRuntimeProvider } from "./runtime-port.js"
export {
  bookingRequirementsRuntimePort,
  bookingsAccommodationRuntimePort,
  bookingsFinanceRuntimePort,
  bookingsInventoryRuntimePort,
  bookingsRelationshipsRuntimePort,
  bookingsRuntimePort,
} from "./runtime-port.js"
export type {
  BookingTravelerBedPreference,
  BookingTravelerDietary,
  BookingTravelerIdentity,
  BookingTravelerTravelDetail,
  DecryptedBookingTravelerTravelDetail,
  NewBookingTravelerTravelDetail,
  TravelerAllocationMap,
} from "./schema/travel-details.js"
export {
  bookingTravelerBedPreferenceSchema,
  bookingTravelerDietarySchema,
  bookingTravelerIdentitySchema,
  bookingTravelerTravelDetailInsertSchema,
  bookingTravelerTravelDetailSelectSchema,
  bookingTravelerTravelDetails,
  bookingTravelerTravelDetailUpdateSchema,
  decryptedBookingTravelerTravelDetailSchema,
  travelerAllocationMapSchema,
} from "./schema/travel-details.js"
export type {
  Booking,
  BookingActivity,
  BookingAllocation,
  BookingDocument,
  BookingFulfillment,
  BookingGroup,
  BookingGroupMember,
  BookingItem,
  BookingItemTraveler,
  BookingNote,
  BookingOrigin,
  BookingOriginLegacyTransactionIds,
  BookingOriginSource,
  BookingPiiAccessLog,
  BookingPriceOverride,
  BookingRedemptionEvent,
  BookingStaffAssignment,
  BookingSupplierStatus,
  BookingTraveler,
  NewBooking,
  NewBookingActivity,
  NewBookingAllocation,
  NewBookingDocument,
  NewBookingFulfillment,
  NewBookingGroup,
  NewBookingGroupMember,
  NewBookingItem,
  NewBookingItemTraveler,
  NewBookingNote,
  NewBookingOrigin,
  NewBookingPiiAccessLog,
  NewBookingRedemptionEvent,
  NewBookingStaffAssignment,
  NewBookingSupplierStatus,
  NewBookingTraveler,
} from "./schema.js"
export {
  bookingActivityLog,
  bookingAllocations,
  bookingDocuments,
  bookingFulfillments,
  bookingGroupKindEnum,
  bookingGroupMemberRoleEnum,
  bookingGroupMembers,
  bookingGroups,
  bookingItems,
  bookingItemTravelers,
  bookingNotes,
  bookingOriginSources,
  bookingOrigins,
  bookingPiiAccessLog,
  bookingRedemptionEvents,
  bookingStaffAssignments,
  bookingSupplierStatuses,
  bookings,
  bookingTravelers,
} from "./schema.js"
export {
  publicBookingsService,
  resolveSessionPricingSnapshot,
} from "./service-public.js"
export {
  addBookingGroupMemberSchema,
  bookingGroupKindSchema,
  bookingGroupListQuerySchema,
  bookingGroupMemberRoleSchema,
  bookingListQuerySchema,
  bookingPriceOverrideSchema,
  cancelBookingSchema,
  completeBookingSchema,
  convertProductSchema,
  createBookingSchema,
  createTravelerWithTravelDetailsSchema,
  insertBookingAllocationSchema,
  insertBookingDocumentSchema,
  insertBookingFulfillmentSchema,
  insertBookingGroupSchema,
  insertBookingItemSchema,
  insertBookingItemTravelerSchema,
  insertBookingNoteSchema,
  insertBookingSchema,
  insertBookingTravelerDocumentSchema,
  insertSupplierStatusSchema,
  insertTravelerSchema,
  internalBookingOverviewLookupQuerySchema,
  overrideBookingStatusSchema,
  pricingPreviewSchema,
  publicBookingOverviewAccessQuerySchema,
  publicBookingOverviewLookupQuerySchema,
  publicGuestBookingAccessSchema,
  publicGuestBookingLookupResponseSchema,
  publicGuestBookingLookupSchema,
  recordBookingRedemptionSchema,
  sharingGroupsForSlotQuerySchema,
  startBookingSchema,
  updateBookingAllocationSchema,
  updateBookingFulfillmentSchema,
  updateBookingGroupSchema,
  updateBookingItemSchema,
  updateBookingSchema,
  updateSupplierStatusSchema,
  updateTravelerSchema,
  updateTravelerWithTravelDetailsSchema,
  upsertTravelerTravelDetailsSchema,
} from "./validation.js"
