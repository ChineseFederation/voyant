import {
  publicBookingFinanceDocumentsSchema,
  publicBookingFinancePaymentsSchema,
  publicBookingPaymentOptionsSchema,
  publicFinanceBookingDocumentSchema,
  publicFinanceBookingPaymentSchema,
  publicFinanceDocumentLookupQuerySchema,
  publicFinanceDocumentLookupSchema,
  publicPaymentOptionsQuerySchema,
  publicPaymentSessionSchema,
  publicStartPaymentSessionSchema,
  publicTravelCreditValidationSchema,
  publicValidateTravelCreditSchema,
} from "@voyant-travel/finance/public-validation"
import {
  bookingPaymentDisputesSchema,
  bookingRefundSettlementsSchema,
  paymentDisputeRecordSchema,
  paymentRefundableRemainderSchema,
  refundSettlementRecordSchema,
} from "@voyant-travel/finance/validation"
import type { z } from "zod"

import { paginatedEnvelope, singleEnvelope } from "./common.js"

export {
  publicBookingFinanceDocumentsSchema,
  publicBookingFinancePaymentsSchema,
  publicBookingPaymentOptionsSchema,
  publicFinanceBookingDocumentSchema,
  publicFinanceBookingPaymentSchema,
  publicFinanceDocumentLookupQuerySchema,
  publicFinanceDocumentLookupSchema,
  publicPaymentOptionsQuerySchema,
  publicPaymentSessionSchema,
  publicStartPaymentSessionSchema,
  publicTravelCreditValidationSchema,
  publicValidateTravelCreditSchema,
}

export const publicBookingPaymentOptionsResponse = singleEnvelope(publicBookingPaymentOptionsSchema)
export const publicBookingFinanceDocumentsResponse = singleEnvelope(
  publicBookingFinanceDocumentsSchema,
)
export const publicFinanceDocumentLookupResponse = singleEnvelope(publicFinanceDocumentLookupSchema)
export const publicBookingFinancePaymentsResponse = singleEnvelope(
  publicBookingFinancePaymentsSchema,
)
export const publicPaymentSessionResponse = singleEnvelope(publicPaymentSessionSchema)
export { bookingPaymentDisputesSchema, paymentDisputeRecordSchema }
export const bookingPaymentDisputesResponse = singleEnvelope(bookingPaymentDisputesSchema)
export {
  bookingRefundSettlementsSchema,
  paymentRefundableRemainderSchema,
  refundSettlementRecordSchema,
}
export const bookingRefundSettlementsResponse = singleEnvelope(bookingRefundSettlementsSchema)
export const paymentRefundableRemainderResponse = singleEnvelope(paymentRefundableRemainderSchema)
export const refundSettlementResponse = singleEnvelope(refundSettlementRecordSchema)
export const refundSettlementListResponse = paginatedEnvelope(refundSettlementRecordSchema)
export const publicTravelCreditValidationResponse = singleEnvelope(
  publicTravelCreditValidationSchema,
)

export type PublicBookingPaymentOptionsRecord = z.infer<typeof publicBookingPaymentOptionsSchema>
export type PublicBookingFinanceDocumentsRecord = z.infer<
  typeof publicBookingFinanceDocumentsSchema
>
export type PublicFinanceDocumentLookupQuery = z.input<
  typeof publicFinanceDocumentLookupQuerySchema
>
export type PublicFinanceDocumentLookupRecord = z.infer<typeof publicFinanceDocumentLookupSchema>
export type PublicBookingFinancePaymentsRecord = z.infer<typeof publicBookingFinancePaymentsSchema>
export type PublicFinanceBookingDocumentRecord = z.infer<typeof publicFinanceBookingDocumentSchema>
export type PublicFinanceBookingPaymentRecord = z.infer<typeof publicFinanceBookingPaymentSchema>
export type PublicPaymentSessionRecord = z.infer<typeof publicPaymentSessionSchema>
export type PaymentDisputeRecord = z.infer<typeof paymentDisputeRecordSchema>
export type BookingPaymentDisputesRecord = z.infer<typeof bookingPaymentDisputesSchema>
export type RefundSettlementRecord = z.infer<typeof refundSettlementRecordSchema>
export type BookingRefundSettlementsRecord = z.infer<typeof bookingRefundSettlementsSchema>
export type PaymentRefundableRemainderRecord = z.infer<typeof paymentRefundableRemainderSchema>
export type PublicStartPaymentSessionInput = z.input<typeof publicStartPaymentSessionSchema>
export type PublicValidateTravelCreditInput = z.input<typeof publicValidateTravelCreditSchema>
export type PublicTravelCreditValidationRecord = z.infer<typeof publicTravelCreditValidationSchema>
