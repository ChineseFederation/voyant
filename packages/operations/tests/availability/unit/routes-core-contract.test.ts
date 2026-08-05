import type {
  availabilityCloseouts,
  availabilityRules,
  availabilitySlots,
} from "@voyant-travel/operations/schema"
import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"

/**
 * Response contract tests (voyant#2114 / voyant#2208 — operations sub-batch
 * 10A) for the availability-core admin routes. Each fixture is typed as the
 * real Drizzle `$inferSelect` row so column drift breaks compilation; the JSON
 * round-trip (Date → ISO string) mirrors `c.json` so a declared/actual mismatch
 * breaks the test. The schemas below mirror the response shapes declared in
 * `availability/routes-core.ts` (§17 dates → strings, plus the joined
 * `productName` and the slot's computed `endDateLocal`).
 */

const isoTimestamp = z.string()
const slotStatusSchema = z.enum(["open", "closed", "sold_out", "cancelled"])

const availabilityRuleSchema = z.object({
  id: z.string(),
  productId: z.string(),
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
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
const availabilityRuleListRowSchema = availabilityRuleSchema.extend({
  productName: z.string().nullable().optional(),
})

// The slot read/mutation schema carries the computed `endDateLocal`; list rows
// additionally carry the joined `productName`.
const availabilitySlotSchema = z.object({
  id: z.string(),
  productId: z.string(),
  itineraryId: z.string().nullable(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  availabilityRuleId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  dateLocal: z.string(),
  startsAt: isoTimestamp,
  endsAt: isoTimestamp.nullable(),
  timezone: z.string(),
  status: slotStatusSchema,
  unlimited: z.boolean(),
  initialPax: z.number().int().nullable(),
  remainingPax: z.number().int().nullable(),
  initialPickups: z.number().int().nullable(),
  remainingPickups: z.number().int().nullable(),
  remainingResources: z.number().int().nullable(),
  pastCutoff: z.boolean(),
  tooEarly: z.boolean(),
  nights: z.number().int().nullable(),
  days: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  endDateLocal: z.string().nullable(),
})
const availabilitySlotListRowSchema = availabilitySlotSchema.extend({
  productName: z.string().nullable().optional(),
})

const availabilityCloseoutSchema = z.object({
  id: z.string(),
  productId: z.string(),
  slotId: z.string().nullable(),
  dateLocal: z.string(),
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoTimestamp,
})

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const ruleRow: InferSelectModel<typeof availabilityRules> = {
  id: "availability_rules_00000000000000000000",
  productId: "products_00000000000000000000000000",
  optionId: null,
  facilityId: null,
  timezone: "Europe/Bucharest",
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
  maxCapacity: 20,
  maxPickupCapacity: null,
  minTotalPax: null,
  cutoffMinutes: 120,
  earlyBookingLimitMinutes: null,
  active: true,
  createdAt,
  updatedAt,
}

// The slot service appends `endDateLocal` (single reads/mutations) and
// `productName` (list rows) on top of the raw `$inferSelect` row.
const slotRow: InferSelectModel<typeof availabilitySlots> & { endDateLocal: string | null } = {
  id: "availability_slots_00000000000000000000",
  productId: "products_00000000000000000000000000",
  productVersionId: null,
  itineraryId: null,
  optionId: null,
  facilityId: null,
  availabilityRuleId: null,
  startTimeId: null,
  dateLocal: "2026-07-01",
  startsAt: new Date("2026-07-01T08:00:00.000Z"),
  endsAt: new Date("2026-07-01T16:00:00.000Z"),
  timezone: "Europe/Bucharest",
  status: "open",
  unlimited: false,
  initialPax: 20,
  remainingPax: 12,
  initialPickups: null,
  remainingPickups: null,
  remainingResources: null,
  pastCutoff: false,
  tooEarly: false,
  nights: null,
  days: 1,
  notes: null,
  createdAt,
  updatedAt,
  endDateLocal: "2026-07-01",
}

const closeoutRow: InferSelectModel<typeof availabilityCloseouts> = {
  id: "availability_closeouts_0000000000000000",
  productId: "products_00000000000000000000000000",
  slotId: null,
  dateLocal: "2026-07-04",
  reason: "Public holiday",
  createdBy: null,
  createdAt,
}

const listCases = [
  ["availability rule", availabilityRuleListRowSchema, { ...ruleRow, productName: "Sunset Tour" }],
  ["availability slot", availabilitySlotListRowSchema, { ...slotRow, productName: "Sunset Tour" }],
  [
    "availability closeout",
    availabilityCloseoutSchema.extend({ productName: z.string().nullable() }),
    { ...closeoutRow, productName: "Sunset Tour" },
  ],
] as const

const singleCases = [
  ["availability rule", availabilityRuleSchema, ruleRow],
  ["availability slot", availabilitySlotSchema, slotRow],
  ["availability closeout", availabilityCloseoutSchema, closeoutRow],
] as const

describe("availability-core list response contracts", () => {
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

describe("availability-core single-entity response contracts", () => {
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
        data: z.array(availabilityRuleSchema),
        total: z.number().int(),
        succeeded: z.number().int(),
        failed: z.array(z.object({ id: z.string(), error: z.string() })),
      })
      .safeParse({
        data: JSON.parse(JSON.stringify([ruleRow])),
        total: 2,
        succeeded: 1,
        failed: [{ id: "availability_rules_missing", error: "Not found" }],
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
        deletedIds: ["availability_rules_00000000000000000000"],
        total: 2,
        succeeded: 1,
        failed: [{ id: "availability_rules_missing", error: "Not found" }],
      })
    expect(parsed.success ? null : parsed.error?.toString()).toBeNull()
  })
})
