import type {
  AbandonBookingSessionV1,
  AdoptBookingSessionV1,
  BookingHoldRecordV1,
  BookingQuoteRecordV1,
  BookingSessionActorKindV1,
  BookingSessionCapabilityActionV1,
  BookingSessionOriginV1,
  BookingSessionOutcomeV1,
  BookingSessionRecordV1,
  BookingSessionScopeV1,
  BookingSessionStateV1,
  BookingSessionTargetV1,
  BookingSessionViewV1,
  CommitBookingSessionV1,
  CreateAcceptedProposalBookingSessionV1,
  CreateBookingSessionV1,
  PlaceBookingHoldV1,
  QuoteBookingSessionV1,
  RenewBookingSessionV1,
  UpdateBookingSessionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { DEFAULT_BOOKING_SESSION_SCOPE } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { newId } from "@voyant-travel/db/lib/typeid"
import type {
  BookingLifecycleCommitOutcomeV1,
  BookingRequirementsV1,
  PricingBreakdownV1,
} from "./contracts.js"

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_QUOTE_TTL_MS = 10 * 60 * 1000
const DEFAULT_HOLD_TTL_MS = 15 * 60 * 1000
const DEFAULT_MAX_RENEWAL_EXTENSION_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_ANONYMOUS_CAPABILITY_SCOPES: BookingSessionCapabilityActionV1[] = [
  "read",
  "update",
  "quote",
  "hold",
  "commit",
  "abandon",
  "adopt",
  "renew",
]

export interface BookingSessionInternalRecord {
  id: string
  createIdempotencyKey: string
  createRequestFingerprint: string
  capabilityHash?: string
  capabilityScopes: BookingSessionCapabilityActionV1[]
  target: BookingSessionTargetV1
  origin?: BookingSessionOriginV1
  actorKind: BookingSessionActorKindV1
  ownerPrincipalId?: string
  ownerOrganizationId?: string
  /** Immutable server-derived public storefront provenance. Never serialized. */
  storefrontOrigin?: { storefrontId: string; channelId: string }
  /**
   * Immutable commercial scope. Fixed at create so a Quote, the Hold taken
   * against it, and the Commit that consumes both all mean one price in one
   * market. `audience` is not carried here — it is derived from `actorKind`.
   */
  scope: BookingSessionScopeV1
  state: BookingSessionStateV1
  revision: number
  statePayload: Record<string, unknown>
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  purgedAt?: Date
}

export interface BookingQuoteInternalRecord {
  id: string
  sessionId: string
  sessionRevision: number
  state: "active" | "superseded" | "consumed" | "expired"
  /** The descriptor this price was computed against. See `composeRequirements`. */
  requirements: BookingRequirementsV1
  pricing: PricingBreakdownV1
  priceFingerprint: string
  quotedAt: Date
  expiresAt: Date
}

export interface BookingHoldInternalRecord {
  id: string
  sessionId: string
  quoteId: string
  target: BookingSessionTargetV1
  quantity: number
  state: "active" | "converted" | "released" | "expired"
  capacityKey: string
  expiresAt: Date
  createdAt: Date
}

export interface BookingCommitInternalRecord {
  id: string
  sessionId: string
  idempotencyKey: string
  requestFingerprint: string
  outcome: Exclude<BookingLifecycleCommitOutcomeV1, { kind: "idempotent_replay" }>
  bookingId?: string
  createdAt: Date
}

export interface BookingSessionOperationRecord {
  id: string
  sessionId: string
  operation: "update" | "quote" | "hold" | "abandon" | "adopt" | "renew"
  idempotencyKey: string
  requestFingerprint: string
  outcome?: BookingSessionOutcomeV1
  createdAt: Date
}

export interface BookingSessionAuditRecord {
  id: string
  sessionId: string
  action:
    | "read"
    | "update"
    | "quote"
    | "hold"
    | "commit"
    | "adopt"
    | "renew"
    | "abandon"
    | "expire"
    | "purge"
    | "supplier_reconcile"
    | "supplier_manual_resolve"
  actorKind: BookingSessionActorKindV1 | "system"
  principalId?: string
  organizationId?: string
  authorityReason?: string
  metadata: Record<string, unknown>
  createdAt: Date
}

export type BookingSessionOperationClaim =
  | { status: "claimed"; id: string }
  | { status: "replay"; outcome: BookingSessionOutcomeV1 }
  | { status: "conflict" }

export interface BookingSessionRepository {
  createSession(record: BookingSessionInternalRecord): Promise<BookingSessionInternalRecord>
  getSession(sessionId: string): Promise<BookingSessionInternalRecord | null>
  getSessionByCreateIdempotency(
    idempotencyKey: string,
  ): Promise<BookingSessionInternalRecord | null>
  saveSession(record: BookingSessionInternalRecord): Promise<void>
  appendAudit(record: BookingSessionAuditRecord): Promise<void>
  listExpiryCandidates(input: { at: Date; limit: number }): Promise<BookingSessionInternalRecord[]>
  listPurgeCandidates(input: {
    before: Date
    limit: number
  }): Promise<BookingSessionInternalRecord[]>
  purgeSessionArtifacts(sessionId: string): Promise<void>
  listActiveQuotes(sessionId: string): Promise<BookingQuoteInternalRecord[]>
  getQuote(quoteId: string): Promise<BookingQuoteInternalRecord | null>
  saveQuote(record: BookingQuoteInternalRecord): Promise<void>
  getHold(holdId: string): Promise<BookingHoldInternalRecord | null>
  listActiveHolds(sessionId: string): Promise<BookingHoldInternalRecord[]>
  saveHold(record: BookingHoldInternalRecord): Promise<void>
  getCommitByIdempotency(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<BookingCommitInternalRecord | null>
  saveCommit(record: BookingCommitInternalRecord): Promise<void>
  claimOperation(input: {
    id: string
    sessionId: string
    operation: BookingSessionOperationRecord["operation"]
    idempotencyKey: string
    requestFingerprint: string
    now: Date
  }): Promise<BookingSessionOperationClaim>
  completeOperation(input: { id: string; outcome: BookingSessionOutcomeV1 }): Promise<void>
  consumeCommit(input: {
    sessionId: string
    quoteId: string
    holdId?: string
    idempotencyKey: string
    requestFingerprint: string
    outcome: BookingCommitInternalRecord["outcome"]
    bookingId: string
    now: Date
  }): Promise<void>
  withTransactionContext<T>(tx: unknown, operation: () => Promise<T>): Promise<T>
  withSessionTransaction<T>(sessionId: string, operation: (tx: unknown) => Promise<T>): Promise<T>
}

export interface ComposeBookingQuoteInput {
  session: BookingSessionInternalRecord
  now: Date
  tx: unknown
}

export type BookingSessionQuoteUnavailableReason =
  | "target_not_found"
  | "target_not_bookable"
  | "price_unavailable"
  | "policy_unavailable"
  | "selection_unavailable"

export type BookingSessionQuoteUnavailableNextAction =
  | "select_alternative_inventory"
  | "contact_operator"
  | "update_selection"

export type ComposeBookingQuoteResult =
  | {
      status: "quoted"
      /**
       * The descriptor the price was computed against. Required on the quoted
       * branch — a target that priced necessarily resolved.
       */
      requirements: BookingRequirementsV1
      pricing: PricingBreakdownV1
    }
  | {
      status: "unavailable"
      /**
       * Carried through unavailability so a priced-out or sold-out target
       * still renders a correct wizard. Absent only when the target itself
       * did not resolve.
       */
      requirements?: BookingRequirementsV1
      reason: BookingSessionQuoteUnavailableReason
      nextAction: BookingSessionQuoteUnavailableNextAction
    }

/**
 * Requirements derivation, split out of quoting so a host can render the
 * Configure step before it has a price. Implementations must delegate to the
 * same per-vertical derivation `composeQuote` uses — one code path, so the
 * requirements a host renders and the requirements a Commit validates against
 * cannot drift (voyant#4113).
 */
export type ComposeBookingRequirementsResult =
  | { status: "available"; requirements: BookingRequirementsV1 }
  | {
      status: "unavailable"
      reason: BookingSessionQuoteUnavailableReason
      nextAction: BookingSessionQuoteUnavailableNextAction
    }

export type PlaceBookingCapacityHoldResult =
  | "held"
  | "unavailable"
  | { status: "quantity_mismatch"; expectedQuantity: number }

export type BookingSessionCommitRejectionReason =
  | "entity_not_found"
  | "entity_not_bookable"
  | "incomplete_draft"
  | "price_changed"

export interface CommitOwnedBookingInput {
  session: BookingSessionInternalRecord
  quote: BookingQuoteInternalRecord
  hold: BookingHoldInternalRecord
  idempotencyKey: string
  requestFingerprint: string
  access: BookingSessionAccessContext
  now: Date
  paymentSessionId?: string
  consumeSources(tx: unknown, bookingId: string, allocationIds: string[]): Promise<void>
}

export interface CommitSourcedBookingInput {
  session: BookingSessionInternalRecord
  supplierOperationScope?: string
  quote: BookingQuoteInternalRecord
  hold?: BookingHoldInternalRecord
  idempotencyKey: string
  requestFingerprint: string
  access: BookingSessionAccessContext
  now: Date
  paymentSessionId?: string
  consumeSources(
    tx: unknown,
    bookingId: string,
    allocationIds: string[],
    supplierOperationId: string,
  ): Promise<void>
}

export type CommitSourcedBookingResult =
  | { kind: "committed"; bookingId: string; allocationIds: string[]; supplierOperationId: string }
  | Extract<
      BookingLifecycleCommitOutcomeV1,
      { kind: "supplier_pending" | "supplier_in_doubt" | "supplier_failed" }
    >

export interface CompositeBookingCommitment {
  componentId: string
  bookingId: string
  allocationIds: string[]
  supplierOperationId?: string
}

export interface CommitCompositeBookingInput {
  session: BookingSessionInternalRecord
  quote: BookingQuoteInternalRecord
  hold?: BookingHoldInternalRecord
  idempotencyKey: string
  requestFingerprint: string
  access: BookingSessionAccessContext
  now: Date
  consumeSources(tx: unknown, bookings: CompositeBookingCommitment[]): Promise<void>
}

export type CommitCompositeBookingResult =
  | { kind: "committed"; bookings: CompositeBookingCommitment[] }
  | Extract<
      BookingLifecycleCommitOutcomeV1,
      { kind: "component_commit_pending" | "proposal_acceptance_required" | "hold_failure" }
    >

export interface BookingSessionCompositeLeafRuntime {
  composeRequirements(input: ComposeBookingQuoteInput): Promise<ComposeBookingRequirementsResult>
  composeQuote(input: ComposeBookingQuoteInput): Promise<ComposeBookingQuoteResult>
  placeCapacityHold(input: {
    session: BookingSessionInternalRecord
    quote: BookingQuoteInternalRecord
    holdId: string
    capacityKey: string
    quantity: number
    expiresAt: Date
    access: BookingSessionAccessContext
    now: Date
    tx: unknown
  }): Promise<PlaceBookingCapacityHoldResult>
  releaseCapacityHold(input: {
    session: BookingSessionInternalRecord
    hold: BookingHoldInternalRecord
    access: BookingSessionAccessContext
    now: Date
    tx: unknown
  }): Promise<void>
  commitOwned(input: CommitOwnedBookingInput): Promise<{
    bookingId: string
    allocationIds: string[]
  }>
  commitSourced(input: CommitSourcedBookingInput): Promise<CommitSourcedBookingResult>
}

export interface BookingSessionCompositeHandler {
  composeRequirements(
    input: ComposeBookingQuoteInput & { leaf: BookingSessionCompositeLeafRuntime },
  ): Promise<ComposeBookingRequirementsResult>
  composeQuote(
    input: ComposeBookingQuoteInput & { leaf: BookingSessionCompositeLeafRuntime },
  ): Promise<ComposeBookingQuoteResult>
  placeCapacityHold(input: {
    session: BookingSessionInternalRecord
    quote: BookingQuoteInternalRecord
    holdId: string
    capacityKey: string
    quantity: number
    expiresAt: Date
    access: BookingSessionAccessContext
    now: Date
    tx: unknown
    leaf: BookingSessionCompositeLeafRuntime
  }): Promise<PlaceBookingCapacityHoldResult>
  releaseCapacityHold(input: {
    session: BookingSessionInternalRecord
    hold: BookingHoldInternalRecord
    access: BookingSessionAccessContext
    now: Date
    tx: unknown
    leaf: BookingSessionCompositeLeafRuntime
  }): Promise<void>
  commit(
    input: CommitCompositeBookingInput & {
      leaf: BookingSessionCompositeLeafRuntime
      db: unknown
    },
  ): Promise<CommitCompositeBookingResult>
}

export interface BookingSessionPaymentPorts {
  prepare(input: {
    session: BookingSessionInternalRecord
    quote: BookingQuoteInternalRecord
    hold?: BookingHoldInternalRecord
    commit: CommitBookingSessionV1
    access: BookingSessionAccessContext
    now: Date
  }): Promise<
    | { kind: "not_required" }
    | { kind: "established"; paymentSessionId: string }
    | {
        kind: "required"
        paymentSession: {
          id: string
          status:
            | "pending"
            | "requires_redirect"
            | "processing"
            | "authorized"
            | "paid"
            | "failed"
            | "cancelled"
            | "expired"
          amountCents: number
          currency: string
          redirectUrl: string | null
          expiresAt: string | null
        }
        allowedGuarantees: Array<"deposit" | "pre_auth" | "card_on_file" | "agency_letter">
      }
  >
  transferToBooking(input: {
    tx: unknown
    paymentSessionId: string
    bookingSessionId: string
    bookingId: string
  }): Promise<void>
  expirePending(input: { tx: unknown; bookingSessionId: string; at: Date }): Promise<void>
}

export interface BookingSessionAccessContext {
  actorKind: BookingSessionActorKindV1
  principalId?: string
  organizationId?: string
  capability?: string
  /** Trusted request context resolved by the public transport, never session state. */
  storefront?: { storefrontId: string; channelId: string }
  sessionTtlMs?: number
  staffAuthority?: { admitted: true; reason: string }
  /** Additional Finance + Bookings authority for operator booking details. */
  staffBookingAuthority?: { admitted: true; reason: string }
}

export interface BookingSessionModulePorts {
  repository: BookingSessionRepository
  normalizeSelection(input: {
    target: BookingSessionTargetV1
    selection: Record<string, unknown>
    access: BookingSessionAccessContext
    now: Date
  }): Promise<Record<string, unknown>>
  /**
   * Derive the target's Booking Requirements without pricing it. Called on
   * every outcome that publishes a Session record, so a host can render the
   * Configure step before it quotes.
   *
   * `tx` is the caller's Session transaction where one is open; Session
   * creation runs before a Session row exists, so implementations must accept
   * a nullish `tx` and fall back to their own read connection. The derivation
   * is read-only either way.
   */
  composeRequirements(input: ComposeBookingQuoteInput): Promise<ComposeBookingRequirementsResult>
  composeQuote(input: ComposeBookingQuoteInput): Promise<ComposeBookingQuoteResult>
  placeCapacityHold(input: {
    session: BookingSessionInternalRecord
    quote: BookingQuoteInternalRecord
    holdId: string
    capacityKey: string
    quantity: number
    expiresAt: Date
    access: BookingSessionAccessContext
    now: Date
    tx: unknown
  }): Promise<PlaceBookingCapacityHoldResult>
  releaseCapacityHold(input: {
    session: BookingSessionInternalRecord
    hold: BookingHoldInternalRecord
    access: BookingSessionAccessContext
    now: Date
    tx: unknown
  }): Promise<void>
  commitOwnedBooking(input: CommitOwnedBookingInput): Promise<{
    bookingId: string
    allocationIds: string[]
  }>
  commitSourcedBooking?(input: CommitSourcedBookingInput): Promise<CommitSourcedBookingResult>
  commitCompositeBooking?(input: CommitCompositeBookingInput): Promise<CommitCompositeBookingResult>
  hasActiveSupplierOperation?(input: { sessionId: string; tx: unknown }): Promise<boolean>
  payments?: BookingSessionPaymentPorts
}

export interface BookingSessionModuleOptions {
  ports: BookingSessionModulePorts
  now?: () => Date
  sessionTtlMs?: number
  quoteTtlMs?: number
  holdTtlMs?: number
  maxRenewalExtensionMs?: number
  maxSessionLifetimeMs?: number
}

export class InvalidBookingSessionSelectionError extends Error {
  constructor(
    readonly reason: "unsupported_target" | "forbidden_field",
    readonly path?: string,
  ) {
    super(`booking_session_selection_${reason}${path ? `:${path}` : ""}`)
  }
}

export class BookingSessionCommitRejectedError extends Error {
  constructor(readonly reason: BookingSessionCommitRejectionReason) {
    super(`booking_session_commit_${reason}`)
  }
}

export interface BookingSessionModule {
  createAcceptedProposalSession(
    input: CreateAcceptedProposalBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  createSession(
    input: CreateBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  resumeSession(
    sessionId: string,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  adoptSession(
    sessionId: string,
    input: AdoptBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  renewSession(
    sessionId: string,
    input: RenewBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  updateSession(
    sessionId: string,
    input: UpdateBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  quoteSession(
    sessionId: string,
    input: QuoteBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  placeHold(
    sessionId: string,
    input: PlaceBookingHoldV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  abandonSession(
    sessionId: string,
    input: AbandonBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  commitSession(
    sessionId: string,
    input: CommitBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  expireDueSessions(
    input: { limit: number },
    access: BookingSessionAccessContext,
  ): Promise<{ expired: number }>
  purgeTerminalSessions(
    input: { before: Date; limit: number },
    access: BookingSessionAccessContext,
  ): Promise<{ purged: number }>
}

export function createBookingSessionModule(
  options: BookingSessionModuleOptions,
): BookingSessionModule {
  const now = options.now ?? (() => new Date())
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
  const quoteTtlMs = options.quoteTtlMs ?? DEFAULT_QUOTE_TTL_MS
  const holdTtlMs = options.holdTtlMs ?? DEFAULT_HOLD_TTL_MS
  const maxRenewalExtensionMs = options.maxRenewalExtensionMs ?? DEFAULT_MAX_RENEWAL_EXTENSION_MS
  const maxSessionLifetimeMs = options.maxSessionLifetimeMs ?? DEFAULT_MAX_SESSION_LIFETIME_MS
  const { repository } = options.ports

  const loadSession = (sessionId: string) => repository.getSession(sessionId)

  /**
   * Resolve the descriptor a host renders this Session from. Terminal and
   * purged Sessions have no target left to re-derive, and an unresolvable
   * target is not a reason to fail the Session operation itself — both omit
   * the field rather than rejecting.
   */
  async function sessionRequirements(
    session: BookingSessionInternalRecord,
    at: Date,
    tx?: unknown,
  ): Promise<BookingRequirementsV1 | undefined> {
    if (session.state !== "active" || session.purgedAt) return undefined
    const resolved = await options.ports.composeRequirements({ session, now: at, tx })
    return resolved.status === "available" ? resolved.requirements : undefined
  }

  function rejectRevision(
    expectedRevision: number,
    session: BookingSessionInternalRecord,
  ): BookingSessionOutcomeV1 | null {
    return expectedRevision === session.revision
      ? null
      : {
          kind: "rejected",
          error: {
            kind: "revision_conflict",
            expectedRevision,
            actualRevision: session.revision,
            actualState: session.state,
          },
        }
  }

  async function createSessionRecord(
    input: {
      idempotencyKey: string
      target: BookingSessionTargetV1
      selection?: Record<string, unknown>
      scope?: BookingSessionScopeV1
      capabilityScopes?: BookingSessionCapabilityActionV1[]
    },
    access: BookingSessionAccessContext,
    origin?: BookingSessionOriginV1,
  ): Promise<BookingSessionOutcomeV1> {
    const at = now()
    if (access.actorKind !== "anonymous" && !access.principalId?.trim()) {
      return { kind: "rejected", error: { kind: "not_authorized" } }
    }
    if (access.actorKind === "staff" && !access.staffAuthority?.admitted) {
      return { kind: "rejected", error: { kind: "not_authorized" } }
    }
    const capability = access.actorKind === "anonymous" ? access.capability?.trim() : undefined
    if (access.actorKind === "anonymous" && !isValidCapabilityShape(capability)) {
      return { kind: "rejected", error: { kind: "capability_required" } }
    }
    const capabilityScopes =
      access.actorKind === "anonymous" ? normalizeCapabilityScopes(input.capabilityScopes) : []
    const capabilityHash = capability ? await hashCapability(capability) : undefined
    const scope = resolveSessionScope(input.scope)
    const createIdempotencyKey = origin
      ? `accepted-proposal-version:${origin.proposalVersionId}`
      : await scopedCreateIdempotencyKey(input.idempotencyKey, access, capabilityHash)
    const createRequestFingerprint = await stableFingerprint({
      actorKind: access.actorKind,
      principalId: access.actorKind === "anonymous" ? undefined : access.principalId,
      organizationId: access.actorKind === "anonymous" ? undefined : access.organizationId,
      storefrontOrigin: access.actorKind === "staff" ? undefined : access.storefront,
      capabilityHash,
      capabilityScopes,
      target: input.target,
      ...(origin ? { origin } : {}),
      // Scope is part of what a create request asked for: replaying the same
      // idempotency key in another market is a different Session, not a
      // replay of the first one.
      scope,
      selection: input.selection ?? {},
    })
    const existing = await repository.getSessionByCreateIdempotency(createIdempotencyKey)
    if (existing) {
      if (existing.createRequestFingerprint !== createRequestFingerprint) {
        return idempotencyConflict()
      }
      return {
        kind: "session_created",
        session: serializeSession(existing, await sessionRequirements(existing, at)),
      }
    }
    let statePayload: Record<string, unknown>
    try {
      statePayload = await options.ports.normalizeSelection({
        target: input.target,
        selection: input.selection ?? {},
        access,
        now: at,
      })
    } catch (error) {
      const rejection = invalidSelectionOutcome(error)
      if (rejection) return rejection
      throw error
    }
    const session: BookingSessionInternalRecord = {
      id: newId("booking_sessions"),
      createIdempotencyKey,
      createRequestFingerprint,
      capabilityHash,
      capabilityScopes,
      target: input.target,
      origin,
      actorKind: access.actorKind,
      ownerPrincipalId: access.actorKind === "anonymous" ? undefined : access.principalId,
      ownerOrganizationId: access.actorKind === "anonymous" ? undefined : access.organizationId,
      storefrontOrigin: access.actorKind === "staff" ? undefined : access.storefront,
      scope,
      state: "active",
      revision: 1,
      statePayload,
      expiresAt: new Date(at.getTime() + (access.sessionTtlMs ?? sessionTtlMs)),
      createdAt: at,
      updatedAt: at,
    }
    const created = await repository.createSession(session)
    if (created.id !== session.id) {
      if (created.createRequestFingerprint !== createRequestFingerprint) {
        return idempotencyConflict()
      }
      return {
        kind: "session_created",
        session: serializeSession(created, await sessionRequirements(created, at)),
      }
    }
    return {
      kind: "session_created",
      session: serializeSession(session, await sessionRequirements(session, at)),
    }
  }

  return {
    createSession(input, access) {
      return createSessionRecord(input, access)
    },

    createAcceptedProposalSession(input, access) {
      return createSessionRecord(
        {
          idempotencyKey: input.idempotencyKey,
          target: {
            kind: "trip_snapshot",
            tripSnapshotId: input.tripSnapshotId,
            tripEnvelopeId: input.tripEnvelopeId,
          },
          selection: input.selection,
          scope: input.scope,
        },
        access,
        {
          kind: "accepted_proposal_version",
          proposalId: input.proposalId,
          proposalVersionId: input.proposalVersionId,
          tripSnapshotId: input.tripSnapshotId,
        },
      )
    },

    async resumeSession(sessionId, access) {
      return repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) return { kind: "rejected", error: { kind: "session_expired" } }
        const authorized = await authorizeSessionAccess(session, access, "read")
        if (authorized) return authorized
        const at = now()
        if (session.state === "active" && session.expiresAt <= at) {
          await expireSession(repository, options.ports, session, access, at, tx)
        }
        await appendSessionAudit(repository, session, "read", access, at, {
          redaction: access.actorKind === "staff" ? "selection_omitted" : "none",
        })
        return {
          kind: "session_resumed",
          session: serializeSessionView(
            session,
            access,
            await sessionRequirements(session, at, tx),
          ),
        }
      })
    },

    async adoptSession(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) return { kind: "rejected", error: { kind: "session_expired" } }
        if (access.actorKind !== "customer" || !access.principalId?.trim()) {
          return { kind: "rejected", error: { kind: "not_authorized" } }
        }
        if (session.actorKind !== "anonymous") {
          if (!isOwnedBy(session, access)) {
            return { kind: "rejected", error: { kind: "not_authorized" } }
          }
          const storefrontRejected = authorizeStorefrontOrigin(session, access)
          if (storefrontRejected) return storefrontRejected
          const claim = await claimOperation(repository, sessionId, "adopt", input, now())
          if (claim.status === "replay") return claim.outcome
          if (claim.status === "conflict") return idempotencyConflict()
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: { kind: "not_authorized" },
          })
        }
        const capabilityRejected = await authorizeAnonymousCapability(session, access, "adopt")
        if (capabilityRejected) return capabilityRejected
        const storefrontRejected = authorizeStorefrontOrigin(session, access)
        if (storefrontRejected) return storefrontRejected
        const at = now()
        if (session.expiresAt <= at || session.state !== "active") {
          if (session.state === "active") {
            await expireSession(repository, options.ports, session, access, at, tx)
          }
          return { kind: "rejected", error: { kind: "session_expired" } }
        }
        const claim = await claimOperation(repository, sessionId, "adopt", input, at)
        if (claim.status === "replay") return claim.outcome
        if (claim.status === "conflict") return idempotencyConflict()
        const revisionRejected = rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return completeAndReturn(repository, claim.id, revisionRejected)

        session.actorKind = "customer"
        session.ownerPrincipalId = access.principalId.trim()
        session.ownerOrganizationId = access.organizationId?.trim() || undefined
        session.capabilityHash = undefined
        session.capabilityScopes = []
        session.revision += 1
        session.updatedAt = at
        await repository.saveSession(session)
        await appendSessionAudit(repository, session, "adopt", access, at)
        const outcome: BookingSessionOutcomeV1 = {
          kind: "session_adopted",
          session: serializeSessionView(
            session,
            access,
            await sessionRequirements(session, at, tx),
          ),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async renewSession(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) return { kind: "rejected", error: { kind: "session_expired" } }
        const authorized = await authorizeSessionAccess(session, access, "renew")
        if (authorized) return authorized
        const at = now()
        if (session.state !== "active" || session.expiresAt <= at) {
          if (session.state === "active") {
            await expireSession(repository, options.ports, session, access, at, tx)
          }
          return {
            kind: "rejected",
            error: { kind: "renewal_not_allowed", reason: "session_not_active" },
          }
        }
        const claim = await claimOperation(repository, sessionId, "renew", input, at)
        if (claim.status === "replay") return claim.outcome
        if (claim.status === "conflict") return idempotencyConflict()
        const revisionRejected = rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return completeAndReturn(repository, claim.id, revisionRejected)
        const extensionMs = input.extendBySeconds * 1000
        if (extensionMs > maxRenewalExtensionMs) {
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: { kind: "renewal_not_allowed", reason: "extension_too_large" },
          })
        }
        const renewedExpiry = new Date(session.expiresAt.getTime() + extensionMs)
        if (renewedExpiry.getTime() > session.createdAt.getTime() + maxSessionLifetimeMs) {
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: { kind: "renewal_not_allowed", reason: "absolute_lifetime_exceeded" },
          })
        }

        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        for (const quote of await repository.listActiveQuotes(session.id)) {
          quote.state = "superseded"
          await repository.saveQuote(quote)
        }
        session.expiresAt = renewedExpiry
        session.revision += 1
        session.updatedAt = at
        await repository.saveSession(session)
        await appendSessionAudit(repository, session, "renew", access, at, {
          extendBySeconds: input.extendBySeconds,
        })
        const outcome: BookingSessionOutcomeV1 = {
          kind: "session_renewed",
          session: serializeSession(session),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async updateSession(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) return { kind: "rejected", error: { kind: "session_expired" } }
        const authorized = await authorizeSessionAccess(session, access, "update")
        if (authorized) return authorized
        const at = now()
        if (session.state === "active" && session.expiresAt <= at) {
          await expireSession(repository, options.ports, session, access, at, tx)
        }
        if (session.state !== "active") {
          return session.state === "consumed"
            ? { kind: "rejected", error: { kind: "session_consumed" } }
            : { kind: "rejected", error: { kind: "session_expired" } }
        }
        const claim = await claimOperation(repository, sessionId, "update", input, now())
        if (claim.status === "replay") return claim.outcome
        if (claim.status === "conflict") return idempotencyConflict()
        const revisionRejected = rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return completeAndReturn(repository, claim.id, revisionRejected)

        let statePayload: Record<string, unknown>
        try {
          statePayload = await options.ports.normalizeSelection({
            target: session.target,
            selection: input.selection,
            access,
            now: at,
          })
        } catch (error) {
          const rejection = invalidSelectionOutcome(error)
          if (rejection) return completeAndReturn(repository, claim.id, rejection)
          throw error
        }
        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        session.statePayload = statePayload
        session.revision += 1
        session.updatedAt = at
        for (const quote of await repository.listActiveQuotes(session.id)) {
          quote.state = "superseded"
          await repository.saveQuote(quote)
        }
        await repository.saveSession(session)
        await appendSessionAudit(repository, session, "update", access, at)
        const outcome: BookingSessionOutcomeV1 = {
          kind: "session_updated",
          session: serializeSession(session, await sessionRequirements(session, at, tx)),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async quoteSession(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) return { kind: "rejected", error: { kind: "session_expired" } }
        const authorized = await authorizeSessionAccess(session, access, "quote")
        if (authorized) return authorized
        const at = now()
        if (session.state === "active" && session.expiresAt <= at) {
          await expireSession(repository, options.ports, session, access, at, tx)
        }
        if (session.state !== "active") {
          return session.state === "consumed"
            ? { kind: "rejected", error: { kind: "session_consumed" } }
            : { kind: "rejected", error: { kind: "session_expired" } }
        }
        const claim = await claimOperation(repository, sessionId, "quote", input, now())
        if (claim.status === "replay") return claim.outcome
        if (claim.status === "conflict") return idempotencyConflict()
        const revisionRejected = rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return completeAndReturn(repository, claim.id, revisionRejected)

        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        for (const quote of await repository.listActiveQuotes(session.id)) {
          quote.state = "superseded"
          await repository.saveQuote(quote)
        }

        const composed = await options.ports.composeQuote({ session, now: at, tx })
        if (composed.status === "unavailable") {
          return completeAndReturn(repository, claim.id, quoteUnavailable(composed))
        }
        const { pricing, requirements } = composed
        const quote: BookingQuoteInternalRecord = {
          id: newId("booking_session_quotes"),
          sessionId,
          sessionRevision: session.revision,
          state: "active",
          requirements,
          pricing,
          priceFingerprint: await stableFingerprint(pricing),
          quotedAt: at,
          expiresAt: new Date(at.getTime() + quoteTtlMs),
        }
        await repository.saveQuote(quote)
        await appendSessionAudit(repository, session, "quote", access, at, {
          quoteId: quote.id,
        })
        const outcome: BookingSessionOutcomeV1 = {
          kind: "quote_created",
          // The compose call already derived requirements for this target;
          // publish those rather than re-deriving them for the record.
          session: serializeSession(session, requirements),
          quote: serializeQuote(quote),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async placeHold(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) return { kind: "rejected", error: { kind: "session_expired" } }
        const authorized = await authorizeSessionAccess(session, access, "hold")
        if (authorized) return authorized
        const at = now()
        if (session.state === "active" && session.expiresAt <= at) {
          await expireSession(repository, options.ports, session, access, at, tx)
        }
        if (session.state !== "active") {
          return session.state === "consumed"
            ? { kind: "rejected", error: { kind: "session_consumed" } }
            : { kind: "rejected", error: { kind: "session_expired" } }
        }
        const claim = await claimOperation(repository, sessionId, "hold", input, now())
        if (claim.status === "replay") return claim.outcome
        if (claim.status === "conflict") return idempotencyConflict()
        const revisionRejected = rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return completeAndReturn(repository, claim.id, revisionRejected)

        const quote = await loadUsableQuote(repository, input.quoteId, session, at)
        if (quote === "expired") {
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: { kind: "quote_expired", nextAction: "request_fresh_quote" },
          })
        }
        if (quote === "superseded") {
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: { kind: "quote_superseded", nextAction: "request_fresh_quote" },
          })
        }
        if (!quote) {
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: { kind: "quote_required", nextAction: "request_fresh_quote" },
          })
        }

        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        const hold: BookingHoldInternalRecord = {
          id: newId("booking_session_holds"),
          sessionId,
          quoteId: quote.id,
          target: session.target,
          quantity: input.quantity ?? 1,
          state: "active",
          capacityKey: capacityKeyForTarget(session.target),
          expiresAt: new Date(at.getTime() + holdTtlMs),
          createdAt: at,
        }
        const held = await options.ports.placeCapacityHold({
          session,
          quote,
          holdId: hold.id,
          capacityKey: hold.capacityKey,
          quantity: hold.quantity,
          expiresAt: hold.expiresAt,
          access,
          now: at,
          tx,
        })
        if (typeof held === "object" && held.status === "quantity_mismatch") {
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: {
              kind: "hold_quantity_mismatch",
              requestedQuantity: hold.quantity,
              expectedQuantity: held.expectedQuantity,
              nextAction: "request_new_hold",
            },
          })
        }
        if (held !== "held") {
          return completeAndReturn(repository, claim.id, {
            kind: "rejected",
            error: { kind: "availability_changed", nextAction: "request_new_hold" },
          })
        }
        await repository.saveHold(hold)
        await appendSessionAudit(repository, session, "hold", access, at, {
          holdId: hold.id,
          quoteId: quote.id,
        })
        const outcome: BookingSessionOutcomeV1 = {
          kind: "hold_created",
          session: serializeSession(session),
          hold: serializeHold(hold),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async abandonSession(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) return { kind: "rejected", error: { kind: "session_expired" } }
        const authorized = await authorizeSessionAccess(session, access, "abandon")
        if (authorized) return authorized
        if (
          await options.ports.hasActiveSupplierOperation?.({
            sessionId: session.id,
            tx,
          })
        ) {
          return {
            kind: "rejected" as const,
            error: {
              kind: "supplier_operation_active" as const,
              nextAction: "reconcile_supplier_operation" as const,
            },
          }
        }
        const at = now()
        if (session.state === "active" && session.expiresAt <= at) {
          await expireSession(repository, options.ports, session, access, at, tx)
        }
        if (session.state !== "active") {
          return session.state === "consumed"
            ? { kind: "rejected", error: { kind: "session_consumed" } }
            : { kind: "rejected", error: { kind: "session_expired" } }
        }
        const claim = await claimOperation(repository, sessionId, "abandon", input, now())
        if (claim.status === "replay") return claim.outcome
        if (claim.status === "conflict") return idempotencyConflict()
        const revisionRejected = rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return completeAndReturn(repository, claim.id, revisionRejected)

        session.state = "abandoned"
        session.revision += 1
        session.updatedAt = at
        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        await options.ports.payments?.expirePending({
          tx,
          bookingSessionId: session.id,
          at,
        })
        for (const quote of await repository.listActiveQuotes(session.id)) {
          quote.state = "superseded"
          await repository.saveQuote(quote)
        }
        await repository.saveSession(session)
        await appendSessionAudit(repository, session, "abandon", access, at)
        const outcome: BookingSessionOutcomeV1 = {
          kind: "session_abandoned",
          session: serializeSession(session),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async commitSession(sessionId, input, access) {
      const initialSession = await loadSession(sessionId)
      if (!initialSession) return { kind: "rejected", error: { kind: "session_expired" } }
      const authorized = await authorizeSessionAccess(initialSession, access, "commit")
      if (authorized) return authorized

      const priorCommit = await repository.getCommitByIdempotency(sessionId, input.idempotencyKey)
      if (priorCommit) {
        const requestFingerprint = await commitRequestFingerprint(input)
        if (priorCommit.requestFingerprint !== requestFingerprint) return idempotencyConflict()
        return replayCommit(priorCommit)
      }

      const preflight = await repository.withSessionTransaction(sessionId, async (tx) => {
        const session = await loadSession(sessionId)
        if (!session) {
          return {
            status: "outcome" as const,
            outcome: { kind: "rejected", error: { kind: "session_expired" } } as const,
          }
        }
        const lockedAuthorization = await authorizeSessionAccess(session, access, "commit")
        if (lockedAuthorization) {
          return { status: "outcome" as const, outcome: lockedAuthorization }
        }
        const at = now()
        const durableContinuation =
          (session.target.kind === "catalog_item" && session.state === "supplier_pending") ||
          (session.target.kind === "trip_snapshot" &&
            (session.state === "supplier_pending" || session.state === "component_pending"))
        if (!durableContinuation && session.state === "active" && session.expiresAt <= at) {
          await expireSession(repository, options.ports, session, access, at, tx)
        }
        if (session.state !== "active" && !durableContinuation) {
          return {
            status: "outcome" as const,
            outcome:
              session.state === "consumed"
                ? ({
                    kind: "rejected",
                    error: {
                      kind: "commit_already_consumed",
                      nextAction: "return_idempotent_result",
                    },
                  } as const)
                : ({ kind: "rejected", error: { kind: "session_expired" } } as const),
          }
        }
        const revisionRejected = rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return { status: "outcome" as const, outcome: revisionRejected }

        const quote = durableContinuation
          ? await loadPersistedSourcedQuote(repository, input.quoteId, session)
          : await loadUsableQuote(repository, input.quoteId, session, at)
        if (quote === "expired" || quote === "superseded") {
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return {
            status: "outcome" as const,
            outcome: {
              kind: "commit_result",
              outcome: {
                kind: "quote_failure",
                nextAction: "request_fresh_quote",
                reason: quote,
              },
            } as const,
          }
        }
        if (!quote) {
          const latestSession = await loadSession(sessionId)
          if (latestSession?.state === "consumed") {
            return {
              status: "outcome" as const,
              outcome: {
                kind: "rejected",
                error: {
                  kind: "commit_already_consumed",
                  nextAction: "return_idempotent_result",
                },
              } as const,
            }
          }
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return {
            status: "outcome" as const,
            outcome: {
              kind: "commit_result",
              outcome: {
                kind: "quote_failure",
                nextAction: "request_fresh_quote",
                reason: "mismatched_session",
              },
            } as const,
          }
        }

        const hold = input.holdId
          ? durableContinuation
            ? await loadPersistedSourcedHold(repository, input.holdId, session, quote)
            : await loadUsableHold(repository, input.holdId, session, quote, at)
          : null
        if (
          hold === "expired" ||
          (!hold && (session.target.kind === "product" || session.target.kind === "owned_entity"))
        ) {
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return {
            status: "outcome" as const,
            outcome: {
              kind: "commit_result",
              outcome: {
                kind: "hold_failure",
                nextAction: "request_new_hold",
                reason: hold === "expired" ? "expired" : "missing",
              },
            } as const,
          }
        }

        if (durableContinuation) {
          return { status: "ready" as const, session, quote, hold, at }
        }

        const freshQuote = await options.ports.composeQuote({ session, now: at, tx })
        if (freshQuote.status === "unavailable") {
          quote.state = "superseded"
          await repository.saveQuote(quote)
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return { status: "outcome" as const, outcome: quoteUnavailable(freshQuote) }
        }
        if ((await stableFingerprint(freshQuote.pricing)) !== quote.priceFingerprint) {
          quote.state = "superseded"
          await repository.saveQuote(quote)
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return {
            status: "outcome" as const,
            outcome: {
              kind: "commit_result",
              outcome: {
                kind: "quote_failure",
                nextAction: "request_fresh_quote",
                reason: "superseded",
              },
            } as const,
          }
        }
        return { status: "ready" as const, session, quote, hold, at }
      })
      if (preflight.status === "outcome") return preflight.outcome

      const { session, quote, hold, at } = preflight

      let preparedPayment: Awaited<ReturnType<BookingSessionPaymentPorts["prepare"]>>
      try {
        preparedPayment = options.ports.payments
          ? await options.ports.payments.prepare({
              session,
              quote,
              ...(hold ? { hold } : {}),
              commit: input,
              access,
              now: at,
            })
          : ({ kind: "not_required" } as const)
      } catch (error) {
        if (isIdempotencyConflictError(error)) return idempotencyConflict()
        throw error
      }
      if (preparedPayment.kind === "required") {
        return {
          kind: "commit_result",
          outcome: {
            kind: "payment_required",
            nextAction: "establish_payment_guarantee",
            paymentTarget: "booking_session",
            allowedGuarantees: preparedPayment.allowedGuarantees,
            paymentSession: preparedPayment.paymentSession,
          },
        }
      }
      const paymentSessionId =
        preparedPayment.kind === "established" ? preparedPayment.paymentSessionId : undefined

      const requestFingerprint = await commitRequestFingerprint(input)
      let committed: {
        bookingId: string
        allocationIds: string[]
        supplierOperationId?: string
      }
      try {
        if (session.target.kind === "trip_snapshot") {
          const compositeResult = await options.ports.commitCompositeBooking?.({
            session,
            quote,
            ...(hold ? { hold } : {}),
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            access,
            now: at,
            async consumeSources(tx, bookings) {
              await consumeCompositeCommittedSources({
                repository,
                ports: options.ports,
                session,
                quote,
                hold,
                access,
                paymentSessionId,
                input,
                requestFingerprint,
                bookings,
                tx,
                now,
              })
            },
          })
          if (!compositeResult) {
            throw new BookingSessionCommitRejectedError("entity_not_bookable")
          }
          if (compositeResult.kind !== "committed") {
            if (compositeResult.kind === "component_commit_pending") {
              await markCompositeSessionPending(
                repository,
                session.id,
                compositeResult.components,
                at,
              )
            }
            return { kind: "commit_result", outcome: compositeResult }
          }
          if (compositeResult.bookings.length === 0) {
            throw new BookingSessionCommitRejectedError("entity_not_bookable")
          }
          return {
            kind: "commit_result",
            outcome: {
              kind: "component_bookings_committed",
              nextAction: "none",
              bookings: compositeResult.bookings.map((booking) => ({
                componentId: booking.componentId,
                bookingId: booking.bookingId,
                status: "confirmed" as const,
                allocationIds: booking.allocationIds,
                ...(booking.supplierOperationId
                  ? { supplierOperationId: booking.supplierOperationId }
                  : {}),
              })),
              consumedSessionId: session.id,
              consumedQuoteId: quote.id,
              ...(hold ? { convertedHoldId: hold.id } : {}),
            },
          }
        } else if (session.target.kind === "catalog_item") {
          const sourcedResult = await options.ports.commitSourcedBooking?.({
            session,
            quote,
            ...(hold ? { hold } : {}),
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            access,
            now: at,
            paymentSessionId,
            async consumeSources(tx, bookingId, allocationIds, supplierOperationId) {
              await consumeCommittedSources({
                repository,
                ports: options.ports,
                session,
                quote,
                hold,
                access,
                paymentSessionId,
                input,
                requestFingerprint,
                bookingId,
                allocationIds,
                supplierOperationId,
                recomposeQuote: false,
                tx,
                now,
              })
            },
          })
          if (!sourcedResult) {
            throw new BookingSessionCommitRejectedError("entity_not_bookable")
          }
          if (sourcedResult.kind !== "committed") {
            return { kind: "commit_result", outcome: sourcedResult }
          }
          committed = sourcedResult
        } else {
          committed = await options.ports.commitOwnedBooking({
            session,
            quote,
            hold: hold as BookingHoldInternalRecord,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            access,
            now: at,
            paymentSessionId,
            async consumeSources(tx, bookingId, allocationIds) {
              await consumeCommittedSources({
                repository,
                ports: options.ports,
                session,
                quote,
                hold,
                access,
                paymentSessionId,
                input,
                requestFingerprint,
                bookingId,
                allocationIds,
                recomposeQuote: true,
                tx,
                now,
              })
            },
          })
        }
      } catch (error) {
        if (isIdempotencyConflictError(error)) return idempotencyConflict()
        if (error instanceof BookingSessionCommitRejectedError) {
          return {
            kind: "rejected",
            error: {
              kind: "commit_rejected",
              reason: error.reason,
              nextAction: commitRejectionNextAction(error.reason),
            },
          }
        }
        if (
          error instanceof Error &&
          error.message === "owned inventory hold is not live at commit"
        ) {
          const currentSession = await repository.getSession(session.id)
          if (currentSession?.state === "consumed") {
            const replay = await replayConcurrentCommit(repository, sessionId, input)
            if (replay) return replay
            return {
              kind: "rejected",
              error: {
                kind: "commit_already_consumed",
                nextAction: "return_idempotent_result",
              },
            }
          }
          const outcome: FailedCommitOutcome = {
            kind: "hold_failure",
            nextAction: "request_new_hold",
            reason: "released",
          }
          await persistCommitFailureState(
            repository,
            options.ports,
            session.id,
            quote.id,
            access,
            now(),
            outcome,
          )
          return { kind: "commit_result", outcome }
        }
        if (error instanceof CommitOutcomeError) {
          await persistCommitFailureState(
            repository,
            options.ports,
            session.id,
            quote.id,
            access,
            now(),
            error.outcome,
          )
          return { kind: "commit_result", outcome: error.outcome }
        }
        if (error instanceof CommitSessionStateError) {
          if (error.state === "expired") {
            await expireSessionInSessionTransaction(
              repository,
              options.ports,
              session.id,
              access,
              now(),
            )
            return { kind: "rejected", error: { kind: "session_expired" } }
          }
          const replay = await replayConcurrentCommit(repository, sessionId, input)
          if (replay) return replay
          return {
            kind: "rejected",
            error: { kind: "commit_already_consumed", nextAction: "return_idempotent_result" },
          }
        }
        if (isCommitConsumedError(error)) {
          const replay = await replayConcurrentCommit(repository, sessionId, input)
          if (replay) return replay
          return {
            kind: "rejected",
            error: { kind: "commit_already_consumed", nextAction: "return_idempotent_result" },
          }
        }
        throw error
      }
      const outcome: BookingLifecycleCommitOutcomeV1 = {
        kind: "committed",
        nextAction: "none",
        booking: { id: committed.bookingId, status: "confirmed" },
        allocationIds: committed.allocationIds,
        consumedSessionId: session.id,
        consumedQuoteId: quote.id,
        ...(hold ? { convertedHoldId: hold.id } : {}),
        ...(committed.supplierOperationId
          ? { supplierOperationId: committed.supplierOperationId }
          : {}),
      }
      return { kind: "commit_result", outcome }
    },

    async expireDueSessions(input, access) {
      if (access.actorKind !== "staff" || !access.staffAuthority?.admitted) {
        throw new Error("booking_session_expiry_sweep_not_authorized")
      }
      const at = now()
      const candidates = await repository.listExpiryCandidates({
        at,
        limit: Math.max(1, Math.min(input.limit, 500)),
      })
      let expired = 0
      for (const candidate of candidates) {
        await repository.withSessionTransaction(candidate.id, async (tx) => {
          const session = await repository.getSession(candidate.id)
          if (session?.state !== "active" || session.expiresAt > at) return
          await expireSession(repository, options.ports, session, access, at, tx)
          expired += 1
        })
      }
      return { expired }
    },

    async purgeTerminalSessions(input, access) {
      if (access.actorKind !== "staff" || !access.staffAuthority?.admitted) {
        throw new Error("booking_session_purge_not_authorized")
      }
      const candidates = await repository.listPurgeCandidates({
        before: input.before,
        limit: Math.max(1, Math.min(input.limit, 500)),
      })
      let purged = 0
      for (const candidate of candidates) {
        await repository.withSessionTransaction(candidate.id, async () => {
          const session = await repository.getSession(candidate.id)
          if (
            !session ||
            session.state === "active" ||
            session.purgedAt ||
            session.updatedAt > input.before
          ) {
            return
          }
          const at = now()
          const tombstoneFingerprint = await stableFingerprint({
            purgedSessionId: session.id,
          })
          session.createIdempotencyKey = tombstoneFingerprint
          session.createRequestFingerprint = tombstoneFingerprint
          session.statePayload = {}
          session.capabilityHash = undefined
          session.capabilityScopes = []
          session.ownerPrincipalId = undefined
          session.ownerOrganizationId = undefined
          session.storefrontOrigin = undefined
          session.purgedAt = at
          session.revision += 1
          session.updatedAt = at
          await repository.saveSession(session)
          await repository.purgeSessionArtifacts(session.id)
          await appendSessionAudit(repository, session, "purge", access, at)
          purged += 1
        })
      }
      return { purged }
    },
  }
}

async function consumeCommittedSources(input: {
  repository: BookingSessionRepository
  ports: BookingSessionModulePorts
  session: BookingSessionInternalRecord
  quote: BookingQuoteInternalRecord
  hold: BookingHoldInternalRecord | null
  access: BookingSessionAccessContext
  paymentSessionId?: string
  input: CommitBookingSessionV1
  requestFingerprint: string
  bookingId: string
  allocationIds: string[]
  supplierOperationId?: string
  recomposeQuote: boolean
  tx: unknown
  now: () => Date
}): Promise<void> {
  const outcome: BookingLifecycleCommitOutcomeV1 = {
    kind: "committed",
    nextAction: "none",
    booking: { id: input.bookingId, status: "confirmed" },
    allocationIds: input.allocationIds,
    consumedSessionId: input.session.id,
    consumedQuoteId: input.quote.id,
    ...(input.hold ? { convertedHoldId: input.hold.id } : {}),
    ...(input.supplierOperationId ? { supplierOperationId: input.supplierOperationId } : {}),
  }
  await input.repository.withTransactionContext(input.tx, async () => {
    const currentAt = input.now()
    const currentSession = await input.repository.getSession(input.session.id)
    const persistedSourcedCommit =
      !input.recomposeQuote && currentSession?.state === "supplier_pending"
    if (currentSession?.state !== "active" && !persistedSourcedCommit) {
      throw new CommitSessionStateError(
        currentSession?.state === "consumed" ? "consumed" : "expired",
      )
    }
    if (!persistedSourcedCommit && currentSession.expiresAt <= currentAt) {
      throw new CommitSessionStateError("expired")
    }
    const currentQuote = persistedSourcedCommit
      ? await loadPersistedSourcedQuote(input.repository, input.quote.id, currentSession)
      : await loadUsableQuote(input.repository, input.quote.id, currentSession, currentAt)
    if (currentQuote === "expired") {
      throw new CommitOutcomeError({
        kind: "quote_failure",
        nextAction: "request_fresh_quote",
        reason: "expired",
      })
    }
    if (currentQuote === "superseded" || !currentQuote) {
      throw new CommitOutcomeError({
        kind: "quote_failure",
        nextAction: "request_fresh_quote",
        reason: currentQuote === "superseded" ? "superseded" : "mismatched_session",
      })
    }
    let currentHold: BookingHoldInternalRecord | null = null
    if (input.hold) {
      const loaded = persistedSourcedCommit
        ? await loadPersistedSourcedHold(
            input.repository,
            input.hold.id,
            currentSession,
            currentQuote,
          )
        : await loadUsableHold(
            input.repository,
            input.hold.id,
            currentSession,
            currentQuote,
            currentAt,
          )
      if (loaded === "expired") {
        throw new CommitOutcomeError({
          kind: "hold_failure",
          nextAction: "request_new_hold",
          reason: "expired",
        })
      }
      if (!loaded) {
        throw new CommitOutcomeError({
          kind: "hold_failure",
          nextAction: "request_new_hold",
          reason: "missing",
        })
      }
      currentHold = loaded
    }
    if (input.recomposeQuote) {
      const currentQuoteResult = await input.ports.composeQuote({
        session: currentSession,
        now: currentAt,
        tx: input.tx,
      })
      if (
        currentQuoteResult.status === "unavailable" ||
        (await stableFingerprint(currentQuoteResult.pricing)) !== currentQuote.priceFingerprint
      ) {
        currentQuote.state = "superseded"
        await input.repository.saveQuote(currentQuote)
        throw new CommitOutcomeError({
          kind: "quote_failure",
          nextAction: "request_fresh_quote",
          reason: "superseded",
        })
      }
    }
    await input.repository.consumeCommit({
      sessionId: currentSession.id,
      quoteId: currentQuote.id,
      ...(currentHold ? { holdId: currentHold.id } : {}),
      idempotencyKey: input.input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      outcome,
      bookingId: input.bookingId,
      now: currentAt,
    })
    if (input.paymentSessionId && input.ports.payments) {
      await input.ports.payments.transferToBooking({
        tx: input.tx,
        paymentSessionId: input.paymentSessionId,
        bookingSessionId: currentSession.id,
        bookingId: input.bookingId,
      })
    }
    await appendSessionAudit(input.repository, currentSession, "commit", input.access, currentAt, {
      bookingId: input.bookingId,
      quoteId: currentQuote.id,
      ...(currentHold ? { holdId: currentHold.id } : {}),
      ...(input.supplierOperationId ? { supplierOperationId: input.supplierOperationId } : {}),
    })
  })
}

async function markCompositeSessionPending(
  repository: BookingSessionRepository,
  sessionId: string,
  components: Extract<
    BookingLifecycleCommitOutcomeV1,
    { kind: "component_commit_pending" }
  >["components"],
  at: Date,
): Promise<void> {
  await repository.withSessionTransaction(sessionId, async () => {
    const current = await repository.getSession(sessionId)
    if (!current || current.state === "consumed") return
    current.state = components.some(
      (component) =>
        component.state === "supplier_pending" || component.state === "supplier_in_doubt",
    )
      ? "supplier_pending"
      : "component_pending"
    current.updatedAt = at
    await repository.saveSession(current)
  })
}

async function consumeCompositeCommittedSources(input: {
  repository: BookingSessionRepository
  ports: BookingSessionModulePorts
  session: BookingSessionInternalRecord
  quote: BookingQuoteInternalRecord
  hold: BookingHoldInternalRecord | null
  access: BookingSessionAccessContext
  paymentSessionId?: string
  input: CommitBookingSessionV1
  requestFingerprint: string
  bookings: CompositeBookingCommitment[]
  tx: unknown
  now: () => Date
}): Promise<void> {
  const primary = input.bookings[0]
  if (!primary) throw new BookingSessionCommitRejectedError("entity_not_bookable")
  const outcome: BookingLifecycleCommitOutcomeV1 = {
    kind: "component_bookings_committed",
    nextAction: "none",
    bookings: input.bookings.map((booking) => ({
      componentId: booking.componentId,
      bookingId: booking.bookingId,
      status: "confirmed",
      allocationIds: booking.allocationIds,
      ...(booking.supplierOperationId ? { supplierOperationId: booking.supplierOperationId } : {}),
    })),
    consumedSessionId: input.session.id,
    consumedQuoteId: input.quote.id,
    ...(input.hold ? { convertedHoldId: input.hold.id } : {}),
  }
  await input.repository.withTransactionContext(input.tx, async () => {
    const currentAt = input.now()
    const currentSession = await input.repository.getSession(input.session.id)
    const continuing =
      currentSession?.state === "supplier_pending" || currentSession?.state === "component_pending"
    if (currentSession?.state !== "active" && !continuing) {
      throw new CommitSessionStateError(
        currentSession?.state === "consumed" ? "consumed" : "expired",
      )
    }
    if (!continuing && currentSession.expiresAt <= currentAt) {
      throw new CommitSessionStateError("expired")
    }
    const currentQuote = continuing
      ? await loadPersistedSourcedQuote(input.repository, input.quote.id, currentSession)
      : await loadUsableQuote(input.repository, input.quote.id, currentSession, currentAt)
    if (!currentQuote || currentQuote === "expired" || currentQuote === "superseded") {
      throw new CommitOutcomeError({
        kind: "quote_failure",
        nextAction: "request_fresh_quote",
        reason:
          currentQuote === "expired"
            ? "expired"
            : currentQuote === "superseded"
              ? "superseded"
              : "mismatched_session",
      })
    }
    const currentHold = input.hold
      ? continuing
        ? await loadPersistedSourcedHold(
            input.repository,
            input.hold.id,
            currentSession,
            currentQuote,
          )
        : await loadUsableHold(
            input.repository,
            input.hold.id,
            currentSession,
            currentQuote,
            currentAt,
          )
      : null
    if (currentHold === "expired" || (input.hold && !currentHold)) {
      throw new CommitOutcomeError({
        kind: "hold_failure",
        nextAction: "request_new_hold",
        reason: currentHold === "expired" ? "expired" : "missing",
      })
    }
    await input.repository.consumeCommit({
      sessionId: currentSession.id,
      quoteId: currentQuote.id,
      ...(currentHold ? { holdId: currentHold.id } : {}),
      idempotencyKey: input.input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      outcome,
      bookingId: primary.bookingId,
      now: currentAt,
    })
    if (input.paymentSessionId && input.ports.payments) {
      await input.ports.payments.transferToBooking({
        tx: input.tx,
        paymentSessionId: input.paymentSessionId,
        bookingSessionId: currentSession.id,
        bookingId: primary.bookingId,
      })
    }
    await appendSessionAudit(input.repository, currentSession, "commit", input.access, currentAt, {
      bookingIds: input.bookings.map((booking) => booking.bookingId),
      componentIds: input.bookings.map((booking) => booking.componentId),
      quoteId: currentQuote.id,
      ...(currentHold ? { holdId: currentHold.id } : {}),
    })
  })
}

type FailedCommitOutcome = Exclude<
  BookingLifecycleCommitOutcomeV1,
  { kind: "committed" | "component_bookings_committed" | "idempotent_replay" }
>

class CommitOutcomeError extends Error {
  constructor(readonly outcome: FailedCommitOutcome) {
    super(`booking_session_commit_${outcome.kind}`)
  }
}

class CommitSessionStateError extends Error {
  constructor(readonly state: "expired" | "consumed") {
    super(`booking_session_commit_session_${state}`)
  }
}

function quoteUnavailable(
  result: Extract<ComposeBookingQuoteResult, { status: "unavailable" }>,
): BookingSessionOutcomeV1 {
  return {
    kind: "rejected",
    error: {
      kind: "quote_unavailable",
      // A target that priced out or sold out still has a renderable wizard.
      // Dropping the descriptor here is what forced hosts to invent one.
      ...(result.requirements ? { requirements: result.requirements } : {}),
      reason: result.reason,
      nextAction: result.nextAction,
    },
  }
}

function commitRejectionNextAction(
  reason: BookingSessionCommitRejectionReason,
): "select_alternative_inventory" | "update_selection" | "request_fresh_quote" {
  switch (reason) {
    case "entity_not_found":
    case "entity_not_bookable":
      return "select_alternative_inventory"
    case "price_changed":
      return "request_fresh_quote"
    case "incomplete_draft":
      return "update_selection"
  }
}

async function completeAndReturn(
  repository: BookingSessionRepository,
  operationId: string,
  outcome: BookingSessionOutcomeV1,
): Promise<BookingSessionOutcomeV1> {
  await repository.completeOperation({ id: operationId, outcome })
  return outcome
}

async function expireSessionInSessionTransaction(
  repository: BookingSessionRepository,
  ports: BookingSessionModulePorts,
  sessionId: string,
  access: BookingSessionAccessContext,
  now: Date,
): Promise<void> {
  await repository.withSessionTransaction(sessionId, async (tx) => {
    const session = await repository.getSession(sessionId)
    if (!session || session.state === "consumed") return
    await expireSession(repository, ports, session, access, now, tx)
  })
}

async function expireSession(
  repository: BookingSessionRepository,
  ports: BookingSessionModulePorts,
  session: BookingSessionInternalRecord,
  access: BookingSessionAccessContext,
  now: Date,
  tx: unknown,
): Promise<void> {
  await releaseLiveHolds(repository, ports, session, access, now, tx)
  await ports.payments?.expirePending({ tx, bookingSessionId: session.id, at: now })
  for (const quote of await repository.listActiveQuotes(session.id)) {
    quote.state = "expired"
    await repository.saveQuote(quote)
  }
  session.state = "expired"
  session.revision += 1
  session.updatedAt = now
  await repository.saveSession(session)
  await appendSessionAudit(repository, session, "expire", access, now)
}

async function persistCommitFailureState(
  repository: BookingSessionRepository,
  ports: BookingSessionModulePorts,
  sessionId: string,
  quoteId: string,
  access: BookingSessionAccessContext,
  now: Date,
  outcome: FailedCommitOutcome,
): Promise<void> {
  await repository.withSessionTransaction(sessionId, async (tx) => {
    const session = await repository.getSession(sessionId)
    if (session?.state !== "active") return
    if (session.expiresAt <= now) {
      await expireSession(repository, ports, session, access, now, tx)
      return
    }
    if (outcome.kind === "quote_failure") {
      const quote = await repository.getQuote(quoteId)
      if (quote?.sessionId === session.id && quote.state === "active") {
        quote.state = outcome.reason === "expired" ? "expired" : "superseded"
        await repository.saveQuote(quote)
      }
    }
    await releaseLiveHolds(repository, ports, session, access, now, tx)
  })
}

async function releaseLiveHolds(
  repository: BookingSessionRepository,
  ports: BookingSessionModulePorts,
  session: BookingSessionInternalRecord,
  access: BookingSessionAccessContext,
  now: Date,
  tx: unknown,
): Promise<void> {
  for (const hold of await repository.listActiveHolds(session.id)) {
    if (hold.state !== "active") continue
    await ports.releaseCapacityHold({ session, hold, access, now, tx })
    hold.state = hold.expiresAt <= now ? "expired" : "released"
    await repository.saveHold(hold)
  }
}

async function claimOperation(
  repository: BookingSessionRepository,
  sessionId: string,
  operation: BookingSessionOperationRecord["operation"],
  input: unknown,
  now: Date,
): Promise<BookingSessionOperationClaim> {
  return repository.claimOperation({
    id: newId("booking_session_operations"),
    sessionId,
    operation,
    idempotencyKey: idempotencyKeyFromInput(input),
    requestFingerprint: await stableFingerprint(input),
    now,
  })
}

function idempotencyKeyFromInput(input: unknown): string {
  if (!input || typeof input !== "object") return ""
  const value = Reflect.get(input, "idempotencyKey")
  return typeof value === "string" ? value : ""
}

async function commitRequestFingerprint(input: CommitBookingSessionV1): Promise<string> {
  return stableFingerprint({
    expectedRevision: input.expectedRevision,
    quoteId: input.quoteId,
    holdId: input.holdId,
  })
}

function idempotencyConflict(): BookingSessionOutcomeV1 {
  return { kind: "rejected", error: { kind: "idempotency_conflict" } }
}

function replayCommit(commit: BookingCommitInternalRecord): BookingSessionOutcomeV1 {
  return {
    kind: "commit_result",
    outcome: {
      kind: "idempotent_replay",
      nextAction: "return_idempotent_result",
      originalCommitId: commit.id,
      originalOutcome: commit.outcome,
    },
  }
}

async function replayConcurrentCommit(
  repository: BookingSessionRepository,
  sessionId: string,
  input: CommitBookingSessionV1,
): Promise<BookingSessionOutcomeV1 | null> {
  const commit = await repository.getCommitByIdempotency(sessionId, input.idempotencyKey)
  if (!commit) return null
  return commit.requestFingerprint === (await commitRequestFingerprint(input))
    ? replayCommit(commit)
    : idempotencyConflict()
}

function invalidSelectionOutcome(error: unknown): BookingSessionOutcomeV1 | null {
  if (!(error instanceof InvalidBookingSessionSelectionError)) return null
  return {
    kind: "rejected",
    error: {
      kind: "invalid_selection",
      reason: error.reason,
      ...(error.path ? { path: error.path } : {}),
    },
  }
}

function isIdempotencyConflictError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ActionLedgerIdempotencyConflictError" ||
      error.message.includes("idempotency_conflict"))
  )
}

function isCommitConsumedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "booking_session_commit_session_consumed" ||
      error.message === "booking_session_commit_quote_consumed" ||
      error.message === "booking_session_commit_hold_consumed")
  )
}

async function loadUsableQuote(
  repository: BookingSessionRepository,
  quoteId: string,
  session: BookingSessionInternalRecord,
  now: Date,
): Promise<BookingQuoteInternalRecord | "expired" | "superseded" | null> {
  const quote = await repository.getQuote(quoteId)
  if (!quote || quote.sessionId !== session.id) return null
  if (quote.state === "superseded") return "superseded"
  if (quote.sessionRevision !== session.revision) return null
  if (quote.state !== "active") return quote.state === "expired" ? "expired" : null
  if (quote.expiresAt <= now) {
    quote.state = "expired"
    await repository.saveQuote(quote)
    return "expired"
  }
  return quote
}

async function loadPersistedSourcedQuote(
  repository: BookingSessionRepository,
  quoteId: string,
  session: BookingSessionInternalRecord,
): Promise<BookingQuoteInternalRecord | "expired" | "superseded" | null> {
  const quote = await repository.getQuote(quoteId)
  if (!quote || quote.sessionId !== session.id || quote.sessionRevision !== session.revision) {
    return null
  }
  if (quote.state === "expired") return "expired"
  if (quote.state !== "active") return "superseded"
  return quote
}

async function loadUsableHold(
  repository: BookingSessionRepository,
  holdId: string,
  session: BookingSessionInternalRecord,
  quote: BookingQuoteInternalRecord,
  now: Date,
): Promise<BookingHoldInternalRecord | "expired" | null> {
  const hold = await repository.getHold(holdId)
  if (!hold || hold.sessionId !== session.id || hold.quoteId !== quote.id) return null
  if (hold.state !== "active") return hold.state === "expired" ? "expired" : null
  if (hold.expiresAt <= now) {
    return "expired"
  }
  return hold
}

async function loadPersistedSourcedHold(
  repository: BookingSessionRepository,
  holdId: string,
  session: BookingSessionInternalRecord,
  quote: BookingQuoteInternalRecord,
): Promise<BookingHoldInternalRecord | "expired" | null> {
  const hold = await repository.getHold(holdId)
  if (!hold || hold.sessionId !== session.id || hold.quoteId !== quote.id) return null
  if (hold.state === "expired") return "expired"
  return hold.state === "active" ? hold : null
}

function capacityKeyForTarget(target: BookingSessionTargetV1): string {
  if (target.kind === "product" && target.productId) return `product:${target.productId}`
  if (target.kind === "owned_entity" && target.entityModule && target.entityId) {
    return `owned_entity:${target.entityModule}:${target.entityId}`
  }
  if (target.kind === "catalog_item" && target.catalogItemId)
    return `catalog_item:${target.catalogItemId}`
  if (target.kind === "trip_snapshot" && target.tripSnapshotId)
    return `trip_snapshot:${target.tripSnapshotId}`
  throw new Error("Booking Session target does not identify capacity")
}

/**
 * A create request may omit scope; a stored Session may not. Fall back to what
 * the engine hardcoded before scope existed, so an unscoped caller keeps the
 * behaviour it already had instead of silently changing market.
 */
function resolveSessionScope(scope: BookingSessionScopeV1 | undefined): BookingSessionScopeV1 {
  const locale = scope?.locale?.trim()
  const market = scope?.market?.trim()
  const currency = scope?.currency?.trim().toUpperCase()
  return {
    locale: locale || DEFAULT_BOOKING_SESSION_SCOPE.locale,
    market: market || DEFAULT_BOOKING_SESSION_SCOPE.market,
    ...(currency ? { currency } : {}),
  }
}

function serializeSession(
  session: BookingSessionInternalRecord,
  requirements?: BookingRequirementsV1,
): BookingSessionRecordV1 {
  return {
    id: session.id,
    target: session.target,
    ...(session.origin ? { origin: session.origin } : {}),
    actorKind: session.actorKind,
    state: session.state,
    revision: session.revision,
    scope: session.scope,
    ...(requirements ? { requirements } : {}),
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}

function serializeSessionView(
  session: BookingSessionInternalRecord,
  access: BookingSessionAccessContext,
  requirements?: BookingRequirementsV1,
): BookingSessionViewV1 {
  const record = serializeSession(session, requirements)
  if (access.actorKind === "staff") {
    return { ...record, redaction: "selection_omitted" }
  }
  return { ...record, selection: structuredClone(session.statePayload), redaction: "none" }
}

function serializeQuote(quote: BookingQuoteInternalRecord): BookingQuoteRecordV1 {
  return {
    id: quote.id,
    sessionId: quote.sessionId,
    sessionRevision: quote.sessionRevision,
    state: quote.state,
    requirements: quote.requirements,
    pricing: quote.pricing,
    quotedAt: quote.quotedAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
  }
}

function serializeHold(hold: BookingHoldInternalRecord): BookingHoldRecordV1 {
  return {
    id: hold.id,
    sessionId: hold.sessionId,
    quoteId: hold.quoteId,
    target: hold.target,
    quantity: hold.quantity,
    state: hold.state,
    expiresAt: hold.expiresAt.toISOString(),
    createdAt: hold.createdAt.toISOString(),
  }
}

async function hasSessionCapability(
  session: BookingSessionInternalRecord,
  capability: string | undefined,
): Promise<boolean> {
  if (!session.capabilityHash || !isValidCapabilityShape(capability)) return false
  return constantTimeEqual(session.capabilityHash, await hashCapability(capability))
}

async function authorizeAnonymousCapability(
  session: BookingSessionInternalRecord,
  access: BookingSessionAccessContext,
  action: BookingSessionCapabilityActionV1,
): Promise<BookingSessionOutcomeV1 | null> {
  if (!(await hasSessionCapability(session, access.capability))) {
    return { kind: "rejected", error: { kind: "capability_required" } }
  }
  return session.capabilityScopes.includes(action)
    ? null
    : { kind: "rejected", error: { kind: "capability_scope_required", action } }
}

async function authorizeSessionAccess(
  session: BookingSessionInternalRecord,
  access: BookingSessionAccessContext,
  action: BookingSessionCapabilityActionV1,
): Promise<BookingSessionOutcomeV1 | null> {
  if (access.actorKind === "staff") {
    return access.principalId && access.staffAuthority?.admitted
      ? null
      : { kind: "rejected", error: { kind: "not_authorized" } }
  }
  if (session.actorKind === "anonymous") {
    const capabilityRejected = await authorizeAnonymousCapability(session, access, action)
    if (capabilityRejected) return capabilityRejected
    return authorizeStorefrontOrigin(session, access)
  }
  if (!isOwnedBy(session, access)) {
    return { kind: "rejected", error: { kind: "not_authorized" } }
  }
  return authorizeStorefrontOrigin(session, access)
}

function authorizeStorefrontOrigin(
  session: BookingSessionInternalRecord,
  access: BookingSessionAccessContext,
): BookingSessionOutcomeV1 | null {
  if (access.actorKind !== "anonymous" && access.actorKind !== "customer") return null
  const pinned = session.storefrontOrigin
  const current = access.storefront
  return pinned &&
    current &&
    pinned.storefrontId === current.storefrontId &&
    pinned.channelId === current.channelId
    ? null
    : { kind: "rejected", error: { kind: "not_authorized" } }
}

function isOwnedBy(
  session: BookingSessionInternalRecord,
  access: BookingSessionAccessContext,
): boolean {
  return Boolean(
    access.actorKind === session.actorKind &&
      session.ownerPrincipalId &&
      access.principalId === session.ownerPrincipalId &&
      (!session.ownerOrganizationId || session.ownerOrganizationId === access.organizationId),
  )
}

function normalizeCapabilityScopes(
  scopes: BookingSessionCapabilityActionV1[] | undefined,
): BookingSessionCapabilityActionV1[] {
  return [...new Set(scopes ?? DEFAULT_ANONYMOUS_CAPABILITY_SCOPES)].sort()
}

function isValidCapabilityShape(capability: string | undefined): capability is string {
  return Boolean(capability && /^bcap_[A-Za-z0-9_-]{43,}$/.test(capability))
}

async function appendSessionAudit(
  repository: BookingSessionRepository,
  session: BookingSessionInternalRecord,
  action: BookingSessionAuditRecord["action"],
  access: BookingSessionAccessContext,
  at: Date,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await repository.appendAudit({
    id: newId("booking_session_audit_events"),
    sessionId: session.id,
    action,
    actorKind: access.actorKind,
    principalId: access.principalId,
    organizationId: access.organizationId,
    authorityReason: access.staffAuthority?.reason,
    metadata,
    createdAt: at,
  })
}

async function hashCapability(capability: string): Promise<string> {
  return sha256Hex(capability)
}

async function scopedCreateIdempotencyKey(
  idempotencyKey: string,
  access: BookingSessionAccessContext,
  capabilityHash: string | undefined,
): Promise<string> {
  return stableFingerprint({
    key: idempotencyKey,
    actorKind: access.actorKind,
    principalId: access.actorKind === "anonymous" ? null : (access.principalId ?? null),
    organizationId: access.actorKind === "anonymous" ? null : (access.organizationId ?? null),
    capabilityHash: capabilityHash ?? null,
    storefrontOrigin: access.actorKind === "staff" ? null : (access.storefront ?? null),
  })
}

async function stableFingerprint(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(sortForStableJson(value)))
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortForStableJson(item)]),
  )
}
