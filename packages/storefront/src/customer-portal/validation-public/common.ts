import { z } from "zod"

export const bookingStatusSchema = z.enum(["confirmed", "in_progress", "completed", "cancelled"])

export const customerPortalBookingTravelerTypeSchema = z.enum(["traveler", "occupant", "other"])

export const bookingItemTypeSchema = z.enum([
  "unit",
  "extra",
  "service",
  "fee",
  "tax",
  "discount",
  "adjustment",
  "accommodation",
  "transport",
  "other",
])

export const bookingItemStatusSchema = z.enum(["confirmed", "cancelled", "fulfilled"])

export const bookingItemParticipantRoleSchema = z.enum([
  "traveler",
  "occupant",
  "beneficiary",
  "other",
])

export const bookingDocumentTypeSchema = z.enum([
  "visa",
  "insurance",
  "health",
  "passport_copy",
  "contract",
  "invoice",
  "proforma",
  "credit_note",
  "other",
])
export const bookingDocumentSourceSchema = z.enum(["booking_document", "legal", "finance"])

export const bookingFulfillmentTypeSchema = z.enum([
  "service_voucher",
  "ticket",
  "pdf",
  "qr_code",
  "barcode",
  "mobile",
  "other",
])

export const bookingFulfillmentDeliveryChannelSchema = z.enum([
  "download",
  "email",
  "api",
  "wallet",
  "other",
])

export const bookingFulfillmentStatusSchema = z.enum([
  "pending",
  "issued",
  "reissued",
  "revoked",
  "failed",
])

export const seatingPreferenceSchema = z.enum(["aisle", "window", "middle", "no_preference"])
export const customerPortalAddressLabelSchema = z.enum([
  "primary",
  "billing",
  "shipping",
  "mailing",
  "meeting",
  "service",
  "legal",
  "other",
])
export const customerPortalFinanceInvoiceTypeSchema = z.enum(["invoice", "proforma", "credit_note"])
export const customerPortalFinanceInvoiceStatusSchema = z.enum([
  "draft",
  "pending_external_allocation",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
])
export const customerPortalFinancePaymentStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "refunded",
])
export const customerPortalFinancePaymentMethodSchema = z.enum([
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "cheque",
  "wallet",
  "direct_bill",
  "travel_credit",
  "other",
])
export const customerPortalBookingPaymentSummaryStatusSchema = z.enum([
  "unpaid",
  "partially_paid",
  "paid",
  "overdue",
])
export const customerPortalFinanceDocumentAvailabilitySchema = z.enum([
  "missing",
  "pending",
  "ready",
  "failed",
  "stale",
])
export const customerPortalFinanceDocumentFormatSchema = z.enum(["html", "pdf", "xml", "json"])
export const customerPortalProfileDocumentTypeSchema = z.enum([
  "passport",
  "id_card",
  "visa",
  "drivers_license",
  "other",
])
export const customerPortalCompanionDocumentTypeSchema = z.enum([
  "passport",
  "id_card",
  "visa",
  "drivers_license",
  "other",
])
