// agent-quality: file-size exception -- owner: bookings-react; existing schema contract stays co-located until a dedicated split preserves behavior and tests.
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

export const paginatedEnvelope = listResponseSchema

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })
export const arrayEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) })
export const successEnvelope = z.object({ success: z.boolean() })

export const bookingStatusSchema = z.enum(["confirmed", "in_progress", "completed", "cancelled"])

export type BookingStatus = z.infer<typeof bookingStatusSchema>

export const supplierConfirmationStatusSchema = z.enum([
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
])

const bookingDepositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

export const bookingPaymentPolicySchema = z.object({
  deposit: bookingDepositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

export type BookingPaymentPolicy = z.infer<typeof bookingPaymentPolicySchema>

export const bookingPriceOverrideSchema = z.object({
  isManual: z.literal(true),
  originalAmountCents: z.number().int().nullable(),
  overriddenAmountCents: z.number().int(),
  currency: z.string(),
  reason: z.string(),
  overriddenBy: z.string(),
  overriddenAt: z.string(),
})

export type BookingPriceOverride = z.infer<typeof bookingPriceOverrideSchema>

export const bookingRecordItemSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  itemType: z.string(),
  productId: z.string().nullable(),
  productName: z.string().nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
})

export type BookingRecordItemSummary = z.infer<typeof bookingRecordItemSummarySchema>

export const bookingRecordSchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
  status: bookingStatusSchema,
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  pax: z.number().int().nullable(),
  items: z.array(bookingRecordItemSummarySchema).optional(),
  internalNotes: z.string().nullable(),
  communicationLanguage: z.string().nullable().optional(),
  contactFirstName: z.string().nullable().optional(),
  contactLastName: z.string().nullable().optional(),
  contactPartyType: z.enum(["individual", "company"]).nullable().optional(),
  contactTaxId: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  contactPreferredLanguage: z.string().nullable().optional(),
  contactCountry: z.string().nullable().optional(),
  contactRegion: z.string().nullable().optional(),
  contactCity: z.string().nullable().optional(),
  contactAddressLine1: z.string().nullable().optional(),
  contactAddressLine2: z.string().nullable().optional(),
  contactPostalCode: z.string().nullable().optional(),
  customerPaymentPolicy: bookingPaymentPolicySchema.nullable().optional(),
  priceOverride: bookingPriceOverrideSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type BookingRecord = z.infer<typeof bookingRecordSchema>

export const bookingTravelerRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  participantType: z.string(),
  travelerCategory: z.string().nullable().optional(),
  personId: z.string().nullable().optional(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: z.string().nullable().optional(),
  specialRequests: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})

export const bookingTravelerTravelDetailsSchema = z.object({
  travelerId: z.string(),
  nationality: z.string().nullable(),
  documentType: z.enum(["passport", "id_card", "driver_license", "visa", "other"]).nullable(),
  documentNumber: z.string().nullable(),
  documentExpiry: z.string().nullable(),
  documentIssuingCountry: z.string().nullable(),
  documentIssuingAuthority: z.string().nullable(),
  documentPersonDocumentId: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  dietaryRequirements: z.string().nullable(),
  accessibilityNeeds: z.string().nullable(),
  isLeadTraveler: z.boolean(),
  sharingGroupId: z.string().nullable(),
  roomTypeId: z.string().nullable(),
  bedPreference: z.enum(["single", "twin", "double", "no-preference"]).nullable(),
  allocations: z.record(z.string(), z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const bookingTravelerRevealRecordSchema = bookingTravelerRecordSchema.extend({
  travelDetails: bookingTravelerTravelDetailsSchema.nullable(),
})

export type BookingTravelerRecord = z.infer<typeof bookingTravelerRecordSchema>
export type BookingTravelerTravelDetailsRecord = z.infer<typeof bookingTravelerTravelDetailsSchema>
export type BookingTravelerRevealRecord = z.infer<typeof bookingTravelerRevealRecordSchema>

export const bookingTravelerSharingGroupSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  occupancy: z.number().int(),
  roomTypeId: z.string().nullable(),
  bookingIds: z.array(z.string()),
})

export const bookingTravelerSharingGroupMemberSchema = bookingTravelerRecordSchema.extend({
  bookingNumber: z.string(),
  personId: z.string().nullable(),
  isLeadTraveler: z.boolean(),
  sharingGroupId: z.string(),
  roomTypeId: z.string().nullable(),
  bedPreference: z.string().nullable(),
  allocations: z.record(z.string(), z.string()),
})

export type BookingTravelerSharingGroupSummary = z.infer<
  typeof bookingTravelerSharingGroupSummarySchema
>
export type BookingTravelerSharingGroupMember = z.infer<
  typeof bookingTravelerSharingGroupMemberSchema
>

export const bookingSupplierStatusRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  supplierServiceId: z.string().nullable(),
  serviceName: z.string(),
  status: supplierConfirmationStatusSchema,
  supplierReference: z.string().nullable(),
  costCurrency: z.string(),
  costAmountCents: z.number().int(),
  notes: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type BookingSupplierStatusRecord = z.infer<typeof bookingSupplierStatusRecordSchema>

export const bookingActivityRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  actorId: z.string().nullable(),
  /** Hydrated from `auth.user.name` server-side. Null for system events / deleted users. */
  actorName: z.string().nullable().optional(),
  /** Hydrated from `auth.user.email` server-side. Falls back when no name. */
  actorEmail: z.string().nullable().optional(),
  activityType: z.string(),
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
})

export type BookingActivityRecord = z.infer<typeof bookingActivityRecordSchema>

export const bookingNoteRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  authorId: z.string(),
  /** Hydrated from `auth.user.name` server-side. Null when the author has been deleted. */
  authorName: z.string().nullable().optional(),
  /** Hydrated from `auth.user.email` server-side. Falls back when no name. */
  authorEmail: z.string().nullable().optional(),
  content: z.string(),
  createdAt: z.string(),
})

export type BookingNoteRecord = z.infer<typeof bookingNoteRecordSchema>

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

export const bookingItemRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
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
  costCurrency: z.string().nullable(),
  unitCostAmountCents: z.number().int().nullable(),
  totalCostAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  pricingCategoryId: z.string().nullable(),
  availabilitySlotId: z.string().nullable(),
  // Snapshots taken at item-create time. Authoritative for "what did
  // the customer buy?" — never updated. Optional/nullable because old
  // rows pre-date the snapshot columns.
  productNameSnapshot: z.string().nullable().optional(),
  optionNameSnapshot: z.string().nullable().optional(),
  unitNameSnapshot: z.string().nullable().optional(),
  departureLabelSnapshot: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type BookingItemRecord = z.infer<typeof bookingItemRecordSchema>

export const bookingItemTravelerRoleSchema = z.enum([
  "traveler",
  "occupant",
  "primary_contact",
  "service_assignee",
  "beneficiary",
  "other",
])

export const bookingItemTravelerRecordSchema = z.object({
  id: z.string(),
  bookingItemId: z.string(),
  travelerId: z.string(),
  role: bookingItemTravelerRoleSchema,
  isPrimary: z.boolean(),
  createdAt: z.string(),
})

export type BookingItemTravelerRecord = z.infer<typeof bookingItemTravelerRecordSchema>

export const bookingDocumentTypeSchema = z.enum([
  "visa",
  "insurance",
  "health",
  "passport_copy",
  "other",
])

export const bookingTravelerDocumentRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  travelerId: z.string().nullable(),
  type: bookingDocumentTypeSchema,
  fileName: z.string(),
  fileUrl: z.string(),
  expiresAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export type BookingTravelerDocumentRecord = z.infer<typeof bookingTravelerDocumentRecordSchema>

export const bookingGroupKindSchema = z.enum(["shared_room", "other"])
export const bookingGroupMemberRoleSchema = z.enum(["primary", "shared"])

export const bookingGroupRecordSchema = z.object({
  id: z.string(),
  kind: bookingGroupKindSchema,
  label: z.string(),
  primaryBookingId: z.string().nullable(),
  productId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type BookingGroupRecord = z.infer<typeof bookingGroupRecordSchema>

export const bookingGroupMemberRecordSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  bookingId: z.string(),
  role: bookingGroupMemberRoleSchema,
  createdAt: z.string(),
})

export type BookingGroupMemberRecord = z.infer<typeof bookingGroupMemberRecordSchema>

export const bookingGroupMemberWithBookingSchema = bookingGroupMemberRecordSchema.extend({
  booking: bookingRecordSchema.nullable(),
})

export type BookingGroupMemberWithBookingRecord = z.infer<
  typeof bookingGroupMemberWithBookingSchema
>

export const bookingGroupDetailSchema = bookingGroupRecordSchema.extend({
  members: z.array(bookingGroupMemberWithBookingSchema),
})

export type BookingGroupDetailRecord = z.infer<typeof bookingGroupDetailSchema>

// The admin booking detail read (`GET /v1/admin/bookings/:id`) hydrates the
// bookings-owned child collections inline (items, travelers, documents) — see
// the server's `bookingDetailSchema`. The flat `bookingRecordSchema` used for
// the list carries only an optional summary `items` and no travelers/documents,
// so parsing the detail with it silently strips the hydrated collections. The
// detail parser therefore extends the record with the full child shapes:
//  - `items` use the full `bookingItemRecordSchema` (same shape as `/items`).
//  - `travelers` follow the same reveal/redaction gate as `/travelers`; the row
//    is always the plain traveler shape (PII masked or not), but we accept the
//    reveal variant too so an inline `travelDetails` is preserved rather than
//    stripped if the server ever hydrates it.
//  - `documents` reuse `bookingTravelerDocumentRecordSchema`, which already
//    mirrors the server's booking-level `bookingDocumentSchema` (the shape the
//    `/documents` endpoint returns).
export const bookingDetailSchema = bookingRecordSchema.extend({
  items: z.array(bookingItemRecordSchema),
  travelers: z.array(z.union([bookingTravelerRevealRecordSchema, bookingTravelerRecordSchema])),
  documents: z.array(bookingTravelerDocumentRecordSchema),
})

export type BookingDetailRecord = z.infer<typeof bookingDetailSchema>

export const bookingListResponse = paginatedEnvelope(bookingRecordSchema)
// `bookingSingleResponse` stays on the flat record schema: it is shared by the
// mutation hooks (create/update/convert/status/cancel), and the server returns
// a flat `bookingSchema` (no hydrated child collections) for those endpoints.
// Only the detail read (`GET /:id`) hydrates the collections — it uses
// `bookingDetailResponse` below. The `.extend({ data })` mutation hooks that
// build on `bookingSingleResponse` replace `data` wholesale, so the base shape
// here does not affect them.
export const bookingSingleResponse = singleEnvelope(bookingRecordSchema)
export const bookingDetailResponse = singleEnvelope(bookingDetailSchema)
export const bookingItemsResponse = arrayEnvelope(bookingItemRecordSchema)
export const bookingItemTravelersResponse = arrayEnvelope(bookingItemTravelerRecordSchema)
export const bookingTravelerDocumentsResponse = arrayEnvelope(bookingTravelerDocumentRecordSchema)
export const bookingGroupListResponse = paginatedEnvelope(bookingGroupRecordSchema)
export const bookingGroupSingleResponse = singleEnvelope(bookingGroupRecordSchema)
export const bookingGroupDetailResponse = singleEnvelope(bookingGroupDetailSchema)
export const bookingGroupMembersResponse = arrayEnvelope(bookingGroupMemberWithBookingSchema)
export const bookingGroupMemberSingleResponse = singleEnvelope(bookingGroupMemberRecordSchema)
export const bookingGroupForBookingSchema = bookingGroupRecordSchema.extend({
  membership: bookingGroupMemberRecordSchema,
})
export const bookingGroupForBookingResponse = z.object({
  data: bookingGroupForBookingSchema.nullable(),
})
export type BookingGroupForBookingRecord = z.infer<typeof bookingGroupForBookingSchema>
export const bookingTravelersResponse = arrayEnvelope(bookingTravelerRecordSchema)
export const bookingTravelerSingleResponse = singleEnvelope(bookingTravelerRevealRecordSchema)
export const bookingTravelerSharingGroupsResponse = arrayEnvelope(
  bookingTravelerSharingGroupSummarySchema,
)
export const bookingTravelersBySharingGroupResponse = arrayEnvelope(
  bookingTravelerSharingGroupMemberSchema,
)
export const bookingSupplierStatusesResponse = arrayEnvelope(bookingSupplierStatusRecordSchema)
export const bookingActivityResponse = arrayEnvelope(bookingActivityRecordSchema)
export const bookingNotesResponse = arrayEnvelope(bookingNoteRecordSchema)
// Pricing preview — the catalog-resolved snapshot the storefront engine uses
// to compute totals. Consumers match it against their traveler/unit selection
// to render a breakdown; see @voyant-travel/bookings/validation for the request.
const pricingPreviewCatalogSchema = z.object({
  id: z.string(),
  currencyCode: z.string(),
})
const pricingPreviewOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
})
const pricingPreviewRuleSchema = z.object({
  id: z.string(),
  optionId: z.string(),
  pricingMode: z.string(),
  baseSellAmountCents: z.number().int().nullable(),
  isDefault: z.boolean(),
})
const pricingPreviewUnitTierSchema = z.object({
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable(),
})
const pricingPreviewUnitPriceSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string().nullable().optional().default(null),
  unitId: z.string(),
  unitName: z.string().nullable(),
  unitType: z.string().nullable(),
  occupancyMax: z.number().int().nullable().optional().default(null),
  pricingCategoryId: z.string().nullable(),
  pricingMode: z.string(),
  sellAmountCents: z.number().int().nullable(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  tiers: z.array(pricingPreviewUnitTierSchema),
})
const pricingPreviewCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  categoryType: z.string(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  sortOrder: z.number().int(),
})
export const pricingPreviewSnapshotSchema = z.object({
  catalog: pricingPreviewCatalogSchema,
  options: z.array(pricingPreviewOptionSchema),
  rules: z.array(pricingPreviewRuleSchema),
  pricingCategories: z.array(pricingPreviewCategorySchema).optional().default([]),
  unitPrices: z.array(pricingPreviewUnitPriceSchema),
})
export type PricingPreviewSnapshot = z.infer<typeof pricingPreviewSnapshotSchema>
export const pricingPreviewResponse = singleEnvelope(pricingPreviewSnapshotSchema)

// Tax preview — sell-side resolution of the tax line the booking
// would carry given the current subtotal. Backed by the mountable
// booking-tax route.
const taxPreviewRateSchema = z.object({
  code: z.string(),
  label: z.string(),
  rateBasisPoints: z.number().int(),
  priceMode: z.enum(["inclusive", "exclusive"]),
})
export const taxPreviewSnapshotSchema = z.object({
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.string(),
  taxRate: taxPreviewRateSchema.nullable(),
})
export type TaxPreviewSnapshot = z.infer<typeof taxPreviewSnapshotSchema>
export const taxPreviewResponse = singleEnvelope(taxPreviewSnapshotSchema)

// Booking action ledger — `GET /v1/admin/bookings/:id/action-ledger`.
// Mirrors the server's `BookingActionLedgerListResponse` (an
// `ActionLedgerEntryResponse[]` page plus the booking's travelers so
// traveler-targeted entries can be labeled client-side). The entry
// shape is kept inline rather than imported from the server package
// so the browser bundle doesn't drag in drizzle.
export const bookingActionLedgerActionKindSchema = z.enum([
  "read",
  "create",
  "update",
  "delete",
  "execute",
  "approve",
  "reject",
  "reverse",
  "compensate",
  "duplicate",
])

export const bookingActionLedgerStatusSchema = z.enum([
  "requested",
  "awaiting_approval",
  "approved",
  "denied",
  "succeeded",
  "failed",
  "reversed",
  "compensated",
  "expired",
  "cancelled",
  "superseded",
])

export const bookingActionLedgerRiskSchema = z.enum(["low", "medium", "high", "critical"])

export const bookingActionLedgerPrincipalTypeSchema = z.enum([
  "user",
  "api_key",
  "agent",
  "workflow",
  "system",
])

export const bookingActionLedgerEntrySchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  actionName: z.string(),
  actionVersion: z.string(),
  actionKind: bookingActionLedgerActionKindSchema,
  status: bookingActionLedgerStatusSchema,
  evaluatedRisk: bookingActionLedgerRiskSchema,
  actorType: z.string().nullable(),
  principalType: bookingActionLedgerPrincipalTypeSchema,
  principalId: z.string(),
  principalSubtype: z.string().nullable(),
  sessionId: z.string().nullable(),
  apiTokenId: z.string().nullable(),
  internalRequest: z.boolean(),
  delegatedByPrincipalType: bookingActionLedgerPrincipalTypeSchema.nullable(),
  delegatedByPrincipalId: z.string().nullable(),
  delegationId: z.string().nullable(),
  callerType: z.string().nullable(),
  organizationId: z.string().nullable(),
  routeOrToolName: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  workflowStepId: z.string().nullable(),
  correlationId: z.string().nullable(),
  causationActionId: z.string().nullable(),
  idempotencyScope: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  idempotencyFingerprint: z.string().nullable(),
  targetType: z.string(),
  targetId: z.string(),
  capabilityId: z.string().nullable(),
  capabilityVersion: z.string().nullable(),
  authorizationSource: z.string().nullable(),
  approvalId: z.string().nullable(),
  amendsActionId: z.string().nullable(),
  createdAt: z.string(),
})

export type BookingActionLedgerEntryRecord = z.infer<typeof bookingActionLedgerEntrySchema>

export const bookingActionLedgerCursorSchema = z.object({
  occurredAt: z.string(),
  id: z.string(),
})

export type BookingActionLedgerCursor = z.infer<typeof bookingActionLedgerCursorSchema>

export const bookingActionLedgerTravelerSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
})

export type BookingActionLedgerTraveler = z.infer<typeof bookingActionLedgerTravelerSchema>

export const bookingActionLedgerListResponse = z.object({
  data: z.array(bookingActionLedgerEntrySchema),
  travelers: z.array(bookingActionLedgerTravelerSchema),
  pageInfo: z.object({
    nextCursor: bookingActionLedgerCursorSchema.nullable(),
  }),
})

export type BookingActionLedgerListResult = z.infer<typeof bookingActionLedgerListResponse>
