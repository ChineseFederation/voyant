import { and, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import {
  type AllocationResource,
  allocationResources,
  availabilitySlots,
  productOptionResourceTemplates,
} from "./schema.js"
import { type AllocationMutationOptions, recordAllocationAudit } from "./service-allocation.js"
import type {
  AllocationAutomationInput,
  AllocationAutomationResult,
} from "./service-allocation-auto-allocate.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import { executeRows } from "./service-allocation-sql.js"
import {
  type AutoMaterializeRow,
  materializeVehicleSeatGroupInTransaction,
  renderNamePattern,
} from "./service-allocation-vehicle-materialization.js"

export {
  type AllocationAutomationInput,
  type AllocationAutomationResult,
  type AllocationPlanEntry,
  type AllocationPlanPreview,
  autoAllocateSlotResources,
  previewAutoAllocateSlotResources,
} from "./service-allocation-auto-allocate.js"
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

/**
 * ## Idempotency
 *
 * This used to raise `409 Resources already exist` the moment the slot held a
 * single resource of the requested kind, while
 * {@link materializeSlotResourcesFromTemplateDefaults} silently skipped. Two
 * routes over the same table disagreed on what "already done" means, and a
 * retried request — the normal outcome of a dropped connection — surfaced as an
 * error the operator had to interpret.
 *
 * Both paths now agree on **skip-existing at (kind, ref) granularity**:
 * materialising is a converge-to-this-layout operation, so calling it twice
 * leaves the same rows and reports `created: 0, skippedExisting: n`. Skipping
 * was chosen over erroring because it is the only one of the two that is safe
 * to retry, and because per-(kind, ref) granularity lets a second room type
 * materialise later without the whole kind being considered done — the coarser
 * "any row of this kind exists" rule blocked exactly that.
 *
 * Replacing an existing layout stays an explicit operator action: delete the
 * resources, then materialise again.
 */
export async function autoMaterializeAllocationResources(
  db: PostgresJsDatabase,
  slotId: string,
  input: AllocationAutomationInput,
  options: AllocationMutationOptions = {},
): Promise<AllocationAutomationResult> {
  return db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase
    const result = await autoMaterializeAllocationResourcesLocked(scoped, slotId, input)
    if ((result.created ?? 0) > 0) {
      // Inside the transaction: a rolled-back materialisation must not leave an
      // audit entry claiming rooms were laid out.
      await recordAllocationAudit(scoped, {
        slotId,
        action: "resources.materialize",
        actorId: options.actorId ?? null,
        after: {
          kind: result.kind,
          created: result.created ?? 0,
          skippedExisting: result.skippedExisting ?? 0,
        },
      })
    }
    return result
  })
}

/**
 * Existing `(kind, ref_id)` pairs on a slot. Both materialisation paths key
 * their skip decision on the pair they are about to write, so a template that
 * targets a second option unit still materialises while the first is left
 * alone.
 */
async function loadExistingResourceKeys(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<Set<string>> {
  const rows = await executeRows<{ kind: string; ref_id: string | null }>(
    db,
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    sql`SELECT DISTINCT kind, ref_id FROM allocation_resources WHERE slot_id = ${slotId}`,
  )
  return new Set(rows.map((row) => resourceKey(row.kind, row.ref_id)))
}

function resourceKey(kind: string, refId: string | null | undefined): string {
  return `${kind}::${refId ?? ""}`
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

  const existingKeys = await loadExistingResourceKeys(db, slotId)

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
        t.occupancy_min,
        t.min_age,
        t.max_age,
        t.room_type_id,
        t.bed_configuration,
        t.accessible,
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

  if (groups.length === 0) return { kind, created: 0, skippedExisting: 0, resources: [] }

  const created: AllocationResource[] = []
  let sequence = 0
  let skippedExisting = 0
  for (const group of groups) {
    if (kind === "vehicle_seat") {
      if (existingKeys.has(resourceKey(kind, group.ref_id))) {
        skippedExisting += 1
        continue
      }
      const vehicleResources = await materializeVehicleSeatGroupInTransaction(
        db,
        slotId,
        group,
        sequence,
      )
      sequence += vehicleResources.vehicleCount
      created.push(...vehicleResources.resources)
      existingKeys.add(resourceKey(kind, group.ref_id))
      continue
    }

    // Default the resource's ref to its materializing option so the UI
    // can badge each row with the option name (e.g. Standard double).
    // Templates that explicitly set ref_type/ref_id (e.g. pointing at a
    // hotel inventory row) keep their own values.
    const resolvedRefType = group.ref_type ?? "option"
    const resolvedRefId = group.ref_id ?? group.option_id
    if (existingKeys.has(resourceKey(kind, resolvedRefId))) {
      skippedExisting += 1
      continue
    }

    const unitsNeeded = Math.max(1, Math.ceil(group.pax_count / Math.max(1, group.capacity)))
    for (let index = 0; index < unitsNeeded; index++) {
      sequence += 1
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
          occupancyMin: group.occupancy_min ?? null,
          roomTypeId: group.room_type_id ?? null,
          bedConfiguration: group.bed_configuration ?? null,
          accessible: group.accessible ?? false,
          minAge: group.min_age ?? null,
          maxAge: group.max_age ?? null,
          flags: { ...(group.flags ?? {}), templateOptionId: group.option_id },
          sortOrder: sequence,
        })
        .returning()
      if (row) created.push(row)
    }
    existingKeys.add(resourceKey(kind, resolvedRefId))
  }

  return { kind, created: created.length, skippedExisting, resources: created }
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
 * `vehicle_seat` templates are materialised here too: `default_count` is read
 * as the number of *vehicles* to lay out, and each one gets its full seat map
 * from the template's `flags.layoutSpec` (or `layout` + `capacity`). Before
 * this, the only path that created seats was the pax-derived one, so a coach
 * with an empty seat map could not be drawn until the departure had already
 * been sold — the operator had to hand-create fifty seats or sell blind.
 *
 * Runs inside a transaction that holds the slot row lock, because vehicle-seat
 * layouts write a parent and its children and must not interleave with a
 * concurrent materialisation of the same slot.
 */
export async function materializeSlotResourcesFromTemplateDefaults(
  db: PostgresJsDatabase,
  slotId: string,
  opts: MaterializeSlotResourcesFromTemplatesOptions = {},
): Promise<{ created: number; skippedExisting: number; resources: AllocationResource[] }> {
  return db.transaction(async (tx) =>
    materializeSlotResourcesFromTemplateDefaultsLocked(tx as PostgresJsDatabase, slotId, opts),
  )
}

async function materializeSlotResourcesFromTemplateDefaultsLocked(
  db: PostgresJsDatabase,
  slotId: string,
  opts: MaterializeSlotResourcesFromTemplatesOptions,
): Promise<{ created: number; skippedExisting: number; resources: AllocationResource[] }> {
  const [slot] = await db
    .select({
      id: availabilitySlots.id,
      optionId: availabilitySlots.optionId,
      productId: availabilitySlots.productId,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, slotId))
    .for("update")
    .limit(1)
  if (!slot) return { created: 0, skippedExisting: 0, resources: [] }

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
  if (optionIds.length === 0) return { created: 0, skippedExisting: 0, resources: [] }

  const templateConditions = [inArray(productOptionResourceTemplates.productOptionId, optionIds)]
  if (opts.kind) {
    templateConditions.push(eq(productOptionResourceTemplates.kind, opts.kind))
  }

  const templates = await db
    .select()
    .from(productOptionResourceTemplates)
    .where(and(...templateConditions))
    .orderBy(productOptionResourceTemplates.kind, productOptionResourceTemplates.createdAt)

  if (templates.length === 0) return { created: 0, skippedExisting: 0, resources: [] }

  const skipExisting = opts.skipExisting !== false
  // Key by (kind, ref) — not kind alone — so a second room type (another
  // option_unit, same kind="room") still materializes when re-applying, rather
  // than the whole "room" kind being skipped once one room exists. Shared with
  // `autoMaterializeAllocationResources`, which now skips on the same rule.
  const existingKeys = skipExisting ? await loadExistingResourceKeys(db, slotId) : new Set<string>()

  const resources: AllocationResource[] = []
  let sequence = 0
  let skippedExisting = 0

  for (const template of templates) {
    if (template.defaultCount == null || template.defaultCount <= 0) continue
    const key = resourceKey(template.kind, template.refId)
    if (skipExisting && existingKeys.has(key)) {
      skippedExisting += 1
      continue
    }

    if (template.kind === "vehicle_seat") {
      // `default_count` counts vehicles here, not seats: the seat count comes
      // from the layout. `pax_count` is irrelevant — that is the whole point of
      // laying a coach out before the first sale.
      const group: AutoMaterializeRow = {
        option_id: template.productOptionId,
        pax_count: 0,
        vehicle_count: template.defaultCount,
        capacity: template.capacity,
        occupancy_min: template.occupancyMin,
        min_age: template.minAge,
        max_age: template.maxAge,
        room_type_id: template.roomTypeId,
        bed_configuration: template.bedConfiguration,
        accessible: template.accessible,
        name_pattern: template.namePattern,
        ref_type: template.refType,
        ref_id: template.refId,
        layout: template.layout,
        flags: template.flags ?? {},
        option_name: null,
        sort_order: null,
      }
      const vehicleResources = await materializeVehicleSeatGroupInTransaction(
        db,
        slotId,
        group,
        sequence,
      )
      sequence += vehicleResources.vehicleCount
      resources.push(...vehicleResources.resources)
      existingKeys.add(key)
      continue
    }

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
          occupancyMin: template.occupancyMin,
          roomTypeId: template.roomTypeId,
          bedConfiguration: template.bedConfiguration,
          accessible: template.accessible,
          minAge: template.minAge,
          maxAge: template.maxAge,
          flags: { ...(template.flags ?? {}), templateOptionId: template.productOptionId },
          sortOrder: sequence,
        })
        .returning()
      if (row) resources.push(row)
    }
    existingKeys.add(key)
  }

  return { created: resources.length, skippedExisting, resources }
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
