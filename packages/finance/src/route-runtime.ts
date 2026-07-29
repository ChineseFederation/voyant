import { resolveMonthlyBookingLimit } from "@voyant-travel/bookings"
import type { EventBus } from "@voyant-travel/core"

import type { InvoiceFxOptions } from "./invoice-fx.js"
import type { FinanceDocumentRouteOptions } from "./routes-documents.js"
import type { FinanceSettlementRouteOptions, InvoiceSettlementPoller } from "./routes-settlement.js"
import type {
  InvoiceDueDateResolver,
  InvoiceLineDescriptionResolver,
  PaymentScheduleLineDescriptionFormat,
} from "./service.js"
import type { InvoiceDocumentGenerator } from "./service-documents.js"

export type FinanceRouteRuntime = {
  monthlyBookingLimit?: number | null
  invoiceDocumentGenerator?: InvoiceDocumentGenerator
  resolveCustomFields?: FinanceDocumentRouteOptions["resolveCustomFields"]
  resolveDocumentDownloadUrl?: FinanceDocumentRouteOptions["resolveDocumentDownloadUrl"]
  invoiceSettlementPollers: Record<string, InvoiceSettlementPoller>
  eventBus?: EventBus
  descriptionResolver?: InvoiceLineDescriptionResolver
  invoiceDueDateResolver?: InvoiceDueDateResolver
  paymentScheduleLineDescriptionFormat?: PaymentScheduleLineDescriptionFormat
} & InvoiceFxOptions

export const FINANCE_ROUTE_RUNTIME_CONTAINER_KEY = "providers.finance.runtime"

export interface FinanceRuntimeOptions
  extends FinanceDocumentRouteOptions,
    FinanceSettlementRouteOptions,
    InvoiceFxOptions {
  descriptionResolver?: InvoiceLineDescriptionResolver
  invoiceDueDateResolver?: InvoiceDueDateResolver
  paymentScheduleLineDescriptionFormat?: PaymentScheduleLineDescriptionFormat
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

  return {
    monthlyBookingLimit: resolveMonthlyBookingLimit({ ...processEnv, ...bindings }),
    invoiceDocumentGenerator:
      options.resolveInvoiceDocumentGenerator?.(bindings) ?? options.invoiceDocumentGenerator,
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
    onInvoiceFxResolutionError: options.onInvoiceFxResolutionError,
  }
}
