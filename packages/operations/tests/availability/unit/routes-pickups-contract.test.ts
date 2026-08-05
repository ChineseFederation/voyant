import type {
  availabilityPickupPoints,
  availabilitySlotPickups,
  customPickupAreas,
  locationPickupTimes,
  pickupGroups,
  pickupLocations,
  productMeetingConfigs,
} from "@voyant-travel/operations/schema"
import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"

/**
 * Response contract tests (voyant#2114 / voyant#2208 — operations sub-batch
 * 10C) for the availability "pickups" admin routes. Each fixture is typed as
 * the real Drizzle `$inferSelect` row so column drift breaks compilation; the
 * JSON round-trip (Date → ISO string) mirrors `c.json` so a declared/actual
 * mismatch breaks the test. The schemas below mirror the response shapes
 * declared in `availability/routes-pickups.ts` (§17 dates → strings, plus the
 * joined `productName` on the pickup-point and meeting-config list rows).
 */

const isoTimestamp = z.string()
const meetingModeSchema = z.enum(["meeting_only", "pickup_only", "meet_or_pickup"])
const pickupGroupKindSchema = z.enum(["pickup", "dropoff", "meeting"])
const pickupTimingModeSchema = z.enum(["fixed_time", "offset_from_start"])

const availabilityPickupPointSchema = z.object({
  id: z.string(),
  productId: z.string(),
  facilityId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  locationText: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
const availabilityPickupPointListRowSchema = availabilityPickupPointSchema.extend({
  productName: z.string().nullable().optional(),
})

const availabilitySlotPickupSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  pickupPointId: z.string(),
  initialCapacity: z.number().int().nullable(),
  remainingCapacity: z.number().int().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const productMeetingConfigSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  mode: meetingModeSchema,
  allowCustomPickup: z.boolean(),
  allowCustomDropoff: z.boolean(),
  requiresPickupSelection: z.boolean(),
  requiresDropoffSelection: z.boolean(),
  usePickupAllotment: z.boolean(),
  meetingInstructions: z.string().nullable(),
  pickupInstructions: z.string().nullable(),
  dropoffInstructions: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
const productMeetingConfigListRowSchema = productMeetingConfigSchema.extend({
  productName: z.string().nullable().optional(),
})

const pickupGroupSchema = z.object({
  id: z.string(),
  meetingConfigId: z.string(),
  kind: pickupGroupKindSchema,
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const pickupLocationSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  facilityId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  locationText: z.string().nullable(),
  leadTimeMinutes: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const locationPickupTimeSchema = z.object({
  id: z.string(),
  pickupLocationId: z.string(),
  slotId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  timingMode: pickupTimingModeSchema,
  localTime: z.string().nullable(),
  offsetMinutes: z.number().int().nullable(),
  instructions: z.string().nullable(),
  initialCapacity: z.number().int().nullable(),
  remainingCapacity: z.number().int().nullable(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const customPickupAreaSchema = z.object({
  id: z.string(),
  meetingConfigId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  geographicText: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const pickupPointRow: InferSelectModel<typeof availabilityPickupPoints> = {
  id: "availability_pickup_points_000000000000",
  productId: "products_00000000000000000000000000",
  facilityId: null,
  name: "Hotel Lobby",
  description: "Meet at the main entrance",
  locationText: "123 Main St",
  active: true,
  createdAt,
  updatedAt,
}

const slotPickupRow: InferSelectModel<typeof availabilitySlotPickups> = {
  id: "availability_slot_pickups_0000000000000",
  slotId: "availability_slots_00000000000000000000",
  pickupPointId: "availability_pickup_points_000000000000",
  initialCapacity: 10,
  remainingCapacity: 4,
  createdAt,
  updatedAt,
}

const meetingConfigRow: InferSelectModel<typeof productMeetingConfigs> = {
  id: "product_meeting_configs_00000000000000",
  productId: "products_00000000000000000000000000",
  optionId: null,
  facilityId: null,
  mode: "meet_or_pickup",
  allowCustomPickup: true,
  allowCustomDropoff: false,
  requiresPickupSelection: true,
  requiresDropoffSelection: false,
  usePickupAllotment: false,
  meetingInstructions: "Meet at the dock",
  pickupInstructions: null,
  dropoffInstructions: null,
  active: true,
  createdAt,
  updatedAt,
}

const pickupGroupRow: InferSelectModel<typeof pickupGroups> = {
  id: "pickup_groups_000000000000000000000000",
  meetingConfigId: "product_meeting_configs_00000000000000",
  kind: "pickup",
  name: "Downtown hotels",
  description: null,
  active: true,
  sortOrder: 0,
  createdAt,
  updatedAt,
}

const pickupLocationRow: InferSelectModel<typeof pickupLocations> = {
  id: "pickup_locations_0000000000000000000000",
  groupId: "pickup_groups_000000000000000000000000",
  facilityId: null,
  name: "Central Plaza",
  description: null,
  locationText: "Plaza fountain",
  leadTimeMinutes: 15,
  active: true,
  sortOrder: 0,
  createdAt,
  updatedAt,
}

const locationPickupTimeRow: InferSelectModel<typeof locationPickupTimes> = {
  id: "location_pickup_times_000000000000000000",
  pickupLocationId: "pickup_locations_0000000000000000000000",
  slotId: null,
  startTimeId: null,
  timingMode: "fixed_time",
  localTime: "08:30",
  offsetMinutes: null,
  instructions: null,
  initialCapacity: 12,
  remainingCapacity: 12,
  active: true,
  createdAt,
  updatedAt,
}

const customPickupAreaRow: InferSelectModel<typeof customPickupAreas> = {
  id: "custom_pickup_areas_00000000000000000000",
  meetingConfigId: "product_meeting_configs_00000000000000",
  name: "City center",
  description: null,
  geographicText: "Within the old town walls",
  active: true,
  createdAt,
  updatedAt,
}

// The pickup-point and meeting-config list rows are left-joined to `products`
// for the display name; the other five resources have no joined columns.
const listCases = [
  [
    "availability pickup point",
    availabilityPickupPointListRowSchema,
    { ...pickupPointRow, productName: "Sunset Tour" },
  ],
  ["availability slot pickup", availabilitySlotPickupSchema, slotPickupRow],
  [
    "product meeting config",
    productMeetingConfigListRowSchema,
    { ...meetingConfigRow, productName: "Sunset Tour" },
  ],
  ["pickup group", pickupGroupSchema, pickupGroupRow],
  ["pickup location", pickupLocationSchema, pickupLocationRow],
  ["location pickup time", locationPickupTimeSchema, locationPickupTimeRow],
  ["custom pickup area", customPickupAreaSchema, customPickupAreaRow],
] as const

const singleCases = [
  ["availability pickup point", availabilityPickupPointSchema, pickupPointRow],
  ["availability slot pickup", availabilitySlotPickupSchema, slotPickupRow],
  ["product meeting config", productMeetingConfigSchema, meetingConfigRow],
  ["pickup group", pickupGroupSchema, pickupGroupRow],
  ["pickup location", pickupLocationSchema, pickupLocationRow],
  ["location pickup time", locationPickupTimeSchema, locationPickupTimeRow],
  ["custom pickup area", customPickupAreaSchema, customPickupAreaRow],
] as const

describe("availability-pickups list response contracts", () => {
  for (const [label, schema, row] of listCases) {
    it(`the serialized ${label} list satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(
        JSON.stringify(listResponse([row], { total: 1, limit: 50, offset: 0 })),
      )
      const parsed = listResponseSchema(schema).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("availability-pickups single-entity response contracts", () => {
  for (const [label, schema, row] of singleCases) {
    it(`the serialized ${label} { data } envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }

  it("the delete envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z.object({ success: z.literal(true) }).safeParse({ success: true })
    expect(parsed.success).toBe(true)
  })

  it("the batch-update envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z
      .object({
        data: z.array(availabilityPickupPointSchema),
        total: z.number().int(),
        succeeded: z.number().int(),
        failed: z.array(z.object({ id: z.string(), error: z.string() })),
      })
      .safeParse({
        data: JSON.parse(JSON.stringify([pickupPointRow])),
        total: 2,
        succeeded: 1,
        failed: [{ id: "availability_pickup_points_missing", error: "Not found" }],
      })
    expect(parsed.success ? null : parsed.error?.toString()).toBeNull()
  })

  it("the batch-delete envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z
      .object({
        deletedIds: z.array(z.string()),
        total: z.number().int(),
        succeeded: z.number().int(),
        failed: z.array(z.object({ id: z.string(), error: z.string() })),
      })
      .safeParse({
        deletedIds: ["availability_pickup_points_000000000000"],
        total: 2,
        succeeded: 1,
        failed: [{ id: "availability_pickup_points_missing", error: "Not found" }],
      })
    expect(parsed.success ? null : parsed.error?.toString()).toBeNull()
  })
})
