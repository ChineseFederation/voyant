import { booleanQueryParam } from "@voyant-travel/db/helpers"
import { z } from "zod"
import { validateRRule } from "./rrule.js"
import { instantToSlotLocal } from "./slot-timezone.js"

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const availabilitySlotStatusSchema = z.enum(["open", "closed", "sold_out", "cancelled"])
export const meetingModeSchema = z.enum(["meeting_only", "pickup_only", "meet_or_pickup"])
export const pickupGroupKindSchema = z.enum(["pickup", "dropoff", "meeting"])
export const pickupTimingModeSchema = z.enum(["fixed_time", "offset_from_start"])
export const allocationResourceKindSchema = z.string().trim().min(1).max(80)
export const operatedDepartureResourceKindSchema = z.enum(["room", "vehicle", "vehicle_seat"])
export const allocationResourceFlagsSchema = z.record(z.string(), z.unknown())
export const travelerAllocationMapSchema = z.record(z.string(), z.string())

/**
 * Explicit 2D seat layout for vehicle_seat templates. Each row is a list of
 * cells the materializer walks:
 *
 *   - `seat` → creates one vehicle_seat resource
 *   - `aisle` → renders as a horizontal gap between seat blocks
 *   - `door` → renders as a wider gap (mid-coach door is common)
 *   - `void` → empty cell (wheelchair spot, toilet, kitchen, wheel well)
 *
 * Stored on the template's `flags.layoutSpec`. When present, the materializer
 * ignores the legacy `layout` string + `capacity` (capacity is derived from
 * the number of "seat" cells). The availability React renderer mirrors the
 * same grid so the visual seat map matches what the operator drew.
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

const isoDateSchema = z.string().date()
const isoDateTimeSchema = z.string().datetime()

function validateRecurrenceRule(value: { recurrenceRule?: string }, ctx: z.RefinementCtx) {
  if (value.recurrenceRule === undefined) return
  const result = validateRRule(value.recurrenceRule)
  if (!result.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceRule"],
      message: result.message,
    })
  }
}

function validateSlotTimingAndCapacity(
  value: {
    dateLocal?: string
    startsAt?: string
    endsAt?: string | null
    timezone?: string
    unlimited?: boolean
    initialPax?: number | null
    remainingPax?: number | null
  },
  ctx: z.RefinementCtx,
  options: { validateRemainingPax?: boolean } = {},
) {
  const validateRemainingPax = options.validateRemainingPax ?? true

  if (value.startsAt !== undefined && value.endsAt) {
    const startsAt = Date.parse(value.startsAt)
    const endsAt = Date.parse(value.endsAt)
    if (Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt < startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "endsAt must be greater than or equal to startsAt",
      })
    }
  }

  if (
    validateRemainingPax &&
    value.unlimited !== true &&
    value.initialPax !== undefined &&
    value.initialPax !== null &&
    value.remainingPax !== undefined &&
    value.remainingPax !== null &&
    value.remainingPax > value.initialPax
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["remainingPax"],
      message: "remainingPax must be less than or equal to initialPax",
    })
  }

  if (
    value.dateLocal !== undefined &&
    value.startsAt !== undefined &&
    value.timezone !== undefined
  ) {
    try {
      const startsAtDateLocal = instantToSlotLocal(value.startsAt, value.timezone).date
      if (value.dateLocal !== startsAtDateLocal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateLocal"],
          message: "dateLocal must match startsAt in the slot timezone",
        })
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timezone"],
        message: "timezone must be a valid IANA timezone for startsAt",
      })
    }
  }
}

export const availabilityRuleCoreSchema = z.object({
  productId: z.string(),
  optionId: z.string().nullable().optional(),
  facilityId: z.string().nullable().optional(),
  timezone: z.string().min(1),
  recurrenceRule: z.string().min(1),
  maxCapacity: z.number().int().min(0),
  maxPickupCapacity: z.number().int().min(0).nullable().optional(),
  minTotalPax: z.number().int().min(0).nullable().optional(),
  cutoffMinutes: z.number().int().min(0).nullable().optional(),
  earlyBookingLimitMinutes: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
})

export const insertAvailabilityRuleSchema =
  availabilityRuleCoreSchema.superRefine(validateRecurrenceRule)
export const updateAvailabilityRuleSchema = availabilityRuleCoreSchema
  .partial()
  .superRefine(validateRecurrenceRule)
export const availabilityRuleListQuerySchema = paginationSchema.extend({
  productId: z.string().optional(),
  optionId: z.string().optional(),
  facilityId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const availabilityStartTimeCoreSchema = z.object({
  productId: z.string(),
  optionId: z.string().nullable().optional(),
  facilityId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  startTimeLocal: z.string().min(1),
  durationMinutes: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
})

export const insertAvailabilityStartTimeSchema = availabilityStartTimeCoreSchema
export const updateAvailabilityStartTimeSchema = availabilityStartTimeCoreSchema.partial()
export const availabilityStartTimeListQuerySchema = paginationSchema.extend({
  productId: z.string().optional(),
  optionId: z.string().optional(),
  facilityId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const availabilitySlotCoreSchema = z.object({
  productId: z.string(),
  /**
   * The Product Version this departure operates from. Normally resolved at
   * creation from the product's currently published version; supply it
   * explicitly to materialize a departure against a specific version. Null
   * when the product has never been published or for legacy rows (#4032).
   */
  productVersionId: z.string().nullable().optional(),
  itineraryId: z.string().nullable().optional(),
  optionId: z.string().nullable().optional(),
  facilityId: z.string().nullable().optional(),
  availabilityRuleId: z.string().nullable().optional(),
  startTimeId: z.string().nullable().optional(),
  dateLocal: isoDateSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable().optional(),
  timezone: z.string().min(1),
  status: availabilitySlotStatusSchema.default("open"),
  unlimited: z.boolean().default(false),
  initialPax: z.number().int().min(0).nullable().optional(),
  remainingPax: z.number().int().min(0).nullable().optional(),
  initialPickups: z.number().int().min(0).nullable().optional(),
  remainingPickups: z.number().int().min(0).nullable().optional(),
  remainingResources: z.number().int().min(0).nullable().optional(),
  pastCutoff: z.boolean().default(false),
  tooEarly: z.boolean().default(false),
  nights: z.number().int().min(0).nullable().optional(),
  days: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const insertAvailabilitySlotSchema = availabilitySlotCoreSchema.superRefine(
  validateSlotTimingAndCapacity,
)
export const updateAvailabilitySlotSchema = availabilitySlotCoreSchema
  .partial()
  .superRefine((value, ctx) =>
    validateSlotTimingAndCapacity(value, ctx, { validateRemainingPax: false }),
  )
export const availabilitySlotListQuerySchema = paginationSchema.extend({
  productId: z.string().optional(),
  itineraryId: z.string().optional(),
  optionId: z.string().optional(),
  facilityId: z.string().optional(),
  availabilityRuleId: z.string().optional(),
  startTimeId: z.string().optional(),
  dateLocal: isoDateSchema.optional(),
  startsAtFrom: isoDateTimeSchema.optional(),
  startsAtUntil: isoDateTimeSchema.optional(),
  status: availabilitySlotStatusSchema.optional(),
})

export const availabilityAggregatesQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export const availabilityOverviewQuerySchema = z.object({
  productId: z.string().optional(),
  attentionLimit: z.coerce.number().int().min(1).max(20).default(4),
})

export const availabilityCloseoutCoreSchema = z.object({
  productId: z.string(),
  slotId: z.string().nullable().optional(),
  dateLocal: isoDateSchema,
  reason: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
})

export const insertAvailabilityCloseoutSchema = availabilityCloseoutCoreSchema
export const updateAvailabilityCloseoutSchema = availabilityCloseoutCoreSchema.partial()
export const availabilityCloseoutListQuerySchema = paginationSchema.extend({
  productId: z.string().optional(),
  slotId: z.string().optional(),
  dateLocal: isoDateSchema.optional(),
})

export const allocationResourceCoreSchema = z.object({
  kind: allocationResourceKindSchema,
  refType: z.string().nullable().optional(),
  refId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  capacity: z.number().int().min(1),
  flags: allocationResourceFlagsSchema.default({}),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
})

export const insertAllocationResourceSchema = allocationResourceCoreSchema.superRefine(
  (value, ctx) => {
    if (value.kind !== "vehicle_seat") return
    if (value.capacity !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["capacity"],
        message: "A vehicle seat must have capacity 1",
      })
    }
    if (!value.parentId) {
      ctx.addIssue({
        code: "custom",
        path: ["parentId"],
        message: "A vehicle seat must belong to a vehicle",
      })
    }
    if (!value.label?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: "A vehicle seat must have a designation",
      })
    }
  },
)
/**
 * `expectedUpdatedAt` is the optimistic-concurrency precondition: the
 * `updatedAt` the caller read. Supplying it rejects a patch computed against a
 * resource somebody else has since re-shaped (a coach whose capacity was
 * lowered under you) with 409 instead of silently overwriting.
 */
export const updateAllocationResourceSchema = allocationResourceCoreSchema
  .omit({ kind: true })
  .partial()
  .extend({ expectedUpdatedAt: isoDateTimeSchema.optional() })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), {
    message: "Patch payload is required",
  })

export const deleteAllocationResourceQuerySchema = z.object({
  expectedUpdatedAt: isoDateTimeSchema.optional(),
})

/**
 * Attach an existing fleet `resources` record to a departure. `kind` and
 * `capacity` default from the fleet record; name them when it does not carry
 * one (a `guide`/`equipment` resource, or a coach with no declared capacity).
 */
export const attachDepartureResourceSchema = z.object({
  resourceId: z.string().trim().min(1),
  kind: allocationResourceKindSchema.optional(),
  capacity: z.number().int().min(1).optional(),
  label: z.string().trim().min(1).max(160).nullable().optional(),
  flags: allocationResourceFlagsSchema.default({}),
  sortOrder: z.number().int().default(0),
  notes: z.string().trim().max(500).nullable().optional(),
})

export const detachDepartureResourceQuerySchema = z.object({
  expectedUpdatedAt: isoDateTimeSchema.optional(),
  /** Remove the attached resource's children (a coach's seats) with it. */
  cascade: booleanQueryParam.optional(),
})

/**
 * Place a whole set of travelers in one transaction. `expectedResourceId` is
 * the per-traveler optimistic-concurrency precondition — omit it to write
 * unconditionally, pass `null` to require the traveler to be unassigned.
 */
export const batchAssignTravelerAllocationsSchema = z
  .object({
    kind: allocationResourceKindSchema,
    assignments: z
      .array(
        z.object({
          travelerId: z.string().trim().min(1),
          resourceId: z.string().trim().min(1).nullable(),
          expectedResourceId: z.string().trim().min(1).nullable().optional(),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine(
    (value) =>
      value.kind !== "vehicle" ||
      value.assignments.every((assignment) => assignment.resourceId === null),
    {
      path: ["kind"],
      message: "Vehicles are parent resources; assign travelers to vehicle seats instead",
    },
  )

export const allocationKindQuerySchema = z.object({
  kind: allocationResourceKindSchema.default("room"),
})

export const assignTravelerAllocationSchema = z
  .object({
    kind: allocationResourceKindSchema,
    resourceId: z.string().nullable(),
  })
  .refine((value) => value.kind !== "vehicle" || value.resourceId === null, {
    path: ["kind"],
    message: "Vehicles are parent resources; assign travelers to vehicle seats instead",
  })

export const updateTravelerSharingGroupSchema = z.object({
  sharingGroupId: z.string().trim().min(1).nullable(),
})

export const pairSharingGroupSchema = z.object({
  travelerIds: z.array(z.string().min(1)).min(2).max(20),
  sharingGroupId: z.string().trim().min(1).optional(),
})

export const updateSharingGroupLabelSchema = z.object({
  label: z.string().trim().min(1).max(120),
})

export const upsertResourceTemplateSchema = z.object({
  capacity: z.number().int().min(1),
  namePattern: z.string().trim().min(1).max(160).default("Room {sequence}"),
  refType: z.string().trim().min(1).nullable().optional(),
  refId: z.string().trim().min(1).nullable().optional(),
  layout: z.string().trim().min(1).nullable().optional(),
  defaultCount: z.number().int().min(0).nullable().optional(),
  flags: allocationResourceFlagsSchema.default({}),
})

export const allocationAutomationSchema = z.object({
  kind: allocationResourceKindSchema.default("room"),
})

export const materializeOpenSlotsSchema = z.object({
  optionId: z.string().optional(),
})

/**
 * Paging for the slot allocation manifest's **booking** axis.
 *
 * `limit` is optional on purpose: omitting it returns every booking, which is
 * what this route did before it could page, so no existing caller changes
 * behaviour. The manifest's `summary` counters are whole-departure regardless
 * of the page — see `SlotAllocationManifestPagination`.
 */
export const allocationManifestQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
})

export const allocationAuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const availabilityPickupPointCoreSchema = z.object({
  productId: z.string(),
  facilityId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  locationText: z.string().nullable().optional(),
  active: z.boolean().default(true),
})

export const insertAvailabilityPickupPointSchema = availabilityPickupPointCoreSchema
export const updateAvailabilityPickupPointSchema = availabilityPickupPointCoreSchema.partial()
export const availabilityPickupPointListQuerySchema = paginationSchema.extend({
  productId: z.string().optional(),
  facilityId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const availabilitySlotPickupCoreSchema = z.object({
  slotId: z.string(),
  pickupPointId: z.string(),
  initialCapacity: z.number().int().min(0).nullable().optional(),
  remainingCapacity: z.number().int().min(0).nullable().optional(),
})

export const insertAvailabilitySlotPickupSchema = availabilitySlotPickupCoreSchema
export const updateAvailabilitySlotPickupSchema = availabilitySlotPickupCoreSchema.partial()
export const availabilitySlotPickupListQuerySchema = paginationSchema.extend({
  slotId: z.string().optional(),
  pickupPointId: z.string().optional(),
})

export const productMeetingConfigCoreSchema = z.object({
  productId: z.string(),
  optionId: z.string().nullable().optional(),
  facilityId: z.string().nullable().optional(),
  mode: meetingModeSchema.default("meeting_only"),
  allowCustomPickup: z.boolean().default(false),
  allowCustomDropoff: z.boolean().default(false),
  requiresPickupSelection: z.boolean().default(false),
  requiresDropoffSelection: z.boolean().default(false),
  usePickupAllotment: z.boolean().default(false),
  meetingInstructions: z.string().nullable().optional(),
  pickupInstructions: z.string().nullable().optional(),
  dropoffInstructions: z.string().nullable().optional(),
  active: z.boolean().default(true),
})

export const insertProductMeetingConfigSchema = productMeetingConfigCoreSchema
export const updateProductMeetingConfigSchema = productMeetingConfigCoreSchema.partial()
export const productMeetingConfigListQuerySchema = paginationSchema.extend({
  productId: z.string().optional(),
  optionId: z.string().optional(),
  facilityId: z.string().optional(),
  mode: meetingModeSchema.optional(),
  active: booleanQueryParam.optional(),
})

export const pickupGroupCoreSchema = z.object({
  meetingConfigId: z.string(),
  kind: pickupGroupKindSchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export const insertPickupGroupSchema = pickupGroupCoreSchema
export const updatePickupGroupSchema = pickupGroupCoreSchema.partial()
export const pickupGroupListQuerySchema = paginationSchema.extend({
  meetingConfigId: z.string().optional(),
  kind: pickupGroupKindSchema.optional(),
  active: booleanQueryParam.optional(),
})

export const pickupLocationCoreSchema = z.object({
  groupId: z.string(),
  facilityId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  locationText: z.string().nullable().optional(),
  leadTimeMinutes: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export const insertPickupLocationSchema = pickupLocationCoreSchema
export const updatePickupLocationSchema = pickupLocationCoreSchema.partial()
export const pickupLocationListQuerySchema = paginationSchema.extend({
  groupId: z.string().optional(),
  facilityId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const locationPickupTimeCoreSchema = z.object({
  pickupLocationId: z.string(),
  slotId: z.string().nullable().optional(),
  startTimeId: z.string().nullable().optional(),
  timingMode: pickupTimingModeSchema.default("fixed_time"),
  localTime: z.string().nullable().optional(),
  offsetMinutes: z.number().int().nullable().optional(),
  instructions: z.string().nullable().optional(),
  initialCapacity: z.number().int().min(0).nullable().optional(),
  remainingCapacity: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
})

export const insertLocationPickupTimeSchema = locationPickupTimeCoreSchema
export const updateLocationPickupTimeSchema = locationPickupTimeCoreSchema.partial()
export const locationPickupTimeListQuerySchema = paginationSchema.extend({
  pickupLocationId: z.string().optional(),
  slotId: z.string().optional(),
  startTimeId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const customPickupAreaCoreSchema = z.object({
  meetingConfigId: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  geographicText: z.string().nullable().optional(),
  active: z.boolean().default(true),
})

export const insertCustomPickupAreaSchema = customPickupAreaCoreSchema
export const updateCustomPickupAreaSchema = customPickupAreaCoreSchema.partial()
export const customPickupAreaListQuerySchema = paginationSchema.extend({
  meetingConfigId: z.string().optional(),
  active: booleanQueryParam.optional(),
})
