"use client"

import { type FetchWithValidationOptions, fetchWithValidation, withQueryParams } from "./client.js"
import type {
  FinanceActionLedgerListCursor,
  FinanceRefundSettlementListFilters,
} from "./query-keys.js"
import {
  bookingPaymentDisputesResponse,
  bookingRefundSettlementsResponse,
  financeActionLedgerListResponse,
  invoiceFxRateResponse,
  type PublicFinanceDocumentLookupQuery,
  type PublicStartPaymentSessionInput,
  type PublicValidateTravelCreditInput,
  paymentRefundableRemainderResponse,
  publicBookingFinanceDocumentsResponse,
  publicBookingFinancePaymentsResponse,
  publicBookingPaymentOptionsResponse,
  publicFinanceDocumentLookupResponse,
  publicPaymentSessionResponse,
  publicTravelCreditValidationResponse,
  refundSettlementListResponse,
} from "./schemas.js"

export interface FinanceActionLedgerListInput {
  cursor?: FinanceActionLedgerListCursor | null | undefined
  limit?: number | undefined
}

export interface InvoiceFxRateInput {
  baseCurrency: string
  quoteCurrency: string
  date?: string | undefined
}

function toFinanceActionLedgerQuery(input?: FinanceActionLedgerListInput) {
  return {
    cursorOccurredAt: input?.cursor?.occurredAt,
    cursorId: input?.cursor?.id,
    limit: input?.limit,
  }
}

export function listInvoiceActionLedger(
  client: FetchWithValidationOptions,
  invoiceId: string,
  input: FinanceActionLedgerListInput = {},
) {
  return fetchWithValidation(
    withQueryParams(
      `/v1/admin/finance/invoices/${invoiceId}/action-ledger`,
      toFinanceActionLedgerQuery(input),
    ),
    financeActionLedgerListResponse,
    client,
  )
}

export function listPaymentSessionActionLedger(
  client: FetchWithValidationOptions,
  paymentSessionId: string,
  input: FinanceActionLedgerListInput = {},
) {
  return fetchWithValidation(
    withQueryParams(
      `/v1/admin/finance/payment-sessions/${paymentSessionId}/action-ledger`,
      toFinanceActionLedgerQuery(input),
    ),
    financeActionLedgerListResponse,
    client,
  )
}

export function getPublicFinanceDocumentByReference(
  client: FetchWithValidationOptions,
  query: PublicFinanceDocumentLookupQuery,
) {
  return fetchWithValidation(
    withQueryParams("/v1/public/finance/documents/by-reference", query),
    publicFinanceDocumentLookupResponse,
    client,
  )
}

export function getPublicBookingDocuments(client: FetchWithValidationOptions, bookingId: string) {
  return fetchWithValidation(
    `/v1/public/finance/bookings/${bookingId}/documents`,
    publicBookingFinanceDocumentsResponse,
    client,
  )
}

export function getPublicBookingPayments(client: FetchWithValidationOptions, bookingId: string) {
  return fetchWithValidation(
    `/v1/public/finance/bookings/${bookingId}/payments`,
    publicBookingFinancePaymentsResponse,
    client,
  )
}

/**
 * Admin variant — same response shape as `getPublicBookingPayments`,
 * but hits the admin endpoint (`/v1/admin/finance/bookings/:id/payments`)
 * so a staff actor can read it. The customer-portal continues to use
 * the public path; the operator dashboard uses this one.
 */
export function getAdminBookingPayments(client: FetchWithValidationOptions, bookingId: string) {
  return fetchWithValidation(
    `/v1/admin/finance/bookings/${bookingId}/payments`,
    publicBookingFinancePaymentsResponse,
    client,
  )
}

/**
 * The booking's card disputes. A contested payment still reads `paid`, so this
 * is the only read that can tell a cleanly paid booking from one whose money is
 * being taken back (voyant#4289).
 */
export function getBookingPaymentDisputes(client: FetchWithValidationOptions, bookingId: string) {
  return fetchWithValidation(
    `/v1/admin/finance/bookings/${bookingId}/disputes`,
    bookingPaymentDisputesResponse,
    client,
  )
}

/**
 * How the booking's refunds were actually paid — and which are still owed
 * (voyant#4303). An issued credit note reads the same either way, so this is
 * the only read that can tell a refunded booking from one that still owes
 * somebody money.
 */
export function getBookingRefundSettlements(client: FetchWithValidationOptions, bookingId: string) {
  return fetchWithValidation(
    `/v1/admin/finance/bookings/${bookingId}/refund-settlements`,
    bookingRefundSettlementsResponse,
    client,
  )
}

/** The refund-settlement list, filtered (voyant#4303). */
export function getRefundSettlements(
  client: FetchWithValidationOptions,
  filters: FinanceRefundSettlementListFilters = {},
) {
  return fetchWithValidation(
    withQueryParams("/v1/admin/finance/refund-settlements", filters),
    refundSettlementListResponse,
    client,
  )
}

/**
 * How much of a payment may still be refunded. Refunds that are pending are
 * subtracted alongside those that settled, so this is smaller than "paid minus
 * refunded" whenever a refund is in flight — deliberately, because the
 * alternative is refunding the same money twice.
 */
export function getPaymentRefundableRemainder(
  client: FetchWithValidationOptions,
  paymentId: string,
) {
  return fetchWithValidation(
    `/v1/admin/finance/payments/${paymentId}/refundable`,
    paymentRefundableRemainderResponse,
    client,
  )
}

export function getInvoiceFxRate(client: FetchWithValidationOptions, input: InvoiceFxRateInput) {
  return fetchWithValidation(
    withQueryParams("/v1/admin/finance/invoice-fx-rate", input),
    invoiceFxRateResponse,
    client,
  )
}

export function getPublicBookingPaymentOptions(
  client: FetchWithValidationOptions,
  bookingId: string,
  filters?: {
    personId?: string
    organizationId?: string
    provider?: string
    instrumentType?: string
    includeInactive?: boolean
  },
) {
  return fetchWithValidation(
    withQueryParams(`/v1/public/finance/bookings/${bookingId}/payment-options`, filters),
    publicBookingPaymentOptionsResponse,
    client,
  )
}

export function getPublicPaymentSession(client: FetchWithValidationOptions, sessionId: string) {
  return fetchWithValidation(
    `/v1/public/finance/payment-sessions/${sessionId}`,
    publicPaymentSessionResponse,
    client,
  )
}

export function startPublicBookingSchedulePaymentSession(
  client: FetchWithValidationOptions,
  bookingId: string,
  scheduleId: string,
  input: PublicStartPaymentSessionInput,
) {
  return fetchWithValidation(
    `/v1/public/finance/bookings/${bookingId}/payment-schedules/${scheduleId}/payment-session`,
    publicPaymentSessionResponse,
    client,
    { method: "POST", body: JSON.stringify(input) },
  )
}

export function startPublicBookingGuaranteePaymentSession(
  client: FetchWithValidationOptions,
  bookingId: string,
  guaranteeId: string,
  input: PublicStartPaymentSessionInput,
) {
  return fetchWithValidation(
    `/v1/public/finance/bookings/${bookingId}/guarantees/${guaranteeId}/payment-session`,
    publicPaymentSessionResponse,
    client,
    { method: "POST", body: JSON.stringify(input) },
  )
}

export function validatePublicTravelCredit(
  client: FetchWithValidationOptions,
  input: PublicValidateTravelCreditInput,
) {
  return fetchWithValidation(
    "/v1/public/finance/travel-credits/validate",
    publicTravelCreditValidationResponse,
    client,
    { method: "POST", body: JSON.stringify(input) },
  )
}
