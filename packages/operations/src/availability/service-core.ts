import {
  type AvailabilitySlot,
  availabilityCloseouts,
  availabilitySlots,
} from "@voyant-travel/availability/schema"
import type { EventBus } from "@voyant-travel/core"
import { RequestValidationError } from "@voyant-travel/hono"
import { and, asc, desc, eq, getTableColumns, gte, lt, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { AVAILABILITY_SLOT_CHANGED_EVENT, type AvailabilitySlotChangedEvent } from "./events.js"
import { materializeDepartureServiceOperations } from "./materialize-departure-operations.js"
import { productOptionsRef, productsRef, resolveCurrentProductVersionId } from "./products-ref.js"
import { assertProductAllowsStaticAvailability } from "./service-product-guard.js"
import type {
  AvailabilityCloseoutListQuery,
  AvailabilitySlotListQuery,
  CreateAvailabilityCloseoutInput,
  CreateAvailabilitySlotInput,
  UpdateAvailabilityCloseoutInput,
  UpdateAvailabilitySlotInput,
} from "./service-shared.js"
import { paginate, toDateOrNull } from "./service-shared.js"
import { assertSlotTimingAndCapacity } from "./service-validation.js"
import { slotEndDateLocal } from "./slot-timezone.js"

export type AvailabilitySlotWithEndDateLocal = AvailabilitySlot & {
  productName?: string | null
  endDateLocal: string | null
}

export class AvailabilitySlotRevisionConflictError extends Error {
  constructor(
    readonly expectedUpdatedAt: string,
    readonly current: AvailabilitySlotWithEndDateLocal,
  ) {
    super("Availability slot changed after it was read")
    this.name = "AvailabilitySlotRevisionConflictError"
  }
}

function withSlotEndDateLocal<TSlot extends AvailabilitySlot & { productName?: string | null }>(
  slot: TSlot,
): TSlot & { endDateLocal: string | null } {
  return {
    ...slot,
    endDateLocal: slotEndDateLocal(slot),
  }
}

async function assertSlotOptionBelongsToProduct(
  db: PostgresJsDatabase,
  input: { productId: string; optionId: string },
) {
  const [option] = await db
    .select({ id: productOptionsRef.id })
    .from(productOptionsRef)
    .where(
      and(
        eq(productOptionsRef.id, input.optionId),
        eq(productOptionsRef.productId, input.productId),
      ),
    )
    .limit(1)

  if (!option) {
    throw new RequestValidationError("Availability slot option must belong to the slot product", {
      productId: input.productId,
      optionId: input.optionId,
    })
  }
}

export async function listSlots(db: PostgresJsDatabase, query: AvailabilitySlotListQuery) {
  const conditions = []
  if (query.productId) conditions.push(eq(availabilitySlots.productId, query.productId))
  if (query.itineraryId) conditions.push(eq(availabilitySlots.itineraryId, query.itineraryId))
  if (query.optionId) conditions.push(eq(availabilitySlots.optionId, query.optionId))
  if (query.facilityId) conditions.push(eq(availabilitySlots.facilityId, query.facilityId))
  if (query.availabilityRuleId) {
    conditions.push(eq(availabilitySlots.availabilityRuleId, query.availabilityRuleId))
  }
  if (query.startTimeId) conditions.push(eq(availabilitySlots.startTimeId, query.startTimeId))
  if (query.dateLocal) conditions.push(eq(availabilitySlots.dateLocal, query.dateLocal))
  if (query.startsAtFrom)
    conditions.push(gte(availabilitySlots.startsAt, new Date(query.startsAtFrom)))
  if (query.startsAtUntil)
    conditions.push(lt(availabilitySlots.startsAt, new Date(query.startsAtUntil)))
  if (query.status) conditions.push(eq(availabilitySlots.status, query.status))
  const where = conditions.length ? and(...conditions) : undefined

  const page = await paginate(
    db
      .select({ ...getTableColumns(availabilitySlots), productName: productsRef.name })
      .from(availabilitySlots)
      .leftJoin(productsRef, eq(availabilitySlots.productId, productsRef.id))
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(asc(availabilitySlots.startsAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(availabilitySlots).where(where),
    query.limit,
    query.offset,
  )
  return {
    ...page,
    data: page.data.map((slot): AvailabilitySlotWithEndDateLocal => withSlotEndDateLocal(slot)),
  }
}

export async function getSlotById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, id))
    .limit(1)
  return row ? withSlotEndDateLocal(row) : null
}

export interface SlotMutationRuntime {
  /**
   * Optional event bus. When wired, slot create/update/delete each emit
   * `availability.slot.changed` so subscribers (channel-push, catalog
   * bridge) can react to any mutation that changes a product's effective
   * departure surface — not just operator edits.
   *
   * Per docs/architecture/channel-push-architecture.md §5.1.
   */
  eventBus?: EventBus
  /**
   * Origin of the change. `createSlot` / `deleteSlot` default to
   * `"created"` / `"deleted"`. `updateSlot` defaults to `"manual"`. The
   * scheduled-refresh job overrides with `"refresh"` so dashboards can
   * attribute drift correctly.
   */
  source?: AvailabilitySlotChangedEvent["source"]
  /** Test-only seams for deterministic concurrent-update coverage. */
  testHooks?: {
    beforeSlotSnapshot?: (db: PostgresJsDatabase) => Promise<void>
    afterSlotSnapshot?: () => Promise<void>
  }
}

/**
 * Back-compat alias for the original update-only runtime type. New
 * callers should reach for `SlotMutationRuntime`.
 */
export type UpdateSlotRuntime = SlotMutationRuntime

export async function createSlot(
  db: PostgresJsDatabase,
  data: CreateAvailabilitySlotInput,
  runtime: SlotMutationRuntime = {},
) {
  await assertProductAllowsStaticAvailability(db, data.productId, "slot")

  assertSlotTimingAndCapacity(data)

  if (data.optionId) {
    await assertSlotOptionBelongsToProduct(db, {
      productId: data.productId,
      optionId: data.optionId,
    })
  }

  // Seed `remaining_pax` for a bounded slot when the caller omits it.
  // `remainingPax` is optional in the input schema, so a slot created with
  // `{ initialPax, unlimited: false }` and no `remainingPax` would otherwise
  // land with `remaining_pax = NULL`. The booking engine's capacity
  // reservation reads `remaining_pax ?? 0`, so such a slot is sold out from
  // birth — every reservation 409s while the admin UI shows full capacity
  // (#2833). A finite slot with no explicit remainder starts at full
  // `initialPax`; the update path already rebalances on capacity changes.
  const remainingPax =
    !data.unlimited && data.remainingPax == null && data.initialPax != null
      ? data.initialPax
      : data.remainingPax

  // Bind the departure to the Product definition it is created from, so later
  // Product edits cannot silently rewrite what it sells (#4032). An explicit
  // value wins — that is how a caller materializes against a chosen version
  // rather than whatever is currently published.
  const productVersionId =
    data.productVersionId ?? (await resolveCurrentProductVersionId(db, data.productId))

  const [row] = await db
    .insert(availabilitySlots)
    .values({
      ...data,
      productVersionId,
      remainingPax,
      startsAt: new Date(data.startsAt),
      endsAt: toDateOrNull(data.endsAt),
    })
    .returning()
  if (!row) return row

  // Materialize this departure's operable service lines from the frozen Product
  // Version snapshot it was just bound to (voyant#4035). Idempotent, and a slot
  // with no bound version or no snapshot is a no-op.
  await materializeDepartureServiceOperations(db, row.id)

  // Emit on create so subscribers (catalog-plane bridge, channel-push)
  // see new departures the same way they see edits. Without this, a
  // freshly-created slot is invisible to the projection until the next
  // unrelated update.
  const eventBus = runtime.eventBus
  if (eventBus) {
    const payload: AvailabilitySlotChangedEvent = {
      slotId: row.id,
      productId: row.productId,
      optionId: row.optionId ?? null,
      startsAt: row.startsAt,
      remainingPax: row.unlimited ? null : (row.remainingPax ?? null),
      unlimited: row.unlimited,
      source: runtime.source ?? "created",
    }
    await eventBus.emit(AVAILABILITY_SLOT_CHANGED_EVENT, payload, {
      category: "domain",
      source: "service",
    })
  }

  return withSlotEndDateLocal(row)
}

export async function updateSlot(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateAvailabilitySlotInput & { updatedAt?: string },
  runtime: SlotMutationRuntime = {},
) {
  const row = await db.transaction(async (tx) => {
    const transactionalDb = tx as PostgresJsDatabase
    await runtime.testHooks?.beforeSlotSnapshot?.(transactionalDb)
    // The lock makes the authoritative timing snapshot and the partial patch
    // one serialized operation. A concurrent writer validates only after the
    // prior writer commits, so two independently-valid patches cannot combine
    // into an invalid dateLocal / startsAt / endsAt / timezone state.
    const [current] = await tx
      .select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, id))
      .for("update")
      .limit(1)
    if (!current) return null
    await runtime.testHooks?.afterSlotSnapshot?.()

    if (data.updatedAt !== undefined) {
      const expectedUpdatedAt = new Date(data.updatedAt)
      if (Number.isNaN(expectedUpdatedAt.getTime())) {
        throw new RequestValidationError(
          "Availability slot updatedAt precondition must be a valid instant",
          { updatedAt: data.updatedAt },
        )
      }
      if (expectedUpdatedAt.getTime() !== current.updatedAt.getTime()) {
        throw new AvailabilitySlotRevisionConflictError(
          data.updatedAt,
          withSlotEndDateLocal(current),
        )
      }
    }

    if (data.productId !== undefined && data.productId !== current.productId) {
      throw new RequestValidationError("Availability slot product ownership is immutable", {
        slotId: id,
        productId: current.productId,
        requestedProductId: data.productId,
      })
    }
    await assertProductAllowsStaticAvailability(transactionalDb, current.productId, "slot")

    if (data.optionId !== undefined) {
      const nextOptionId = data.optionId
      if (nextOptionId) {
        await assertSlotOptionBelongsToProduct(transactionalDb, {
          productId: current.productId,
          optionId: nextOptionId,
        })
      }
    }

    assertSlotTimingAndCapacity({
      dateLocal: data.dateLocal ?? current.dateLocal,
      startsAt: data.startsAt ?? current.startsAt,
      endsAt: data.endsAt === undefined ? current.endsAt : data.endsAt,
      timezone: data.timezone ?? current.timezone,
      unlimited: data.unlimited ?? current.unlimited,
      initialPax: data.initialPax === undefined ? current.initialPax : data.initialPax,
      remainingPax: undefined,
    })

    // Full read-modify-write snapshots remain valid public inputs, but these
    // fields are service-owned projections of bookings, resources, and the
    // booking window. Never let an operator's stale snapshot write them back.
    const {
      productId: _ignoredProductId,
      updatedAt: _expectedUpdatedAt,
      remainingPax: _ignoredRemainingPax,
      remainingPickups: _ignoredRemainingPickups,
      remainingResources: _ignoredRemainingResources,
      pastCutoff: _ignoredPastCutoff,
      tooEarly: _ignoredTooEarly,
      ...rest
    } = data
    const patch: Record<string, unknown> = {
      ...rest,
      startsAt: data.startsAt === undefined ? undefined : new Date(data.startsAt),
      endsAt: data.endsAt === undefined ? undefined : toDateOrNull(data.endsAt),
      // Keep the optimistic revision monotonic even when two writes land in
      // the same application-clock millisecond.
      updatedAt: sql`GREATEST(
        clock_timestamp(),
        ${availabilitySlots.updatedAt} + interval '1 millisecond'
      )`,
    }

    // `remaining_pax` is a derived value the service owns — concurrent flows
    // (holds, bookings, refunds) update it atomically while a form is open,
    // so we never trust a client-supplied snapshot (#1087 and #1088).
    // Recompute here using the row's *current* state inside the same
    // UPDATE statement so the capacity-change rebalance is race-free.
    //
    //   - Switching to unlimited → NULL (no cap).
    //   - Changing initialPax with a finite cap → preserve the consumed
    //     delta: `new_initial - (old_initial - old_remaining)`, clamped to
    //     [0, new_initial]. If consumed > new_initial (capacity dropped
    //     below what's already booked) the slot lands at 0; the operator
    //     can release allocations to recover headroom.
    //   - Leaving capacity alone → don't touch remaining_pax.
    if (data.unlimited === true) {
      patch.remainingPax = null
    } else if (data.initialPax !== undefined && data.initialPax !== null) {
      const newInitial = data.initialPax
      patch.remainingPax = sql`GREATEST(
        0,
        LEAST(
          ${newInitial}::int,
          ${newInitial}::int
            - GREATEST(
                0,
                COALESCE(${availabilitySlots.initialPax}, ${newInitial}::int)
                  - COALESCE(${availabilitySlots.remainingPax}, ${newInitial}::int)
              )
        )
      )::int`
    }

    const [updated] = await tx
      .update(availabilitySlots)
      .set(patch)
      .where(eq(availabilitySlots.id, id))
      .returning()
    return updated ?? null
  })
  if (!row) return null

  // Emit on every successful update — subscribers decide what to do with
  // the signal (channel-push only acts on availability-affecting fields).
  // The intent table on the channel-push side collapses by (channelId,
  // slotId) so duplicate or noisy emits are harmless. Per §5.1.
  const eventBus = runtime.eventBus
  if (eventBus) {
    const payload: AvailabilitySlotChangedEvent = {
      slotId: row.id,
      productId: row.productId,
      optionId: row.optionId ?? null,
      startsAt: row.startsAt,
      remainingPax: row.unlimited ? null : (row.remainingPax ?? null),
      unlimited: row.unlimited,
      source: runtime.source ?? "manual",
    }
    await eventBus.emit(AVAILABILITY_SLOT_CHANGED_EVENT, payload, {
      category: "domain",
      source: "service",
    })
  }

  return withSlotEndDateLocal(row)
}

export async function deleteSlot(
  db: PostgresJsDatabase,
  id: string,
  runtime: SlotMutationRuntime = {},
) {
  // Snapshot the row before deletion so we can build a complete event
  // payload — once the row is gone we can't reconstruct productId etc.
  const [snapshot] = await db
    .select()
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, id))
    .limit(1)

  const [row] = await db
    .delete(availabilitySlots)
    .where(eq(availabilitySlots.id, id))
    .returning({ id: availabilitySlots.id })
  if (!row) return null

  const eventBus = runtime.eventBus
  if (eventBus && snapshot) {
    const payload: AvailabilitySlotChangedEvent = {
      slotId: snapshot.id,
      productId: snapshot.productId,
      optionId: snapshot.optionId ?? null,
      startsAt: snapshot.startsAt,
      // Deleted slot contributes zero capacity. `remainingPax` reflects
      // the post-mutation state per the contract; for a delete that's 0.
      remainingPax: 0,
      unlimited: false,
      source: runtime.source ?? "deleted",
    }
    await eventBus.emit(AVAILABILITY_SLOT_CHANGED_EVENT, payload, {
      category: "domain",
      source: "service",
    })
  }

  return row
}

export async function listCloseouts(db: PostgresJsDatabase, query: AvailabilityCloseoutListQuery) {
  const conditions = []
  if (query.productId) conditions.push(eq(availabilityCloseouts.productId, query.productId))
  if (query.slotId) conditions.push(eq(availabilityCloseouts.slotId, query.slotId))
  if (query.dateLocal) conditions.push(eq(availabilityCloseouts.dateLocal, query.dateLocal))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select({ ...getTableColumns(availabilityCloseouts), productName: productsRef.name })
      .from(availabilityCloseouts)
      .leftJoin(productsRef, eq(availabilityCloseouts.productId, productsRef.id))
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(desc(availabilityCloseouts.createdAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(availabilityCloseouts).where(where),
    query.limit,
    query.offset,
  )
}

export async function getCloseoutById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(availabilityCloseouts)
    .where(eq(availabilityCloseouts.id, id))
    .limit(1)
  return row ?? null
}

export async function createCloseout(
  db: PostgresJsDatabase,
  data: CreateAvailabilityCloseoutInput,
) {
  const [row] = await db.insert(availabilityCloseouts).values(data).returning()
  return row
}

export async function updateCloseout(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateAvailabilityCloseoutInput,
) {
  const [row] = await db
    .update(availabilityCloseouts)
    .set(data)
    .where(eq(availabilityCloseouts.id, id))
    .returning()
  return row ?? null
}

export async function deleteCloseout(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(availabilityCloseouts)
    .where(eq(availabilityCloseouts.id, id))
    .returning({ id: availabilityCloseouts.id })
  return row ?? null
}
