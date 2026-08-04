import {
  type AllocationResource,
  allocationResources,
  availabilitySlots,
  productOptionResourceTemplates,
} from "@voyant-travel/availability/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import {
  type AllocatorResource,
  type AllocatorTraveler,
  planRoomAllocation,
  planVehicleSeatAllocation,
} from "./auto-allocator.js"
import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import {
  type AllocationMutationOptions,
  getSlotAllocationManifest,
  recordAllocationAudit,
  type SlotAllocationManifest,
} from "./service-allocation.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import { executeRows, sqlTextArray } from "./service-allocation-sql.js"
import {
  type AutoMaterializeRow,
  materializeVehicleSeatGroupInTransaction,
  renderNamePattern,
} from "./service-allocation-vehicle-materialization.js"
import type { allocationAutomationSchema } from "./validation.js"

export type AllocationAutomationInput = z.infer<typeof allocationAutomationSchema>
export type {
  ProductOptionResourceTemplates,
  ResourceTemplate,
  UpsertResourceTemplateInput,
} from "./service-allocation-templates.js"
export {
  deleteProductOptionResourceTemplate,
  listProductOptionResourceTemplates,
  upsertProductOptionResourceTemplate,
} from "./service-allocation-templates.js"
export {
  parseLayoutSpecFromFlags,
  positionFromCells,
} from "./service-allocation-vehicle-materialization.js"

export interface AllocationAutomationResult {
  kind: string
  assigned?: number
  skipped?: number
  created?: number
  resources?: AllocationResource[]
}

export async function autoMaterializeAllocationResources(
  db: PostgresJsDatabase,
  slotId: string,
  input: AllocationAutomationInput,
  options: AllocationMutationOptions = {},
): Promise<AllocationAutomationResult> {
  const result = await db.transaction(async (tx) => {
    const materialized = await autoMaterializeAllocationResourcesLocked(
      tx as PostgresJsDatabase,
      slotId,
      input,
    )

    // Audit inside the transaction so the materialised resources and
    // their record commit or roll back together.
    if ((materialized.created ?? 0) > 0) {
      await recordAllocationAudit(tx, {
        slotId,
        action: "resources.materialize",
        actorId: options.actorId ?? null,
        after: { kind: materialized.kind, created: materialized.created ?? 0 },
      })
    }

    return materialized
  })

  return result
}

async function autoMaterializeAllocationResourcesLocked(
  db: PostgresJsDatabase,
  slotId: string,
  input: AllocationAutomationInput,
): Promise<AllocationAutomationResult> {
  const kind = input.kind ?? "room"
  const [slot] = await db
    .select({ id: availabilitySlots.id })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, slotId))
    .for("update")
    .limit(1)
  if (!slot) throw new AllocationServiceError("Availability slot not found", 404)

  const existing = await executeRows<{ count: number }>(
    db,
    sql`
      SELECT COUNT(*)::int AS count
      FROM allocation_resources
      WHERE slot_id = ${slotId} AND kind = ${kind}
    `,
  )
  if ((existing[0]?.count ?? 0) > 0) {
    throw new AllocationServiceError("Resources already exist", 409, {
      detail: "Delete existing resources before re-materializing, or add new ones manually.",
    })
  }

  const groups = await executeRows<AutoMaterializeRow>(
    db,
    sql`
      WITH slot_bookings AS (
        SELECT DISTINCT b.id AS booking_id
        FROM bookings b
        JOIN booking_allocations ba ON ba.booking_id = b.id
        WHERE ba.availability_slot_id = ${slotId}
          AND b.status IN (${activeBookingStatusesSql()})
          AND ba.status IN (${activeBookingAllocationStatusesSql()})
      ),
      -- Pax per option = sum of booking_item quantities for items belonging
      -- to bookings on this slot. The previous formulation joined
      -- booking_travelers to booking_id, which cross-multiplied items × travelers
      -- whenever a booking had more than one item (e.g. Adult + Senior rows
      -- on the same booking inflated pax_count to 4 instead of 2).
      pax AS (
        SELECT bi.option_id, SUM(bi.quantity)::int AS pax_count
        FROM booking_items bi
        JOIN slot_bookings sb ON sb.booking_id = bi.booking_id
        WHERE bi.option_id IS NOT NULL
        GROUP BY bi.option_id
      )
      SELECT
        pax.option_id,
        pax.pax_count,
        t.capacity,
        t.name_pattern,
        t.ref_type,
        t.ref_id,
        t.layout,
        t.flags,
        po.name AS option_name,
        po.sort_order
      FROM pax
      JOIN product_option_resource_templates t
        ON t.product_option_id = pax.option_id AND t.kind = ${kind}
      LEFT JOIN product_options po ON po.id = pax.option_id
      ORDER BY po.sort_order NULLS LAST, po.name NULLS LAST
    `,
  )

  if (groups.length === 0) return { kind, created: 0, resources: [] }

  const created: AllocationResource[] = []
  let sequence = 0
  for (const group of groups) {
    if (kind === "vehicle_seat") {
      const vehicleResources = await materializeVehicleSeatGroupInTransaction(
        db,
        slotId,
        group,
        sequence,
      )
      sequence += vehicleResources.vehicleCount
      created.push(...vehicleResources.resources)
      continue
    }

    const unitsNeeded = Math.max(1, Math.ceil(group.pax_count / Math.max(1, group.capacity)))
    for (let index = 0; index < unitsNeeded; index++) {
      sequence += 1
      // Default the resource's ref to its materializing option so the UI
      // can badge each row with the option name (e.g. Standard double).
      // Templates that explicitly set ref_type/ref_id (e.g. pointing at a
      // hotel inventory row) keep their own values.
      const resolvedRefType = group.ref_type ?? "option"
      const resolvedRefId = group.ref_id ?? group.option_id
      const [row] = await db
        .insert(allocationResources)
        .values({
          slotId,
          kind,
          refType: resolvedRefType,
          refId: resolvedRefId,
          label: renderNamePattern(group.name_pattern, {
            sequence: String(sequence),
            option: group.option_name ?? "",
            index: String(index + 1),
          }),
          capacity: group.capacity,
          flags: { ...(group.flags ?? {}), templateOptionId: group.option_id },
          sortOrder: sequence,
        })
        .returning()
      if (row) created.push(row)
    }
  }

  return { kind, created: created.length, resources: created }
}

export async function autoAllocateSlotResources(
  db: PostgresJsDatabase,
  slotId: string,
  input: AllocationAutomationInput,
  options: AllocationMutationOptions = {},
): Promise<AllocationAutomationResult> {
  const kind = input.kind ?? "room"

  // The capacity invariant lives in the *decision*, not in the write, so the
  // manifest read, the plan and the upsert all sit inside one transaction
  // behind the same `FOR UPDATE` over the slot's resources of this kind.
  // Planning from a snapshot taken before the lock let a manual assignment
  // (or a second auto-allocate) land in between; the plan was then applied
  // verbatim and could push a resource past its capacity with no conflict
  // raised. Serialising the writes alone never serialised the decision.
  const plan = await db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase

    await scoped.execute(sql`
      SELECT id
      FROM allocation_resources
      WHERE slot_id = ${slotId} AND kind = ${kind}
      FOR UPDATE
    `)

    const manifest = await getSlotAllocationManifest(scoped, slotId)
    if (!manifest) throw new AllocationServiceError("Availability slot not found", 404)

    const resources = manifest.resources.filter((resource) => resource.kind === kind)
    if (resources.length === 0) {
      throw new AllocationServiceError("No resources for this allocation kind", 400, { kind })
    }

    const travelers = toAllocatorTravelers(manifest, kind)
    const allocatorResources = resources.map(toAllocatorResource)
    const planned =
      kind === "vehicle_seat"
        ? planVehicleSeatAllocation(travelers, allocatorResources)
        : planRoomAllocation(travelers, allocatorResources)

    if (planned.assignments.length > 0) {
      const travelerIds = planned.assignments.map((assignment) => assignment.travelerId)
      const resourceIds = planned.assignments.map((assignment) => assignment.resourceId)
      await scoped.execute(sql`
        INSERT INTO booking_traveler_travel_details (traveler_id, allocations)
        SELECT
          row.traveler_id,
          jsonb_build_object(${kind}::text, row.resource_id::text)
        FROM unnest(${sqlTextArray(travelerIds)}, ${sqlTextArray(resourceIds)}) AS row(traveler_id, resource_id)
        ON CONFLICT (traveler_id) DO UPDATE SET
          allocations =
            COALESCE(booking_traveler_travel_details.allocations, '{}'::jsonb)
            || EXCLUDED.allocations,
          updated_at = now()
      `)
      await assertPlannedResourcesWithinCapacity(scoped, slotId, kind, resourceIds)
    }

    // Audit inside the transaction so the applied plan and its record
    // commit or roll back together — PR #4139 moved planning and writing
    // in here but left the audit outside.
    await recordAllocationAudit(tx, {
      slotId,
      action: "auto-allocate",
      actorId: options.actorId ?? null,
      after: { kind, assigned: planned.assignments.length, skipped: planned.skipped },
    })

    return planned
  })

  return { kind, assigned: plan.assignments.length, skipped: plan.skipped }
}

/**
 * Post-write invariant check for the resources an auto-allocate plan
 * touched. Re-planning under the lock already keeps the plan inside
 * capacity, so this is a backstop against an allocator regression rather
 * than the primary guard -- it runs inside the writing transaction, so a
 * violation rolls the whole plan back instead of shipping an oversold slot.
 * One aggregate query over the planned resources only: an unrelated
 * resource that was already over capacity must not block the operator.
 */
async function assertPlannedResourcesWithinCapacity(
  db: PostgresJsDatabase,
  slotId: string,
  kind: string,
  resourceIds: string[],
): Promise<void> {
  const overflowing = await executeRows<{
    id: string
    label: string | null
    capacity: number
    assigned: number
  }>(
    db,
    sql`
      SELECT ar.id, ar.label, ar.capacity, usage.assigned
      FROM allocation_resources ar
      JOIN LATERAL (
        SELECT COUNT(DISTINCT btd.traveler_id)::int AS assigned
        FROM booking_traveler_travel_details btd
        JOIN booking_travelers bt ON bt.id = btd.traveler_id
        JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
        JOIN bookings b ON b.id = bt.booking_id
        WHERE btd.allocations ->> ar.kind = ar.id
          AND ba.availability_slot_id = ar.slot_id
          AND b.status IN (${activeBookingStatusesSql()})
          AND ba.status IN (${activeBookingAllocationStatusesSql()})
      ) usage ON true
      WHERE ar.slot_id = ${slotId}
        AND ar.kind = ${kind}
        AND ar.id = ANY(${sqlTextArray([...new Set(resourceIds)])})
        AND usage.assigned > ar.capacity
    `,
  )

  if (overflowing.length === 0) return

  throw new AllocationServiceError("Resource over capacity", 409, {
    kind,
    resources: overflowing.map((resource) => ({
      id: resource.id,
      label: resource.label,
      capacity: resource.capacity,
      assigned: resource.assigned,
    })),
  })
}

export interface MaterializeSlotResourcesFromTemplatesOptions {
  /**
   * Restrict materialisation to a single template kind. When omitted,
   * all templates with a non-null `defaultCount` for the slot's option
   * are seeded.
   */
  kind?: string
  /**
   * Restrict materialisation to a single option's templates. Needed when a
   * product-level slot (no `optionId`) is seeded on behalf of one option —
   * without it, every option's templates would be materialised.
   */
  optionId?: string
  /**
   * Skip templates whose `kind` already has resources for the slot.
   * Defaults to true so the helper is safe to call repeatedly during
   * slot generation.
   */
  skipExisting?: boolean
}

/**
 * Auto-seed `allocation_resources` for a freshly-published slot from
 * its option's `product_option_resource_templates` rows that declare a
 * `default_count`. Distinct from `autoMaterializeAllocationResources`,
 * which derives counts from existing bookings. Templates without
 * `default_count` are skipped — operators handle those via the admin
 * materialise route once pax is known.
 *
 * Vehicle-seat layouts are out of scope here; use the existing
 * `autoMaterializeAllocationResources` path for those once the slot
 * has bookings (it knows pax-per-option).
 */
export async function materializeSlotResourcesFromTemplateDefaults(
  db: PostgresJsDatabase,
  slotId: string,
  opts: MaterializeSlotResourcesFromTemplatesOptions = {},
): Promise<{ created: number; resources: AllocationResource[] }> {
  const [slot] = await db
    .select({
      id: availabilitySlots.id,
      optionId: availabilitySlots.optionId,
      productId: availabilitySlots.productId,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, slotId))
    .limit(1)
  if (!slot) return { created: 0, resources: [] }

  // Resolve which option(s) supply templates. An explicit `opts.optionId`
  // wins (used when back-filling a product-level slot on behalf of one
  // option). Otherwise an option-scoped slot uses its own option, and a
  // product-level slot draws from every option of its product.
  let optionIds: string[]
  if (opts.optionId) {
    optionIds = [opts.optionId]
  } else if (slot.optionId) {
    optionIds = [slot.optionId]
  } else {
    const optionRows = await executeRows<{ id: string }>(
      db,
      // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`SELECT id FROM product_options WHERE product_id = ${slot.productId}`,
    )
    optionIds = optionRows.map((row) => row.id)
  }
  if (optionIds.length === 0) return { created: 0, resources: [] }

  const templateConditions = [inArray(productOptionResourceTemplates.productOptionId, optionIds)]
  if (opts.kind) {
    templateConditions.push(eq(productOptionResourceTemplates.kind, opts.kind))
  }

  const templates = await db
    .select()
    .from(productOptionResourceTemplates)
    .where(and(...templateConditions))
    .orderBy(productOptionResourceTemplates.kind, productOptionResourceTemplates.createdAt)

  if (templates.length === 0) return { created: 0, resources: [] }

  const skipExisting = opts.skipExisting !== false
  const existing = skipExisting
    ? await executeRows<{ kind: string; ref_id: string | null }>(
        db,
        // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`SELECT DISTINCT kind, ref_id FROM allocation_resources WHERE slot_id = ${slotId}`,
      )
    : []
  // Key by (kind, ref) — not kind alone — so a second room type (another
  // option_unit, same kind="room") still materializes when re-applying, rather
  // than the whole "room" kind being skipped once one room exists.
  const templateKey = (kind: string, refId: string | null) => `${kind}::${refId ?? ""}`
  const existingKeys = new Set(existing.map((row) => templateKey(row.kind, row.ref_id)))

  const resources: AllocationResource[] = []
  let sequence = 0

  for (const template of templates) {
    if (template.defaultCount == null || template.defaultCount <= 0) continue
    if (template.kind === "vehicle_seat") continue
    if (skipExisting && existingKeys.has(templateKey(template.kind, template.refId))) continue

    for (let index = 0; index < template.defaultCount; index++) {
      sequence += 1
      const [row] = await db
        .insert(allocationResources)
        .values({
          slotId,
          kind: template.kind,
          refType: template.refType,
          refId: template.refId,
          label: renderNamePattern(template.namePattern, {
            sequence: String(sequence),
            index: String(index + 1),
          }),
          capacity: template.capacity,
          flags: { ...(template.flags ?? {}), templateOptionId: template.productOptionId },
          sortOrder: sequence,
        })
        .returning()
      if (row) resources.push(row)
    }
  }

  return { created: resources.length, resources }
}

/**
 * Back-fill every open, future departure for a product (optionally scoped to a
 * single option) with resources from its templates' `default_count`. Reuses
 * the per-slot, idempotent {@link materializeSlotResourcesFromTemplateDefaults}
 * — slots that already have a kind's resources are skipped — so an operator can
 * configure departure inventory once and apply it across already-open slots.
 */
export async function materializeOpenSlotsFromTemplateDefaults(
  db: PostgresJsDatabase,
  params: { productId: string; optionId?: string },
): Promise<{ slots: number; created: number }> {
  // Departures are usually product-level (no optionId), so we select the
  // product's open future slots and scope the *materialisation* — not the slot
  // query — to the requested option. Filtering slots by optionId here would
  // exclude every product-level departure and seed nothing.
  const slots = await db
    .select({ id: availabilitySlots.id })
    .from(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.productId, params.productId),
        eq(availabilitySlots.status, "open"),
        // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`${availabilitySlots.startsAt} >= now()`,
      ),
    )

  let created = 0
  for (const slot of slots) {
    const result = await materializeSlotResourcesFromTemplateDefaults(
      db,
      slot.id,
      params.optionId ? { optionId: params.optionId } : {},
    )
    created += result.created
  }

  return { slots: slots.length, created }
}

function toAllocatorTravelers(manifest: SlotAllocationManifest, kind: string): AllocatorTraveler[] {
  const travelers: AllocatorTraveler[] = []
  for (const booking of manifest.bookings) {
    for (const traveler of booking.travelers) {
      travelers.push({
        id: traveler.id,
        bookingId: booking.id,
        bookingStatus: booking.status,
        isLeadTraveler: traveler.isLeadTraveler,
        sharingGroupId: traveler.sharingGroupId,
        hasAccessibilityNeeds: traveler.hasAccessibilityNeeds,
        existingAllocationId: traveler.allocations[kind] ?? null,
        optionId: traveler.optionId,
        optionUnitId: traveler.optionUnitId,
        optionUnitCode: traveler.optionUnitCode,
      })
    }
  }
  return travelers
}

function toAllocatorResource(resource: AllocationResource): AllocatorResource {
  return {
    id: resource.id,
    kind: resource.kind,
    capacity: resource.capacity,
    flags: resource.flags ?? {},
    parentId: resource.parentId,
    refType: resource.refType,
    refId: resource.refId,
    label: resource.label,
    row: typeof resource.flags?.row === "number" ? resource.flags.row : undefined,
    column: typeof resource.flags?.column === "string" ? resource.flags.column : undefined,
    position:
      resource.flags?.position === "window" ||
      resource.flags?.position === "aisle" ||
      resource.flags?.position === "middle"
        ? resource.flags.position
        : undefined,
  }
}
