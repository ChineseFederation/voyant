import { createHash } from "node:crypto"

import type {
  BookingActionProjectionService,
  BookingActionSourceRuntime,
} from "@voyant-travel/bookings/runtime-port"
import type {
  BookingActionListQuery,
  BookingActionRecord,
  BookingActionSourceSnapshot,
  BookingActionState,
  BookingActionSyncMode,
  BookingActionSyncSummary,
  PublicBookingActionRecord,
} from "@voyant-travel/bookings-contracts/booking-actions"
import {
  bookingActionListQuerySchema,
  bookingActionSourceSnapshotSchema,
} from "@voyant-travel/bookings-contracts/booking-actions"
import type { SQL } from "drizzle-orm"
import { and, asc, count, eq, gte, inArray, lt, lte, max, ne, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { localToInstant } from "../availability/slot-timezone.js"
import {
  type BookingActionProjection,
  bookingActionEscalationPolicy,
  bookingActionProjections,
  type NewBookingActionProjection,
} from "./schema.js"

const INCREMENTAL_LOOKBACK_MS = 5 * 60 * 1000

type SourceIdentity = Pick<BookingActionProjection, "sourceModule" | "sourceType" | "sourceId">

export function bookingActionSourceIdentity(source: SourceIdentity): string {
  return `${source.sourceModule}\u0000${source.sourceType}\u0000${source.sourceId}`
}

export function shouldReplaceBookingActionProjection(
  current: Pick<BookingActionProjection, "sourceUpdatedAt" | "fingerprint"> | undefined,
  incoming: Pick<NewBookingActionProjection, "sourceUpdatedAt" | "fingerprint">,
): boolean {
  if (!current) return true
  if (current.sourceUpdatedAt.getTime() > incoming.sourceUpdatedAt.getTime()) return false
  if (current.sourceUpdatedAt.getTime() < incoming.sourceUpdatedAt.getTime()) return true
  // A source revision should uniquely identify content. If a buggy source
  // emits different snapshots at the exact same revision, this tie-break makes
  // convergence independent of delivery order instead of letting last writer
  // win.
  return incoming.fingerprint > current.fingerprint
}

export function findMissingBookingActionProjectionIds(
  current: ReadonlyArray<
    Pick<BookingActionProjection, "id" | "sourceModule" | "sourceType" | "sourceId">
  >,
  seen: ReadonlySet<string>,
): string[] {
  return current.filter((row) => !seen.has(bookingActionSourceIdentity(row))).map(({ id }) => id)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function fingerprint(snapshot: BookingActionSourceSnapshot): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex")
}

function addUtcDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function resolveBookingActionDeadline(snapshot: BookingActionSourceSnapshot): {
  dueAt: Date
  dueLocalDate: string | null
  timeZone: string
  deadlineSemantics: "instant" | "local_date_end"
} {
  if (snapshot.deadline.semantics === "instant") {
    return {
      dueAt: new Date(snapshot.deadline.at),
      dueLocalDate: null,
      timeZone: "UTC",
      deadlineSemantics: "instant",
    }
  }

  // End-of-day is the instant immediately before the following local midnight.
  // Resolving the next calendar day in the named zone makes DST transitions
  // explicit and avoids treating a business date as UTC.
  const nextLocalMidnight = localToInstant({
    date: addUtcDays(snapshot.deadline.localDate, 1),
    time: "00:00:00",
    timezone: snapshot.deadline.timeZone,
  })
  return {
    dueAt: new Date(new Date(nextLocalMidnight).getTime() - 1),
    dueLocalDate: snapshot.deadline.localDate,
    timeZone: snapshot.deadline.timeZone,
    deadlineSemantics: "local_date_end",
  }
}

export function deriveBookingActionState(
  row: Pick<
    BookingActionProjection,
    "sourceState" | "dueAt" | "dueWindowSeconds" | "escalateAfterSeconds"
  >,
  asOf: Date,
): BookingActionState {
  if (row.sourceState !== "open") return row.sourceState
  if (asOf.getTime() < row.dueAt.getTime() - row.dueWindowSeconds * 1000) return "scheduled"
  if (asOf.getTime() < row.dueAt.getTime()) return "due"
  if (asOf.getTime() >= row.dueAt.getTime() + row.escalateAfterSeconds * 1000) {
    return "escalated"
  }
  return "overdue"
}

function derivedStateSql(asOf: Date) {
  return sql<BookingActionState>`CASE
    WHEN ${bookingActionProjections.sourceState} <> 'open'
      THEN ${bookingActionProjections.sourceState}
    WHEN ${bookingActionProjections.dueAt} > ${asOf} + (${bookingActionProjections.dueWindowSeconds} * interval '1 second')
      THEN 'scheduled'
    WHEN ${bookingActionProjections.dueAt} > ${asOf}
      THEN 'due'
    WHEN ${bookingActionProjections.dueAt} + (${bookingActionProjections.escalateAfterSeconds} * interval '1 second') <= ${asOf}
      THEN 'escalated'
    ELSE 'overdue'
  END`
}

function toRecord(row: BookingActionProjection, asOf: Date): BookingActionRecord {
  return {
    id: row.id,
    providerId: row.providerId,
    sourceModule: row.sourceModule,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceUpdatedAt: row.sourceUpdatedAt.toISOString(),
    kind: row.kind,
    bookingId: row.bookingId,
    bookingSessionId: row.bookingSessionId,
    dueAt: row.dueAt.toISOString(),
    dueLocalDate: row.dueLocalDate,
    timeZone: row.timeZone,
    deadlineSemantics: row.deadlineSemantics,
    state: deriveBookingActionState(row, asOf),
    satisfiedAt: row.satisfiedAt?.toISOString() ?? null,
    escalationPolicy: bookingActionEscalationPolicy(row),
    operatorNextAction: row.operatorNextAction,
    customerVisible: row.customerVisible,
    customerNextAction: row.customerNextAction,
    safeMetadata: row.safeMetadata,
    projectedAt: row.projectedAt.toISOString(),
  }
}

function toPublicRecord(row: BookingActionRecord): PublicBookingActionRecord {
  return {
    id: row.id,
    kind: row.kind,
    bookingId: row.bookingId,
    dueAt: row.dueAt,
    dueLocalDate: row.dueLocalDate,
    timeZone: row.timeZone,
    deadlineSemantics: row.deadlineSemantics,
    state: row.state,
    satisfiedAt: row.satisfiedAt,
    customerNextAction: row.customerNextAction,
  }
}

function toProjectionInsert(
  provider: BookingActionSourceRuntime,
  snapshot: BookingActionSourceSnapshot,
  now: Date,
): NewBookingActionProjection {
  const deadline = resolveBookingActionDeadline(snapshot)
  return {
    providerId: provider.id,
    sourceModule: snapshot.sourceModule,
    sourceType: snapshot.sourceType,
    sourceId: snapshot.sourceId,
    sourceUpdatedAt: new Date(snapshot.sourceUpdatedAt),
    kind: snapshot.kind,
    bookingId: snapshot.bookingId,
    bookingSessionId: snapshot.bookingSessionId,
    ...deadline,
    sourceState: snapshot.sourceState,
    satisfiedAt: snapshot.satisfiedAt ? new Date(snapshot.satisfiedAt) : null,
    dueWindowSeconds: snapshot.escalationPolicy.dueWindowSeconds,
    escalateAfterSeconds: snapshot.escalationPolicy.escalateAfterSeconds,
    operatorNextAction: snapshot.operatorNextAction,
    customerVisible: snapshot.customerVisible,
    customerNextAction: snapshot.customerNextAction,
    safeMetadata: snapshot.safeMetadata,
    fingerprint: fingerprint(snapshot),
    projectedAt: now,
  }
}

async function providerChangedAfter(
  db: PostgresJsDatabase,
  providerId: string,
): Promise<Date | undefined> {
  const [row] = await db
    .select({ latest: max(bookingActionProjections.sourceUpdatedAt) })
    .from(bookingActionProjections)
    .where(eq(bookingActionProjections.providerId, providerId))
  return row?.latest ? new Date(row.latest.getTime() - INCREMENTAL_LOOKBACK_MS) : undefined
}

async function synchronizeProvider(
  db: PostgresJsDatabase,
  provider: BookingActionSourceRuntime,
  mode: BookingActionSyncMode,
  now: Date,
): Promise<{ projected: number; unchanged: number; invalidated: number }> {
  const changedAfter =
    mode === "incremental" ? await providerChangedAfter(db, provider.id) : undefined
  const rawSnapshots = await provider.read(db, { changedAfter })
  const snapshots = rawSnapshots.map((raw) => bookingActionSourceSnapshotSchema.parse(raw))
  for (const snapshot of snapshots) {
    if (snapshot.sourceModule !== provider.sourceModule) {
      throw new Error(
        `Booking action provider ${provider.id} returned source module ${snapshot.sourceModule}; expected ${provider.sourceModule}.`,
      )
    }
  }

  let projected = 0
  let unchanged = 0
  const seen = new Set<string>()
  for (const snapshot of snapshots) {
    const identity = bookingActionSourceIdentity(snapshot)
    if (seen.has(identity)) {
      throw new Error(
        `Booking action provider ${provider.id} returned duplicate source ${identity}.`,
      )
    }
    seen.add(identity)
    const next = toProjectionInsert(provider, snapshot, now)
    const [existing] = await db
      .select()
      .from(bookingActionProjections)
      .where(
        and(
          eq(bookingActionProjections.providerId, provider.id),
          eq(bookingActionProjections.sourceModule, snapshot.sourceModule),
          eq(bookingActionProjections.sourceType, snapshot.sourceType),
          eq(bookingActionProjections.sourceId, snapshot.sourceId),
        ),
      )
      .limit(1)

    if (!shouldReplaceBookingActionProjection(existing, next)) {
      unchanged += 1
      continue
    }

    await db
      .insert(bookingActionProjections)
      .values(next)
      .onConflictDoUpdate({
        target: [
          bookingActionProjections.providerId,
          bookingActionProjections.sourceModule,
          bookingActionProjections.sourceType,
          bookingActionProjections.sourceId,
        ],
        set: next,
        setWhere: or(
          lt(bookingActionProjections.sourceUpdatedAt, next.sourceUpdatedAt),
          and(
            eq(bookingActionProjections.sourceUpdatedAt, next.sourceUpdatedAt),
            lt(bookingActionProjections.fingerprint, next.fingerprint),
          ),
        ),
      })
    projected += 1
  }

  let invalidated = 0
  if (mode === "rebuild") {
    const current = await db
      .select({
        id: bookingActionProjections.id,
        sourceModule: bookingActionProjections.sourceModule,
        sourceType: bookingActionProjections.sourceType,
        sourceId: bookingActionProjections.sourceId,
      })
      .from(bookingActionProjections)
      .where(eq(bookingActionProjections.providerId, provider.id))
    const ids = findMissingBookingActionProjectionIds(current, seen)
    if (ids.length > 0) {
      await db
        .update(bookingActionProjections)
        .set({
          sourceState: "invalid_source",
          operatorNextAction: "none",
          customerVisible: false,
          customerNextAction: null,
          projectedAt: now,
        })
        .where(inArray(bookingActionProjections.id, ids))
      invalidated = ids.length
    }
  }

  return { projected, unchanged, invalidated }
}

export function createBookingActionProjectionService(
  db: PostgresJsDatabase,
): BookingActionProjectionService {
  return {
    async synchronize(sources, mode): Promise<BookingActionSyncSummary> {
      const now = new Date()
      const uniqueIds = new Set(sources.map(({ id }) => id))
      if (uniqueIds.size !== sources.length) {
        throw new Error("Booking action source provider ids must be unique.")
      }
      // All selected modules share the operator's transactional Postgres
      // database. A refresh therefore exposes either one coherent cross-module
      // projection or the previous one — never a half-rebuilt work queue.
      return db.transaction(async (tx) => {
        let projected = 0
        let unchanged = 0
        let invalidated = 0
        for (const source of sources) {
          const result = await synchronizeProvider(tx, source, mode, now)
          projected += result.projected
          unchanged += result.unchanged
          invalidated += result.invalidated
        }
        return { mode, providers: sources.length, projected, unchanged, invalidated }
      })
    },

    async listStaff(input: BookingActionListQuery) {
      const query = bookingActionListQuerySchema.parse(input)
      const asOf = new Date()
      const predicates: SQL[] = []
      if (query.bookingId) predicates.push(eq(bookingActionProjections.bookingId, query.bookingId))
      if (query.bookingSessionId) {
        predicates.push(eq(bookingActionProjections.bookingSessionId, query.bookingSessionId))
      }
      if (query.kind) predicates.push(eq(bookingActionProjections.kind, query.kind))
      if (query.state) predicates.push(sql`${derivedStateSql(asOf)} = ${query.state}`)
      if (query.dueFrom)
        predicates.push(gte(bookingActionProjections.dueAt, new Date(query.dueFrom)))
      if (query.dueTo) predicates.push(lte(bookingActionProjections.dueAt, new Date(query.dueTo)))
      const where = predicates.length > 0 ? and(...predicates) : undefined
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(bookingActionProjections)
          .where(where)
          .orderBy(asc(bookingActionProjections.dueAt), asc(bookingActionProjections.id))
          .limit(query.limit)
          .offset(query.offset),
        db.select({ count: count() }).from(bookingActionProjections).where(where),
      ])
      return {
        data: rows.map((row) => toRecord(row, asOf)),
        count: totals[0]?.count ?? 0,
        limit: query.limit,
        offset: query.offset,
        asOf: asOf.toISOString(),
      }
    },

    async listCustomer(bookingId: string) {
      const asOf = new Date()
      const rows = await db
        .select()
        .from(bookingActionProjections)
        .where(
          and(
            eq(bookingActionProjections.bookingId, bookingId),
            eq(bookingActionProjections.customerVisible, true),
            or(
              eq(bookingActionProjections.sourceState, "open"),
              eq(bookingActionProjections.sourceState, "satisfied"),
            ),
          ),
        )
        .orderBy(asc(bookingActionProjections.dueAt), asc(bookingActionProjections.id))
      return {
        data: rows.map((row) => toPublicRecord(toRecord(row, asOf))),
        asOf: asOf.toISOString(),
      }
    },

    async getDeadlineBySource(input) {
      const [row] = await db
        .select({
          dueAt: bookingActionProjections.dueAt,
          timeZone: bookingActionProjections.timeZone,
          deadlineSemantics: bookingActionProjections.deadlineSemantics,
        })
        .from(bookingActionProjections)
        .where(
          and(
            eq(bookingActionProjections.sourceModule, input.sourceModule),
            eq(bookingActionProjections.sourceType, input.sourceType),
            eq(bookingActionProjections.sourceId, input.sourceId),
            ne(bookingActionProjections.sourceState, "invalid_source"),
          ),
        )
        .limit(1)
      return row ? { ...row, dueAt: row.dueAt.toISOString() } : null
    },

    async getDeadlinesBySource(input) {
      if (input.sourceIds.length === 0) return new Map()
      const rows = await db
        .select({
          sourceId: bookingActionProjections.sourceId,
          dueAt: bookingActionProjections.dueAt,
        })
        .from(bookingActionProjections)
        .where(
          and(
            eq(bookingActionProjections.sourceModule, input.sourceModule),
            eq(bookingActionProjections.sourceType, input.sourceType),
            inArray(bookingActionProjections.sourceId, [...input.sourceIds]),
            ne(bookingActionProjections.sourceState, "invalid_source"),
          ),
        )
      return new Map(rows.map((row) => [row.sourceId, row.dueAt.toISOString()]))
    },
  }
}
