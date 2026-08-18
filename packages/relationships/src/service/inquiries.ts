import { generateEventId } from "@voyant-travel/core"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import type {
  AssignInquiryInput,
  CloseInquiryInput,
  CreateInquiryInput,
  InquiryListQueryInput,
  InquiryStatus,
  ReopenInquiryInput,
  TransitionInquiryInput,
  UpdateInquiryInput,
} from "@voyant-travel/relationships-contracts"
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  INQUIRY_ASSIGNED_EVENT,
  INQUIRY_CLOSED_EVENT,
  INQUIRY_CREATED_EVENT,
  INQUIRY_REOPENED_EVENT,
  INQUIRY_STATUS_CHANGED_EVENT,
  INQUIRY_UPDATED_EVENT,
} from "../events.js"
import { type Inquiry, inquiries, organizations, people } from "../schema.js"
import { paginate } from "./helpers.js"

export type InquiryServiceErrorCode =
  | "INQUIRY_NOT_FOUND"
  | "INQUIRY_RELATED_RECORD_NOT_FOUND"
  | "INVALID_INQUIRY_TRANSITION"
  | "INQUIRY_ASSIGNMENT_REQUIRED"
  | "INQUIRY_NEXT_ACTION_REQUIRED"
  | "INQUIRY_CUSTOMER_REQUIRED"
  | "INQUIRY_ALREADY_RESOLVED"
  | "INQUIRY_CONVERSION_NOT_READY"
  | "INQUIRY_CONVERSION_REFUSED"
  | "INVALID_DUPLICATE_INQUIRY"

export class InquiryServiceError extends Error {
  constructor(
    readonly code: InquiryServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "InquiryServiceError"
  }
}

const transitions: Record<InquiryStatus, readonly InquiryStatus[]> = {
  new: ["triaged"],
  triaged: ["in_progress", "qualified"],
  in_progress: ["waiting_on_customer", "qualified"],
  waiting_on_customer: ["in_progress", "qualified"],
  qualified: [],
  converted: [],
  closed: [],
}

export function canTransitionInquiry(from: InquiryStatus, to: InquiryStatus): boolean {
  return transitions[from].includes(to)
}

function date(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(value)
}

async function assertRelatedRecords(
  db: PostgresJsDatabase,
  input: { personId?: string | null; organizationId?: string | null },
) {
  if (input.personId) {
    const [person] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, input.personId))
    if (!person) {
      throw new InquiryServiceError("INQUIRY_RELATED_RECORD_NOT_FOUND", "Person not found")
    }
  }
  if (input.organizationId) {
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
    if (!organization) {
      throw new InquiryServiceError("INQUIRY_RELATED_RECORD_NOT_FOUND", "Organization not found")
    }
  }
}

function updateDates(input: { nextActionAt?: string | null; firstResponseDueAt?: string | null }) {
  return {
    ...(input.nextActionAt !== undefined ? { nextActionAt: date(input.nextActionAt) } : {}),
    ...(input.firstResponseDueAt !== undefined
      ? { firstResponseDueAt: date(input.firstResponseDueAt) }
      : {}),
  }
}

async function lockedInquiry(db: PostgresJsDatabase, id: string) {
  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).for("update")
  if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
  return row
}

type InquiryMutationTestHooks = {
  /** Test-only rollback seam between the domain write and its outbox write. */
  beforeOutbox?: (tx: PostgresJsDatabase) => Promise<void>
}

function requireActor(actorId: string) {
  if (!actorId) {
    throw new InquiryServiceError("INQUIRY_CUSTOMER_REQUIRED", "A staff actor is required")
  }
}

function inquiryCreatedEventId(inquiryId: string) {
  return `evt_relationships_inquiry_created_${inquiryId}`
}

async function writeInquiryEvent(
  db: PostgresJsDatabase,
  name: string,
  data: Record<string, unknown>,
  eventId = generateEventId(),
) {
  await insertOutboxEvents(db, [
    {
      name,
      data,
      metadata: { category: "domain", source: "service", eventId },
    },
  ])
}

export const inquiriesService = {
  async listInquiries(
    db: PostgresJsDatabase,
    query: InquiryListQueryInput,
    currentUserId?: string,
  ) {
    const conditions = []
    const actionable = notInArray(inquiries.status, ["converted", "closed"])
    const view = query.view ?? "actionable"
    if (view === "actionable") conditions.push(actionable)
    if (view === "new") conditions.push(eq(inquiries.status, "new"))
    if (view === "mine") {
      if (!currentUserId) {
        throw new InquiryServiceError(
          "INQUIRY_CUSTOMER_REQUIRED",
          "The mine view requires a current staff user",
        )
      }
      conditions.push(eq(inquiries.ownerId, currentUserId))
    }
    if (view === "unassigned") conditions.push(isNull(inquiries.ownerId), actionable)
    if (view === "overdue") {
      conditions.push(
        isNotNull(inquiries.nextActionAt),
        lt(inquiries.nextActionAt, new Date()),
        actionable,
      )
    }
    if (view === "waiting") conditions.push(eq(inquiries.status, "waiting_on_customer"))
    if (view === "qualified") conditions.push(eq(inquiries.status, "qualified"))
    if (view === "converted") conditions.push(eq(inquiries.status, "converted"))
    if (view === "closed") conditions.push(eq(inquiries.status, "closed"))
    if (query.status) conditions.push(eq(inquiries.status, query.status))
    if (query.ownerId) conditions.push(eq(inquiries.ownerId, query.ownerId))
    if (query.teamId) conditions.push(eq(inquiries.teamId, query.teamId))
    if (query.priority) conditions.push(eq(inquiries.priority, query.priority))
    if (query.kind) conditions.push(eq(inquiries.kind, query.kind))
    if (query.source) conditions.push(eq(inquiries.source, query.source))
    if (query.personId) conditions.push(eq(inquiries.personId, query.personId))
    if (query.organizationId) conditions.push(eq(inquiries.organizationId, query.organizationId))
    if (query.overdue) {
      conditions.push(
        and(isNotNull(inquiries.nextActionAt), lt(inquiries.nextActionAt, new Date()), actionable),
      )
    }
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        or(
          ilike(inquiries.subject, term),
          ilike(inquiries.customerMessage, term),
          ilike(inquiries.internalSummary, term),
          sql`${inquiries.contactSnapshot}::text ilike ${term}`,
        ),
      )
    }

    const where = conditions.length ? and(...conditions) : undefined
    const priorityOrder = sql`case ${inquiries.priority}
      when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`
    const overdueOrder = sql`case
      when ${inquiries.nextActionAt} is not null and ${inquiries.nextActionAt} < now() then 0 else 1 end`
    return paginate(
      db
        .select()
        .from(inquiries)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(
          asc(overdueOrder),
          asc(priorityOrder),
          asc(inquiries.createdAt),
          asc(inquiries.id),
        ),
      db.select({ count: sql<number>`count(*)::int` }).from(inquiries).where(where),
      query.limit,
      query.offset,
    )
  },

  async getInquiry(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1)
    return row ?? null
  },

  async createInquiry(
    db: PostgresJsDatabase,
    input: CreateInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      await assertRelatedRecords(tx, input)
      const { firstResponseDueAt, nextActionAt, ...values } = input
      const [created] = await tx
        .insert(inquiries)
        .values({
          ...values,
          ...updateDates({ firstResponseDueAt, nextActionAt }),
          personId: input.personId ?? null,
          organizationId: input.organizationId ?? null,
          ownerId: input.ownerId ?? null,
          teamId: input.teamId ?? null,
          unassignedReason: input.ownerId ? null : (input.unassignedReason ?? null),
        })
        .onConflictDoNothing({
          target: [inquiries.source, inquiries.sourceRef],
          where: sql`${inquiries.sourceRef} is not null`,
        })
        .returning()
      if (created) {
        await testHooks?.beforeOutbox?.(tx)
        await writeInquiryEvent(
          tx,
          INQUIRY_CREATED_EVENT,
          { id: created.id, actorId },
          inquiryCreatedEventId(created.id),
        )
        return { inquiry: created, replayed: false as const }
      }
      if (!input.sourceRef) throw new Error("Inquiry insert returned no row")
      const [replayed] = await tx
        .select()
        .from(inquiries)
        .where(and(eq(inquiries.source, input.source), eq(inquiries.sourceRef, input.sourceRef)))
        .limit(1)
      if (!replayed) throw new Error("Inquiry idempotency replay returned no row")
      return { inquiry: replayed, replayed: true as const }
    })
  },

  async updateInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: UpdateInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (current.status === "closed" || current.status === "converted") {
        throw new InquiryServiceError(
          "INQUIRY_ALREADY_RESOLVED",
          "A resolved inquiry cannot be edited",
        )
      }
      await assertRelatedRecords(tx, input)
      const personId = input.personId === undefined ? current.personId : input.personId
      const organizationId =
        input.organizationId === undefined ? current.organizationId : input.organizationId
      if (current.status === "qualified" && !personId && !organizationId) {
        throw new InquiryServiceError(
          "INQUIRY_CUSTOMER_REQUIRED",
          "A qualified inquiry must retain a Person or Organization",
        )
      }
      const { nextActionAt, ...values } = input
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({ ...values, ...updateDates({ nextActionAt }), updatedAt: now })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, { id: row.id, actorId })
      return row
    })
  },

  async transitionInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: TransitionInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (!canTransitionInquiry(current.status, input.status)) {
        throw new InquiryServiceError(
          "INVALID_INQUIRY_TRANSITION",
          `Inquiry cannot transition from ${current.status} to ${input.status}`,
        )
      }
      const nextActionAt =
        input.nextActionAt === undefined ? current.nextActionAt : date(input.nextActionAt)
      const unassignedReason =
        input.unassignedReason === undefined ? current.unassignedReason : input.unassignedReason
      if (input.status === "triaged" && !current.ownerId && !unassignedReason) {
        throw new InquiryServiceError(
          "INQUIRY_ASSIGNMENT_REQUIRED",
          "Triage requires an owner or an unassigned reason",
        )
      }
      if (
        (input.status === "in_progress" || input.status === "waiting_on_customer") &&
        !nextActionAt &&
        !input.noFollowUpExpected
      ) {
        throw new InquiryServiceError(
          "INQUIRY_NEXT_ACTION_REQUIRED",
          "This status requires a next action or an explicit no-follow-up decision",
        )
      }
      if (input.status === "qualified" && !current.personId && !current.organizationId) {
        throw new InquiryServiceError(
          "INQUIRY_CUSTOMER_REQUIRED",
          "Qualification requires a Person or Organization",
        )
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          status: input.status,
          nextActionAt: input.noFollowUpExpected ? null : nextActionAt,
          unassignedReason,
          qualifiedAt: input.status === "qualified" ? now : current.qualifiedAt,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_STATUS_CHANGED_EVENT, {
        id: row.id,
        actorId,
        from: current.status,
        to: row.status,
      })
      return row
    })
  },

  async assignInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: AssignInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (current.status === "closed" || current.status === "converted") {
        throw new InquiryServiceError(
          "INQUIRY_ALREADY_RESOLVED",
          "A resolved inquiry cannot be reassigned",
        )
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          ownerId: input.ownerId,
          teamId: input.teamId === undefined ? current.teamId : input.teamId,
          unassignedReason: input.ownerId ? null : input.unassignedReason,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_ASSIGNED_EVENT, {
        id: row.id,
        actorId,
        ownerId: row.ownerId,
        teamId: row.teamId,
      })
      return row
    })
  },

  async closeInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: CloseInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      let current: Inquiry | undefined
      let duplicate: Inquiry | undefined
      if (input.outcome === "duplicate") {
        const duplicateId = input.duplicateOfInquiryId ?? ""
        if (duplicateId === id) {
          throw new InquiryServiceError(
            "INVALID_DUPLICATE_INQUIRY",
            "An inquiry cannot duplicate itself",
          )
        }
        const rows = await tx
          .select()
          .from(inquiries)
          .where(inArray(inquiries.id, [id, duplicateId]))
          .orderBy(asc(inquiries.id))
          .for("update")
        current = rows.find((row) => row.id === id)
        duplicate = rows.find((row) => row.id === duplicateId)
        if (!current) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
        if (!duplicate) {
          throw new InquiryServiceError("INVALID_DUPLICATE_INQUIRY", "Duplicate inquiry not found")
        }
      } else {
        current = await lockedInquiry(tx, id)
      }
      if (current.status === "closed" || current.status === "converted") {
        throw new InquiryServiceError("INQUIRY_ALREADY_RESOLVED", "Inquiry is already resolved")
      }
      if (input.outcome === "duplicate") {
        if (duplicate?.duplicateOfInquiryId || duplicate?.closeOutcome === "duplicate") {
          throw new InquiryServiceError(
            "INVALID_DUPLICATE_INQUIRY",
            "A duplicate inquiry must point directly to a canonical inquiry",
          )
        }
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          status: "closed",
          closeOutcome: input.outcome,
          closeNote: input.note ?? null,
          duplicateOfInquiryId:
            input.outcome === "duplicate" ? (input.duplicateOfInquiryId ?? null) : null,
          closedAt: now,
          nextActionAt: null,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_CLOSED_EVENT, {
        id: row.id,
        actorId,
        outcome: row.closeOutcome,
      })
      return row
    })
  },

  async reopenInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: ReopenInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (current.status !== "closed") {
        throw new InquiryServiceError(
          "INVALID_INQUIRY_TRANSITION",
          "Only a closed inquiry can be reopened",
        )
      }
      const unassignedReason =
        input.unassignedReason === undefined ? current.unassignedReason : input.unassignedReason
      if (!current.ownerId && !unassignedReason) {
        throw new InquiryServiceError(
          "INQUIRY_ASSIGNMENT_REQUIRED",
          "Reopening to triage requires an owner or an unassigned reason",
        )
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          status: "triaged",
          closeOutcome: null,
          closeNote: null,
          duplicateOfInquiryId: null,
          closedAt: null,
          nextActionAt: date(input.nextActionAt),
          unassignedReason,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_REOPENED_EVENT, { id: row.id, actorId })
      return row
    })
  },
}
