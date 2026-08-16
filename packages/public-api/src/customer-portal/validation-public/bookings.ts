import { z } from "zod"

import {
  bookingDocumentSourceSchema,
  bookingDocumentTypeSchema,
  bookingFulfillmentDeliveryChannelSchema,
  bookingFulfillmentStatusSchema,
  bookingFulfillmentTypeSchema,
  bookingItemParticipantRoleSchema,
  bookingItemStatusSchema,
  bookingItemTypeSchema,
  bookingStatusSchema,
  customerPortalBookingPaymentSummaryStatusSchema,
  customerPortalBookingTravelerTypeSchema,
  customerPortalFinanceDocumentAvailabilitySchema,
  customerPortalFinanceDocumentFormatSchema,
  customerPortalFinanceInvoiceStatusSchema,
  customerPortalFinanceInvoiceTypeSchema,
  customerPortalFinancePaymentMethodSchema,
  customerPortalFinancePaymentStatusSchema,
} from "./common.js"

export const customerPortalBookingSummarySchema = z.object({
  bookingId: z.string(),
  bookingNumber: z.string(),
  status: bookingStatusSchema,
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  productTitle: z.string().nullable(),
  paymentStatus: customerPortalBookingPaymentSummaryStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  confirmedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  travelerCount: z.number().int(),
  primaryTravelerName: z.string().nullable(),
})

export const customerPortalBookingItemTravelerSchema = z.object({
  id: z.string(),
  travelerId: z.string(),
  role: bookingItemParticipantRoleSchema,
  isPrimary: z.boolean(),
})

export const customerPortalBookingItemParticipantSchema = customerPortalBookingItemTravelerSchema

export const customerPortalBookingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  itemType: bookingItemTypeSchema,
  status: bookingItemStatusSchema,
  serviceDate: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  quantity: z.number().int(),
  sellCurrency: z.string(),
  unitSellAmountCents: z.number().int().nullable(),
  totalSellAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  travelerLinks: z.array(customerPortalBookingItemTravelerSchema),
})

export const customerPortalBookingTravelerSchema = z.object({
  id: z.string(),
  participantType: customerPortalBookingTravelerTypeSchema,
  firstName: z.string(),
  lastName: z.string(),
  isPrimary: z.boolean(),
})

export const customerPortalBookingParticipantSchema = customerPortalBookingTravelerSchema

export const customerPortalBookingBillingContactSchema = z.object({
  email: z.string().nullable(),
  phone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  country: z.string().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address1: z.string().nullable(),
  address2: z.string().nullable(),
  postal: z.string().nullable(),
})

export const customerPortalBookingDocumentSchema = z.object({
  id: z.string(),
  source: bookingDocumentSourceSchema,
  travelerId: z.string().nullable(),
  type: bookingDocumentTypeSchema,
  fileName: z.string(),
  fileUrl: z.string(),
  mimeType: z.string().nullable(),
  reference: z.string().nullable(),
})

export const customerPortalBookingFinancialDocumentSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  invoiceType: customerPortalFinanceInvoiceTypeSchema,
  invoiceStatus: customerPortalFinanceInvoiceStatusSchema,
  currency: z.string(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  balanceDueCents: z.number().int(),
  issueDate: z.string(),
  dueDate: z.string(),
  documentStatus: customerPortalFinanceDocumentAvailabilitySchema,
  format: customerPortalFinanceDocumentFormatSchema.nullable(),
  generatedAt: z.string().nullable(),
  downloadUrl: z.string().nullable(),
})

export const customerPortalBookingPaymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  invoiceType: customerPortalFinanceInvoiceTypeSchema,
  status: customerPortalFinancePaymentStatusSchema,
  paymentMethod: customerPortalFinancePaymentMethodSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  paymentDate: z.string(),
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
})

export const customerPortalBookingFinancialsSchema = z.object({
  documents: z.array(customerPortalBookingFinancialDocumentSchema),
  payments: z.array(customerPortalBookingPaymentSchema),
})

export const customerPortalBookingFulfillmentSchema = z.object({
  id: z.string(),
  bookingItemId: z.string().nullable(),
  travelerId: z.string().nullable(),
  fulfillmentType: bookingFulfillmentTypeSchema,
  deliveryChannel: bookingFulfillmentDeliveryChannelSchema,
  status: bookingFulfillmentStatusSchema,
  artifactUrl: z.string().nullable(),
})

export const customerPortalBookingDetailSchema = z.object({
  bookingId: z.string(),
  bookingNumber: z.string(),
  status: bookingStatusSchema,
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  travelers: z.array(customerPortalBookingTravelerSchema),
  items: z.array(customerPortalBookingItemSchema),
  billingContact: customerPortalBookingBillingContactSchema.nullable(),
  documents: z.array(customerPortalBookingDocumentSchema),
  financials: customerPortalBookingFinancialsSchema,
  fulfillments: z.array(customerPortalBookingFulfillmentSchema),
})

export type CustomerPortalBookingSummary = z.infer<typeof customerPortalBookingSummarySchema>
export type CustomerPortalBookingBillingContact = z.infer<
  typeof customerPortalBookingBillingContactSchema
>
export type CustomerPortalBookingDocument = z.infer<typeof customerPortalBookingDocumentSchema>
export type CustomerPortalBookingFinancialDocument = z.infer<
  typeof customerPortalBookingFinancialDocumentSchema
>
export type CustomerPortalBookingPayment = z.infer<typeof customerPortalBookingPaymentSchema>
export type CustomerPortalBookingFinancials = z.infer<typeof customerPortalBookingFinancialsSchema>
export type CustomerPortalBookingDetail = z.infer<typeof customerPortalBookingDetailSchema>
