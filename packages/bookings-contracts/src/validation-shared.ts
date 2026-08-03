import { z } from "zod"

export const bookingStatusSchema = z.enum(["confirmed", "in_progress", "completed", "cancelled"])

export const supplierConfirmationStatusSchema = z.enum([
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
])

export const bookingSourceTypeSchema = z.enum([
  "direct",
  "manual",
  "affiliate",
  "ota",
  "reseller",
  "api_partner",
  "internal",
])

export const bookingParticipantTypeSchema = z.enum(["traveler", "occupant", "other"])

export const bookingTravelerCategorySchema = z.enum(["adult", "child", "infant", "senior", "other"])

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

export const bookingStaffAssignmentRoleSchema = z.enum(["service_assignee", "other"])

export const bookingAllocationTypeSchema = z.enum(["unit", "pickup", "resource"])

export const bookingAllocationStatusSchema = z.enum([
  "held",
  "confirmed",
  "released",
  "expired",
  "cancelled",
  "fulfilled",
])

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

export const bookingRedemptionMethodSchema = z.enum(["manual", "scan", "api", "other"])

export const bookingDocumentTypeSchema = z.enum([
  "visa",
  "insurance",
  "health",
  "passport_copy",
  "other",
])
