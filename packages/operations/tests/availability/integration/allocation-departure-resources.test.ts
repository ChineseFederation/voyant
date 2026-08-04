import { allocationResources, availabilitySlots } from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { products } from "../../../../inventory/src/schema.js"
import { AllocationServiceError } from "../../../src/availability/service-allocation.js"
import {
  attachDepartureResource,
  detachDepartureResource,
  listDepartureResourceLinks,
} from "../../../src/availability/service-allocation-resource-link.js"
import { resourceSlotAssignments, resources } from "../../../src/resources/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("departure fleet-resource link (integration)", () => {
  let db: PostgresJsDatabase
  let productId: string
  let slotId: string
  let otherSlotId: string
  let coachId: string

  // One TRUNCATE for the file. `cleanupTestDb` truncates the whole ~500-table
  // schema and can take tens of seconds; each test gets its own departure,
  // resource and ids instead so they cannot see each other's rows.
  beforeAll(async () => {
    db = createTestDb() as PostgresJsDatabase
    await cleanupTestDb(db)
    productId = newId("products")
    await db.insert(products).values({
      id: productId,
      name: "Transylvania Coach Tour",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
  }, 120000)

  beforeEach(async () => {
    slotId = newId("availability_slots")
    otherSlotId = newId("availability_slots")
    coachId = newId("resources")

    await db.insert(availabilitySlots).values([
      {
        id: slotId,
        productId,
        dateLocal: "2026-06-01",
        startsAt: new Date("2026-06-01T08:00:00Z"),
        endsAt: new Date("2026-06-03T18:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        initialPax: 50,
        remainingPax: 50,
      },
      {
        id: otherSlotId,
        productId,
        dateLocal: "2026-06-02",
        startsAt: new Date("2026-06-02T08:00:00Z"),
        endsAt: new Date("2026-06-04T18:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        initialPax: 50,
        remainingPax: 50,
      },
    ])
    await db.insert(resources).values({
      id: coachId,
      kind: "vehicle",
      name: "Setra S 517",
      code: "B-123-XYZ",
      capacity: 49,
      active: true,
    })
  })

  it("attaches a fleet resource as an allocation resource and opens its fleet commitment", async () => {
    const link = await attachDepartureResource(
      db,
      slotId,
      { resourceId: coachId },
      {
        actorId: "usr_test",
      },
    )

    expect(link.created).toBe(true)
    expect(link.resource.kind).toBe("vehicle")
    expect(link.resource.refType).toBe("resource")
    expect(link.resource.refId).toBe(coachId)
    expect(link.resource.capacity).toBe(49)
    expect(link.resource.label).toBe("Setra S 517 (B-123-XYZ)")
    expect(link.resource.flags.resourceAssignmentId).toBe(link.assignmentId)

    const assignments = await db
      .select()
      .from(resourceSlotAssignments)
      .where(eq(resourceSlotAssignments.slotId, slotId))
    expect(assignments).toHaveLength(1)
    expect(assignments[0]?.resourceId).toBe(coachId)
    expect(assignments[0]?.status).toBe("assigned")
    expect(assignments[0]?.assignedBy).toBe("usr_test")

    const audit = await db.execute<{ action: string; actor_id: string | null }>(sql`
      SELECT action, actor_id FROM allocation_audit_log WHERE slot_id = ${slotId}
    `)
    expect([...audit].map((row) => row.action)).toContain("resource.attach")
  })

  it("is idempotent: re-attaching returns the existing link without a second commitment", async () => {
    const first = await attachDepartureResource(db, slotId, { resourceId: coachId })
    const second = await attachDepartureResource(db, slotId, { resourceId: coachId })

    expect(second.created).toBe(false)
    expect(second.resource.id).toBe(first.resource.id)
    expect(second.assignmentId).toBe(first.assignmentId)

    const links = await listDepartureResourceLinks(db, slotId)
    expect(links).toHaveLength(1)
    const assignments = await db
      .select()
      .from(resourceSlotAssignments)
      .where(eq(resourceSlotAssignments.slotId, slotId))
    expect(assignments).toHaveLength(1)
  })

  // The whole point of the authority decision: `resource_slot_assignments` is
  // the only table that spans departures, so it is the only one that can see a
  // coach already committed elsewhere. `allocation_resources` is slot-scoped.
  it("refuses a coach already committed to an overlapping departure", async () => {
    await attachDepartureResource(db, otherSlotId, { resourceId: coachId })

    await expect(attachDepartureResource(db, slotId, { resourceId: coachId })).rejects.toThrow(
      /already committed to an overlapping departure/,
    )

    const links = await listDepartureResourceLinks(db, slotId)
    expect(links).toEqual([])
  })

  it("allows a coach whose other commitment was released", async () => {
    await attachDepartureResource(db, otherSlotId, { resourceId: coachId })
    await detachDepartureResource(db, otherSlotId, coachId)

    const link = await attachDepartureResource(db, slotId, { resourceId: coachId })
    expect(link.created).toBe(true)
  })

  // Reconciliation: the Resources admin section may already have committed the
  // coach to this departure. Adopting that row is what stops the same coach
  // being held twice through two unrelated tables.
  it("adopts an assignment the Resources admin already made for this departure", async () => {
    const existingAssignmentId = newId("resource_slot_assignments")
    await db.insert(resourceSlotAssignments).values({
      id: existingAssignmentId,
      slotId,
      resourceId: coachId,
      status: "reserved",
    })

    const link = await attachDepartureResource(db, slotId, { resourceId: coachId })
    expect(link.assignmentId).toBe(existingAssignmentId)

    const assignments = await db
      .select()
      .from(resourceSlotAssignments)
      .where(eq(resourceSlotAssignments.slotId, slotId))
    expect(assignments).toHaveLength(1)
  })

  it("requires an explicit kind and capacity for a resource that declares neither", async () => {
    const guideId = newId("resources")
    await db.insert(resources).values({ id: guideId, kind: "guide", name: "Ana", active: true })

    await expect(attachDepartureResource(db, slotId, { resourceId: guideId })).rejects.toThrow(
      /no default departure kind/,
    )
    await expect(
      attachDepartureResource(db, slotId, { resourceId: guideId, kind: "guide" }),
    ).rejects.toThrow(/declares no capacity/)

    const link = await attachDepartureResource(db, slotId, {
      resourceId: guideId,
      kind: "guide",
      capacity: 1,
    })
    expect(link.resource.kind).toBe("guide")
  })

  it("refuses an inactive resource", async () => {
    await db.update(resources).set({ active: false }).where(eq(resources.id, coachId))
    await expect(attachDepartureResource(db, slotId, { resourceId: coachId })).rejects.toThrow(
      /inactive/,
    )
  })

  it("refuses to detach a laid-out coach without cascade, then removes its seats with it", async () => {
    const link = await attachDepartureResource(db, slotId, { resourceId: coachId })
    const seatId = newId("allocation_resources")
    await db.insert(allocationResources).values({
      id: seatId,
      slotId,
      kind: "vehicle_seat",
      label: "1A",
      capacity: 1,
      parentId: link.resource.id,
      flags: {},
    })

    await expect(detachDepartureResource(db, slotId, coachId)).rejects.toThrow(
      /Remove child resources/,
    )

    const detached = await detachDepartureResource(db, slotId, coachId, { cascade: true })
    expect(detached?.removedResourceIds).toEqual([seatId, link.resource.id])

    const remaining = await db
      .select()
      .from(allocationResources)
      .where(eq(allocationResources.slotId, slotId))
    expect(remaining).toEqual([])

    const [assignment] = await db
      .select()
      .from(resourceSlotAssignments)
      .where(
        and(
          eq(resourceSlotAssignments.slotId, slotId),
          eq(resourceSlotAssignments.resourceId, coachId),
        ),
      )
    expect(assignment?.status).toBe("released")
    expect(assignment?.releasedAt).toBeTruthy()
  })

  it("enforces the optimistic-concurrency precondition on detach", async () => {
    const link = await attachDepartureResource(db, slotId, { resourceId: coachId })

    await expect(
      detachDepartureResource(db, slotId, coachId, {
        expectedUpdatedAt: new Date("2020-01-01T00:00:00Z").toISOString(),
      }),
    ).rejects.toMatchObject({ status: 409 })

    const ok = await detachDepartureResource(db, slotId, coachId, {
      expectedUpdatedAt: link.resource.updatedAt,
    })
    expect(ok?.removedResourceIds).toEqual([link.resource.id])
  })

  it("returns null when detaching a resource that was never attached", async () => {
    expect(await detachDepartureResource(db, slotId, coachId)).toBeNull()
  })

  it("raises a 404-shaped error for an unknown slot", async () => {
    await expect(
      attachDepartureResource(db, newId("availability_slots"), { resourceId: coachId }),
    ).rejects.toBeInstanceOf(AllocationServiceError)
  })
})
