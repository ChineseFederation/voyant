/**
 * Request schemas for the departure **allocation** surface: resources and their
 * room constraints, traveler placement and its override, sharing groups,
 * product-option resource templates, and the materialisation / auto-allocation
 * automations.
 *
 * Split out of `validation.ts` when #4036 added the room-constraint fields, the
 * assignment override and the room-block materialisation: the allocation
 * schemas had become the larger half of a file whose other half is about slots,
 * rules and closeouts, and the two halves share only their primitives.
 * `validation.ts` re-exports everything here, so no importer changes.
 */

import { booleanQueryParam } from "@voyant-travel/db/helpers"
import { z } from "zod"

import {
  allocationResourceFlagsSchema,
  allocationResourceKindSchema,
} from "./validation-primitives.js"

const isoDateTimeSchema = z.string().datetime()

/**
 * A traveler's bed preference. Mirrors
 * `@voyant-travel/bookings-contracts`'s `bookingTravelerBedPreferenceSchema`
 * — Operations cannot import Bookings' Drizzle column type without a
 * cross-domain schema dependency, so the vocabulary is restated and pinned
 * here. If Bookings adds a value it must be widened in the same change; a
 * rejected write is a better signal than a preference no room rule understands.
 */
export const travelerBedPreferenceSchema = z.enum(["single", "twin", "double", "no-preference"])

export const allocationResourceCoreSchema = z.object({
  kind: allocationResourceKindSchema,
  refType: z.string().nullable().optional(),
  refId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  /** Maximum occupancy. */
  capacity: z.number().int().min(1),
  /** Minimum sold occupancy; must not exceed `capacity`. */
  occupancyMin: z.number().int().min(1).nullable().optional(),
  roomTypeId: z.string().trim().min(1).nullable().optional(),
  bedConfiguration: z.string().trim().min(1).max(160).nullable().optional(),
  accessible: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  maxAge: z.number().int().min(0).max(120).nullable().optional(),
  flags: allocationResourceFlagsSchema.default({}),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
})

function validateOccupancyBand(
  value: {
    capacity?: number | null
    occupancyMin?: number | null
    minAge?: number | null
    maxAge?: number | null
  },
  ctx: z.RefinementCtx,
) {
  if (value.occupancyMin != null && value.capacity != null && value.occupancyMin > value.capacity) {
    ctx.addIssue({
      code: "custom",
      path: ["occupancyMin"],
      message: "occupancyMin must be less than or equal to capacity",
    })
  }
  if (value.minAge != null && value.maxAge != null && value.minAge > value.maxAge) {
    ctx.addIssue({
      code: "custom",
      path: ["maxAge"],
      message: "maxAge must be greater than or equal to minAge",
    })
  }
}

export const insertAllocationResourceSchema = allocationResourceCoreSchema.superRefine(
  (value, ctx) => {
    validateOccupancyBand(value, ctx)
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
  .superRefine(validateOccupancyBand)

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
/**
 * Deliberate waiver of the room constraints for one assignment.
 *
 * A rooming plan that cannot be overridden is a rooming plan operators route
 * around — they will place the family in the wrong room type through some other
 * screen, and the reason will be in nobody's head but theirs. The reason is
 * mandatory and non-empty because the waiver is only defensible if it is on the
 * record: it is written into the audit entry's `after` payload alongside the
 * exact list of rules it waived.
 */
export const allocationOverrideSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

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
    /** Waives the room constraints for the whole batch; see `allocationOverrideSchema`. */
    override: allocationOverrideSchema.optional(),
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
    override: allocationOverrideSchema.optional(),
  })
  .refine((value) => value.kind !== "vehicle" || value.resourceId === null, {
    path: ["kind"],
    message: "Vehicles are parent resources; assign travelers to vehicle seats instead",
  })
  .refine((value) => value.resourceId !== null || value.override === undefined, {
    path: ["override"],
    message: "An unassignment has no constraint to override",
  })

/**
 * The operator-facing write path for the rooming preferences the constraint
 * evaluator reads. Before #4036 `bed_preference` and `room_type_id` were
 * writable only through the admin travel-details API — enforcing constraints on
 * data no operator can enter from the departure workspace is theatre.
 */
export const updateTravelerRoomingPreferencesSchema = z
  .object({
    bedPreference: travelerBedPreferenceSchema.nullable().optional(),
    roomTypeId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Patch payload is required" })

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

export const upsertResourceTemplateSchema = z
  .object({
    /**
     * Maximum occupancy. When `occupancyMax` is supplied the service keeps the
     * two in step, so a materializer still reads exactly one number.
     */
    capacity: z.number().int().min(1),
    occupancyMin: z.number().int().min(1).nullable().optional(),
    occupancyMax: z.number().int().min(1).nullable().optional(),
    minAge: z.number().int().min(0).max(120).nullable().optional(),
    maxAge: z.number().int().min(0).max(120).nullable().optional(),
    roomTypeId: z.string().trim().min(1).nullable().optional(),
    bedConfiguration: z.string().trim().min(1).max(160).nullable().optional(),
    accessible: z.boolean().optional(),
    namePattern: z.string().trim().min(1).max(160).default("Room {sequence}"),
    refType: z.string().trim().min(1).nullable().optional(),
    refId: z.string().trim().min(1).nullable().optional(),
    layout: z.string().trim().min(1).nullable().optional(),
    defaultCount: z.number().int().min(0).nullable().optional(),
    flags: allocationResourceFlagsSchema.default({}),
  })
  .superRefine((value, ctx) => {
    const max = value.occupancyMax ?? value.capacity
    if (value.occupancyMin != null && value.occupancyMin > max) {
      ctx.addIssue({
        code: "custom",
        path: ["occupancyMin"],
        message: "occupancyMin must be less than or equal to the maximum occupancy",
      })
    }
    if (value.minAge != null && value.maxAge != null && value.minAge > value.maxAge) {
      ctx.addIssue({
        code: "custom",
        path: ["maxAge"],
        message: "maxAge must be greater than or equal to minAge",
      })
    }
  })

/**
 * Materialize room positions on a departure from a contracted accommodation
 * block. `rooms` is how many of the block's held rooms this departure takes;
 * omit it to take the block's whole remaining hold for the departure's nights.
 */
export const materializeFromRoomBlockSchema = z.object({
  blockId: z.string().trim().min(1),
  rooms: z.number().int().min(1).max(500).optional(),
  namePattern: z.string().trim().min(1).max(160).default("Room {sequence}"),
  kind: allocationResourceKindSchema.default("room"),
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
