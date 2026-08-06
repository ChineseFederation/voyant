"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "../client.js"
import type { UsePublicBookingDocumentsOptions } from "../hooks/use-public-booking-documents.js"
import type { UsePublicBookingPaymentOptionsOptions } from "../hooks/use-public-booking-payment-options.js"
import type { UsePublicBookingPaymentsOptions } from "../hooks/use-public-booking-payments.js"
import type { UsePublicFinanceDocumentByReferenceOptions } from "../hooks/use-public-finance-document-by-reference.js"
import type { UsePublicPaymentSessionOptions } from "../hooks/use-public-payment-session.js"
import type { UseTravelCreditOptions } from "../hooks/use-travel-credit.js"
import type { UseTravelCreditsOptions } from "../hooks/use-travel-credits.js"
import {
  getAdminBookingPayments,
  getBookingPaymentDisputes,
  getBookingRefundSettlements,
  getPaymentRefundableRemainder,
  getPublicBookingDocuments,
  getPublicBookingPaymentOptions,
  getPublicBookingPayments,
  getPublicFinanceDocumentByReference,
  getPublicPaymentSession,
  getRefundSettlements,
} from "../operations.js"
import {
  type FinanceDepartureProfitabilityFilters,
  type FinanceProductProfitabilityFilters,
  type FinanceRefundSettlementListFilters,
  type FinanceTravelerProfitabilityFilters,
  financeQueryKeys,
} from "../query-keys.js"
import {
  accountantInvoicesResponse,
  accountantSharesResponse,
  accountantSummaryResponse,
  costCategoriesResponse,
  departureProfitabilityResponse,
  productProfitabilityResponse,
  travelCreditDetailResponse,
  travelCreditListResponse,
  travelerProfitabilityResponse,
} from "../schemas.js"

export function getPublicBookingPaymentOptionsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UsePublicBookingPaymentOptionsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.publicBookingPaymentOptions(bookingId ?? "", filters),
    queryFn: async () => {
      if (!bookingId) {
        throw new Error("getPublicBookingPaymentOptionsQueryOptions requires a bookingId")
      }

      return getPublicBookingPaymentOptions(client, bookingId, filters)
    },
  })
}

export function getPublicBookingDocumentsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UsePublicBookingDocumentsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.publicBookingDocuments(bookingId ?? ""),
    queryFn: async () => {
      if (!bookingId) {
        throw new Error("getPublicBookingDocumentsQueryOptions requires a bookingId")
      }

      return getPublicBookingDocuments(client, bookingId)
    },
  })
}

export function getPublicFinanceDocumentByReferenceQueryOptions(
  client: FetchWithValidationOptions,
  reference: string | null | undefined,
  options: UsePublicFinanceDocumentByReferenceOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.publicFinanceDocumentLookup({ reference: reference ?? undefined }),
    queryFn: async () => {
      if (!reference) {
        throw new Error("getPublicFinanceDocumentByReferenceQueryOptions requires a reference")
      }

      return getPublicFinanceDocumentByReference(client, { reference })
    },
  })
}

export function getPublicBookingPaymentsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UsePublicBookingPaymentsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.publicBookingPayments(bookingId ?? ""),
    queryFn: async () => {
      if (!bookingId) {
        throw new Error("getPublicBookingPaymentsQueryOptions requires a bookingId")
      }

      return getPublicBookingPayments(client, bookingId)
    },
  })
}

export function getAdminBookingPaymentsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
) {
  return queryOptions({
    queryKey: financeQueryKeys.adminBookingPayments(bookingId ?? ""),
    queryFn: async () => {
      if (!bookingId) {
        throw new Error("getAdminBookingPaymentsQueryOptions requires a bookingId")
      }
      return getAdminBookingPayments(client, bookingId)
    },
  })
}

export function getBookingRefundSettlementsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
) {
  return queryOptions({
    queryKey: financeQueryKeys.bookingRefundSettlements(bookingId ?? ""),
    queryFn: async () => {
      if (!bookingId) {
        throw new Error("getBookingRefundSettlementsQueryOptions requires a bookingId")
      }
      return getBookingRefundSettlements(client, bookingId)
    },
  })
}

export function getRefundSettlementsQueryOptions(
  client: FetchWithValidationOptions,
  filters: FinanceRefundSettlementListFilters = {},
) {
  return queryOptions({
    queryKey: financeQueryKeys.refundSettlements(filters),
    queryFn: () => getRefundSettlements(client, filters),
  })
}

export function getPaymentRefundableRemainderQueryOptions(
  client: FetchWithValidationOptions,
  paymentId: string | null | undefined,
) {
  return queryOptions({
    queryKey: financeQueryKeys.paymentRefundableRemainder(paymentId ?? ""),
    queryFn: async () => {
      if (!paymentId) {
        throw new Error("getPaymentRefundableRemainderQueryOptions requires a paymentId")
      }
      return getPaymentRefundableRemainder(client, paymentId)
    },
  })
}

export function getBookingPaymentDisputesQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
) {
  return queryOptions({
    queryKey: financeQueryKeys.bookingPaymentDisputes(bookingId ?? ""),
    queryFn: async () => {
      if (!bookingId) {
        throw new Error("getBookingPaymentDisputesQueryOptions requires a bookingId")
      }
      return getBookingPaymentDisputes(client, bookingId)
    },
  })
}

export function getPublicPaymentSessionQueryOptions(
  client: FetchWithValidationOptions,
  sessionId: string | null | undefined,
  options: UsePublicPaymentSessionOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.publicPaymentSession(sessionId ?? ""),
    queryFn: async () => {
      if (!sessionId) {
        throw new Error("getPublicPaymentSessionQueryOptions requires a sessionId")
      }

      return getPublicPaymentSession(client, sessionId)
    },
  })
}

export function getTravelCreditsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseTravelCreditsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: financeQueryKeys.travelCreditsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.status) params.set("status", filters.status)
      if (filters.seriesCode) params.set("seriesCode", filters.seriesCode)
      if (filters.issuedToPersonId) params.set("issuedToPersonId", filters.issuedToPersonId)
      if (filters.issuedToOrganizationId) {
        params.set("issuedToOrganizationId", filters.issuedToOrganizationId)
      }
      if (filters.search) params.set("search", filters.search)
      if (filters.hasBalance !== undefined) params.set("hasBalance", String(filters.hasBalance))
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/travel-credits${qs ? `?${qs}` : ""}`,
        travelCreditListResponse,
        client,
      )
    },
  })
}

export function getTravelCreditQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseTravelCreditOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: financeQueryKeys.travelCredit(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getTravelCreditQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/finance/travel-credits/${id}`,
        travelCreditDetailResponse,
        client,
      )
    },
  })
}

export function getDepartureProfitabilityQueryOptions(
  client: FetchWithValidationOptions,
  filters: FinanceDepartureProfitabilityFilters = {},
) {
  return queryOptions({
    queryKey: financeQueryKeys.departureProfitability(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.from) params.set("from", filters.from)
      if (filters.to) params.set("to", filters.to)
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.departureId) params.set("departureId", filters.departureId)
      if (filters.currency) params.set("currency", filters.currency)
      if (filters.baseCurrency) params.set("baseCurrency", filters.baseCurrency)
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/reports/profitability/departures${qs ? `?${qs}` : ""}`,
        departureProfitabilityResponse,
        client,
      )
    },
  })
}

export function getProductProfitabilityQueryOptions(
  client: FetchWithValidationOptions,
  filters: FinanceProductProfitabilityFilters = {},
) {
  return queryOptions({
    queryKey: financeQueryKeys.productProfitability(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.from) params.set("from", filters.from)
      if (filters.to) params.set("to", filters.to)
      if (filters.currency) params.set("currency", filters.currency)
      if (filters.baseCurrency) params.set("baseCurrency", filters.baseCurrency)
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/finance/reports/profitability/products${qs ? `?${qs}` : ""}`,
        productProfitabilityResponse,
        client,
      )
    },
  })
}

export function getTravelerProfitabilityQueryOptions(
  client: FetchWithValidationOptions,
  filters: FinanceTravelerProfitabilityFilters,
) {
  return queryOptions({
    queryKey: financeQueryKeys.travelerProfitability(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("departureId", filters.departureId)
      params.set("currency", filters.currency)
      return fetchWithValidation(
        `/v1/admin/finance/reports/profitability/travelers?${params.toString()}`,
        travelerProfitabilityResponse,
        client,
      )
    },
  })
}

export function getCostCategoriesQueryOptions(
  client: FetchWithValidationOptions,
  options: { includeArchived?: boolean } = {},
) {
  return queryOptions({
    queryKey: financeQueryKeys.costCategories(),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/finance/cost-categories${options.includeArchived ? "?includeArchived=true" : ""}`,
        costCategoriesResponse,
        client,
      ),
  })
}

export function getAccountantSharesQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: financeQueryKeys.accountantShares(),
    queryFn: () =>
      fetchWithValidation("/v1/admin/finance/accountant-shares", accountantSharesResponse, client),
  })
}

/** Public portal — `client` is an unauthenticated fetcher; `token` is the credential. */
export function getAccountantSummaryQueryOptions(
  client: FetchWithValidationOptions,
  token: string,
  baseCurrency?: string,
) {
  return queryOptions({
    queryKey: financeQueryKeys.accountantSummary(token, baseCurrency),
    queryFn: () => {
      const qs = baseCurrency ? `?baseCurrency=${encodeURIComponent(baseCurrency)}` : ""
      return fetchWithValidation(
        `/v1/public/finance/accountant/${encodeURIComponent(token)}/summary${qs}`,
        accountantSummaryResponse,
        client,
      )
    },
  })
}

export function getAccountantInvoicesQueryOptions(
  client: FetchWithValidationOptions,
  token: string,
) {
  return queryOptions({
    queryKey: financeQueryKeys.accountantInvoices(token),
    queryFn: () =>
      fetchWithValidation(
        `/v1/public/finance/accountant/${encodeURIComponent(token)}/invoices`,
        accountantInvoicesResponse,
        client,
      ),
  })
}
