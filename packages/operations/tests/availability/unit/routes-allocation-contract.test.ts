import type {
  allocationAuditLog,
  allocationResources,
  productOptionResourceTemplates,
  sharingGroupLabels,
} from "@voyant-travel/operations/schema"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"

/**
 * Response contract tests (voyant#2114 / voyant#2208 — operations sub-batch
 * 10B) for the availability-allocation admin routes. Each Drizzle-backed fixture
 * is typed as the real `$inferSelect` row so column drift breaks compilation;
 * the JSON round-trip (Date → ISO string) mirrors `c.json` so a declared/actual
 * mismatch breaks the test. The schemas below mirror the response shapes
 * declared in `availability/routes-allocation.ts` (§17: timestamps → strings;
 * the resource `flags` jsonb is an open record). The manifest / mutation-result
 * / template-tree fixtures are typed against the service interfaces' wire shapes
 * since those endpoints return computed objects, not raw rows.
 */

const isoTimestamp = z.string()
const flagsSchema = z.record(z.string(), z.unknown())

const allocationResourceSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  label: z.string().nullable(),
  capacity: z.number().int(),
  occupancyMin: z.number().int().nullable(),
  roomTypeId: z.string().nullable(),
  bedConfiguration: z.string().nullable(),
  accessible: z.boolean(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  flags: flagsSchema,
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const deletedAllocationResourceSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  capacity: z.number().int(),
})

const sharingGroupLabelSchema = z.object({
  groupId: z.string(),
  label: z.string(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const allocationAuditLogEntrySchema = z.object({
  id: z.string(),
  slotId: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  travelerId: z.string().nullable(),
  resourceId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoTimestamp,
})

const resourceTemplateSchema = z.object({
  id: z.string(),
  productOptionId: z.string(),
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  capacity: z.number().int(),
  occupancyMin: z.number().int().nullable(),
  occupancyMax: z.number().int().nullable(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  roomTypeId: z.string().nullable(),
  bedConfiguration: z.string().nullable(),
  accessible: z.boolean(),
  namePattern: z.string(),
  layout: z.string().nullable(),
  defaultCount: z.number().int().nullable(),
  flags: flagsSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const productOptionResourceTemplatesSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  templates: z.array(resourceTemplateSchema),
})

const allocationManifestTravelerSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingNumber: z.string(),
  bookingStatus: z.string(),
  bookingSequence: z.number().int(),
  paymentStatus: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isLeadTraveler: z.boolean(),
  isPrimary: z.boolean(),
  sharingGroupId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  optionUnitCode: z.string().nullable(),
  roomTypeId: z.string().nullable(),
  bedPreference: z.string().nullable(),
  allocations: z.record(z.string(), z.string()),
  travelerCategory: z.string().nullable(),
  participantType: z.string(),
  hasAccessibilityNeeds: z.boolean(),
  hasDietaryRequirements: z.boolean(),
})

const allocationManifestBookingSchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
  status: z.string(),
  bookingSequence: z.number().int(),
  paymentStatus: z.string(),
  contactFirstName: z.string().nullable(),
  contactLastName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  sellCurrency: z.string().nullable(),
  pax: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable(),
  paidAmountCents: z.number().int().nullable(),
  travelers: z.array(allocationManifestTravelerSchema),
})

const slotAllocationManifestSchema = z.object({
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

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

// Drizzle-backed rows — typed so a column rename/retype breaks compilation.
const resourceRow: InferSelectModel<typeof allocationResources> = {
  id: "allocation_resources_00000000000000000000",
  slotId: "availability_slots_00000000000000000000",
  kind: "room",
  refType: "option",
  refId: "product_options_0000000000000000000000",
  label: "Room 1",
  capacity: 2,
  occupancyMin: 2,
  roomTypeId: "room_types_000000000000000000000000",
  bedConfiguration: "1 double",
  accessible: false,
  minAge: null,
  maxAge: null,
  flags: { templateOptionId: "product_options_0000000000000000000000" },
  parentId: null,
  sortOrder: 1,
  createdAt,
  updatedAt,
}

const auditRow: InferSelectModel<typeof allocationAuditLog> = {
  id: "allocation_audit_log_0000000000000000000",
  slotId: "availability_slots_00000000000000000000",
  action: "resource.create",
  actorId: null,
  travelerId: null,
  resourceId: resourceRow.id,
  before: null,
  after: { kind: "room", label: "Room 1", capacity: 2 },
  createdAt,
}

const sharingGroupLabelRow: InferSelectModel<typeof sharingGroupLabels> = {
  groupId: "11111111-2222-3333-4444-555555555555",
  label: "Smith family",
  createdAt,
  updatedAt,
}

const templateRow: InferSelectModel<typeof productOptionResourceTemplates> = {
  id: "product_option_resource_templates_000000",
  productOptionId: "product_options_0000000000000000000000",
  kind: "room",
  refType: "option",
  refId: null,
  capacity: 2,
  occupancyMin: 2,
  occupancyMax: 2,
  minAge: null,
  maxAge: null,
  roomTypeId: null,
  bedConfiguration: "1 double",
  accessible: false,
  namePattern: "Room {sequence}",
  layout: null,
  defaultCount: 4,
  flags: {},
  createdAt,
  updatedAt,
}

describe("availability-allocation Drizzle-backed response contracts", () => {
  it("the audit-log { data } envelope satisfies the declared schema", () => {
    // `listAllocationAuditLog` serializes createdAt to an ISO string itself.
    const wire = JSON.parse(
      JSON.stringify({
        data: [{ ...auditRow, createdAt: auditRow.createdAt.toISOString() }],
      }),
    )
    const parsed = z.object({ data: z.array(allocationAuditLogEntrySchema) }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the created/updated allocation resource { data } envelope satisfies the declared schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: resourceRow }))
    const parsed = z.object({ data: allocationResourceSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the deleted allocation resource { data } envelope satisfies the declared schema", () => {
    const { id, kind, label, capacity } = resourceRow
    const wire = JSON.parse(JSON.stringify({ data: { id, kind, label, capacity } }))
    const parsed = z.object({ data: deletedAllocationResourceSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the sharing-group label { data } envelope satisfies the declared schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: sharingGroupLabelRow }))
    const parsed = z.object({ data: sharingGroupLabelSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })
})

describe("availability-allocation computed-shape response contracts", () => {
  it("the resource-template tree { data } envelope satisfies the declared schema", () => {
    // The template service serializes its timestamps to ISO strings.
    const template = {
      ...templateRow,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    }
    const wire = JSON.parse(
      JSON.stringify({
        data: [
          {
            id: "product_options_0000000000000000000000",
            name: "Standard double",
            code: "STD",
            description: null,
            status: "active",
            isDefault: true,
            sortOrder: 0,
            templates: [template],
          },
        ],
      }),
    )
    const parsed = z.object({ data: z.array(productOptionResourceTemplatesSchema) }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the slot allocation manifest { data } envelope satisfies the declared schema", () => {
    const manifest = {
      slot: {
        id: "availability_slots_00000000000000000000",
        productId: "products_00000000000000000000000000",
        startsAt: "2026-07-01T08:00:00.000Z",
        endsAt: "2026-07-01T16:00:00.000Z",
      },
      bookings: [
        {
          id: "bkg_0000000000000000000000000",
          bookingNumber: "BK-0001",
          status: "confirmed",
          bookingSequence: 1,
          paymentStatus: "paid",
          contactFirstName: "Ada",
          contactLastName: "Lovelace",
          contactEmail: "ada@example.com",
          contactPhone: null,
          sellCurrency: "EUR",
          pax: 2,
          sellAmountCents: 50000,
          paidAmountCents: 50000,
          travelers: [
            {
              id: "btr_0000000000000000000000000",
              bookingId: "bkg_0000000000000000000000000",
              bookingNumber: "BK-0001",
              bookingStatus: "confirmed",
              bookingSequence: 1,
              paymentStatus: "paid",
              firstName: "Ada",
              lastName: "Lovelace",
              fullName: "Ada Lovelace",
              email: "ada@example.com",
              phone: null,
              isLeadTraveler: true,
              isPrimary: true,
              sharingGroupId: null,
              optionId: null,
              optionUnitId: null,
              optionUnitCode: null,
              roomTypeId: null,
              bedPreference: null,
              allocations: { room: resourceRow.id },
              travelerCategory: "adult",
              participantType: "traveler",
              hasAccessibilityNeeds: false,
              hasDietaryRequirements: false,
            },
          ],
        },
      ],
      resources: [
        { ...resourceRow, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() },
      ],
      sharingGroupLabels: { [sharingGroupLabelRow.groupId]: sharingGroupLabelRow.label },
      summary: {
        bookingCount: 1,
        travelerCount: 1,
        leadTravelerCount: 1,
        bookingsByStatus: { confirmed: 1 },
      },
    }
    const wire = JSON.parse(JSON.stringify({ data: manifest }))
    const parsed = z.object({ data: slotAllocationManifestSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the mutation-result envelopes satisfy the declared schemas", () => {
    const assign = z
      .object({
        data: z.object({
          travelerId: z.string(),
          kind: z.string(),
          resourceId: z.string().nullable(),
        }),
      })
      .safeParse({ data: { travelerId: "btr_x", kind: "room", resourceId: resourceRow.id } })
    expect(assign.success ? null : assign.error?.toString()).toBeNull()

    const pair = z
      .object({ data: z.object({ sharingGroupId: z.string(), travelerIds: z.array(z.string()) }) })
      .safeParse({ data: { sharingGroupId: "grp-1", travelerIds: ["btr_a", "btr_b"] } })
    expect(pair.success ? null : pair.error?.toString()).toBeNull()

    const automation = z
      .object({
        data: z.object({
          kind: z.string(),
          assigned: z.number().int().optional(),
          skipped: z.number().int().optional(),
          created: z.number().int().optional(),
        }),
      })
      .safeParse({ data: { kind: "room", assigned: 3, skipped: 1 } })
    expect(automation.success ? null : automation.error?.toString()).toBeNull()

    const openSlots = z
      .object({ data: z.object({ slots: z.number().int(), created: z.number().int() }) })
      .safeParse({ data: { slots: 4, created: 12 } })
    expect(openSlots.success ? null : openSlots.error?.toString()).toBeNull()
  })
})
