import { allocationResources, availabilitySlots } from "@voyant-travel/availability/schema"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type {
  AllocationMutationOptions,
  CreateAllocationResourceInput,
  UpdateAllocationResourceInput,
} from "./service-allocation.js"
import { recordAllocationAudit } from "./service-allocation-audit.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import {
  clearTravelerAllocationsForResource,
  countResourceOccupants,
} from "./service-allocation-resource-capacity.js"
import {
  assertVehicleChildCapacity,
  assertVehicleSeatDesignationAvailable,
} from "./service-allocation-resource-invariants.js"

export async function createAllocationResource(
  db: PostgresJsDatabase,
  slotId: string,
  input: CreateAllocationResourceInput,
  options: AllocationMutationOptions = {},
) {
  const row = await db.transaction(async (tx) => {
    const transactionalDb = tx as PostgresJsDatabase
    const [slot] = await tx
      .select({ id: availabilitySlots.id })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slotId))
      .limit(1)
    if (!slot) return null

    // Seat creation and vehicle-capacity updates both lock the same parent
    // vehicle row before inspecting child seats. That serializes the final
    // capacity check and prevents two concurrent "last seat" inserts.
    const parent = await assertValidResourceParent(
      transactionalDb,
      slotId,
      input.kind,
      input.parentId ?? null,
      { lockParent: input.kind === "vehicle_seat" },
    )
    if (input.kind === "vehicle_seat" && parent) {
      const childSeatCount = await countVehicleSeats(transactionalDb, slotId, parent.id)
      assertVehicleChildCapacity({
        capacity: parent.capacity,
        existingSeatCount: childSeatCount,
        seatsToAdd: 1,
      })
      await assertUniqueVehicleSeatDesignation(transactionalDb, {
        slotId,
        vehicleId: parent.id,
        label: input.label,
        flags: input.flags ?? {},
      })
    }

    const [created] = await tx
      .insert(allocationResources)
      .values({
        slotId,
        kind: input.kind,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        label: input.label ?? null,
        capacity: input.capacity,
        flags: input.flags ?? {},
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning()
    return created ?? null
  })
  if (row) {
    await recordAllocationAudit(db, {
      slotId,
      action: "resource.create",
      actorId: options.actorId ?? null,
      resourceId: row.id,
      after: {
        kind: row.kind,
        label: row.label,
        capacity: row.capacity,
      },
    })
  }
  return row
}

export async function updateAllocationResource(
  db: PostgresJsDatabase,
  slotId: string,
  resourceId: string,
  input: UpdateAllocationResourceInput,
  options: AllocationMutationOptions = {},
) {
  const result = await db.transaction(async (tx) => {
    const transactionalDb = tx as PostgresJsDatabase
    const [existing] = await tx
      .select({
        id: allocationResources.id,
        kind: allocationResources.kind,
        label: allocationResources.label,
        capacity: allocationResources.capacity,
        flags: allocationResources.flags,
        sortOrder: allocationResources.sortOrder,
        parentId: allocationResources.parentId,
      })
      .from(allocationResources)
      .where(and(eq(allocationResources.id, resourceId), eq(allocationResources.slotId, slotId)))
      .for("update")
      .limit(1)
    if (!existing) return null

    if (existing.kind === "vehicle_seat" && input.capacity !== undefined && input.capacity !== 1) {
      throw new AllocationServiceError("A vehicle seat must have capacity 1", 400)
    }
    if (existing.kind === "vehicle" && input.capacity !== undefined) {
      const childSeatCount = await countVehicleSeats(transactionalDb, slotId, resourceId)
      assertVehicleChildCapacity({
        capacity: input.capacity,
        existingSeatCount: childSeatCount,
        seatsToAdd: 0,
      })
    }
    if (
      existing.kind === "vehicle_seat" &&
      (input.label !== undefined || input.flags !== undefined || input.parentId !== undefined)
    ) {
      const effectiveParentId = input.parentId !== undefined ? input.parentId : existing.parentId
      const parent = await assertValidResourceParent(
        transactionalDb,
        slotId,
        existing.kind,
        effectiveParentId,
        { lockParent: true },
      )
      if (parent && effectiveParentId !== existing.parentId) {
        const childSeatCount = await countVehicleSeats(transactionalDb, slotId, parent.id)
        assertVehicleChildCapacity({
          capacity: parent.capacity,
          existingSeatCount: childSeatCount,
          seatsToAdd: 1,
        })
      }
      if (parent) {
        await assertUniqueVehicleSeatDesignation(transactionalDb, {
          slotId,
          vehicleId: parent.id,
          label: input.label !== undefined ? input.label : existing.label,
          flags: input.flags !== undefined ? input.flags : existing.flags,
          excludeResourceId: resourceId,
        })
      }
    } else if (input.parentId !== undefined) {
      await assertValidResourceParent(transactionalDb, slotId, existing.kind, input.parentId)
    }

    if (input.capacity !== undefined) {
      const current = await countResourceOccupants(
        transactionalDb,
        slotId,
        existing.kind,
        resourceId,
      )
      if (current > input.capacity) {
        throw new AllocationServiceError("Resource over capacity", 409, {
          capacity: input.capacity,
          current,
        })
      }
    }

    const [row] = await tx
      .update(allocationResources)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(allocationResources.id, resourceId), eq(allocationResources.slotId, slotId)))
      .returning()
    return row ? { existing, row } : null
  })
  if (result) {
    await recordAllocationAudit(db, {
      slotId,
      action: "resource.update",
      actorId: options.actorId ?? null,
      resourceId: result.row.id,
      before: {
        label: result.existing.label,
        capacity: result.existing.capacity,
        flags: result.existing.flags,
        sortOrder: result.existing.sortOrder,
      },
      after: {
        label: result.row.label,
        capacity: result.row.capacity,
        flags: result.row.flags,
        sortOrder: result.row.sortOrder,
      },
    })
  }
  return result?.row ?? null
}

export async function deleteAllocationResource(
  db: PostgresJsDatabase,
  slotId: string,
  resourceId: string,
  options: AllocationMutationOptions = {},
) {
  const row = await db.transaction(async (tx) => {
    // Locking the parent candidate serializes deletion with seat creation,
    // which locks the same row before checking and inserting child seats.
    const [existing] = await tx
      .select({ id: allocationResources.id })
      .from(allocationResources)
      .where(and(eq(allocationResources.id, resourceId), eq(allocationResources.slotId, slotId)))
      .for("update")
      .limit(1)
    if (!existing) return null

    const [child] = await tx
      .select({ id: allocationResources.id })
      .from(allocationResources)
      .where(
        and(eq(allocationResources.slotId, slotId), eq(allocationResources.parentId, resourceId)),
      )
      .limit(1)
    if (child) {
      throw new AllocationServiceError("Remove child resources before deleting their parent", 409)
    }

    const [deleted] = await tx
      .delete(allocationResources)
      .where(and(eq(allocationResources.id, resourceId), eq(allocationResources.slotId, slotId)))
      .returning({
        id: allocationResources.id,
        kind: allocationResources.kind,
        label: allocationResources.label,
        capacity: allocationResources.capacity,
      })
    return deleted ?? null
  })
  if (row) {
    await clearTravelerAllocationsForResource(db, resourceId)
    await recordAllocationAudit(db, {
      slotId,
      action: "resource.delete",
      actorId: options.actorId ?? null,
      resourceId: row.id,
      before: {
        kind: row.kind,
        label: row.label,
        capacity: row.capacity,
      },
    })
  }
  return row
}

async function assertValidResourceParent(
  db: PostgresJsDatabase,
  slotId: string,
  kind: string,
  parentId: string | null,
  options: { lockParent?: boolean } = {},
) {
  if (!parentId) {
    if (kind === "vehicle_seat") {
      throw new AllocationServiceError("A vehicle seat must belong to a vehicle", 400)
    }
    return null
  }

  const query = db
    .select({
      id: allocationResources.id,
      kind: allocationResources.kind,
      capacity: allocationResources.capacity,
    })
    .from(allocationResources)
    .where(and(eq(allocationResources.id, parentId), eq(allocationResources.slotId, slotId)))
  const [parent] = options.lockParent ? await query.for("update").limit(1) : await query.limit(1)

  if (!parent) {
    throw new AllocationServiceError("Parent resource not found for this slot", 404)
  }
  if (kind === "vehicle_seat" && parent.kind !== "vehicle") {
    throw new AllocationServiceError("A vehicle seat parent must be a vehicle", 400)
  }
  return parent
}

async function countVehicleSeats(db: PostgresJsDatabase, slotId: string, vehicleId: string) {
  const rows = await db
    .select({ id: allocationResources.id })
    .from(allocationResources)
    .where(
      and(
        eq(allocationResources.slotId, slotId),
        eq(allocationResources.parentId, vehicleId),
        eq(allocationResources.kind, "vehicle_seat"),
      ),
    )
  return rows.length
}

async function assertUniqueVehicleSeatDesignation(
  db: PostgresJsDatabase,
  input: {
    slotId: string
    vehicleId: string
    label: string | null | undefined
    flags: Record<string, unknown> | null | undefined
    excludeResourceId?: string
  },
) {
  const siblings = await db
    .select({
      id: allocationResources.id,
      label: allocationResources.label,
      flags: allocationResources.flags,
    })
    .from(allocationResources)
    .where(
      and(
        eq(allocationResources.slotId, input.slotId),
        eq(allocationResources.parentId, input.vehicleId),
        eq(allocationResources.kind, "vehicle_seat"),
      ),
    )
  assertVehicleSeatDesignationAvailable({
    label: input.label,
    flags: input.flags,
    existingSeats: siblings.filter((seat) => seat.id !== input.excludeResourceId),
  })
}
