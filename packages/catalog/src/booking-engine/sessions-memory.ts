import {
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import { newId } from "@voyant-travel/db/lib/typeid"

import type { BookingRequirementsV1 } from "./contracts.js"
import type {
  BookingCommitInternalRecord,
  BookingHoldInternalRecord,
  BookingQuoteInternalRecord,
  BookingSessionAuditRecord,
  BookingSessionInternalRecord,
  BookingSessionModulePorts,
  BookingSessionOperationRecord,
  BookingSessionRepository,
  CommitOwnedBookingInput,
} from "./sessions-service.js"

export interface InMemoryBookingSessionRepository extends BookingSessionRepository {
  sessions: Map<string, BookingSessionInternalRecord>
  quotes: Map<string, BookingQuoteInternalRecord>
  holds: Map<string, BookingHoldInternalRecord>
  commits: Map<string, BookingCommitInternalRecord>
  operations: Map<string, BookingSessionOperationRecord>
  auditEvents: Map<string, BookingSessionAuditRecord>
}

export function createInMemoryBookingSessionRepository(): InMemoryBookingSessionRepository {
  const locks = new Map<string, Promise<unknown>>()
  const repository: InMemoryBookingSessionRepository = {
    sessions: new Map(),
    quotes: new Map(),
    holds: new Map(),
    commits: new Map(),
    operations: new Map(),
    auditEvents: new Map(),

    async createSession(record) {
      const existing = [...repository.sessions.values()].find(
        (session) => session.createIdempotencyKey === record.createIdempotencyKey,
      )
      if (existing) return cloneSession(existing)
      repository.sessions.set(record.id, cloneSession(record))
      return cloneSession(record)
    },
    async getSession(sessionId) {
      const session = repository.sessions.get(sessionId)
      return session ? cloneSession(session) : null
    },
    async getSessionByCreateIdempotency(idempotencyKey) {
      const session = [...repository.sessions.values()].find(
        (record) => record.createIdempotencyKey === idempotencyKey,
      )
      return session ? cloneSession(session) : null
    },
    async saveSession(record) {
      repository.sessions.set(record.id, cloneSession(record))
    },
    async appendAudit(record) {
      repository.auditEvents.set(record.id, cloneAudit(record))
    },
    async listExpiryCandidates(input) {
      return [...repository.sessions.values()]
        .filter((session) => session.state === "active" && session.expiresAt <= input.at)
        .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime())
        .slice(0, input.limit)
        .map(cloneSession)
    },
    async listPurgeCandidates(input) {
      return [...repository.sessions.values()]
        .filter(
          (session) =>
            session.state !== "active" && !session.purgedAt && session.updatedAt <= input.before,
        )
        .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime())
        .slice(0, input.limit)
        .map(cloneSession)
    },
    async purgeSessionArtifacts(sessionId) {
      for (const [id, operation] of repository.operations) {
        if (operation.sessionId === sessionId) repository.operations.delete(id)
      }
    },
    async listActiveQuotes(sessionId) {
      return [...repository.quotes.values()]
        .filter((quote) => quote.sessionId === sessionId && quote.state === "active")
        .map(cloneQuote)
    },
    async getQuote(quoteId) {
      const quote = repository.quotes.get(quoteId)
      return quote ? cloneQuote(quote) : null
    },
    async saveQuote(record) {
      repository.quotes.set(record.id, cloneQuote(record))
    },
    async getHold(holdId) {
      const hold = repository.holds.get(holdId)
      return hold ? cloneHold(hold) : null
    },
    async listActiveHolds(sessionId) {
      return [...repository.holds.values()]
        .filter((hold) => hold.sessionId === sessionId && hold.state === "active")
        .map(cloneHold)
    },
    async saveHold(record) {
      repository.holds.set(record.id, cloneHold(record))
    },
    async getCommitByIdempotency(sessionId, idempotencyKey) {
      const commit = [...repository.commits.values()].find(
        (record) => record.sessionId === sessionId && record.idempotencyKey === idempotencyKey,
      )
      return commit ? cloneCommit(commit) : null
    },
    async saveCommit(record) {
      repository.commits.set(record.id, cloneCommit(record))
    },
    async claimOperation(record) {
      const existing = [...repository.operations.values()].find(
        (operation) =>
          operation.sessionId === record.sessionId &&
          operation.operation === record.operation &&
          operation.idempotencyKey === record.idempotencyKey,
      )
      if (existing) {
        if (existing.requestFingerprint !== record.requestFingerprint) {
          return { status: "conflict" as const }
        }
        return existing.outcome
          ? { status: "replay" as const, outcome: structuredClone(existing.outcome) }
          : { status: "conflict" as const }
      }
      repository.operations.set(record.id, {
        id: record.id,
        sessionId: record.sessionId,
        operation: record.operation,
        idempotencyKey: record.idempotencyKey,
        requestFingerprint: record.requestFingerprint,
        outcome: undefined as never,
        createdAt: new Date(record.now),
      })
      return { status: "claimed" as const, id: record.id }
    },
    async completeOperation(record) {
      const existing = repository.operations.get(record.id)
      if (existing) {
        repository.operations.set(record.id, {
          ...existing,
          outcome: structuredClone(record.outcome),
        })
      }
    },
    async consumeCommit(input) {
      const session = repository.sessions.get(input.sessionId)
      const quote = repository.quotes.get(input.quoteId)
      const hold = input.holdId ? repository.holds.get(input.holdId) : undefined
      if (
        session?.state !== "active" &&
        session?.state !== "supplier_pending" &&
        session?.state !== "component_pending"
      ) {
        throw new Error("booking_session_commit_session_consumed")
      }
      if (quote?.state !== "active") throw new Error("booking_session_commit_quote_consumed")
      if (input.holdId && hold?.state !== "active") {
        throw new Error("booking_session_commit_hold_consumed")
      }
      repository.sessions.set(input.sessionId, {
        ...cloneSession(session),
        state: "consumed",
        revision: session.revision + 1,
        updatedAt: new Date(input.now),
      })
      repository.quotes.set(input.quoteId, { ...cloneQuote(quote), state: "consumed" })
      if (input.holdId && hold) {
        repository.holds.set(input.holdId, { ...cloneHold(hold), state: "converted" })
      }
      const commitId = newId("booking_session_commits")
      repository.commits.set(commitId, {
        id: commitId,
        sessionId: input.sessionId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        outcome: structuredClone(input.outcome),
        bookingId: input.bookingId,
        createdAt: new Date(input.now),
      })
    },
    async withTransactionContext(_tx, operation) {
      return operation()
    },
    async withSessionTransaction(sessionId, operation) {
      const previous = locks.get(sessionId) ?? Promise.resolve()
      let release: () => void = () => {}
      const current = new Promise<void>((resolve) => {
        release = resolve
      })
      const chained = previous.then(() => current)
      locks.set(sessionId, chained)
      await previous
      const snapshot = {
        sessions: cloneMap(repository.sessions, cloneSession),
        quotes: cloneMap(repository.quotes, cloneQuote),
        holds: cloneMap(repository.holds, cloneHold),
        commits: cloneMap(repository.commits, cloneCommit),
        operations: cloneMap(repository.operations, cloneOperation),
        auditEvents: cloneMap(repository.auditEvents, cloneAudit),
      }
      try {
        return await operation(undefined)
      } catch (error) {
        repository.sessions = snapshot.sessions
        repository.quotes = snapshot.quotes
        repository.holds = snapshot.holds
        repository.commits = snapshot.commits
        repository.operations = snapshot.operations
        repository.auditEvents = snapshot.auditEvents
        throw error
      } finally {
        release()
        if (locks.get(sessionId) === chained) locks.delete(sessionId)
      }
    },
  }
  return repository
}

/**
 * A minimal renderable descriptor for in-memory fixtures. It stands in for a
 * vertical's derivation so the Session plane can be exercised without one — it
 * is not a fallback any production path may use.
 */
export function inMemoryBookingRequirements(): BookingRequirementsV1 {
  return {
    ...defaultRequirementsFlags(),
    paxBands: [...DEFAULT_PAX_BANDS],
    paxBandsAllowedTotal: paxBandsAllowedTotalFrom(DEFAULT_PAX_BANDS),
    travelerFields: [...defaultTravelerFields()],
    bookingFields: [...defaultBookingFields()],
    paymentIntents: [...DEFAULT_PAYMENT_INTENTS],
  }
}

export interface InMemoryOwnedInventoryPorts
  extends Pick<
    BookingSessionModulePorts,
    "composeRequirements" | "placeCapacityHold" | "releaseCapacityHold" | "commitOwnedBooking"
  > {
  setCapacity(capacityKey: string, quantity: number): void
  hasActiveHold(holdId: string): boolean
  bookingIds: string[]
  allocationIds: string[]
}

export function createInMemoryOwnedInventoryPorts(): InMemoryOwnedInventoryPorts {
  const capacities = new Map<string, number>()
  const activeHolds = new Map<string, { capacityKey: string; quantity: number; expiresAt: Date }>()
  const bookingIds: string[] = []
  const allocationIds: string[] = []

  return {
    bookingIds,
    allocationIds,
    setCapacity(capacityKey, quantity) {
      capacities.set(capacityKey, quantity)
    },
    async composeRequirements() {
      return { status: "available", requirements: inMemoryBookingRequirements() }
    },
    hasActiveHold(holdId) {
      return activeHolds.has(holdId)
    },
    async placeCapacityHold({ holdId, capacityKey, quantity, expiresAt, now }) {
      for (const [id, hold] of activeHolds) {
        if (hold.expiresAt <= now) activeHolds.delete(id)
      }
      const held = [...activeHolds.values()]
        .filter((hold) => hold.capacityKey === capacityKey)
        .reduce((sum, hold) => sum + hold.quantity, 0)
      const capacity = capacities.get(capacityKey) ?? 0
      if (capacity - held < quantity) return "unavailable"
      activeHolds.set(holdId, { capacityKey, quantity, expiresAt })
      return "held"
    },
    async releaseCapacityHold({ hold }) {
      activeHolds.delete(hold.id)
    },
    async commitOwnedBooking(input: CommitOwnedBookingInput) {
      const active = activeHolds.get(input.hold.id)
      if (!active || active.expiresAt <= input.now) {
        throw new Error("owned inventory hold is not live at commit")
      }
      activeHolds.delete(input.hold.id)
      const remaining = (capacities.get(active.capacityKey) ?? 0) - active.quantity
      if (remaining < 0) throw new Error("owned inventory oversold")
      capacities.set(active.capacityKey, remaining)

      const bookingId = newId("bookings")
      const allocationId = newId("booking_allocations")
      bookingIds.push(bookingId)
      allocationIds.push(allocationId)
      await input.consumeSources(undefined, bookingId, [allocationId])
      return { bookingId, allocationIds: [allocationId] }
    },
  }
}

function cloneSession(record: BookingSessionInternalRecord): BookingSessionInternalRecord {
  return {
    ...record,
    target: { ...record.target },
    storefrontOrigin: record.storefrontOrigin ? { ...record.storefrontOrigin } : undefined,
    capabilityScopes: [...record.capabilityScopes],
    statePayload: { ...record.statePayload },
    expiresAt: new Date(record.expiresAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    purgedAt: record.purgedAt ? new Date(record.purgedAt) : undefined,
  }
}

function cloneAudit(record: BookingSessionAuditRecord): BookingSessionAuditRecord {
  return {
    ...record,
    metadata: structuredClone(record.metadata),
    createdAt: new Date(record.createdAt),
  }
}

function cloneQuote(record: BookingQuoteInternalRecord): BookingQuoteInternalRecord {
  return {
    ...record,
    requirements: structuredClone(record.requirements),
    pricing: structuredClone(record.pricing),
    quotedAt: new Date(record.quotedAt),
    expiresAt: new Date(record.expiresAt),
  }
}

function cloneHold(record: BookingHoldInternalRecord): BookingHoldInternalRecord {
  return {
    ...record,
    target: { ...record.target },
    expiresAt: new Date(record.expiresAt),
    createdAt: new Date(record.createdAt),
  }
}

function cloneCommit(record: BookingCommitInternalRecord): BookingCommitInternalRecord {
  return {
    ...record,
    outcome: structuredClone(record.outcome),
    createdAt: new Date(record.createdAt),
  }
}

function cloneOperation(record: BookingSessionOperationRecord): BookingSessionOperationRecord {
  return {
    ...record,
    outcome: structuredClone(record.outcome),
    createdAt: new Date(record.createdAt),
  }
}

function cloneMap<T>(map: Map<string, T>, clone: (value: T) => T): Map<string, T> {
  return new Map([...map.entries()].map(([key, value]) => [key, clone(value)]))
}
