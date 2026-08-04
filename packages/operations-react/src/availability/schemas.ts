import {
  insertAllocationResourceSchema,
  insertAvailabilityCloseoutSchema,
  insertAvailabilityPickupPointSchema,
  insertAvailabilityRuleSchema,
  insertAvailabilitySlotSchema,
  insertAvailabilityStartTimeSchema,
  updateAllocationResourceSchema,
  updateAvailabilityCloseoutSchema,
  updateAvailabilityPickupPointSchema,
  updateAvailabilityRuleSchema,
  updateAvailabilitySlotSchema,
  updateAvailabilityStartTimeSchema,
  upsertResourceTemplateSchema,
} from "@voyant-travel/operations/validation"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import {
  allocationCompromiseSchema,
  allocationResourceSchema,
  allocationUnplacedGroupSchema,
} from "./allocation-schemas.js"

export const paginatedEnvelope = listResponseSchema

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })
export const successEnvelope = z.object({ success: z.boolean() })

export const batchFailureSchema = z.object({ id: z.string(), error: z.string() })
export type BatchFailure = z.infer<typeof batchFailureSchema>

/**
 * Envelope of the availability `POST <entity>/batch-update` endpoints
 * (success/partial-failure: `failed` lists the ids that were not found).
 */
export const batchUpdateEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    total: z.number().int(),
    succeeded: z.number().int(),
    failed: z.array(batchFailureSchema),
  })

/** Envelope of the availability `POST <entity>/batch-delete` endpoints. */
export const batchDeleteEnvelope = z.object({
  deletedIds: z.array(z.string()),
  total: z.number().int(),
  succeeded: z.number().int(),
  failed: z.array(batchFailureSchema),
})

export type BatchUpdateResponse<TRecord> = {
  data: TRecord[]
  total: number
  succeeded: number
  failed: BatchFailure[]
}
export type BatchDeleteResponse = z.infer<typeof batchDeleteEnvelope>

export const productOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  sellCurrency: z.string().nullable().default(null),
  productType: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
})

export type ProductOption = z.infer<typeof productOptionSchema>

export const availabilityRuleRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string().nullable().optional(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  timezone: z.string(),
  recurrenceRule: z.string(),
  maxCapacity: z.number().int(),
  maxPickupCapacity: z.number().int().nullable(),
  minTotalPax: z.number().int().nullable(),
  cutoffMinutes: z.number().int().nullable(),
  earlyBookingLimitMinutes: z.number().int().nullable(),
  active: z.boolean(),
})

export type AvailabilityRuleRecord = z.infer<typeof availabilityRuleRecordSchema>
export type AvailabilityRuleRow = AvailabilityRuleRecord

export const availabilityStartTimeRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string().nullable().optional(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  label: z.string().nullable(),
  startTimeLocal: z.string(),
  durationMinutes: z.number().int().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
})

export type AvailabilityStartTimeRecord = z.infer<typeof availabilityStartTimeRecordSchema>
export type AvailabilityStartTimeRow = AvailabilityStartTimeRecord

export const availabilitySlotRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string().nullable().optional(),
  itineraryId: z.string().nullable(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  availabilityRuleId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  dateLocal: z.string(),
  endDateLocal: z.string().nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  timezone: z.string(),
  status: z.enum(["open", "closed", "sold_out", "cancelled"]),
  unlimited: z.boolean(),
  initialPax: z.number().int().nullable(),
  remainingPax: z.number().int().nullable(),
  nights: z.number().int().nullable(),
  days: z.number().int().nullable(),
  notes: z.string().nullable(),
})

export type AvailabilitySlotRecord = z.infer<typeof availabilitySlotRecordSchema>
export type AvailabilitySlotRow = AvailabilitySlotRecord

export const availabilitySlotDetailSchema = availabilitySlotRecordSchema.extend({
  initialPickups: z.number().int().nullable(),
  remainingPickups: z.number().int().nullable(),
  remainingResources: z.number().int().nullable(),
  pastCutoff: z.boolean(),
  tooEarly: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AvailabilitySlotDetail = z.infer<typeof availabilitySlotDetailSchema>

export const availabilityCloseoutRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string().nullable().optional(),
  slotId: z.string().nullable(),
  dateLocal: z.string(),
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
})

export type AvailabilityCloseoutRow = z.infer<typeof availabilityCloseoutRecordSchema>

export const availabilitySlotPickupRecordSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  pickupPointId: z.string(),
  initialCapacity: z.number().int().nullable(),
  remainingCapacity: z.number().int().nullable(),
})

export type AvailabilitySlotPickupRow = z.infer<typeof availabilitySlotPickupRecordSchema>

export const availabilityPickupPointRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable(),
  locationText: z.string().nullable(),
  active: z.boolean(),
})

export type AvailabilityPickupPointRow = z.infer<typeof availabilityPickupPointRecordSchema>

export const bookingSummarySchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
})

export type BookingSummary = z.infer<typeof bookingSummarySchema>

export const resourceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
})

export type ResourceSummary = z.infer<typeof resourceSummarySchema>

export const availabilitySlotAssignmentRecordSchema = z.object({
  id: z.string(),
  poolId: z.string().nullable(),
  resourceId: z.string().nullable(),
  bookingId: z.string().nullable(),
  status: z.enum(["reserved", "assigned", "released", "cancelled", "completed"]),
  assignedBy: z.string().nullable(),
  releasedAt: z.string().nullable(),
  notes: z.string().nullable(),
})

export type AvailabilitySlotAssignmentRow = z.infer<typeof availabilitySlotAssignmentRecordSchema>

export const productSingleResponse = z.object({
  data: productOptionSchema,
})

export const productListResponse = paginatedEnvelope(productOptionSchema)
export const availabilityRuleListResponse = paginatedEnvelope(availabilityRuleRecordSchema)
export const availabilityRuleSingleResponse = singleEnvelope(availabilityRuleRecordSchema)
export const availabilityStartTimeListResponse = paginatedEnvelope(
  availabilityStartTimeRecordSchema,
)
export const availabilityStartTimeSingleResponse = singleEnvelope(availabilityStartTimeRecordSchema)
export const availabilitySlotListResponse = paginatedEnvelope(availabilitySlotRecordSchema)
export const availabilitySlotRecordResponse = singleEnvelope(availabilitySlotRecordSchema)
export const availabilitySlotSingleResponse = singleEnvelope(availabilitySlotDetailSchema)
export const availabilityOverviewResponse = singleEnvelope(
  z.object({
    openSlotsCount: z.number().int(),
    constrainedSlotsCount: z.number().int(),
    activeRulesCount: z.number().int(),
    activePickupPointsCount: z.number().int(),
    productsWithoutUpcomingDeparturesCount: z.number().int(),
    productsWithoutUpcomingDepartures: z.array(productOptionSchema),
    constrainedSlots: z.array(availabilitySlotRecordSchema),
  }),
)
export type AvailabilityOverviewData = z.infer<typeof availabilityOverviewResponse>["data"]
export const availabilityCloseoutListResponse = paginatedEnvelope(availabilityCloseoutRecordSchema)
export const availabilityCloseoutSingleResponse = singleEnvelope(availabilityCloseoutRecordSchema)
export const availabilityPickupPointListResponse = paginatedEnvelope(
  availabilityPickupPointRecordSchema,
)
export const availabilityPickupPointSingleResponse = singleEnvelope(
  availabilityPickupPointRecordSchema,
)
export const availabilitySlotPickupListResponse = paginatedEnvelope(
  availabilitySlotPickupRecordSchema,
)
export const availabilitySlotAssignmentListResponse = paginatedEnvelope(
  availabilitySlotAssignmentRecordSchema,
)
export const bookingSummaryListResponse = paginatedEnvelope(bookingSummarySchema)
export const resourceSummaryListResponse = paginatedEnvelope(resourceSummarySchema)

export const allocationPaymentStatusSchema = z.enum(["paid", "partial", "unpaid"])
export type AllocationPaymentStatus = z.infer<typeof allocationPaymentStatusSchema>

export const allocationManifestTravelerSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingNumber: z.string(),
  bookingStatus: z.string(),
  /**
   * Per-slot booking ordinal (1-based, ordered by booking createdAt). All
   * travelers on the same booking share the same number so the operator
   * can see at a glance which chips belong together. Defaults to 0 for
   * back-compat when the server is older.
   */
  bookingSequence: z.number().int().nonnegative().default(0),
  paymentStatus: allocationPaymentStatusSchema.default("unpaid"),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isLeadTraveler: z.boolean(),
  isPrimary: z.boolean(),
  sharingGroupId: z.string().nullable(),
  roomTypeId: z.string().nullable(),
  bedPreference: z.string().nullable(),
  allocations: z.record(z.string(), z.string()),
  travelerCategory: z.string().nullable(),
  participantType: z.string(),
  hasAccessibilityNeeds: z.boolean(),
  hasDietaryRequirements: z.boolean(),
})

export type AllocationManifestTraveler = z.infer<typeof allocationManifestTravelerSchema>

export const allocationManifestBookingSchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
  status: z.string(),
  /** Per-slot ordinal (1-based, by booking createdAt). */
  bookingSequence: z.number().int().nonnegative().default(0),
  paymentStatus: allocationPaymentStatusSchema.default("unpaid"),
  contactFirstName: z.string().nullable(),
  contactLastName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  sellCurrency: z.string().nullable(),
  pax: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable().default(null),
  paidAmountCents: z.number().int().nullable().default(null),
  travelers: z.array(allocationManifestTravelerSchema),
})

export type AllocationManifestBooking = z.infer<typeof allocationManifestBookingSchema>

export const slotAllocationManifestSchema = z.object({
  slot: z.object({
    id: z.string(),
    productId: z.string().nullable(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
  }),
  bookings: z.array(allocationManifestBookingSchema),
  resources: z.array(allocationResourceSchema),
  sharingGroupLabels: z.record(z.string(), z.string()),
  summary: z.object({
    bookingCount: z.number().int(),
    travelerCount: z.number().int(),
    leadTravelerCount: z.number().int(),
    bookingsByStatus: z.record(z.string(), z.number().int()),
  }),
})

export type SlotAllocationManifest = z.infer<typeof slotAllocationManifestSchema>
export const slotAllocationManifestResponse = singleEnvelope(slotAllocationManifestSchema)

/**
 * 2D seat layout for vehicle_seat templates. Mirrors `seatLayoutSpecSchema`
 * in @voyant-travel/operations; the schemas are kept in sync by intent because
 * availability-react can't depend on the server-side package.
 */
export const seatLayoutCellSchema = z.enum(["seat", "aisle", "door", "void"])
export type SeatLayoutCell = z.infer<typeof seatLayoutCellSchema>

export const seatLayoutSpecSchema = z.object({
  rows: z
    .array(
      z.object({
        cells: z.array(seatLayoutCellSchema).min(1).max(20),
      }),
    )
    .min(1)
    .max(40),
})
export type SeatLayoutSpec = z.infer<typeof seatLayoutSpecSchema>

export const resourceTemplateSchema = z.object({
  id: z.string(),
  productOptionId: z.string(),
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  /** Maximum occupancy; the service keeps it in step with `occupancyMax`. */
  capacity: z.number().int(),
  occupancyMin: z.number().int().nullable().default(null),
  occupancyMax: z.number().int().nullable().default(null),
  minAge: z.number().int().nullable().default(null),
  maxAge: z.number().int().nullable().default(null),
  roomTypeId: z.string().nullable().default(null),
  bedConfiguration: z.string().nullable().default(null),
  accessible: z.boolean().default(false),
  namePattern: z.string(),
  layout: z.string().nullable(),
  defaultCount: z.number().int().nullable(),
  flags: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ResourceTemplate = z.infer<typeof resourceTemplateSchema>

export const productOptionResourceTemplatesSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  templates: z.array(resourceTemplateSchema),
})

export type ProductOptionResourceTemplates = z.infer<typeof productOptionResourceTemplatesSchema>

export const productOptionResourceTemplatesListResponse = z.object({
  data: z.array(productOptionResourceTemplatesSchema),
})

export const allocationAutomationResponse = singleEnvelope(
  z.object({
    kind: z.string(),
    assigned: z.number().int().optional(),
    skipped: z.number().int().optional(),
    /** The groups behind `skipped`, each with its sharing group and a reason. */
    unplaced: z.array(allocationUnplacedGroupSchema).optional(),
    /** Groups the planner could only place by relaxing a constraint. */
    compromises: z.array(allocationCompromiseSchema).optional(),
    created: z.number().int().optional(),
    skippedExisting: z.number().int().optional(),
    resources: z.array(allocationResourceSchema).optional(),
  }),
)

export const sharingGroupLabelSchema = z.object({
  groupId: z.string(),
  label: z.string(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
})

export type SharingGroupLabel = z.infer<typeof sharingGroupLabelSchema>

export const allocationAuditLogEntrySchema = z.object({
  id: z.string(),
  slotId: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  travelerId: z.string().nullable(),
  resourceId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
})

export type AllocationAuditLogEntry = z.infer<typeof allocationAuditLogEntrySchema>

export const allocationAuditLogResponse = z.object({
  data: z.array(allocationAuditLogEntrySchema),
})

export * from "./allocation-schemas.js"
export * from "./departure-summary-schemas.js"

export const slotUnitAvailabilityRecordSchema = z.object({
  optionUnitId: z.string(),
  unitName: z.string(),
  occupancyMax: z.number().int().nullable(),
  initial: z.number().int().nullable(),
  reserved: z.number().int(),
  remaining: z.number().int().nullable(),
})
export type SlotUnitAvailabilityRecord = z.infer<typeof slotUnitAvailabilityRecordSchema>
export const slotUnitAvailabilityListResponse = z.object({
  data: z.array(slotUnitAvailabilityRecordSchema),
})

export {
  insertAllocationResourceSchema,
  insertAvailabilityCloseoutSchema,
  insertAvailabilityPickupPointSchema,
  insertAvailabilityRuleSchema,
  insertAvailabilitySlotSchema,
  insertAvailabilityStartTimeSchema,
  updateAllocationResourceSchema,
  updateAvailabilityCloseoutSchema,
  updateAvailabilityPickupPointSchema,
  updateAvailabilityRuleSchema,
  updateAvailabilitySlotSchema,
  updateAvailabilityStartTimeSchema,
  upsertResourceTemplateSchema,
}

export type CreateAllocationResourceInput = z.input<typeof insertAllocationResourceSchema>
export type UpdateAllocationResourceInput = z.input<typeof updateAllocationResourceSchema>
export type UpsertResourceTemplateInput = z.input<typeof upsertResourceTemplateSchema>
export type CreateAvailabilityRuleInput = z.input<typeof insertAvailabilityRuleSchema>
export type UpdateAvailabilityRuleInput = z.input<typeof updateAvailabilityRuleSchema>
export type CreateAvailabilityStartTimeInput = z.input<typeof insertAvailabilityStartTimeSchema>
export type UpdateAvailabilityStartTimeInput = z.input<typeof updateAvailabilityStartTimeSchema>
export type CreateAvailabilitySlotInput = z.input<typeof insertAvailabilitySlotSchema>
export type UpdateAvailabilitySlotInput = z.input<typeof updateAvailabilitySlotSchema>
export type CreateAvailabilityCloseoutInput = z.input<typeof insertAvailabilityCloseoutSchema>
export type UpdateAvailabilityCloseoutInput = z.input<typeof updateAvailabilityCloseoutSchema>
export type CreateAvailabilityPickupPointInput = z.input<typeof insertAvailabilityPickupPointSchema>
export type UpdateAvailabilityPickupPointInput = z.input<typeof updateAvailabilityPickupPointSchema>
