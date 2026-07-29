// agent-quality: file-size exception -- owner: finance; compatibility exports and shared service helpers stay co-located while the domain-operation service modules are split out.
export {
  type ActionLedgerRequestContextValues,
  actionMutationDetails,
  appendActionLedgerMutation,
} from "@voyant-travel/action-ledger"
export { bookingItems, bookings } from "@voyant-travel/bookings/schema"
export type { EventBus } from "@voyant-travel/core"
export type { AnyDrizzleDb } from "@voyant-travel/db"
export {
  lockBookingFinanceInsertionFence,
  withBookingFinanceInsertionFence,
} from "@voyant-travel/db"
export { newId } from "@voyant-travel/db/lib/typeid"
export { renderStructuredTemplate } from "@voyant-travel/utils/template-renderer"
export {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm"
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
export type { z } from "zod"
export { resolveFxMoneyBaseAmount } from "./fx-money.js"
export type { InvoiceFxOptions } from "./invoice-fx.js"
export { isInvoiceNumberUniqueConstraintError } from "./invoice-number-errors.js"
export {
  bookingGuarantees,
  bookingItemCommissions,
  bookingItemTaxLines,
  bookingPaymentSchedules,
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
  supplierInvoices,
  supplierPayments,
  taxClasses,
  taxPolicyProfiles,
  taxPolicyRules,
  taxRegimes,
} from "./schema.js"
export type { InvoiceSettledEvent } from "./service-settlement.js"
export { recomputeSupplierInvoiceBalance } from "./service-supplier-invoices.js"

import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import { actionMutationDetails } from "@voyant-travel/action-ledger"
import { bookings } from "@voyant-travel/bookings/schema"
import type { EventBus } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { renderStructuredTemplate } from "@voyant-travel/utils/template-renderer"
import { and, asc, desc, eq, gt, ne, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { resolveFxMoneyBaseAmount } from "./fx-money.js"
import type { InvoiceFxOptions } from "./invoice-fx.js"
import {
  type bookingGuarantees,
  type bookingItemTaxLines,
  bookingPaymentSchedules,
  creditNotes,
  type invoiceRenditions,
  invoices,
  type paymentSessions,
  payments,
  supplierInvoices,
  supplierPayments,
} from "./schema.js"

export {
  buildBookingGuaranteeCreateActionLedgerInput,
  buildBookingGuaranteeDeleteActionLedgerInput,
  buildBookingGuaranteeUpdateActionLedgerInput,
  buildBookingPaymentScheduleCreateActionLedgerInput,
  buildBookingPaymentScheduleDeleteActionLedgerInput,
  buildBookingPaymentScheduleUpdateActionLedgerInput,
  buildCreditNoteCreationActionLedgerInput,
  buildCreditNoteLineItemCreateActionLedgerInput,
  buildCreditNoteUpdateActionLedgerInput,
  buildInvoiceDeleteActionLedgerInput,
  buildInvoiceIssuedActionLedgerInput,
  buildInvoiceLineItemCreateActionLedgerInput,
  buildInvoiceLineItemDeleteActionLedgerInput,
  buildInvoiceLineItemUpdateActionLedgerInput,
  buildInvoiceUpdateActionLedgerInput,
  buildPaymentAuthorizationCreateActionLedgerInput,
  buildPaymentAuthorizationDeleteActionLedgerInput,
  buildPaymentAuthorizationUpdateActionLedgerInput,
  buildPaymentCaptureCreateActionLedgerInput,
  buildPaymentCaptureDeleteActionLedgerInput,
  buildPaymentCaptureUpdateActionLedgerInput,
  buildPaymentDeleteActionLedgerInput,
  buildPaymentInstrumentCreateActionLedgerInput,
  buildPaymentInstrumentDeleteActionLedgerInput,
  buildPaymentInstrumentUpdateActionLedgerInput,
  buildPaymentSessionCancelledActionLedgerInput,
  buildPaymentSessionCompletionActionLedgerInput,
  buildPaymentSessionCreateActionLedgerInput,
  buildPaymentSessionExpiredActionLedgerInput,
  buildPaymentSessionFailedActionLedgerInput,
  buildPaymentSessionRequiresRedirectActionLedgerInput,
  buildPaymentSessionUpdateActionLedgerInput,
  buildPaymentUpdateActionLedgerInput,
  buildRecordPaymentActionLedgerInput,
  buildSupplierPaymentCreateActionLedgerInput,
  buildSupplierPaymentUpdateActionLedgerInput,
} from "./service-action-ledger.js"

import { listResponse } from "@voyant-travel/types"
import type {
  agingReportQuerySchema,
  applyDefaultBookingPaymentPlanSchema,
  cancelPaymentSessionSchema,
  completePaymentSessionSchema,
  createPaymentSessionFromGuaranteeSchema,
  createPaymentSessionFromInvoiceSchema,
  createPaymentSessionFromScheduleSchema,
  expirePaymentSessionSchema,
  failPaymentSessionSchema,
  insertBookingGuaranteeSchema,
  insertBookingItemCommissionSchema,
  insertBookingItemTaxLineSchema,
  insertBookingPaymentScheduleSchema,
  insertCreditNoteLineItemSchema,
  insertCreditNoteSchema,
  insertFinanceNoteSchema,
  insertInvoiceAttachmentSchema,
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
  paymentListQuerySchema,
  paymentSessionListQuerySchema,
  profitabilityQuerySchema,
  renderInvoiceInputSchema,
  revenueReportQuerySchema,
  supplierPaymentListQuerySchema,
  taxClassListQuerySchema,
  taxPolicyProfileListQuerySchema,
  taxPolicyRuleListQuerySchema,
  taxRegimeListQuerySchema,
  updateBookingGuaranteeSchema,
  updateBookingItemCommissionSchema,
  updateBookingItemTaxLineSchema,
  updateBookingPaymentScheduleSchema,
  updateCreditNoteSchema,
  updateInvoiceAttachmentSchema,
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
  updateSupplierPaymentSchema,
  updateTaxClassSchema,
  updateTaxPolicyProfileSchema,
  updateTaxPolicyRuleSchema,
  updateTaxRegimeSchema,
  voidInvoiceSchema,
} from "./validation.js"

export type RevenueReportQuery = z.infer<typeof revenueReportQuerySchema>
export type AgingReportQuery = z.infer<typeof agingReportQuerySchema>
export type ProfitabilityQuery = z.infer<typeof profitabilityQuerySchema>
export type PaymentInstrumentListQuery = z.infer<typeof paymentInstrumentListQuerySchema>
export type PaymentSessionListQuery = z.infer<typeof paymentSessionListQuerySchema>
export type PaymentAuthorizationListQuery = z.infer<typeof paymentAuthorizationListQuerySchema>
export type PaymentCaptureListQuery = z.infer<typeof paymentCaptureListQuerySchema>
export type CreatePaymentInstrumentInput = z.infer<typeof insertPaymentInstrumentSchema>
export type UpdatePaymentInstrumentInput = z.infer<typeof updatePaymentInstrumentSchema>
export type CreatePaymentSessionInput = z.infer<typeof insertPaymentSessionSchema>
export type UpdatePaymentSessionInput = z.infer<typeof updatePaymentSessionSchema>
export type CreatePaymentAuthorizationInput = z.infer<typeof insertPaymentAuthorizationSchema>
export type UpdatePaymentAuthorizationInput = z.infer<typeof updatePaymentAuthorizationSchema>
export type CreatePaymentCaptureInput = z.infer<typeof insertPaymentCaptureSchema>
export type UpdatePaymentCaptureInput = z.infer<typeof updatePaymentCaptureSchema>
export type CreateBookingPaymentScheduleInput = z.infer<typeof insertBookingPaymentScheduleSchema>
export type UpdateBookingPaymentScheduleInput = z.infer<typeof updateBookingPaymentScheduleSchema>
export type CreateBookingGuaranteeInput = z.infer<typeof insertBookingGuaranteeSchema>
export type UpdateBookingGuaranteeInput = z.infer<typeof updateBookingGuaranteeSchema>
export type CreateBookingItemTaxLineInput = z.infer<typeof insertBookingItemTaxLineSchema>
export type UpdateBookingItemTaxLineInput = z.infer<typeof updateBookingItemTaxLineSchema>
export type CreateBookingItemCommissionInput = z.infer<typeof insertBookingItemCommissionSchema>
export type UpdateBookingItemCommissionInput = z.infer<typeof updateBookingItemCommissionSchema>
export type SupplierPaymentListQuery = z.infer<typeof supplierPaymentListQuerySchema>
export type CreateSupplierPaymentInput = z.infer<typeof insertSupplierPaymentSchema>
export type UpdateSupplierPaymentInput = z.infer<typeof updateSupplierPaymentSchema>
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>

export class PaymentValidationError extends Error {
  readonly status: 400 | 409
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    details?: Record<string, unknown>,
    options: { status?: 400 | 409; code?: string } = {},
  ) {
    super(message)
    this.name = "PaymentValidationError"
    this.status = options.status ?? 400
    this.code = options.code ?? "invalid_request"
    this.details = details
  }
}

export interface UnifiedPaymentRow {
  kind: "customer" | "supplier"
  id: string
  invoiceId: string | null
  /** Customer-side: human-readable invoice number from `invoices.invoice_number`. */
  invoiceNumber: string | null
  bookingId: string | null
  /** Supplier-side: human-readable booking number from `bookings.booking_number`. */
  bookingNumber: string | null
  supplierId: string | null
  /** Supplier-side: supplier display name from `suppliers.name`. */
  supplierName: string | null
  /** Customer-side: person who paid, joined via invoice → people. */
  personId: string | null
  personName: string | null
  /** Customer-side: organization that paid, joined via invoice → organizations. */
  organizationId: string | null
  organizationName: string | null
  amountCents: number
  currency: string
  baseCurrency: string | null
  baseAmountCents: number | null
  paymentMethod: string
  status: string
  referenceNumber: string | null
  paymentDate: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
export type CreateInvoiceInput = z.infer<typeof insertInvoiceSchema>
export type CreateInvoiceFromBookingInput = z.infer<typeof invoiceFromBookingSchema>
export type PaymentScheduleLineDescriptionFormat = NonNullable<
  CreateInvoiceFromBookingInput["paymentScheduleLineDescriptionFormat"]
>
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>
export type CreateInvoiceLineItemInput = z.infer<typeof insertInvoiceLineItemSchema>
export type UpdateInvoiceLineItemInput = z.infer<typeof updateInvoiceLineItemSchema>
export type CreatePaymentInput = z.infer<typeof insertPaymentSchema>
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>
export type CreateCreditNoteInput = z.infer<typeof insertCreditNoteSchema>
export type UpdateCreditNoteInput = z.infer<typeof updateCreditNoteSchema>
export type CreateCreditNoteLineItemInput = z.infer<typeof insertCreditNoteLineItemSchema>
export type CreateFinanceNoteInput = z.infer<typeof insertFinanceNoteSchema>
export type InvoiceNumberSeriesListQuery = z.infer<typeof invoiceNumberSeriesListQuerySchema>
export type CreateInvoiceNumberSeriesInput = z.infer<typeof insertInvoiceNumberSeriesSchema>
export type UpdateInvoiceNumberSeriesInput = z.infer<typeof updateInvoiceNumberSeriesSchema>
export type EnsureExternalInvoiceNumberSeriesInput = {
  provider: string
  scope: CreateInvoiceNumberSeriesInput["scope"]
  code?: string
  name: string
  externalConfigKey?: string | null
  isDefault?: boolean
  active?: boolean
  prefix?: string
  separator?: string
  padLength?: number
  resetStrategy?: CreateInvoiceNumberSeriesInput["resetStrategy"]
}
export type InvoiceTemplateListQuery = z.infer<typeof invoiceTemplateListQuerySchema>
export type CreateInvoiceTemplateInput = z.infer<typeof insertInvoiceTemplateSchema>
export type UpdateInvoiceTemplateInput = z.infer<typeof updateInvoiceTemplateSchema>
export type CreateInvoiceRenditionInput = z.infer<typeof insertInvoiceRenditionSchema>
export type UpdateInvoiceRenditionInput = z.infer<typeof updateInvoiceRenditionSchema>
export type CreateInvoiceAttachmentInput = z.infer<typeof insertInvoiceAttachmentSchema>
export type UpdateInvoiceAttachmentInput = z.infer<typeof updateInvoiceAttachmentSchema>
export type TaxRegimeListQuery = z.infer<typeof taxRegimeListQuerySchema>
export type CreateTaxRegimeInput = z.infer<typeof insertTaxRegimeSchema>
export type UpdateTaxRegimeInput = z.infer<typeof updateTaxRegimeSchema>
export type TaxClassListQuery = z.infer<typeof taxClassListQuerySchema>
export type CreateTaxClassInput = z.infer<typeof insertTaxClassSchema>
export type UpdateTaxClassInput = z.infer<typeof updateTaxClassSchema>
export type TaxPolicyProfileListQuery = z.infer<typeof taxPolicyProfileListQuerySchema>
export type CreateTaxPolicyProfileInput = z.infer<typeof insertTaxPolicyProfileSchema>
export type UpdateTaxPolicyProfileInput = z.infer<typeof updateTaxPolicyProfileSchema>
export type TaxPolicyRuleListQuery = z.infer<typeof taxPolicyRuleListQuerySchema>
export type CreateTaxPolicyRuleInput = z.infer<typeof insertTaxPolicyRuleSchema>
export type UpdateTaxPolicyRuleInput = z.infer<typeof updateTaxPolicyRuleSchema>
export type CreateInvoiceExternalRefInput = z.infer<typeof insertInvoiceExternalRefSchema>
export type RenderInvoiceInput = z.infer<typeof renderInvoiceInputSchema>
export type MarkPaymentSessionRequiresRedirectInput = z.infer<
  typeof markPaymentSessionRequiresRedirectSchema
>
export type CompletePaymentSessionInput = z.infer<typeof completePaymentSessionSchema>
export type FailPaymentSessionInput = z.infer<typeof failPaymentSessionSchema>
export type CancelPaymentSessionInput = z.infer<typeof cancelPaymentSessionSchema>
export type ExpirePaymentSessionInput = z.infer<typeof expirePaymentSessionSchema>
export type CreatePaymentSessionFromScheduleInput = z.infer<
  typeof createPaymentSessionFromScheduleSchema
>
export type CreatePaymentSessionFromGuaranteeInput = z.infer<
  typeof createPaymentSessionFromGuaranteeSchema
>
export type CreatePaymentSessionFromInvoiceInput = z.infer<
  typeof createPaymentSessionFromInvoiceSchema
>
export type ApplyDefaultBookingPaymentPlanInput = z.infer<
  typeof applyDefaultBookingPaymentPlanSchema
>

export type InvoiceNumberScope = "invoice" | "proforma"
export type InvoiceNumberAllocationErrorCode =
  | "invoice_number_series_not_found"
  | "invoice_number_series_inactive"
  | "invoice_number_series_scope_mismatch"
  | "no_active_series_for_scope"

export class InvoiceNumberAllocationError extends Error {
  readonly code: InvoiceNumberAllocationErrorCode
  readonly scope: InvoiceNumberScope
  readonly seriesId?: string

  constructor(
    code: InvoiceNumberAllocationErrorCode,
    details: { scope: InvoiceNumberScope; seriesId?: string },
  ) {
    super(code)
    this.name = "InvoiceNumberAllocationError"
    this.code = code
    this.scope = details.scope
    this.seriesId = details.seriesId
  }
}

export class ExternalInvoiceNumberSeriesCollisionError extends Error {
  readonly code = "external_invoice_number_series_code_conflict"
  readonly seriesCode: string
  readonly provider: string
  readonly scope: string
  readonly existingProvider: string | null
  readonly existingScope: string

  constructor(details: {
    seriesCode: string
    provider: string
    scope: string
    existingProvider: string | null
    existingScope: string
  }) {
    super(
      `Invoice number series code "${details.seriesCode}" already belongs to ${details.existingProvider ?? "a local series"} in scope "${details.existingScope}"`,
    )
    this.name = "ExternalInvoiceNumberSeriesCollisionError"
    this.seriesCode = details.seriesCode
    this.provider = details.provider
    this.scope = details.scope
    this.existingProvider = details.existingProvider
    this.existingScope = details.existingScope
  }
}

export class InvoiceNumberConflictError extends Error {
  readonly code = "invoice_number_conflict"
  readonly invoiceNumber: string

  constructor(invoiceNumber: string) {
    super("Invoice number already exists")
    this.name = "InvoiceNumberConflictError"
    this.invoiceNumber = invoiceNumber
  }
}

export class InvoiceFromBookingValidationError extends Error {
  readonly status = 400
  readonly code = "invalid_invoice_from_booking"
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "InvoiceFromBookingValidationError"
    this.details = details
  }
}

export class InvoiceValidationError extends Error {
  readonly status: 400 | 404 | 409
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    details?: Record<string, unknown>,
    options: { status?: 400 | 404 | 409; code?: string } = {},
  ) {
    super(message)
    this.name = "InvoiceValidationError"
    this.status = options.status ?? 400
    this.code = options.code ?? "invalid_invoice"
    this.details = details
  }
}

export class InvoiceLineItemsPersistenceError extends Error {
  readonly code = "invoice_line_items_not_persisted"
  readonly invoiceId: string
  readonly expectedCount: number
  readonly actualCount: number

  constructor(invoiceId: string, expectedCount: number, actualCount: number) {
    super("Invoice line items were not persisted")
    this.name = "InvoiceLineItemsPersistenceError"
    this.invoiceId = invoiceId
    this.expectedCount = expectedCount
    this.actualCount = actualCount
  }
}

/** Booking data needed for createInvoiceFromBooking — supplied by the caller (template). */
export type InvoiceFromBookingPaymentScheduleData = {
  id: string
  bookingId: string
  bookingItemId: string | null
  scheduleType: "deposit" | "installment" | "balance" | "hold" | "other"
  dueDate: string
  currency: string
  amountCents: number
}

export interface InvoiceFromBookingData {
  booking: {
    id: string
    bookingNumber: string
    personId: string | null
    organizationId: string | null
    startDate?: string | Date | null
    endDate?: string | Date | null
    sellCurrency: string
    baseCurrency: string | null
    fxRateSetId: string | null
    sellAmountCents: number | null
    baseSellAmountCents: number | null
  }
  paymentSchedule?: InvoiceFromBookingPaymentScheduleData | null
  /**
   * Complete persisted schedule set for the booking. Schedule-derived invoices
   * use this to allocate indivisible tax cents exactly once across installments.
   */
  paymentSchedules?: InvoiceFromBookingPaymentScheduleData[]
  dueDatePaymentSchedule?: InvoiceFromBookingPaymentScheduleData | null
  items: Array<{
    id: string
    title: string
    productId?: string | null
    productName?: string | null
    productNameSnapshot?: string | null
    optionNameSnapshot?: string | null
    unitNameSnapshot?: string | null
    departureLabelSnapshot?: string | null
    startDate?: string | Date | null
    serviceDate?: string | Date | null
    startsAt?: string | Date | null
    endDate?: string | Date | null
    endsAt?: string | Date | null
    quantity: number
    unitSellAmountCents: number | null
    totalSellAmountCents: number | null
  }>
}

export interface ResolvedInvoiceLine {
  bookingItemId: string | null
  bookingPaymentScheduleId: string | null
  description: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  taxAmountCents: number
  taxRate: number | null
  sortOrder: number
}

export interface InvoiceLineDescriptionResolverInput {
  booking: InvoiceFromBookingData["booking"]
  schedule?: NonNullable<InvoiceFromBookingData["paymentSchedule"]>
  item?: InvoiceFromBookingData["items"][number]
  line: ResolvedInvoiceLine
}

export type InvoiceLineDescriptionResolver = (
  input: InvoiceLineDescriptionResolverInput,
) => string | Promise<string>

export interface InvoiceDueDateResolverInput {
  issueDate: string
  dueDate: string
  invoiceType: NonNullable<CreateInvoiceFromBookingInput["invoiceType"]>
  booking: InvoiceFromBookingData["booking"]
  bookingPaymentSchedule?: NonNullable<InvoiceFromBookingData["paymentSchedule"]>
}

export type InvoiceDueDateResolver = (
  input: InvoiceDueDateResolverInput,
) => string | Promise<string>

export const PAYMENT_SCHEDULE_LINE_LABELS: Record<
  NonNullable<InvoiceFromBookingData["paymentSchedule"]>["scheduleType"],
  string
> = {
  deposit: "Deposit",
  installment: "Installment",
  balance: "Balance",
  hold: "Hold",
  other: "Payment schedule",
}

export function bookingItemToInvoiceLine(
  item: InvoiceFromBookingData["items"][number],
  taxes: Array<typeof bookingItemTaxLines.$inferSelect>,
  sortOrder: number,
): ResolvedInvoiceLine {
  const quantity = Math.max(item.quantity, 1)
  const totalCents =
    item.totalSellAmountCents ?? (item.unitSellAmountCents ?? 0) * Math.max(item.quantity, 1)
  const firstTaxWithRate = taxes.find(
    (tax) => tax.scope !== "withheld" && tax.rateBasisPoints != null,
  )

  return {
    bookingItemId: item.id,
    bookingPaymentScheduleId: null,
    description: renderBookingItemInvoiceLineDescription(item),
    quantity: item.quantity,
    unitPriceCents:
      item.unitSellAmountCents ??
      (item.totalSellAmountCents !== null && item.totalSellAmountCents !== undefined
        ? Math.floor(item.totalSellAmountCents / quantity)
        : 0),
    totalCents,
    taxAmountCents: 0,
    taxRate:
      firstTaxWithRate?.rateBasisPoints != null
        ? Math.round(firstTaxWithRate.rateBasisPoints / 100)
        : null,
    sortOrder,
  }
}

export function renderBookingItemInvoiceLineDescription(
  item: InvoiceFromBookingData["items"][number],
) {
  const base = resolveBookingItemDisplayName(item) ?? item.title
  const dates = formatInvoiceLineDateRange(
    resolveBookingItemStartDate(item),
    resolveBookingItemEndDate(item),
  )

  return dates ? `${base} | ${dates}` : base
}

export function bookingPaymentScheduleToInvoiceLine(
  booking: InvoiceFromBookingData["booking"],
  schedule: NonNullable<InvoiceFromBookingData["paymentSchedule"]>,
  item: InvoiceFromBookingData["items"][number] | undefined,
  descriptionFormat: PaymentScheduleLineDescriptionFormat = "schedule_first",
): ResolvedInvoiceLine {
  const label = PAYMENT_SCHEDULE_LINE_LABELS[schedule.scheduleType]
  const percent = getPaymentSchedulePercent(booking, schedule)
  const head = percent != null && percent < 100 ? `${label} ${percent}%` : label
  const base = resolveBookingItemDisplayName(item) ?? `booking ${booking.bookingNumber}`
  const dates = formatInvoiceLineDateRange(
    item ? (resolveBookingItemStartDate(item) ?? booking.startDate) : booking.startDate,
    item ? (resolveBookingItemEndDate(item) ?? booking.endDate) : booking.endDate,
  )

  return {
    bookingItemId: schedule.bookingItemId ?? null,
    bookingPaymentScheduleId: schedule.id,
    description: renderPaymentScheduleLineDescription({ base, dates, head, descriptionFormat }),
    quantity: 1,
    unitPriceCents: schedule.amountCents,
    totalCents: schedule.amountCents,
    taxAmountCents: 0,
    taxRate: null,
    sortOrder: 0,
  }
}

export function renderPaymentScheduleLineDescription(input: {
  head: string
  base: string
  dates: string | null
  descriptionFormat: PaymentScheduleLineDescriptionFormat
}) {
  switch (input.descriptionFormat) {
    case "product_only":
      return input.dates ? `${input.base} | ${input.dates}` : input.base
    case "product_first":
      return input.dates
        ? `${input.base} - ${input.head} | ${input.dates}`
        : `${input.base} - ${input.head}`
    case "schedule_first":
      return input.dates
        ? `${input.head} ${input.base} | ${input.dates}`
        : `${input.head} ${input.base}`
  }
}

export function resolvePaymentScheduleDisplayItem(
  schedule: NonNullable<InvoiceFromBookingData["paymentSchedule"]>,
  items: InvoiceFromBookingData["items"],
) {
  if (schedule.bookingItemId) {
    return items.find((item) => item.id === schedule.bookingItemId)
  }

  const namedItems = items.filter((item) => resolveBookingItemDisplayName(item))
  return [...(namedItems.length > 0 ? namedItems : items)].sort(
    compareBookingItemsForScheduleDisplay,
  )[0]
}

export function resolveBookingItemDisplayName(
  item: InvoiceFromBookingData["items"][number] | undefined,
) {
  return (
    item?.productNameSnapshot?.trim() || item?.productName?.trim() || item?.title?.trim() || null
  )
}

export function resolveBookingItemStartDate(item: InvoiceFromBookingData["items"][number]) {
  return item.startDate ?? item.serviceDate ?? item.startsAt
}

export function resolveBookingItemEndDate(item: InvoiceFromBookingData["items"][number]) {
  return item.endDate ?? item.endsAt ?? item.serviceDate ?? resolveBookingItemStartDate(item)
}

export function compareBookingItemsForScheduleDisplay(
  left: InvoiceFromBookingData["items"][number],
  right: InvoiceFromBookingData["items"][number],
) {
  return (
    compareNullableStrings(
      resolveBookingItemDateSortKey(left),
      resolveBookingItemDateSortKey(right),
    ) ||
    compareNullableStrings(
      resolveBookingItemDisplayName(left),
      resolveBookingItemDisplayName(right),
    ) ||
    left.id.localeCompare(right.id)
  )
}

export function resolveBookingItemDateSortKey(item: InvoiceFromBookingData["items"][number]) {
  return (
    toDateOnly(resolveBookingItemStartDate(item)) ?? toDateOnly(resolveBookingItemEndDate(item))
  )
}

export function compareNullableStrings(left: string | null, right: string | null) {
  if (left && right) return left.localeCompare(right)
  if (left) return -1
  if (right) return 1
  return 0
}

export function getPaymentSchedulePercent(
  booking: InvoiceFromBookingData["booking"],
  schedule: NonNullable<InvoiceFromBookingData["paymentSchedule"]>,
) {
  if (!booking.sellAmountCents || booking.sellAmountCents <= 0) return null
  return Math.round((schedule.amountCents / booking.sellAmountCents) * 100)
}

export function formatInvoiceLineDateRange(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
) {
  const start = toDateOnly(startDate)
  const end = toDateOnly(endDate)
  if (!start) return null
  if (!end || end === start) return start
  return `${start} - ${end}`
}

export function toDateOnly(value: string | Date | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

export function invoiceFromBookingOverrideLineItems(
  lineItems: NonNullable<CreateInvoiceFromBookingInput["lineItems"]>,
): ResolvedInvoiceLine[] {
  return lineItems.map((line, sortOrder) => {
    const lineSubtotalCents = line.quantity * line.unitAmountCents
    const taxAmountCents =
      line.taxAmountCents ??
      (line.taxRateBps != null ? Math.round((lineSubtotalCents * line.taxRateBps) / 10_000) : 0)

    return {
      bookingItemId: null as string | null,
      bookingPaymentScheduleId: null as string | null,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitAmountCents,
      totalCents: lineSubtotalCents,
      taxAmountCents,
      taxRate: line.taxRateBps != null ? Math.round(line.taxRateBps / 100) : null,
      sortOrder,
    }
  })
}

export async function resolveInvoiceLineDescriptions(
  lineItems: ResolvedInvoiceLine[],
  context: {
    booking: InvoiceFromBookingData["booking"]
    paymentSchedule?: NonNullable<InvoiceFromBookingData["paymentSchedule"]> | null
    items: InvoiceFromBookingData["items"]
    descriptionResolver?: InvoiceLineDescriptionResolver
  },
) {
  if (!context.descriptionResolver) return lineItems
  const scheduleItem = context.paymentSchedule
    ? resolvePaymentScheduleDisplayItem(context.paymentSchedule, context.items)
    : undefined

  return Promise.all(
    lineItems.map(async (line) => ({
      ...line,
      description:
        (await context.descriptionResolver?.({
          booking: context.booking,
          schedule: context.paymentSchedule ?? undefined,
          item: context.paymentSchedule
            ? scheduleItem
            : context.items.find((item) => item.id === line.bookingItemId),
          line,
        })) ?? line.description,
    })),
  )
}

export async function resolveInvoiceFromBookingDueDate(
  data: CreateInvoiceFromBookingInput,
  bookingData: InvoiceFromBookingData,
  runtime: FinanceServiceRuntime,
) {
  if (!runtime.invoiceDueDateResolver) return data.dueDate

  const dueDate = await runtime.invoiceDueDateResolver({
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    invoiceType: data.invoiceType ?? "invoice",
    booking: bookingData.booking,
    bookingPaymentSchedule:
      bookingData.paymentSchedule ?? bookingData.dueDatePaymentSchedule ?? undefined,
  })

  if (!dueDate) {
    throw new InvoiceFromBookingValidationError(
      "Invoice due date resolver returned an empty date",
      {
        issueDate: data.issueDate,
        dueDate: data.dueDate,
      },
    )
  }

  return dueDate
}

export function assertInvoiceFromBookingOverrideTotals(
  data: CreateInvoiceFromBookingInput,
  totals: { subtotalCents: number; taxCents: number; totalCents: number },
) {
  if (data.subtotalCents !== undefined && data.subtotalCents !== totals.subtotalCents) {
    throw new InvoiceFromBookingValidationError("Invoice subtotal does not match line items", {
      expectedSubtotalCents: totals.subtotalCents,
      subtotalCents: data.subtotalCents,
    })
  }

  if (data.taxCents !== undefined && data.taxCents !== totals.taxCents) {
    throw new InvoiceFromBookingValidationError("Invoice tax does not match line items", {
      expectedTaxCents: totals.taxCents,
      taxCents: data.taxCents,
    })
  }

  if (data.totalCents !== undefined && data.totalCents !== totals.totalCents) {
    throw new InvoiceFromBookingValidationError("Invoice total does not match subtotal plus tax", {
      expectedTotalCents: totals.totalCents,
      totalCents: data.totalCents,
    })
  }
}

export function normalizeCurrencyCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? null
}

export function invoiceFromBookingExternalRefValues(
  invoiceId: string,
  refs: NonNullable<CreateInvoiceFromBookingInput["externalRefs"]>,
) {
  return refs.map((ref) => ({
    invoiceId,
    provider: ref.provider,
    externalId: ref.externalId ?? null,
    externalNumber: ref.externalNumber ?? null,
    externalUrl: ref.externalUrl ?? null,
    status: ref.status ?? null,
    metadata: ref.metadata ?? null,
    syncedAt: toTimestamp(ref.syncedAt),
    syncError: ref.syncError ?? null,
  }))
}

export function resolveBookingInvoiceBaseAmount(
  booking: InvoiceFromBookingData["booking"],
  invoiceCurrency: string,
  amountCents: number,
) {
  if (!booking.baseCurrency) return null
  if (invoiceCurrency === booking.baseCurrency) return amountCents
  if (invoiceCurrency !== booking.sellCurrency || booking.baseSellAmountCents == null) return null
  if (!booking.sellAmountCents || booking.sellAmountCents <= 0) return booking.baseSellAmountCents
  return Math.round((amountCents / booking.sellAmountCents) * booking.baseSellAmountCents)
}

export function toTimestamp(value?: string | null) {
  return value ? new Date(value) : null
}

export function toDateString(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function readStringMetadata(value: unknown, key: string) {
  if (value == null || typeof value !== "object") return null
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === "string" && candidate.trim() ? candidate : null
}

export function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export function parseDateString(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

export function derivePaymentSessionTarget(
  input: CreatePaymentSessionInput | UpdatePaymentSessionInput,
) {
  const explicitTarget = "target" in input ? input.target : undefined
  if (explicitTarget) {
    switch (explicitTarget.type) {
      case "booking":
        return { targetType: "booking" as const, targetId: explicitTarget.bookingId }
      case "invoice":
        return { targetType: "invoice" as const, targetId: explicitTarget.invoiceId }
      case "booking_payment_schedule":
        return {
          targetType: "booking_payment_schedule" as const,
          targetId: explicitTarget.bookingPaymentScheduleId,
        }
      case "booking_guarantee":
        return {
          targetType: "booking_guarantee" as const,
          targetId: explicitTarget.bookingGuaranteeId,
        }
      case "flight_order":
        return { targetType: "flight_order" as const, targetId: explicitTarget.flightOrderId }
      case "legacy_order":
        return { targetType: "order" as const, targetId: explicitTarget.legacyOrderId }
      case "program":
        return { targetType: "other" as const, targetId: explicitTarget.programId }
      case "supplier_settlement":
        return { targetType: "other" as const, targetId: explicitTarget.supplierSettlementId }
      case "channel_settlement":
        return { targetType: "other" as const, targetId: explicitTarget.channelSettlementId }
      case "provider_reference":
        return { targetType: "other" as const, targetId: explicitTarget.reference }
    }
  }

  const legacyOrderId = input.legacyOrderId ?? null

  if (input.targetType && input.targetType !== "other") {
    return {
      targetType: input.targetType,
      targetId:
        input.targetId ??
        (input.targetType === "booking"
          ? input.bookingId
          : input.targetType === "order"
            ? legacyOrderId
            : input.targetType === "invoice"
              ? input.invoiceId
              : input.targetType === "booking_payment_schedule"
                ? input.bookingPaymentScheduleId
                : input.targetType === "booking_guarantee"
                  ? input.bookingGuaranteeId
                  : input.targetId),
    }
  }

  if (input.bookingPaymentScheduleId) {
    return {
      targetType: "booking_payment_schedule" as const,
      targetId: input.bookingPaymentScheduleId,
    }
  }
  if (input.bookingGuaranteeId) {
    return { targetType: "booking_guarantee" as const, targetId: input.bookingGuaranteeId }
  }
  if (input.invoiceId) {
    return { targetType: "invoice" as const, targetId: input.invoiceId }
  }
  if (legacyOrderId) {
    return { targetType: "order" as const, targetId: legacyOrderId }
  }
  if (input.bookingId) {
    return { targetType: "booking" as const, targetId: input.bookingId }
  }

  return {
    targetType: (input.targetType ?? "other") as CreatePaymentSessionInput["targetType"],
    targetId: input.targetId ?? null,
  }
}

// ============================================================================
// Invoice number allocation (transactional)
// ============================================================================

export function currentPeriodBoundary(
  strategy: "never" | "annual" | "monthly",
  now: Date,
): Date | null {
  if (strategy === "never") return null
  if (strategy === "annual") {
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  }
  // monthly
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export function formatNumber(
  prefix: string,
  separator: string,
  padLength: number,
  sequence: number,
): string {
  const padded = String(sequence).padStart(padLength, "0")
  return `${prefix}${separator}${padded}`
}

export function invoiceScopeForType(invoiceType: CreateInvoiceFromBookingInput["invoiceType"]) {
  return invoiceType === "proforma" ? "proforma" : "invoice"
}

export function pendingExternalInvoiceNumber(scope: InvoiceNumberScope) {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? randomId()
  return `PENDING-${scope.toUpperCase()}-${uuid.slice(0, 32)}`
}

export function randomId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(32, "0")
}

export function renderInvoiceBody(
  body: string,
  bodyFormat: "html" | "markdown" | "lexical_json",
  variables: Record<string, unknown>,
): string {
  return renderStructuredTemplate(body, bodyFormat, variables)
}

export async function paginate<T extends object>(
  rowsQuery: Promise<T[]>,
  countQuery: Promise<Array<{ count: number }>>,
  limit: number,
  offset: number,
) {
  const [data, countResult] = await Promise.all([rowsQuery, countQuery])
  return listResponse(data, { total: countResult[0]?.count ?? 0, limit, offset })
}

export async function touchLinkedBookingUpdatedAt(
  db: PostgresJsDatabase,
  bookingId: string | null | undefined,
  now = new Date(),
) {
  if (!bookingId) return
  await db.update(bookings).set({ updatedAt: now }).where(eq(bookings.id, bookingId))
}

/**
 * Runtime context for finance service methods that need to emit lifecycle
 * events (e.g. `invoice.settled`). Optional — methods fall back to a no-op
 * when no eventBus is provided, so direct callers (tests, scripts) don't
 * have to wire one up.
 */
export interface FinanceServiceRuntime extends InvoiceFxOptions {
  eventBus?: EventBus
  monthlyBookingLimit?: number | null
  actionLedgerContext?: ActionLedgerRequestContextValues
  actionLedgerAuthorizationSource?: string | null
  actionLedgerActionName?: string | null
  actionLedgerRouteOrToolName?: string | null
  actionLedgerTargetType?: string | null
  actionLedgerTargetId?: string | null
  actionLedgerCapabilityId?: string | null
  actionLedgerCapabilityVersion?: string | null
  actionLedgerEvaluatedRisk?: "low" | "medium" | "high" | "critical" | null
  actionLedgerCausationActionId?: string | null
  actionLedgerApprovalId?: string | null
  actionLedgerIdempotencyScope?: string | null
  actionLedgerIdempotencyKey?: string | null
  actionLedgerIdempotencyFingerprint?: string | null
  descriptionResolver?: InvoiceLineDescriptionResolver
  invoiceDueDateResolver?: InvoiceDueDateResolver
  paymentScheduleLineDescriptionFormat?: PaymentScheduleLineDescriptionFormat
}

export interface InvoiceVoidedEvent {
  invoiceId: string
  invoiceNumber: string
  invoiceType: (typeof invoices.$inferSelect)["invoiceType"]
  bookingId: string | null
  totalCents: number
  currency: string
  reason: string | null
  voidedAt: string
  /** @deprecated External app projections do not expose provider routing fields. */
  externalProvider?: string | null
  /** @deprecated External app projections do not expose provider numbering fields. */
  externalNumber?: string | null
  /** @deprecated External app projections do not expose provider series fields. */
  externalSeriesName?: string | null
  /** Canonical emitters always set this; optional preserves the v1 source contract. */
  occurredAt?: string
}

export interface BookingPaymentSchedulePaidEvent {
  bookingId: string
  bookingPaymentScheduleId: string
  paymentSessionId: string
  paymentId: string | null
  scheduleType: (typeof bookingPaymentSchedules.$inferSelect)["scheduleType"]
  amountCents: number
  currency: string
  provider: string | null
}

export interface PaymentCompletedEvent {
  paymentSessionId: string
  targetType: (typeof paymentSessions.$inferSelect)["targetType"]
  targetId: string | null
  bookingId: string | null
  legacyOrderId: string | null
  invoiceId: string | null
  bookingPaymentScheduleId: string | null
  bookingGuaranteeId: string | null
  amountCents: number
  currency: string
  provider: string | null
}

export interface InvoicePaymentRecordedEvent {
  invoiceId: string
  invoiceNumber: string
  invoiceType: (typeof invoices.$inferSelect)["invoiceType"]
  bookingId: string | null
  invoiceCurrency: string
  invoiceTotalCents: number
  invoicePaidCents: number
  invoiceBalanceDueCents: number
  paymentId: string
  amountCents: number
  currency: string
  baseCurrency: string | null
  baseAmountCents: number | null
  paymentMethod: (typeof payments.$inferSelect)["paymentMethod"]
  status: (typeof payments.$inferSelect)["status"]
  referenceNumber: string | null
  paymentDate: string
  /** Canonical emitters always set this; optional preserves the v1 source contract. */
  occurredAt?: string
}

export type BookingGuaranteeRecord = typeof bookingGuarantees.$inferSelect

export interface BindInvoiceRenditionInput {
  templateId?: string | null
  format: (typeof invoiceRenditions.$inferSelect)["format"]
  storageKey?: string | null
  contentType: string
  fileSize?: number | null
  checksum?: string | null
  language?: string | null
  generatedAt?: string | null
  appProvider?: string | null
  appIdempotencyDigest?: string | null
  appFileName?: string | null
  metadata?: Record<string, unknown> | null
  replaceExisting?: boolean
}

export interface InvoiceRenderedEvent {
  invoiceId: string
  invoiceStatus: (typeof invoices.$inferSelect)["status"]
  invoiceType: (typeof invoices.$inferSelect)["invoiceType"]
  renditionId: string
  format: (typeof invoiceRenditions.$inferSelect)["format"]
  storageKey: string | null
  contentType: string
  byteSize: number | null
  contentHash: string | null
}

export function buildBookingPaymentSchedulePaidEvent(
  schedule: typeof bookingPaymentSchedules.$inferSelect,
  session: typeof paymentSessions.$inferSelect,
  paymentId: string | null,
): BookingPaymentSchedulePaidEvent {
  return {
    bookingId: schedule.bookingId,
    bookingPaymentScheduleId: schedule.id,
    paymentSessionId: session.id,
    paymentId,
    scheduleType: schedule.scheduleType,
    amountCents: schedule.amountCents,
    currency: schedule.currency,
    provider: session.provider,
  }
}

export function buildPaymentCompletedEvent(
  session: typeof paymentSessions.$inferSelect,
): PaymentCompletedEvent {
  return {
    paymentSessionId: session.id,
    targetType: session.targetType,
    targetId: session.targetId,
    bookingId: session.bookingId,
    legacyOrderId: session.orderId,
    invoiceId: session.invoiceId,
    bookingPaymentScheduleId: session.bookingPaymentScheduleId,
    bookingGuaranteeId: session.bookingGuaranteeId,
    amountCents: session.amountCents,
    currency: session.currency,
    provider: session.provider,
  }
}

export interface RawUnifiedPaymentRow {
  kind: "customer" | "supplier"
  id: string
  invoice_id: string | null
  invoice_number: string | null
  booking_id: string | null
  booking_number: string | null
  supplier_id: string | null
  supplier_name: string | null
  person_id: string | null
  person_first_name: string | null
  person_last_name: string | null
  organization_id: string | null
  organization_name: string | null
  amount_cents: number
  currency: string
  base_currency: string | null
  base_amount_cents: number | null
  payment_method: string
  status: string
  reference_number: string | null
  payment_date: string
  notes: string | null
  created_at: Date | string
  updated_at: Date | string
}

/**
 * Normalize `db.execute(sql)` results across drizzle drivers.
 * `drizzle-orm/postgres-js` returns rows directly (an array), while
 * `drizzle-orm/node-postgres` (used by the operator starter against a
 * local pg server) and `drizzle-orm/neon-serverless` return pg's
 * `QueryResult<T>` wrapper with `.rows`. Casting to `Array<T>` and
 * calling `.map` blows up under the wrapper shape — surface the rows
 * regardless of which driver is bound.
 */
export function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows
    return Array.isArray(rows) ? (rows as T[]) : []
  }
  return []
}

export function mapRawPayment(row: RawUnifiedPaymentRow): UnifiedPaymentRow {
  // Person display name: "First Last", trimmed. Falls back to null when both
  // halves are missing so the UI can swap to organization or hide the field.
  const personName =
    row.person_first_name || row.person_last_name
      ? `${row.person_first_name ?? ""} ${row.person_last_name ?? ""}`.trim() || null
      : null

  return {
    kind: row.kind,
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    bookingId: row.booking_id,
    bookingNumber: row.booking_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    personId: row.person_id,
    personName,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    amountCents: row.amount_cents,
    currency: row.currency,
    baseCurrency: row.base_currency,
    baseAmountCents: row.base_amount_cents,
    paymentMethod: row.payment_method,
    status: row.status,
    referenceNumber: row.reference_number,
    paymentDate: row.payment_date,
    notes: row.notes,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  }
}

export function paymentSettlementAmountSql(invoiceCurrency: string) {
  return sql<number>`
    coalesce(
      sum(
        case
          when ${payments.currency} = ${invoiceCurrency} then ${payments.amountCents}
          when ${payments.baseCurrency} = ${invoiceCurrency} then coalesce(${payments.baseAmountCents}, 0)
          else 0
        end
      ),
      0
    )::int
  `
}

export async function recomputeInvoiceTotalsAfterPaymentChange(
  tx: PostgresJsDatabase,
  invoice: typeof invoices.$inferSelect,
) {
  const [sumResult] = await tx
    .select({ total: paymentSettlementAmountSql(invoice.currency) })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, "completed")))

  const paidCents = sumResult?.total ?? 0
  const balanceDueCents = Math.max(0, invoice.totalCents - paidCents)

  let nextStatus = invoice.status
  if (invoice.status !== "void" && invoice.status !== "draft") {
    if (paidCents >= invoice.totalCents && invoice.totalCents > 0) {
      nextStatus = "paid"
    } else if (paidCents > 0) {
      nextStatus = "partially_paid"
    } else if (invoice.status === "paid" || invoice.status === "partially_paid") {
      nextStatus = "issued"
    }
  }

  await tx
    .update(invoices)
    .set({ paidCents, balanceDueCents, status: nextStatus, updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id))
}

export async function assertInvoiceAcceptsNewPayment(
  db: PostgresJsDatabase,
  invoice: typeof invoices.$inferSelect,
) {
  if (invoice.status !== "void") return

  let redirectInvoiceId: string | null = null
  let redirectInvoiceNumber: string | null = null
  if (invoice.invoiceType === "proforma") {
    const [successor] = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.convertedFromInvoiceId, invoice.id))
      .limit(1)
    redirectInvoiceId = successor?.id ?? null
    redirectInvoiceNumber = successor?.invoiceNumber ?? null
  }

  throw new PaymentValidationError(
    redirectInvoiceId
      ? `This proforma was converted to invoice ${redirectInvoiceNumber ?? redirectInvoiceId}; record the payment there instead.`
      : `Cannot record payment against voided invoice ${invoice.id}.`,
    {
      invoiceId: invoice.id,
      ...(redirectInvoiceId ? { redirectInvoiceId, redirectInvoiceNumber } : {}),
    },
    { status: 409, code: "invoice_void" },
  )
}

export function assertPaymentCanSettleInvoice(invoiceCurrency: string, data: CreatePaymentInput) {
  if (data.status !== "completed" || data.currency === invoiceCurrency) {
    return
  }

  if (data.baseCurrency === invoiceCurrency && data.baseAmountCents && data.baseAmountCents > 0) {
    return
  }

  throw new PaymentValidationError(
    "Completed cross-currency payments require a base amount in the invoice currency",
    {
      invoiceCurrency,
      paymentCurrency: data.currency,
      fields: ["baseCurrency", "baseAmountCents"],
    },
  )
}

export async function getPaymentFromReplayedLedgerEntry(db: AnyDrizzleDb, actionId: string) {
  const [detail] = await db
    .select({ commandResultRef: actionMutationDetails.commandResultRef })
    .from(actionMutationDetails)
    .where(eq(actionMutationDetails.actionId, actionId))
    .limit(1)
  const paymentId = parsePaymentCommandResultRef(detail?.commandResultRef ?? null)

  if (!paymentId) {
    throw new Error(`Replayed payment ledger entry ${actionId} did not reference a payment`)
  }

  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
  if (!payment) {
    throw new Error(
      `Replayed payment ledger entry ${actionId} referenced missing payment ${paymentId}`,
    )
  }

  return payment
}

export function parsePaymentCommandResultRef(commandResultRef: string | null): string | null {
  const prefix = "payment:"
  if (!commandResultRef?.startsWith(prefix)) return null
  const paymentId = commandResultRef.slice(prefix.length).trim()
  return paymentId ? paymentId : null
}

export function shouldNormalizeBaseAmount(data: {
  amountCents?: number | null
  currency?: string | null
  baseCurrency?: string | null
  baseAmountCents?: number | null
  fxRateSetId?: string | null
  paymentDate?: string | null
}) {
  return (
    data.amountCents !== undefined ||
    data.currency !== undefined ||
    data.baseCurrency !== undefined ||
    data.baseAmountCents !== undefined ||
    data.fxRateSetId !== undefined ||
    data.paymentDate !== undefined
  )
}

export async function resolveSupplierPaymentUpdateData(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateSupplierPaymentInput,
  runtime: FinanceServiceRuntime,
): Promise<UpdateSupplierPaymentInput | null> {
  const [existing] = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.id, id))
    .limit(1)
  if (!existing) return null
  if (!shouldNormalizeBaseAmount(data)) return data

  const bookingId = data.bookingId ?? existing.bookingId
  const supplierInvoiceId = data.supplierInvoiceId ?? existing.supplierInvoiceId
  let targetBaseCurrency: string | null = null
  let fallbackFxRateSetId: string | null = null
  if (bookingId) {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
    targetBaseCurrency = booking?.baseCurrency ?? null
    fallbackFxRateSetId = booking?.fxRateSetId ?? null
  } else if (supplierInvoiceId) {
    const [invoice] = await db
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, supplierInvoiceId))
      .limit(1)
    targetBaseCurrency = invoice?.baseCurrency ?? null
    fallbackFxRateSetId = invoice?.fxRateSetId ?? null
  }
  const normalized = await resolveFxMoneyBaseAmount(
    db,
    {
      amountCents: data.amountCents ?? existing.amountCents,
      currency: data.currency ?? existing.currency,
      baseCurrency: data.baseCurrency ?? existing.baseCurrency,
      baseAmountCents: data.baseAmountCents ?? null,
      fxRateSetId: data.fxRateSetId ?? existing.fxRateSetId,
    },
    {
      ...runtime,
      targetBaseCurrency,
      fallbackFxRateSetId,
      date: data.paymentDate ?? existing.paymentDate,
    },
  )

  return {
    ...data,
    baseCurrency: normalized.baseCurrency ?? null,
    baseAmountCents: normalized.baseAmountCents ?? null,
    fxRateSetId: normalized.fxRateSetId ?? null,
  }
}

export async function resolveCreditNoteUpdateData(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateCreditNoteInput,
  runtime: FinanceServiceRuntime,
): Promise<UpdateCreditNoteInput | null> {
  const [existing] = await db.select().from(creditNotes).where(eq(creditNotes.id, id)).limit(1)
  if (!existing) return null
  if (!shouldNormalizeBaseAmount(data)) return data

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, existing.invoiceId))
    .limit(1)
  if (!invoice) return null

  const normalized = await resolveFxMoneyBaseAmount(
    db,
    {
      amountCents: data.amountCents ?? existing.amountCents,
      currency: data.currency ?? existing.currency,
      baseCurrency: data.baseCurrency ?? existing.baseCurrency,
      baseAmountCents: data.baseAmountCents ?? null,
      fxRateSetId: data.fxRateSetId ?? existing.fxRateSetId,
    },
    {
      ...runtime,
      targetBaseCurrency: invoice.currency,
      fallbackFxRateSetId: invoice.fxRateSetId ?? null,
      date: new Date(),
    },
  )

  return {
    ...data,
    baseCurrency: normalized.baseCurrency ?? null,
    baseAmountCents: normalized.baseAmountCents ?? null,
    fxRateSetId: normalized.fxRateSetId ?? null,
  }
}

export async function resolveInvoiceForPaymentSession(
  db: PostgresJsDatabase,
  session: typeof paymentSessions.$inferSelect,
) {
  if (session.invoiceId) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, session.invoiceId))
    return invoice ?? null
  }

  if (!session.bookingPaymentScheduleId) {
    return null
  }

  const [schedule] = await db
    .select()
    .from(bookingPaymentSchedules)
    .where(eq(bookingPaymentSchedules.id, session.bookingPaymentScheduleId))
    .limit(1)

  if (!schedule) {
    return null
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.bookingId, schedule.bookingId),
        eq(invoices.currency, schedule.currency),
        ne(invoices.status, "void"),
        gt(invoices.balanceDueCents, 0),
      ),
    )
    .orderBy(desc(invoices.createdAt))
    .limit(1)

  return invoice ?? null
}

export async function assertBookingPaymentScheduleHasPaymentCoverage(
  db: PostgresJsDatabase,
  schedule: Pick<
    typeof bookingPaymentSchedules.$inferSelect,
    "id" | "bookingId" | "amountCents" | "currency"
  >,
) {
  // Sum every completed payment recorded against this booking's invoices
  // and convert to the schedule's currency:
  //   - same-currency payments contribute their `amountCents`
  //   - cross-currency payments contribute their `baseAmountCents` when
  //     `baseCurrency` matches the schedule (the BookingPaymentsSummary
  //     "FX equivalent" column already exposes this conversion to the
  //     operator, so reusing it here keeps the math consistent)
  // We then subtract any *other* schedules already flagged paid in the
  // same currency, so the operator can't double-count payments by
  // marking multiple schedules paid when only one schedule's worth of
  // money actually came in.
  const paymentRows = await db
    .select({
      amountCents: payments.amountCents,
      currency: payments.currency,
      baseCurrency: payments.baseCurrency,
      baseAmountCents: payments.baseAmountCents,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(eq(invoices.bookingId, schedule.bookingId), eq(payments.status, "completed")))

  const totalPaidInScheduleCurrency = paymentRows.reduce((sum, payment) => {
    if (payment.currency === schedule.currency) return sum + payment.amountCents
    if (payment.baseCurrency === schedule.currency && typeof payment.baseAmountCents === "number") {
      return sum + payment.baseAmountCents
    }
    return sum
  }, 0)

  const otherPaidSchedules = await db
    .select({ amountCents: bookingPaymentSchedules.amountCents })
    .from(bookingPaymentSchedules)
    .where(
      and(
        eq(bookingPaymentSchedules.bookingId, schedule.bookingId),
        eq(bookingPaymentSchedules.status, "paid"),
        eq(bookingPaymentSchedules.currency, schedule.currency),
        ne(bookingPaymentSchedules.id, schedule.id),
      ),
    )

  const alreadyClaimed = otherPaidSchedules.reduce((sum, row) => sum + row.amountCents, 0)
  const availableCoverage = totalPaidInScheduleCurrency - alreadyClaimed

  if (availableCoverage < schedule.amountCents) {
    throw new PaymentValidationError(
      "Cannot mark booking payment schedule as paid without linked completed payment coverage",
      {
        scheduleId: schedule.id,
        bookingId: schedule.bookingId,
        requiredCents: schedule.amountCents,
        coveredCents: availableCoverage,
        currency: schedule.currency,
      },
    )
  }
}

export async function settleCoveredBookingPaymentSchedules(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<Array<typeof bookingPaymentSchedules.$inferSelect>> {
  return db.transaction(async (tx) => {
    const schedules = await tx
      .select()
      .from(bookingPaymentSchedules)
      .where(
        and(
          eq(bookingPaymentSchedules.bookingId, bookingId),
          or(
            eq(bookingPaymentSchedules.status, "pending"),
            eq(bookingPaymentSchedules.status, "due"),
          ),
        ),
      )
      .orderBy(asc(bookingPaymentSchedules.dueDate), asc(bookingPaymentSchedules.createdAt))

    const paidSchedules: Array<typeof bookingPaymentSchedules.$inferSelect> = []
    for (const schedule of schedules) {
      try {
        await assertBookingPaymentScheduleHasPaymentCoverage(tx, schedule)
      } catch (error) {
        if (error instanceof PaymentValidationError) break
        throw error
      }

      const [paidSchedule] = await tx
        .update(bookingPaymentSchedules)
        .set({ status: "paid", updatedAt: new Date() })
        .where(
          and(
            eq(bookingPaymentSchedules.id, schedule.id),
            or(
              eq(bookingPaymentSchedules.status, "pending"),
              eq(bookingPaymentSchedules.status, "due"),
            ),
          ),
        )
        .returning()
      if (paidSchedule) paidSchedules.push(paidSchedule)
    }

    return paidSchedules
  })
}
