"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UseAllPaymentsOptions } from "./hooks/use-all-payments.js"
import type { UseBookingGuaranteesOptions } from "./hooks/use-booking-guarantees.js"
import type { UseBookingPaymentSchedulesOptions } from "./hooks/use-booking-payment-schedules.js"
import type { UseInvoiceOptions } from "./hooks/use-invoice.js"
import type { UseInvoiceAttachmentsOptions } from "./hooks/use-invoice-attachments.js"
import type { UseInvoiceCreditNotesOptions } from "./hooks/use-invoice-credit-notes.js"
import type { UseInvoiceFxRateOptions } from "./hooks/use-invoice-fx-rate.js"
import type { UseInvoiceLineItemsOptions } from "./hooks/use-invoice-line-items.js"
import type { UseInvoiceNotesOptions } from "./hooks/use-invoice-notes.js"
import type { UseInvoiceNumberSeriesOptions } from "./hooks/use-invoice-number-series.js"
import type { UseInvoicePaymentsOptions } from "./hooks/use-invoice-payments.js"
import type { UseInvoicesOptions } from "./hooks/use-invoices.js"
import type { UsePaymentOptions } from "./hooks/use-payment.js"
import type { UsePaymentSessionsOptions } from "./hooks/use-payment-sessions.js"
import type { UseSupplierInvoiceOptions } from "./hooks/use-supplier-invoice.js"
import type { UseSupplierInvoicesOptions } from "./hooks/use-supplier-invoices.js"
import type { UseSupplierPaymentsOptions } from "./hooks/use-supplier-payments.js"
import { getInvoiceFxRate } from "./operations.js"
import { financeQueryKeys } from "./query-keys.js"
import {
  allPaymentsListResponse,
  bookingGuaranteesResponse,
  bookingPaymentSchedulesResponse,
  invoiceAttachmentsResponse,
  invoiceCreditNotesResponse,
  invoiceLineItemsResponse,
  invoiceListResponse,
  invoiceNotesResponse,
  invoiceNumberSeriesListResponse,
  invoicePaymentsResponse,
  invoiceSingleResponse,
  paymentSessionListResponse,
  paymentSingleResponse,
  supplierInvoiceAttachmentsResponse,
  supplierInvoiceListResponse,
  supplierInvoiceSingleResponse,
  supplierPaymentListResponse,
} from "./schemas.js"

export function getBookingPaymentSchedulesQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseBookingPaymentSchedulesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.bookingPaymentSchedules(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/finance/bookings/${bookingId}/payment-schedules`,
        bookingPaymentSchedulesResponse,
        client,
      ),
  })
}

export function getBookingGuaranteesQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseBookingGuaranteesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.bookingGuarantees(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/finance/bookings/${bookingId}/guarantees`,
        bookingGuaranteesResponse,
        client,
      ),
  })
}

export function getInvoiceFxRateQueryOptions(
  client: FetchWithValidationOptions,
  options: UseInvoiceFxRateOptions,
) {
  const { enabled: _enabled = true, ...input } = options

  return queryOptions({
    queryKey: financeQueryKeys.invoiceFxRate(input),
    queryFn: async () => {
      if (!input.baseCurrency || !input.quoteCurrency) {
        throw new Error("getInvoiceFxRateQueryOptions requires both currencies")
      }
      return getInvoiceFxRate(client, {
        baseCurrency: input.baseCurrency,
        quoteCurrency: input.quoteCurrency,
        date: input.date,
      })
    },
  })
}

export function getInvoicesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseInvoicesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.invoicesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      if (filters.bookingId) params.set("bookingId", filters.bookingId)
      if (filters.personId) params.set("personId", filters.personId)
      if (filters.organizationId) params.set("organizationId", filters.organizationId)
      if (filters.status) params.set("status", filters.status)
      if (filters.currency) params.set("currency", filters.currency)
      if (filters.dueDateFrom) params.set("dueDateFrom", filters.dueDateFrom)
      if (filters.dueDateTo) params.set("dueDateTo", filters.dueDateTo)
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/invoices${qs ? `?${qs}` : ""}`,
        invoiceListResponse,
        client,
      )
    },
  })
}

export function getSupplierInvoicesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseSupplierInvoicesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.supplierInvoicesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.supplierId) params.set("supplierId", filters.supplierId)
      if (filters.status) params.set("status", filters.status)
      if (filters.currency) params.set("currency", filters.currency)
      if (filters.dueDateFrom) params.set("dueDateFrom", filters.dueDateFrom)
      if (filters.dueDateTo) params.set("dueDateTo", filters.dueDateTo)
      if (filters.departureId) params.set("departureId", filters.departureId)
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.bookingId) params.set("bookingId", filters.bookingId)
      if (filters.search) params.set("search", filters.search)
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/supplier-invoices${qs ? `?${qs}` : ""}`,
        supplierInvoiceListResponse,
        client,
      )
    },
  })
}

export function getSupplierInvoiceQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseSupplierInvoiceOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.supplierInvoice(id ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/finance/supplier-invoices/${id}`,
        supplierInvoiceSingleResponse,
        client,
      ),
  })
}

export function getSupplierInvoicePaymentsQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: financeQueryKeys.supplierInvoicePayments(id ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/finance/supplier-invoices/${id}/payments`,
        supplierPaymentListResponse,
        client,
      ),
  })
}

export function getSupplierInvoiceAttachmentsQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: financeQueryKeys.supplierInvoiceAttachments(id ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/finance/supplier-invoices/${id}/attachments`,
        supplierInvoiceAttachmentsResponse,
        client,
      ),
  })
}

export function getInvoiceNumberSeriesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseInvoiceNumberSeriesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.invoiceNumberSeriesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.scope) params.set("scope", filters.scope)
      if (filters.active !== undefined) params.set("active", filters.active ? "true" : "false")
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/invoice-number-series${qs ? `?${qs}` : ""}`,
        invoiceNumberSeriesListResponse,
        client,
      )
    },
  })
}

export function getAllPaymentsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseAllPaymentsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.allPaymentsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.kind) params.set("kind", filters.kind)
      if (filters.status) params.set("status", filters.status)
      if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod)
      if (filters.currency) params.set("currency", filters.currency)
      if (filters.invoiceId) params.set("invoiceId", filters.invoiceId)
      if (filters.bookingId) params.set("bookingId", filters.bookingId)
      if (filters.supplierId) params.set("supplierId", filters.supplierId)
      if (filters.paymentDateFrom) params.set("paymentDateFrom", filters.paymentDateFrom)
      if (filters.paymentDateTo) params.set("paymentDateTo", filters.paymentDateTo)
      if (filters.search) params.set("search", filters.search)
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/payments${qs ? `?${qs}` : ""}`,
        allPaymentsListResponse,
        client,
      )
    },
  })
}

export function getPaymentSessionsQueryOptions(
  client: FetchWithValidationOptions,
  options: UsePaymentSessionsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.paymentSessionsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.bookingId) params.set("bookingId", filters.bookingId)
      if (filters.legacyOrderId) params.set("legacyOrderId", filters.legacyOrderId)
      if (filters.invoiceId) params.set("invoiceId", filters.invoiceId)
      if (filters.bookingPaymentScheduleId) {
        params.set("bookingPaymentScheduleId", filters.bookingPaymentScheduleId)
      }
      if (filters.bookingGuaranteeId) params.set("bookingGuaranteeId", filters.bookingGuaranteeId)
      if (filters.status) params.set("status", filters.status)
      if (filters.provider) params.set("provider", filters.provider)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/payment-sessions${qs ? `?${qs}` : ""}`,
        paymentSessionListResponse,
        client,
      )
    },
  })
}

export function getPaymentQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UsePaymentOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.payment(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getPaymentQueryOptions requires an id")
      return fetchWithValidation(`/v1/admin/finance/payments/${id}`, paymentSingleResponse, client)
    },
  })
}

export function getSupplierPaymentsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseSupplierPaymentsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.supplierPaymentsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.bookingId) params.set("bookingId", filters.bookingId)
      if (filters.supplierId) params.set("supplierId", filters.supplierId)
      if (filters.status) params.set("status", filters.status)
      if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod)
      if (filters.currency) params.set("currency", filters.currency)
      if (filters.paymentDateFrom) params.set("paymentDateFrom", filters.paymentDateFrom)
      if (filters.paymentDateTo) params.set("paymentDateTo", filters.paymentDateTo)
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/supplier-payments${qs ? `?${qs}` : ""}`,
        supplierPaymentListResponse,
        client,
      )
    },
  })
}

export function getInvoiceQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseInvoiceOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.invoice(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getInvoiceQueryOptions requires an id")
      return fetchWithValidation(`/v1/admin/finance/invoices/${id}`, invoiceSingleResponse, client)
    },
  })
}

export function getInvoiceLineItemsQueryOptions(
  client: FetchWithValidationOptions,
  invoiceId: string | null | undefined,
  options: UseInvoiceLineItemsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.lineItems(invoiceId ?? ""),
    queryFn: async () => {
      if (!invoiceId) throw new Error("getInvoiceLineItemsQueryOptions requires an invoiceId")
      return fetchWithValidation(
        `/v1/admin/finance/invoices/${invoiceId}/line-items`,
        invoiceLineItemsResponse,
        client,
      )
    },
  })
}

export function getInvoicePaymentsQueryOptions(
  client: FetchWithValidationOptions,
  invoiceId: string | null | undefined,
  options: UseInvoicePaymentsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.payments(invoiceId ?? ""),
    queryFn: async () => {
      if (!invoiceId) throw new Error("getInvoicePaymentsQueryOptions requires an invoiceId")
      return fetchWithValidation(
        `/v1/admin/finance/invoices/${invoiceId}/payments`,
        invoicePaymentsResponse,
        client,
      )
    },
  })
}

export function getInvoiceCreditNotesQueryOptions(
  client: FetchWithValidationOptions,
  invoiceId: string | null | undefined,
  options: UseInvoiceCreditNotesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.creditNotes(invoiceId ?? ""),
    queryFn: async () => {
      if (!invoiceId) throw new Error("getInvoiceCreditNotesQueryOptions requires an invoiceId")
      return fetchWithValidation(
        `/v1/admin/finance/invoices/${invoiceId}/credit-notes`,
        invoiceCreditNotesResponse,
        client,
      )
    },
  })
}

export function getInvoiceNotesQueryOptions(
  client: FetchWithValidationOptions,
  invoiceId: string | null | undefined,
  options: UseInvoiceNotesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.notes(invoiceId ?? ""),
    queryFn: async () => {
      if (!invoiceId) throw new Error("getInvoiceNotesQueryOptions requires an invoiceId")
      return fetchWithValidation(
        `/v1/admin/finance/invoices/${invoiceId}/notes`,
        invoiceNotesResponse,
        client,
      )
    },
  })
}

export function getInvoiceAttachmentsQueryOptions(
  client: FetchWithValidationOptions,
  invoiceId: string | null | undefined,
  options: UseInvoiceAttachmentsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.attachments(invoiceId ?? ""),
    queryFn: async () => {
      if (!invoiceId) throw new Error("getInvoiceAttachmentsQueryOptions requires an invoiceId")
      return fetchWithValidation(
        `/v1/admin/finance/invoices/${invoiceId}/attachments`,
        invoiceAttachmentsResponse,
        client,
      )
    },
  })
}

export {
  getAccountantInvoicesQueryOptions,
  getAccountantSharesQueryOptions,
  getAccountantSummaryQueryOptions,
  getAdminBookingPaymentsQueryOptions,
  getCostCategoriesQueryOptions,
  getDepartureProfitabilityQueryOptions,
  getProductProfitabilityQueryOptions,
  getPublicBookingDocumentsQueryOptions,
  getPublicBookingPaymentOptionsQueryOptions,
  getPublicBookingPaymentsQueryOptions,
  getPublicFinanceDocumentByReferenceQueryOptions,
  getPublicPaymentSessionQueryOptions,
  getTravelCreditQueryOptions,
  getTravelCreditsQueryOptions,
  getTravelerProfitabilityQueryOptions,
} from "./query-options/public-reporting.js"

export {
  getInvoiceActionLedgerQueryOptions,
  getPaymentSessionActionLedgerQueryOptions,
} from "./query-options-action-ledger.js"
