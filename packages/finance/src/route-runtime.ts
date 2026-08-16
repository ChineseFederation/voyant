import {
  type MonthlyBookingLimitResolver,
  resolveMonthlyBookingLimit,
  selectMonthlyBookingLimit,
} from "@voyant-travel/bookings"
import type { EventBus } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { FinanceInvoiceDocumentProvider } from "./contracts/invoice-document-provider.js"
import type { InvoiceFxOptions } from "./invoice-fx.js"
import type { RefundSettlementExecutionResult } from "./refund-settlement-execution.js"
import type { FinanceDocumentRouteOptions } from "./routes-documents.js"
import type { FinanceSettlementRouteOptions, InvoiceSettlementPoller } from "./routes-settlement.js"
import type {
  InvoiceDueDateResolver,
  InvoiceLineDescriptionResolver,
  PaymentScheduleLineDescriptionFormat,
} from "./service.js"
import type { InvoiceDocumentGenerator } from "./service-documents.js"

export type FinanceRouteRuntime = {
  /**
   * The monthly booking allowance in force for the booking this runtime is
   * about to create. Read per use — when a host installs
   * `resolveMonthlyBookingLimit` this is an accessor over live entitlement,
   * and copying it into a local re-freezes it.
   */
  readonly monthlyBookingLimit?: number | null
  invoiceDocumentGenerator?: InvoiceDocumentGenerator
  /**
   * The graph-selected invoice document provider. Present exactly when the
   * deployment fulfilled finance's `document-renderer` and `document-storage`
   * resources, which is what lets the render route produce the document inline
   * instead of leaving the caller waiting on the recovery job (voyant#4668).
   */
  invoiceDocumentProvider?: FinanceInvoiceDocumentProvider
  resolveCustomFields?: FinanceDocumentRouteOptions["resolveCustomFields"]
  resolveDocumentDownloadUrl?: FinanceDocumentRouteOptions["resolveDocumentDownloadUrl"]
  invoiceSettlementPollers: Record<string, InvoiceSettlementPoller>
  eventBus?: EventBus
  descriptionResolver?: InvoiceLineDescriptionResolver
  invoiceDueDateResolver?: InvoiceDueDateResolver
  paymentScheduleLineDescriptionFormat?: PaymentScheduleLineDescriptionFormat
  /**
   * Drive a recorded `processor_reversal` refund through the deployment's
   * payment adapter (voyant#4303). Absent when no adapter is selected — which
   * is the ordinary case for a deployment that refunds by bank transfer, and
   * why the settlement record does not depend on it.
   */
  executeRefundSettlement?: ExecuteRefundSettlement
} & InvoiceFxOptions

export type ExecuteRefundSettlement = (input: {
  bindings: unknown
  db: PostgresJsDatabase
  refundSettlementId: string
  eventBus?: EventBus
}) => Promise<RefundSettlementExecutionResult>

export const FINANCE_ROUTE_RUNTIME_CONTAINER_KEY = "providers.finance.runtime"

export interface FinanceRuntimeOptions
  extends FinanceDocumentRouteOptions,
    FinanceSettlementRouteOptions,
    InvoiceFxOptions {
  descriptionResolver?: InvoiceLineDescriptionResolver
  invoiceDueDateResolver?: InvoiceDueDateResolver
  paymentScheduleLineDescriptionFormat?: PaymentScheduleLineDescriptionFormat
  /**
   * Per-request monthly booking allowance, for hosts whose plan entitlement
   * changes while the process runs. Same contract as the bookings runtime
   * option of the same name — finance creates bookings too, so both paths
   * have to consult the same live answer or a managed tenant gets one cap
   * from the booking routes and another from the finance routes.
   */
  resolveMonthlyBookingLimit?: MonthlyBookingLimitResolver
  /** Populated by `createFinanceRuntime` when a payment adapter is selected. */
  executeRefundSettlement?: ExecuteRefundSettlement
  /** Populated by `createFinanceRuntime` when a document provider is selected. */
  invoiceDocumentProvider?: FinanceInvoiceDocumentProvider
}

export function buildFinanceRouteRuntime(
  bindings: Record<string, unknown>,
  options: FinanceRuntimeOptions = {},
): FinanceRouteRuntime {
  const processEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> }
      }
    ).process?.env ?? {}
  const configuredMonthlyBookingLimit = resolveMonthlyBookingLimit({ ...processEnv, ...bindings })

  return {
    get monthlyBookingLimit() {
      return selectMonthlyBookingLimit(
        options.resolveMonthlyBookingLimit,
        configuredMonthlyBookingLimit,
      )
    },
    invoiceDocumentGenerator:
      options.resolveInvoiceDocumentGenerator?.(bindings) ?? options.invoiceDocumentGenerator,
    invoiceDocumentProvider: options.invoiceDocumentProvider,
    resolveCustomFields: options.resolveCustomFields,
    resolveDocumentDownloadUrl: options.resolveDocumentDownloadUrl,
    invoiceSettlementPollers:
      options.resolveInvoiceSettlementPollers?.(bindings) ?? options.invoiceSettlementPollers ?? {},
    eventBus: options.resolveEventBus?.(bindings) ?? options.eventBus,
    descriptionResolver: options.descriptionResolver,
    invoiceDueDateResolver: options.invoiceDueDateResolver,
    paymentScheduleLineDescriptionFormat: options.paymentScheduleLineDescriptionFormat,
    invoiceFxSettings: options.invoiceFxSettings,
    resolveInvoiceFxSettings: options.resolveInvoiceFxSettings,
    updateInvoiceFxSettings: options.updateInvoiceFxSettings,
    resolveInvoiceExchangeRate:
      options.resolveInvoiceExchangeRateResolver?.(bindings) ?? options.resolveInvoiceExchangeRate,
    resolveInvoiceExchangeRateResolver: options.resolveInvoiceExchangeRateResolver,
    captureFxRates: options.captureFxRates,
    onInvoiceFxResolutionError: options.onInvoiceFxResolutionError,
    executeRefundSettlement: options.executeRefundSettlement,
  }
}
