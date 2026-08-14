// agent-quality: file-size exception -- owner: finance; existing module stays co-located until a dedicated split preserves behavior and tests.
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerBookingFinancialLifecycle } from "@voyant-travel/bookings"
import type { Module } from "@voyant-travel/core"
import { customFieldsRuntimePort } from "@voyant-travel/core/custom-fields"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import { type PaymentAdapter, paymentAdapterRuntimePort } from "@voyant-travel/payments"
import { financeBookingLifecycle } from "./booking-lifecycle.js"
import { type BookingTaxRouteOptions, createBookingTaxSettingsRoutes } from "./booking-tax.js"
import {
  buildFinanceCheckoutRouteRuntime,
  type CheckoutRoutesOptions,
  createFinanceCheckoutAdminRoutes,
  createFinanceCheckoutRoutes,
  FINANCE_CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY,
} from "./checkout-routes.js"
import { createInvoiceFxRoutes } from "./invoice-fx.js"
import { financeLinkable } from "./linkables.js"
import {
  buildFinanceRouteRuntime,
  FINANCE_ROUTE_RUNTIME_CONTAINER_KEY,
  type FinanceRuntimeOptions,
} from "./route-runtime.js"
import { financeRoutes } from "./routes.js"
import { financeActionLedgerRoutes } from "./routes-action-ledger.js"
import { createFinanceAdminDocumentRoutes } from "./routes-documents.js"
import { createPublicFinanceRoutes, type PublicFinanceRouteOptions } from "./routes-public.js"
import { createFinanceAdminSettlementRoutes } from "./routes-settlement.js"
import { supplierInvoiceRoutes } from "./routes-supplier-invoices.js"
import { createFinanceRuntime } from "./runtime.js"
import {
  financeCheckoutPaymentStartersRuntimePort,
  financeHostRuntimePort,
  financeInvoiceSettlementPollerRuntimePort,
  financeNotificationsRuntimePort,
  financeOperatorSettingsRuntimePort,
} from "./runtime-port.js"

export { FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION } from "./booking-create-policy.js"
export {
  type AllocateBookingNumberOptions,
  allocateBookingNumber,
  BOOKING_NUMBER_PATTERN,
  formatBookingNumber,
} from "./booking-number.js"
export {
  BookingSessionPaymentIdempotencyConflictError,
  type BookingSessionPaymentState,
  bookingSessionPaymentIdempotencyKey,
  type CreateBookingSessionPaymentInput,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments,
  findEstablishedBookingSessionPayment,
  hasInFlightBookingSessionPayment,
  transferBookingSessionPaymentToBooking,
} from "./booking-session-payment.js"
export type {
  CheckoutRouteRuntime,
  CheckoutRoutesOptions,
} from "./checkout-routes.js"
export {
  buildFinanceCheckoutRouteRuntime,
  CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY,
  createFinanceCheckoutAdminRoutes,
  createFinanceCheckoutRoutes,
  FINANCE_CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY,
} from "./checkout-routes.js"
export type {
  BootstrappedCheckoutCollection,
  CheckoutBankTransferDetails,
  CheckoutCollectionPlan,
  CheckoutNotificationDelivery,
  CheckoutNotificationDispatcher,
  CheckoutPaymentStarter,
  CheckoutPaymentStarterContext,
  CheckoutPolicyOptions,
  CheckoutProviderStartResult,
  CheckoutRuntimeOptions,
  InitiatedCheckoutCollection,
} from "./checkout-service.js"
export {
  bootstrapCheckoutCollection,
  initiateCheckoutCollection,
  previewCheckoutCollection,
  resolveDocumentType,
  resolvePaymentSessionTarget,
} from "./checkout-service.js"
export type {
  BootstrapCheckoutCollectionInput,
  BootstrappedCheckoutCollectionRecord,
  CheckoutBankTransferInstructionsRecord,
  CheckoutInvoiceNotificationInput,
  CheckoutPaymentSessionNotificationInput,
  CheckoutProviderStartInput,
  CheckoutProviderStartResultRecord,
  CheckoutReminderRunListQuery,
  CheckoutReminderRunRecord,
  InitiateCheckoutCollectionInput,
  InitiatedCheckoutCollectionRecord,
  PreviewCheckoutCollectionInput,
} from "./checkout-validation.js"
export {
  bootstrapCheckoutCollectionSchema,
  bootstrappedCheckoutCollectionSchema,
  checkoutBankTransferInstructionsSchema,
  checkoutCollectionIntentSchema,
  checkoutCollectionInvoiceSchema,
  checkoutCollectionMethodSchema,
  checkoutCollectionPlanSchema,
  checkoutCollectionScheduleSchema,
  checkoutCollectionStageSchema,
  checkoutInvoiceDocumentTypeSchema,
  checkoutInvoiceNotificationSchema,
  checkoutNotificationChannelSchema,
  checkoutNotificationDeliverySchema,
  checkoutNotificationDeliveryStatusSchema,
  checkoutPaymentSessionNotificationSchema,
  checkoutPaymentSessionTargetSchema,
  checkoutProviderStartInputSchema,
  checkoutProviderStartResultSchema,
  checkoutReminderRunListQuerySchema,
  checkoutReminderRunListResponseSchema,
  checkoutReminderRunSchema,
  checkoutReminderRunStatusSchema,
  checkoutReminderTargetTypeSchema,
  initiateCheckoutCollectionSchema,
  initiatedCheckoutCollectionSchema,
  previewCheckoutCollectionSchema,
} from "./checkout-validation.js"
export {
  creditNoteLinkable,
  financeLinkable,
  invoiceLinkable,
  invoiceTemplateLinkable,
  supplierInvoiceLinkable,
} from "./linkables.js"
export {
  type BookingCheckoutUrlSettings,
  type BuildBookingCheckoutUrlOptions,
  type BuildPaymentLinkUrlOptions,
  buildBookingCheckoutUrl,
  buildConfiguredPaymentLinkUrl,
  buildPaymentLinkUrl,
  normalizePaymentLinkUrlTemplate,
  resolveEffectivePaymentLinkUrlTemplate,
} from "./payment-link.js"
export type { FinanceRoutes } from "./routes.js"
export type { PublicFinanceRoutes } from "./routes-public.js"
export {
  createPublicFinanceRoutes,
  type PublicFinanceRouteOptions,
  publicFinanceRoutes,
} from "./routes-public.js"
export {
  type SupplierInvoiceRoutes,
  supplierInvoiceRoutes,
} from "./routes-supplier-invoices.js"
export {
  createSelfServiceCreateRuntime,
  type SelfServiceCreateRuntimeDeps,
} from "./self-service-create-runtime.js"
export type { FinanceServiceRuntime } from "./service.js"
export { type PublicFinanceRuntimeOptions, publicFinanceService } from "./service-public.js"

export const financeModule: Module = {
  name: "finance",
  linkable: financeLinkable,
  requiresTransactionalDb: true,
}

export interface FinanceApiModuleOptions
  extends FinanceRuntimeOptions,
    PublicFinanceRouteOptions,
    CheckoutRoutesOptions,
    BookingTaxRouteOptions {}

export function createFinanceApiModule(options: FinanceApiModuleOptions = {}): ApiModule {
  const adminRoutes = stampOpenApiRegistryApiId(
    new OpenAPIHono()
      .route("/", financeRoutes)
      .route("/", createFinanceCheckoutAdminRoutes(options))
      .route("/", financeActionLedgerRoutes)
      .route("/", supplierInvoiceRoutes)
      .route("/", createInvoiceFxRoutes(options))
      .route("/", createFinanceAdminDocumentRoutes(options))
      .route("/", createFinanceAdminSettlementRoutes(options)),
    "@voyant-travel/finance#api.admin",
  ).route("/", createBookingTaxSettingsRoutes(options))

  const module: Module = {
    ...financeModule,
    bootstrap: ({ bindings, container, eventBus }) => {
      const runtime = buildFinanceRouteRuntime(bindings as Record<string, unknown>, options)
      // Wire the framework's eventBus into the route runtime so subscribers
      // (notably the storefront's checkout-finalize workflow on
      // `payment.completed`) actually receive emissions from
      // `financeService.completePaymentSession`. Without this, the Netopia
      // webhook silently no-ops because the runtime has no bus attached.
      if (!runtime.eventBus && eventBus) runtime.eventBus = eventBus
      container.register(FINANCE_ROUTE_RUNTIME_CONTAINER_KEY, runtime)
      container.register(
        FINANCE_CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY,
        buildFinanceCheckoutRouteRuntime(bindings as Record<string, unknown>, options),
      )
    },
  }

  const publicRoutes = stampOpenApiRegistryApiId(
    new OpenAPIHono()
      .route("/", createPublicFinanceRoutes(options))
      .route("/", createFinanceCheckoutRoutes(options)),
    "@voyant-travel/finance#api.public",
  )

  return {
    module,
    adminRoutes,
    publicRoutes,
    optionalCustomerAuth: true,
  }
}

export const financeApiModule: ApiModule = createFinanceApiModule()

export const createFinanceVoyantRuntime = defineGraphRuntimeFactory(
  async ({ api, getPort, getPorts, hasPort, hostOptions }) => {
    const configured = createFinanceApiModule({
      ...createFinanceRuntime(
        await getPort(financeHostRuntimePort),
        await getPort(customFieldsRuntimePort),
        await getPort(financeNotificationsRuntimePort),
        await getPort(financeOperatorSettingsRuntimePort),
        hasPort(financeCheckoutPaymentStartersRuntimePort)
          ? await getPort(financeCheckoutPaymentStartersRuntimePort)
          : undefined,
        await getPorts(financeInvoiceSettlementPollerRuntimePort),
        hasPort(paymentAdapterRuntimePort)
          ? await getPort<PaymentAdapter>(paymentAdapterRuntimePort)
          : undefined,
      ),
      // Finance accepts bookings too, so it consumes the same monthly booking
      // quota. A host that installs a live allowance on bookings alone would
      // serve one cap from the booking routes and another from these.
      ...(hostOptions as Partial<FinanceApiModuleOptions>),
    })
    const bootstrap = configured.module.bootstrap
    const selected: ApiModule = {
      module: {
        ...configured.module,
        bootstrap: async (context) => {
          registerBookingFinancialLifecycle(context.container, financeBookingLifecycle)
          await bootstrap?.(context)
        },
      },
    }
    if (api.some(({ surface }) => surface === "admin") && configured.adminRoutes) {
      selected.adminRoutes = configured.adminRoutes
    }
    if (api.some(({ surface }) => surface === "public") && configured.publicRoutes) {
      selected.publicRoutes = configured.publicRoutes
    }
    return selected
  },
)

export type {
  PaymentAdapter,
  PaymentAdapterCapabilities,
  PaymentAdapterConformanceHarness,
  PaymentAdapterConformanceResult,
  PaymentAdapterDiagnostics,
  PaymentAdapterRuntimeContext,
  PaymentCallbackEvent,
  PaymentCallbackRequest,
  PaymentCallbackVerificationResult,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentMoney,
  PaymentOperationInput,
  PaymentOperationResult,
  PaymentStatusInput,
  PaymentStatusResult,
} from "@voyant-travel/payments"
export {
  PAYMENT_ADAPTER_CONTRACT_VERSION,
  PAYMENT_ADAPTER_RUNTIME_PORT_ID,
  paymentAdapterRuntimePort,
  runPaymentAdapterConformance,
} from "@voyant-travel/payments"
export {
  type BookingCancellationSettlementInput,
  buildPaidBookingCancellationSettlementNote,
  closeTerminalBookingPaymentSchedules,
  financeBookingLifecycle,
  recordPaidBookingCancellationSettlement,
} from "./booking-lifecycle.js"
export {
  applyBookingSessionStaffSelectionV1,
  type BookingSessionStaffSelectionV1,
  bookingSessionStaffSelectionV1,
  normalizeBookingSessionStaffSelectionV1,
} from "./booking-session-staff-selection.js"
export {
  type BookingTaxRouteOptions,
  type BookingTaxSettings,
  computeBookingItemTaxLine,
  createBookingTaxPreviewApiExtension,
  createBookingTaxPreviewRoutes,
  createBookingTaxSettingsApiExtension,
  createBookingTaxSettingsRoutes,
  loadProductTaxFacts,
  matchesTaxPolicyCondition,
  mountBookingTaxPreviewRoutes,
  mountBookingTaxSettingsRoutes,
  type ProductTaxFacts,
  type ResolveBookingSellTaxRateOptions,
  type ResolveBookingTaxSettings,
  type ResolvedBookingSellTaxRate,
  resolveBookingSellTaxRate,
  type TaxPolicyCondition,
  type UpdateBookingTaxSettings,
} from "./booking-tax.js"
export {
  BOOKING_TAX_PREVIEW_RUNTIME_KEY,
  BOOKING_TAX_SETTINGS_RUNTIME_KEY,
  type BookingTaxRuntime,
  createBookingTaxPreviewVoyantRuntime,
  createBookingTaxSettingsVoyantRuntime,
} from "./booking-tax-runtime.js"
export type {
  CardPaymentBilling,
  CardPaymentStartArgs,
  CardPaymentStarter,
  CardPaymentStartResult,
  PaymentAdapterCardPaymentExecution,
  PaymentAdapterCardPaymentStarterOptions,
} from "./card-payment.js"
export {
  createPaymentAdapterCardPaymentStarter,
  resolvePaymentCallbackUrl,
  startPaymentAdapterCardPayment,
} from "./card-payment.js"
export {
  type DocumentDownloadEnvelope,
  type DocumentDownloadResolution,
  type DocumentDownloadResolver,
  resolveStoredDocumentDownload,
  type StoredDocumentReference,
} from "./document-download.js"
export {
  type FxMoneyInput,
  type ResolveFxMoneyBaseAmountOptions,
  resolveFxMoneyBaseAmount,
} from "./fx-money.js"
export {
  createInvoiceFxApiExtension,
  createInvoiceFxRoutes,
  createVoyantDataFxExchangeRateResolver,
  type InvoiceExchangeRateResolution,
  type InvoiceFxContext,
  type InvoiceFxOptions,
  type InvoiceFxRouteOptions,
  type InvoiceFxSettings,
  mountInvoiceFxRoutes,
  type ResolvedInvoiceFxSettings,
  type ResolveInvoiceExchangeRate,
  type ResolveInvoiceExchangeRateInput,
  type ResolveInvoiceFxSettings,
  resolveInvoiceFxContext,
  resolveInvoiceFxSettingsOrDefault,
  type UpdateInvoiceFxSettings,
  type VoyantDataFxResolverOptions,
} from "./invoice-fx.js"
export {
  type CreateOrderPaymentSessionsOptions,
  createOrderPaymentSessions,
  type EnsureOrderSessionParams,
  type OrderPaymentSessionSummary,
  type OrderPaymentSessions,
  type OrderPaymentSessionTargetType,
  type StartOrderPaymentProvider,
} from "./order-payment-sessions.js"
export {
  applyPaymentAdapterCallbackEvent,
  applyPaymentAdapterInitiationResult,
  applyPaymentAdapterStatusResult,
} from "./payment-adapter-events.js"
export {
  type PaymentAdapterStatusRefreshExecution,
  refreshPaymentAdapterStatus,
} from "./payment-adapter-status.js"
export type {
  ComputedScheduleEntry,
  ComputeScheduleInput,
  DepositKind,
  DepositRule,
  PaymentPolicy,
  PaymentPolicyCascadeLayers,
  PaymentPolicySource,
  PaymentScheduleEntryType,
  ResolvedPaymentPolicy,
} from "./payment-policy.js"
export {
  computePaymentSchedule,
  isPaymentPolicyEmpty,
  noDepositPolicy,
  normalizePaymentPolicy,
  policyShouldRequireFullPayment,
  resolveDepositAmountCents,
  resolveEffectivePaymentPolicy,
} from "./payment-policy.js"
export {
  createPaymentPolicyCascade,
  type PaymentPolicyCascade,
  type PaymentPolicyCascadeOptions,
  type PaymentPolicyCascadeReaders,
  readPolicySourceFromInternalNotes,
  stampPolicySourceOnBooking,
} from "./payment-policy-cascade.js"
export {
  type BookingScheduleRoutesOptions,
  createBookingScheduleAdminRoutes,
  createBookingScheduleApiExtension,
  createBookingScheduleVoyantRuntime,
  createPaymentPolicyPublicRoutes,
  generatePaymentScheduleForBooking,
  type PaymentPolicyEntityContext,
} from "./payment-schedule/routes.js"
export {
  executeAdapterRefundSettlement,
  REFUND_SETTLEMENT_OUTCOME_KEY,
  type RefundSettlementExecution,
  type RefundSettlementExecutionOutcome,
  type RefundSettlementExecutionResult,
} from "./refund-settlement-execution.js"
export {
  canAdvanceRefundSettlement,
  HELD_REFUND_SETTLEMENT_STATUSES,
  holdsRefundedFunds,
  isAdapterBackedRefundMethod,
  isInstrumentRefundMethod,
  isOwedRefundSettlement,
  REFUND_SETTLEMENT_METHODS,
  REFUND_SETTLEMENT_STATUSES,
  type RefundSettlementMethod,
  type RefundSettlementStatus,
} from "./refund-settlement-lifecycle.js"
export {
  buildFinanceRouteRuntime,
  FINANCE_ROUTE_RUNTIME_CONTAINER_KEY,
  type FinanceRouteRuntime,
  type FinanceRuntimeOptions,
} from "./route-runtime.js"
export {
  createFinanceAdminDocumentRoutes,
  type FinanceDocumentRouteOptions,
} from "./routes-documents.js"
export {
  createFinanceAdminSettlementRoutes,
  type FinanceSettlementRouteOptions,
  type InvoiceSettlementPoller,
} from "./routes-settlement.js"
export { aggregateFinanceInvoiceSettlementPollers } from "./runtime.js"
export {
  type FinanceInvoiceSettlementPollerProvider,
  financeAccommodationsPaymentPolicyRuntimePort,
  financeCheckoutPaymentStartersRuntimePort,
  financeCruisesPaymentPolicyRuntimePort,
  financeDistributionPaymentPolicyRuntimePort,
  financeHostRuntimePort,
  financeInventoryPaymentPolicyRuntimePort,
  financeInvoiceSettlementPollerRuntimePort,
  financeNotificationsRuntimePort,
  financeOperatorSettingsRuntimePort,
} from "./runtime-port.js"
export type {
  BookingGuarantee,
  BookingItemCommission,
  BookingItemTaxLine,
  BookingPaymentSchedule,
  CreditNote,
  CreditNoteLineItem,
  FinanceNote,
  Invoice,
  InvoiceAttachment,
  InvoiceExternalRef,
  InvoiceLineItem,
  InvoiceNumberSeries,
  InvoiceRendition,
  InvoiceTemplate,
  NewBookingGuarantee,
  NewBookingItemCommission,
  NewBookingItemTaxLine,
  NewBookingPaymentSchedule,
  NewCreditNote,
  NewCreditNoteLineItem,
  NewFinanceNote,
  NewInvoice,
  NewInvoiceAttachment,
  NewInvoiceExternalRef,
  NewInvoiceLineItem,
  NewInvoiceNumberSeries,
  NewInvoiceRendition,
  NewInvoiceTemplate,
  NewPayment,
  NewPaymentAuthorization,
  NewPaymentCapture,
  NewPaymentInstrument,
  NewPaymentSession,
  NewSupplierCostAllocation,
  NewSupplierInvoice,
  NewSupplierInvoiceAttachment,
  NewSupplierInvoiceLine,
  NewSupplierPayment,
  NewTaxClass,
  NewTaxRegime,
  NewTravelCredit,
  NewTravelCreditRedemption,
  Payment,
  PaymentAuthorization,
  PaymentCapture,
  PaymentInstrument,
  PaymentSession,
  SupplierCostAllocation,
  SupplierInvoice,
  SupplierInvoiceAttachment,
  SupplierInvoiceLine,
  SupplierPayment,
  TaxClass,
  TaxRegime,
  TravelCredit,
  TravelCreditRedemption,
} from "./schema.js"
export {
  apServiceTypeEnum,
  bookingGuarantees,
  bookingItemCommissions,
  bookingItemTaxLines,
  bookingPaymentSchedules,
  costAllocationSplitMethodEnum,
  costAllocationTargetTypeEnum,
  creditNoteLineItems,
  creditNotes,
  financeNotes,
  invoiceAttachments,
  invoiceExternalRefs,
  invoiceLineItems,
  invoiceNumberSeries,
  invoiceRenditions,
  invoices,
  invoiceTemplates,
  paymentAuthorizations,
  paymentCaptures,
  paymentInstruments,
  paymentSessions,
  payments,
  supplierCostAllocations,
  supplierInvoiceAttachments,
  supplierInvoiceLines,
  supplierInvoiceStatusEnum,
  supplierInvoices,
  supplierPayments,
  taxClasses,
  taxPolicyProfiles,
  taxPolicyRules,
  taxRegimes,
  travelCreditRedemptions,
  travelCreditSourceTypeEnum,
  travelCreditStatusEnum,
  travelCredits,
} from "./schema.js"
export type {
  SelfServiceBookingCaller,
  SelfServiceBookingSourceRejection,
  SelfServiceBookingSourceResolution,
  SelfServiceBookingSourceResolved,
  SelfServiceBookingSourceRuntime,
} from "./self-service-booking-source.js"
export type {
  BindInvoiceRenditionInput,
  BookingPaymentSchedulePaidEvent,
  CreateInvoiceFromBookingInput,
  InvoiceFromBookingData,
  InvoiceLineDescriptionResolver,
  InvoiceLineDescriptionResolverInput,
  InvoicePaymentRecordedEvent,
  InvoiceRenderedEvent,
  InvoiceVoidedEvent,
  PaymentCompletedEvent,
  PaymentScheduleLineDescriptionFormat,
  ResolvedInvoiceLine,
  UnifiedPaymentRow,
} from "./service.js"
export {
  financeService,
  InvoiceLineItemsPersistenceError,
  InvoiceNumberAllocationError,
  InvoiceNumberConflictError,
  renderInvoiceBody,
} from "./service.js"
export type {
  FinanceAggregateOutstandingInvoice,
  FinanceAggregates,
} from "./service-aggregates.js"
export type {
  BookingCreateInput,
  BookingCreateOutcome,
  BookingCreateResult,
  BookingCreateTravelerInput,
} from "./service-booking-create.js"
export { bookingCreateSchema } from "./service-booking-create.js"
export type {
  GeneratedInvoiceDocumentRecord,
  GeneratedInvoiceRenditionArtifact,
  InvoiceDocumentGeneratedEvent,
  InvoiceDocumentGenerator,
  InvoiceDocumentGeneratorContext,
  InvoiceDocumentRuntimeOptions,
  StorageBackedInvoiceDocumentGeneratorOptions,
  StorageBackedInvoiceDocumentSerializer,
  StorageBackedInvoiceDocumentUpload,
} from "./service-documents.js"
export {
  createPdfInvoiceDocumentGenerator,
  createStorageBackedInvoiceDocumentGenerator,
  defaultPdfInvoiceDocumentSerializer,
  defaultStorageBackedInvoiceDocumentSerializer,
  financeDocumentsService,
} from "./service-documents.js"
export type {
  InvoiceIssuedEvent,
  InvoiceIssueRuntime,
  InvoiceProformaConvertedEvent,
} from "./service-issue.js"
export {
  buildInvoiceIssuedEvent,
  convertProformaToInvoice,
  issueInvoiceFromBooking,
  issueProformaFromBooking,
} from "./service-issue.js"
export {
  getLatestInvoiceRendition,
  type InvoiceRenditionWaitMode,
  type WaitForInvoiceRenditionOptions,
  type WaitForInvoiceRenditionResult,
  waitForInvoiceRendition,
  waitFormatForMode,
} from "./service-rendition-wait.js"
export type {
  FinanceSettlementRuntimeOptions,
  InvoiceSettledEvent,
  InvoiceSettlementPollerContext,
  InvoiceSettlementPollerResult,
} from "./service-settlement.js"
export { financeSettlementService } from "./service-settlement.js"
export { settleCoveredBookingPaymentSchedules } from "./service-shared.js"
export {
  type AllocationCheckEntry,
  type AllocationCheckLine,
  type AllocationCheckResult,
  type InvoiceTotals,
  recomputeTotalsFromLines,
  type SupplierInvoiceErrorCode,
  SupplierInvoiceServiceError,
  type SupplierInvoiceServiceRuntime,
  supplierInvoicesService,
  validateAllocations,
} from "./service-supplier-invoices.js"
export { TravelCreditServiceError, travelCreditsService } from "./service-travel-credits.js"
export type {
  GeneratedInvoiceDocumentResult,
  GenerateInvoiceDocumentInput,
  PolledInvoiceSettlementResult,
  PollInvoiceSettlementInput,
} from "./validation.js"
export {
  agingReportQuerySchema,
  allocateInvoiceNumberInputSchema,
  applyDefaultBookingPaymentPlanSchema,
  apServiceTypeSchema,
  cancelPaymentSessionSchema,
  completePaymentSessionSchema,
  costAllocationSplitMethodSchema,
  costAllocationTargetTypeSchema,
  createPaymentSessionFromGuaranteeSchema,
  createPaymentSessionFromInvoiceSchema,
  createPaymentSessionFromScheduleSchema,
  expirePaymentSessionSchema,
  failPaymentSessionSchema,
  financeAggregatesQuerySchema,
  generatedInvoiceDocumentResultSchema,
  generateInvoiceDocumentInputSchema,
  insertBookingGuaranteeSchema,
  insertBookingItemCommissionSchema,
  insertBookingItemTaxLineSchema,
  insertBookingPaymentScheduleSchema,
  insertCreditNoteLineItemSchema,
  insertCreditNoteSchema,
  insertFinanceNoteSchema,
  insertInvoiceExternalRefSchema,
  insertInvoiceLineItemSchema,
  insertInvoiceNumberSeriesSchema,
  insertInvoiceRenditionSchema,
  insertInvoiceSchema,
  insertInvoiceTemplateSchema,
  insertPaymentAuthorizationSchema,
  insertPaymentCaptureSchema,
  insertPaymentInstrumentSchema,
  insertPaymentSchema,
  insertPaymentSessionSchema,
  insertSupplierInvoiceAttachmentSchema,
  insertSupplierInvoiceSchema,
  insertSupplierPaymentSchema,
  insertTaxClassSchema,
  insertTaxPolicyProfileSchema,
  insertTaxPolicyRuleSchema,
  insertTaxRegimeSchema,
  invoiceFromBookingSchema,
  invoiceListQuerySchema,
  invoiceNumberSeriesListQuerySchema,
  invoiceTemplateListQuerySchema,
  markPaymentSessionRequiresRedirectSchema,
  paymentAuthorizationListQuerySchema,
  paymentCaptureListQuerySchema,
  paymentInstrumentListQuerySchema,
  paymentKindSchema,
  paymentListQuerySchema,
  paymentListSortDirSchema,
  paymentListSortFieldSchema,
  paymentProvenanceSchema,
  paymentSessionListQuerySchema,
  paymentTargetSchema,
  polledInvoiceSettlementProviderResultSchema,
  polledInvoiceSettlementResultSchema,
  pollInvoiceSettlementInputSchema,
  profitabilityQuerySchema,
  renderInvoiceInputSchema,
  revenueReportQuerySchema,
  setSupplierCostAllocationsSchema,
  setSupplierInvoiceLinesSchema,
  supplierCostAllocationInputSchema,
  supplierInvoiceLineInputSchema,
  supplierInvoiceListQuerySchema,
  supplierInvoiceStatusSchema,
  supplierPaymentListQuerySchema,
  taxClassListQuerySchema,
  taxPolicyProfileListQuerySchema,
  taxPolicyRuleListQuerySchema,
  taxRegimeListQuerySchema,
  updateBookingGuaranteeSchema,
  updateBookingItemCommissionSchema,
  updateBookingItemTaxLineSchema,
  updateBookingPaymentScheduleSchema,
  updateCreditNoteLineItemSchema,
  updateCreditNoteSchema,
  updateInvoiceExternalRefSchema,
  updateInvoiceLineItemSchema,
  updateInvoiceNumberSeriesSchema,
  updateInvoiceRenditionSchema,
  updateInvoiceSchema,
  updateInvoiceTemplateSchema,
  updatePaymentAuthorizationSchema,
  updatePaymentCaptureSchema,
  updatePaymentInstrumentSchema,
  updatePaymentSchema,
  updatePaymentSessionSchema,
  updateSupplierInvoiceSchema,
  updateSupplierPaymentSchema,
  updateTaxClassSchema,
  updateTaxPolicyProfileSchema,
  updateTaxPolicyRuleSchema,
  updateTaxRegimeSchema,
} from "./validation.js"
export type {
  PublicBookingFinanceDocuments,
  PublicBookingFinancePayments,
  PublicBookingPaymentOptions,
  PublicFinanceBookingDocument,
  PublicFinanceBookingPayment,
  PublicFinanceDocumentLookup,
  PublicFinanceDocumentLookupQuery,
  PublicPaymentOptionsQuery,
  PublicPaymentSession,
  PublicStartPaymentSessionInput,
  PublicTravelCreditValidationResult,
  PublicValidateTravelCreditInput,
} from "./validation-public.js"
export {
  publicBookingFinanceDocumentsSchema,
  publicBookingFinancePaymentsSchema,
  publicBookingPaymentOptionsSchema,
  publicFinanceBookingDocumentSchema,
  publicFinanceBookingPaymentSchema,
  publicFinanceDocumentAvailabilitySchema,
  publicFinanceDocumentFormatSchema,
  publicFinanceDocumentLookupQuerySchema,
  publicFinanceDocumentLookupSchema,
  publicFinanceInvoiceTypeSchema,
  publicPaymentOptionsQuerySchema,
  publicPaymentSessionSchema,
  publicStartPaymentSessionSchema,
  publicTravelCreditValidationSchema,
  publicValidateTravelCreditSchema,
} from "./validation-public.js"
