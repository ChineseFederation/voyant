// agent-quality: file-size exception -- owner: catalog; the Session state machine, internal records, authorization, and atomic lifecycle intentionally remain one protocol.
import type { BookingPaymentCheckoutV1 } from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import type {
  OfferPreviewOutcomeV1,
  OfferPreviewRequestV1,
} from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import { priceFingerprintInput } from "@voyant-travel/catalog-contracts/booking-engine/pricing-contracts"
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
import { PermanentSubscriberError } from "@voyant-travel/core"
import type { AnalyticsPort } from "@voyant-travel/core/analytics"
import { createSafeAnalytics } from "@voyant-travel/core/analytics"
import { newId } from "@voyant-travel/db/lib/typeid"
import { withBookingSessionAnalytics } from "./analytics.js"
import type {
  BookingCheckoutIntentV1,
  BookingLifecycleCommitOutcomeV1,
  BookingRequirementsV1,
  BookingSessionBankTransferV1,
  PricingBreakdownV1,
  UnsatisfiedRequirementV1,
} from "./contracts.js"
import { validateSelectionAgainstRequirements } from "./contracts.js"
import { InvalidBookingSessionSelectionError } from "./errors.js"
import { previewOffer } from "./offer-preview.js"
import { partySizeFromSelection } from "./quote-support.js"

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
   * Exact server-selected sourced inventory identity for an internal composite
   * leaf. This is never accepted from public input, persisted, or serialized.
   * It prevents a Trip leaf from being re-resolved to a different supplier row
   * that happens to share the same Catalog entity id.
   */
  sourcedTargetPin?: {
    entityModule: string
    entityId: string
    sourceKind: string
    sourceProvider?: string | null
    sourceConnectionId: string
    sourceRef: string
    projection: Record<string, unknown>
    title: string
  }
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
  /**
   * Fingerprint of `requirements`, computed exactly the way `priceFingerprint`
   * is computed over `pricing`. The Commit re-derives requirements and compares,
   * so a descriptor that moved under the buyer is caught the same way a price
   * that moved is.
   */
  requirementsFingerprint: string
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
  supersedeActiveQuotes?(sessionId: string): Promise<void>
  getQuote(quoteId: string): Promise<BookingQuoteInternalRecord | null>
  saveQuote(record: BookingQuoteInternalRecord): Promise<void>
  getHold(holdId: string): Promise<BookingHoldInternalRecord | null>
  listActiveHolds(sessionId: string): Promise<BookingHoldInternalRecord[]>
  saveHold(record: BookingHoldInternalRecord): Promise<void>
  getCommitByIdempotency(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<BookingCommitInternalRecord | null>
  getCommitForSession(sessionId: string): Promise<BookingCommitInternalRecord | null>
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
    /**
     * Settling a captured payment, which may claim a `superseded` Quote as well
     * as an `active` one.
     *
     * The claim is what makes concurrent Commits safe: it moves the Quote to
     * `consumed` only from an expected state, so of two racing Commits exactly
     * one wins. `superseded` is not a competing claim though — it means the
     * shopper re-quoted, which is what they do while a processor holds their
     * money, and refusing on it is what left captured payments with no Booking
     * (voyant#4636). `consumed` still loses, so the race this guards is intact.
     */
    settling?: boolean
  }): Promise<void>
  withTransactionContext<T>(tx: unknown, operation: () => Promise<T>): Promise<T>
  withSessionTransaction<T>(
    sessionId: string,
    operation: (tx: unknown, session?: BookingSessionInternalRecord | null) => Promise<T>,
  ): Promise<T>
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
          /**
           * The handoff the adapter produced, whole. `redirectUrl` above is its
           * redirect-arm projection and is `null` for an embedded one, so this
           * is the only field that can carry a client secret out to the
           * storefront that asked for it (voyant#4346).
           */
          checkout: BookingPaymentCheckoutV1 | null
          expiresAt: string | null
        }
        allowedGuarantees: Array<"deposit" | "pre_auth" | "card_on_file" | "agency_letter">
      }
  >
  /**
   * Establish the durable offline-payment record after the Booking id exists
   * but before the surrounding Commit transaction is consumed.
   */
  establishBankTransfer?(input: {
    tx: unknown
    session: BookingSessionInternalRecord
    quote: BookingQuoteInternalRecord
    commit: CommitBookingSessionV1
    access: BookingSessionAccessContext
    bookingId: string
    now: Date
  }): Promise<BookingSessionBankTransferV1 | null>
  transferToBooking(input: {
    tx: unknown
    paymentSessionId: string
    bookingSessionId: string
    bookingId: string
  }): Promise<void>
  expirePending(input: { tx: unknown; bookingSessionId: string; at: Date }): Promise<void>
  /**
   * Which Quote and Hold this payment was established against.
   *
   * Settlement runs after the shopper has been sent away to a processor, and a
   * shopper waiting on a "confirming" screen goes on quoting: each refresh
   * supersedes the previous Quote and bumps the Session revision. So "the
   * Session's one active Quote" names a different row by the time the money
   * lands, and settling against it settles against something nobody paid for
   * (voyant#4636).
   *
   * The payment records what it collected for. Optional because a host may not
   * keep it — settlement falls back to the single active Quote, which is
   * correct whenever the shopper has stopped quoting.
   */
  describeEstablished?(input: {
    paymentSessionId: string
  }): Promise<{ quoteId: string | null; holdId: string | null } | null>
  /**
   * Whether this Session's money is with a processor and the outcome is not
   * known yet.
   *
   * Asked before anything that would tear the Quote and Hold down. Optional,
   * and absent means "no" — a deployment with no payments port has no in-flight
   * payment to protect.
   */
  hasInFlight?(input: { bookingSessionId: string }): Promise<boolean>
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
  /** Trusted settlement subscriber authority; never populated by request transports. */
  settlementAuthority?: { admitted: true; reason: string; paymentSessionId: string }
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
  /**
   * Price the target. Read-only, and — like `composeRequirements` — must
   * accept a nullish `tx`: the stateless Offer Preview quotes an ephemeral
   * session-shaped value that has no Session row and therefore no open Session
   * transaction to borrow.
   */
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
  /**
   * Host-bound product analytics. Absent means unbound, which is a supported,
   * silent state: no wrapper is installed and the module behaves exactly as it
   * did before the port existed. See `./analytics.ts`.
   */
  analytics?: AnalyticsPort
  /** Millisecond clock for analytics durations. Injectable for deterministic tests. */
  analyticsClock?: () => number
  now?: () => Date
  sessionTtlMs?: number
  quoteTtlMs?: number
  holdTtlMs?: number
  maxRenewalExtensionMs?: number
  maxSessionLifetimeMs?: number
}

/**
 * Re-exported from `errors.js`, which is where it is now declared: the
 * stateless Offer Preview has to recognise the same rejection, and importing
 * it from here would put a runtime edge back from `offer-preview.ts` into this
 * module, which imports `offer-preview.ts` in turn.
 */
export { InvalidBookingSessionSelectionError }

export class BookingSessionCommitRejectedError extends Error {
  constructor(readonly reason: BookingSessionCommitRejectionReason) {
    super(`booking_session_commit_${reason}`)
  }
}

export interface BookingSessionModule {
  /** Server-only composite create; public callers can never submit internal Trip identifiers. */
  createCompositeSession(
    input: {
      idempotencyKey: string
      target: Extract<BookingSessionTargetV1, { kind: "trip_snapshot" }>
      selection?: Record<string, unknown>
      scope?: BookingSessionScopeV1
      capabilityScopes?: BookingSessionCapabilityActionV1[]
    },
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  createAcceptedProposalSession(
    input: CreateAcceptedProposalBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  createSession(
    input: CreateBookingSessionV1,
    access: BookingSessionAccessContext,
  ): Promise<BookingSessionOutcomeV1>
  /**
   * Stateless, non-binding read of what a target would cost and what booking
   * it would require. Mints no identifier and writes nothing — see
   * `offer-preview.ts`. A storefront detail page uses this so that adjusting a
   * pax stepper does not open a Session.
   */
  previewOffer(
    input: OfferPreviewRequestV1,
    access: BookingSessionAccessContext,
  ): Promise<OfferPreviewOutcomeV1>
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
  commitPaidSession(input: {
    bookingSessionId: string
    paymentSessionId: string
  }): Promise<{ bookingId: string }>
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

  /**
   * A Session whose money is with a processor is frozen against anything that
   * would release its Holds.
   *
   * Quoting, renewing, re-selecting and re-holding all tear the live Holds down
   * so the shopper can start again — correct while they are shopping, and
   * exactly wrong once they are paying. The Hold is the seat the payment is
   * being collected for, and a storefront polling its "payment is confirming"
   * screen is indistinguishable from a shopper still browsing: in voyant#4636
   * that gave the seat back three seconds before the money landed, and the
   * settlement that arrived after had nothing left to commit.
   *
   * Not a hazard for the shopper to route around — it resolves by itself the
   * moment the payment does, in either direction.
   */
  async function rejectWhilePaymentInFlight(
    session: BookingSessionInternalRecord,
  ): Promise<BookingSessionOutcomeV1 | null> {
    const inFlight = await options.ports.payments?.hasInFlight?.({ bookingSessionId: session.id })
    return inFlight
      ? {
          kind: "rejected",
          error: { kind: "payment_in_flight", nextAction: "await_payment_outcome" },
        }
      : null
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
    validateCompositePricing = false,
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
        session: serializeSession(existing, await sessionRequirements(existing, at), access),
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
    if (validateCompositePricing) {
      const priced = await options.ports.composeQuote({ session, now: at, tx: undefined })
      if (priced.status === "unavailable") return quoteUnavailable(priced)
    }
    const created = await repository.createSession(session)
    if (created.id !== session.id) {
      if (created.createRequestFingerprint !== createRequestFingerprint) {
        return idempotencyConflict()
      }
      return {
        kind: "session_created",
        session: serializeSession(created, await sessionRequirements(created, at), access),
      }
    }
    return {
      kind: "session_created",
      session: serializeSession(session, await sessionRequirements(session, at), access),
    }
  }

  const bookingSessionModule: BookingSessionModule = {
    createCompositeSession(input, access) {
      return createSessionRecord(input, access, undefined, true)
    },
    createSession(input, access) {
      return createSessionRecord(input, access)
    },

    previewOffer(input, access) {
      // Handed only the three derivation ports — no repository — so a preview
      // is structurally incapable of writing a Session, Quote, Hold, operation
      // claim or audit row.
      const { normalizeSelection, composeRequirements, composeQuote } = options.ports
      return previewOffer(
        { normalizeSelection, composeRequirements, composeQuote },
        input,
        access,
        now(),
      )
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
      return repository.withSessionTransaction(sessionId, async (tx, lockedSession) => {
        const session = lockedSession === undefined ? await loadSession(sessionId) : lockedSession
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
      return repository.withSessionTransaction(sessionId, async (tx, lockedSession) => {
        const session = lockedSession === undefined ? await loadSession(sessionId) : lockedSession
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
        const renewingWhilePaying = await rejectWhilePaymentInFlight(session)
        if (renewingWhilePaying) return completeAndReturn(repository, claim.id, renewingWhilePaying)

        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        await supersedeActiveQuotes(repository, session.id)
        session.expiresAt = renewedExpiry
        session.revision += 1
        session.updatedAt = at
        await repository.saveSession(session)
        await appendSessionAudit(repository, session, "renew", access, at, {
          extendBySeconds: input.extendBySeconds,
        })
        const outcome: BookingSessionOutcomeV1 = {
          kind: "session_renewed",
          session: serializeSession(session, undefined, access),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async updateSession(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx, lockedSession) => {
        const session = lockedSession === undefined ? await loadSession(sessionId) : lockedSession
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
        const reselectingWhilePaying = await rejectWhilePaymentInFlight(session)
        if (reselectingWhilePaying) {
          return completeAndReturn(repository, claim.id, reselectingWhilePaying)
        }
        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        session.statePayload = statePayload
        session.revision += 1
        session.updatedAt = at
        await supersedeActiveQuotes(repository, session.id)
        await repository.saveSession(session)
        await appendSessionAudit(repository, session, "update", access, at)
        const outcome: BookingSessionOutcomeV1 = {
          kind: "session_updated",
          session: serializeSession(session, await sessionRequirements(session, at, tx), access),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async quoteSession(sessionId, input, access) {
      return repository.withSessionTransaction(sessionId, async (tx, lockedSession) => {
        const session = lockedSession === undefined ? await loadSession(sessionId) : lockedSession
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

        const quotingWhilePaying = await rejectWhilePaymentInFlight(session)
        if (quotingWhilePaying) return completeAndReturn(repository, claim.id, quotingWhilePaying)

        await releaseLiveHolds(repository, options.ports, session, access, at, tx)
        await supersedeActiveQuotes(repository, session.id)

        const composed = await options.ports.composeQuote({ session, now: at, tx })
        if (composed.status === "unavailable") {
          return completeAndReturn(repository, claim.id, quoteUnavailable(composed))
        }
        const { pricing, requirements } = composed
        // Validate before persisting a Quote: an incomplete selection is the
        // host's to fix, and it learns here rather than at commit, when the
        // buyer has already paid attention to a price.
        const unsatisfied = validateSelectionAgainstRequirements(requirements, session.statePayload)
        if (unsatisfied.length > 0) {
          return completeAndReturn(repository, claim.id, selectionIncomplete(unsatisfied))
        }
        const quote: BookingQuoteInternalRecord = {
          id: newId("booking_session_quotes"),
          sessionId,
          sessionRevision: session.revision,
          state: "active",
          requirements,
          pricing,
          priceFingerprint: await priceFingerprint(pricing),
          requirementsFingerprint: await stableFingerprint(requirements),
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
          session: serializeSession(session, requirements, access),
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

        const holdingWhilePaying = await rejectWhilePaymentInFlight(session)
        if (holdingWhilePaying) return completeAndReturn(repository, claim.id, holdingWhilePaying)

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
          // A caller that names no quantity is holding for the party the
          // Session is already for. Defaulting to a literal `1` here made
          // every multi-traveler checkout unholdable (voyant#4655).
          quantity: input.quantity ?? partySizeFromSelection(session.statePayload),
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
              // Not `request_new_hold`: the quantity is derived, so an
              // identical retry is rejected identically and the client spins.
              // `expectedQuantity` is the value to hold instead — or the
              // caller changes the Session's pax and takes a fresh Quote.
              nextAction: "request_hold_for_expected_quantity",
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
          session: serializeSession(session, undefined, access),
          hold: serializeHold(hold, access),
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
          session: serializeSession(session, undefined, access),
        }
        await repository.completeOperation({ id: claim.id, outcome })
        return outcome
      })
    },

    async commitSession(sessionId, input, access) {
      // Finishing a Commit whose money already landed, rather than starting
      // one. What the shopper's Session looks like *now* is not evidence about
      // a payment that was captured against how it looked then — see
      // `loadSettledQuote` and voyant#4636.
      const settling = access.settlementAuthority?.admitted === true
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
        // The revision guards the shopper against committing a Session that
        // moved under them. A settlement is not the shopper and has nothing to
        // be protected from: the revision it read is stale by design, because
        // the shopper went on quoting while the processor held the money.
        const revisionRejected = settling ? null : rejectRevision(input.expectedRevision, session)
        if (revisionRejected) return { status: "outcome" as const, outcome: revisionRejected }

        const quote = settling
          ? await loadSettledQuote(repository, input.quoteId, session)
          : durableContinuation
            ? await loadPersistedSourcedQuote(repository, input.quoteId, session)
            : await loadUsableQuote(repository, input.quoteId, session, at)
        if (quote === "expired" || quote === "superseded") {
          if (!settling) await releaseLiveHolds(repository, options.ports, session, access, at, tx)
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
          if (!settling) await releaseLiveHolds(repository, options.ports, session, access, at, tx)
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

        const checkoutIntent: BookingCheckoutIntentV1 = input.checkoutIntent ?? "card"
        if (!quote.requirements.paymentIntents.includes(checkoutIntent)) {
          return {
            status: "outcome" as const,
            outcome: {
              kind: "rejected",
              error: {
                kind: "checkout_intent_not_offered",
                checkoutIntent,
                offeredCheckoutIntents: quote.requirements.paymentIntents,
                nextAction: "select_supported_checkout_intent",
              },
            } as const,
          }
        }

        let hold = input.holdId
          ? settling
            ? await loadSettledHold(repository, input.holdId, session, quote, at)
            : durableContinuation
              ? await loadPersistedSourcedHold(repository, input.holdId, session, quote)
              : await loadUsableHold(repository, input.holdId, session, quote, at)
          : null
        const holdRequired =
          session.target.kind === "product" || session.target.kind === "owned_entity"
        // A Hold this Commit was meant to have and no longer does. Two ways to
        // be meant to have one: the target always needs it, or the request
        // named a Hold that no live loader would accept.
        //
        // The second half is not redundant. An aggregate target is not in
        // `holdRequired` — plenty of Trips carry no owned capacity — but one
        // that does carry it is refused `hold_failure: missing` by the
        // composite handler, and a `released` Hold reads back as `null` rather
        // than `"expired"`. Keying only off `holdRequired` therefore skipped
        // the retake for exactly the composite Bookings that needed it.
        const settlementHoldLost =
          hold === "expired" || (!hold && (input.holdId !== undefined || holdRequired))
        // A settlement whose Hold is gone asks inventory for the capacity again
        // rather than refusing on the strength of a missing token.
        //
        // The Hold is a client-minted reservation, and a shopper cannot keep
        // one alive across a processor: the tab sleeps, 3-D Secure adds
        // minutes, the client re-quotes and supersedes its own Hold six seconds
        // after taking it. Every one of those lands as `hold_failure` against a
        // commit the server is running on its own authority, for money that has
        // already moved (voyant#4692). Nothing here needs the token — it needs
        // the seat, and whether the seat is there is a question inventory can
        // answer now.
        //
        // Not on a durable continuation: there the supplier is holding the
        // inventory and the Session's Hold is not what the Commit rests on, so
        // taking local capacity would reserve a second seat for one booking.
        if (settling && !durableContinuation && settlementHoldLost) {
          const reheld = await reestablishSettlementHold({
            repository,
            ports: options.ports,
            session,
            quote,
            previousHoldId: input.holdId,
            access,
            at,
            holdTtlMs,
            tx,
          })
          if (reheld === "unavailable") {
            return {
              status: "outcome" as const,
              outcome: {
                kind: "commit_result",
                outcome: {
                  kind: "hold_failure",
                  nextAction: "request_new_hold",
                  reason: "capacity_unavailable",
                },
              } as const,
            }
          }
          hold = reheld
        }
        if (hold === "expired" || (!hold && holdRequired)) {
          if (!settling) await releaseLiveHolds(repository, options.ports, session, access, at, tx)
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

        // Both skip the re-quote below, for the same reason: the price this
        // Commit rests on was already settled elsewhere — by the supplier for a
        // durable continuation, by the shopper's captured payment for a
        // settlement — so re-deriving it can only invent a disagreement.
        if (durableContinuation || settling) {
          return { status: "ready" as const, session, quote, hold, at, checkoutIntent }
        }

        const freshQuote = await options.ports.composeQuote({ session, now: at, tx })
        if (freshQuote.status === "unavailable") {
          quote.state = "superseded"
          await repository.saveQuote(quote)
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return { status: "outcome" as const, outcome: quoteUnavailable(freshQuote) }
        }
        if ((await priceFingerprint(freshQuote.pricing)) !== quote.priceFingerprint) {
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
        // Requirements are checked exactly the way the price is: re-derive,
        // compare against what the client rendered, and refuse rather than
        // book something collected against a descriptor that has moved.
        const freshRequirementsFingerprint = await stableFingerprint(freshQuote.requirements)
        if (
          freshRequirementsFingerprint !== quote.requirementsFingerprint ||
          freshRequirementsFingerprint !== input.requirementsFingerprint
        ) {
          quote.state = "superseded"
          await repository.saveQuote(quote)
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return {
            status: "outcome" as const,
            outcome: {
              kind: "rejected",
              error: {
                kind: "requirements_changed",
                requirementsFingerprint: freshRequirementsFingerprint,
                nextAction: "request_fresh_quote",
              },
            } as const,
          }
        }
        // Server-authoritative: never trust that the client quoted first, and
        // never let a Booking, Allocation, or supplier operation exist on the
        // far side of a selection that does not answer the descriptor.
        const unsatisfied = validateSelectionAgainstRequirements(
          freshQuote.requirements,
          session.statePayload,
        )
        if (unsatisfied.length > 0) {
          await releaseLiveHolds(repository, options.ports, session, access, at, tx)
          return { status: "outcome" as const, outcome: selectionIncomplete(unsatisfied) }
        }
        return { status: "ready" as const, session, quote, hold, at, checkoutIntent }
      })
      if (preflight.status === "outcome") return preflight.outcome

      const { session, quote, hold, at, checkoutIntent } = preflight
      const commitInput: CommitBookingSessionV1 = { ...input, checkoutIntent }

      let preparedPayment: Awaited<ReturnType<BookingSessionPaymentPorts["prepare"]>>
      try {
        preparedPayment = options.ports.payments
          ? await options.ports.payments.prepare({
              session,
              quote,
              ...(hold ? { hold } : {}),
              commit: commitInput,
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
            checkoutIntent,
            nextAction: "establish_payment_guarantee",
            paymentTarget: "booking_session",
            allowedGuarantees: preparedPayment.allowedGuarantees,
            paymentSession: preparedPayment.paymentSession,
          },
        }
      }
      const paymentSessionId =
        preparedPayment.kind === "established" ? preparedPayment.paymentSessionId : undefined

      const requestFingerprint = await commitRequestFingerprint(commitInput)
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
                input: commitInput,
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
          const persistedCommit = await repository.getCommitByIdempotency(
            session.id,
            commitInput.idempotencyKey,
          )
          if (persistedCommit) {
            return { kind: "commit_result", outcome: persistedCommit.outcome }
          }
          return {
            kind: "commit_result",
            outcome: {
              kind: "component_bookings_committed",
              nextAction: "none",
              checkoutIntent,
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
                input: commitInput,
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
                input: commitInput,
                requestFingerprint,
                bookingId,
                allocationIds,
                // Never for a settlement: the shopper is still quoting behind
                // this Commit, so re-deriving inside the transaction supersedes
                // the very Quote the money was collected for (voyant#4636).
                recomposeQuote: !settling,
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
        checkoutIntent,
        booking: { id: committed.bookingId, status: "confirmed" },
        allocationIds: committed.allocationIds,
        consumedSessionId: session.id,
        consumedQuoteId: quote.id,
        ...(hold ? { convertedHoldId: hold.id } : {}),
        ...(committed.supplierOperationId
          ? { supplierOperationId: committed.supplierOperationId }
          : {}),
      }
      const persistedCommit = await repository.getCommitByIdempotency(
        session.id,
        commitInput.idempotencyKey,
      )
      return { kind: "commit_result", outcome: persistedCommit?.outcome ?? outcome }
    },

    async commitPaidSession({ bookingSessionId, paymentSessionId }) {
      const existingCommit = await repository.getCommitForSession(bookingSessionId)
      if (existingCommit) return { bookingId: bookingIdFromCommit(existingCommit) }

      const session = await repository.getSession(bookingSessionId)
      if (!session) throw new Error("booking_session_settlement_session_not_found")

      // What the money was actually collected for. Asking the Session for its
      // one active Quote answers a different question — "what is this shopper
      // looking at now" — and a shopper parked on a "confirming" screen goes on
      // refreshing, so by the time a callback lands the active Quote is one the
      // processor never saw, and the paid Quote has been superseded behind it
      // (voyant#4636). Fall back to the active Quote only when the payment does
      // not record one.
      const established = await options.ports.payments?.describeEstablished?.({ paymentSessionId })
      const settledQuote = established?.quoteId
        ? await repository.getQuote(established.quoteId)
        : null
      if (established?.quoteId && settledQuote?.sessionId !== bookingSessionId) {
        throw new Error(`booking_session_settlement_quote_not_found:${established.quoteId}`)
      }

      let quote = settledQuote
      let holdId = settledQuote ? (established?.holdId ?? null) : null
      if (!quote) {
        const quotes = await repository.listActiveQuotes(bookingSessionId)
        if (quotes.length !== 1) {
          throw new Error(`booking_session_settlement_expected_one_quote:${quotes.length}`)
        }
        quote = quotes[0]!
      }
      // A recorded Quote with no recorded Hold does not mean there is no Hold.
      // `prepare` writes the pair from the Commit it was called on, and reuses
      // an existing payment row for the same idempotency key without rewriting
      // its metadata — so a checkout that reached `prepare` before taking its
      // Hold records the Quote alone, permanently. Settlement then passed no
      // `holdId` at all and was refused `hold_failure: missing` against a Hold
      // that was active, unexpired, correctly sized and bound to this very
      // Quote (voyant#4692).
      //
      // Bounded by the Quote, not just the Session: the live Hold counts as
      // what the money bought only if it reserves capacity for the Quote the
      // money was collected against.
      const settlingQuoteId = quote.id
      if (!holdId) {
        const holds = (await repository.listActiveHolds(bookingSessionId)).filter(
          (hold) => hold.quoteId === settlingQuoteId,
        )
        if (holds.length > 1) {
          throw new Error(`booking_session_settlement_expected_at_most_one_hold:${holds.length}`)
        }
        holdId = holds[0]?.id ?? null
      }

      const access: BookingSessionAccessContext = {
        actorKind: session.actorKind,
        settlementAuthority: {
          admitted: true,
          reason: "paid booking session settlement",
          paymentSessionId,
        },
      }
      const outcome = await bookingSessionModule.commitSession(
        bookingSessionId,
        {
          expectedRevision: session.revision,
          quoteId: quote.id,
          requirementsFingerprint: quote.requirementsFingerprint,
          ...(holdId ? { holdId } : {}),
          idempotencyKey: `payment-settlement:${paymentSessionId}`,
        },
        access,
      )
      const committed = settlementBookingId(outcome)
      if (committed) return { bookingId: committed }

      // A shopper may win the commit race under another idempotency key.
      const concurrentCommit = await repository.getCommitForSession(bookingSessionId)
      if (concurrentCommit) return { bookingId: bookingIdFromCommit(concurrentCommit) }

      const failure = `booking_session_settlement_commit_rejected:${settlementFailure(outcome)}`
      if (!settlementRefusalIsFinal(outcome)) throw new Error(failure)

      // A verdict, not a blip. Retrying it produces the same verdict seven more
      // times over roughly three quarters of an hour, and the eighth attempt's
      // message is the one that survives in `last_error` — which is how a
      // post-mortem ends up unable to say whether the first attempt failed for
      // the same reason as the last (voyant#4692). Declaring it permanent
      // dead-letters on the spot, so the stranded-payment staff alert fires
      // with this verdict rather than a later one.
      await repository.withSessionTransaction(bookingSessionId, async (tx) => {
        const current = await repository.getSession(bookingSessionId)
        if (current?.state !== "active") return
        // The one point at which releasing is right. voyant#4636 forbids it on
        // the retry path because the next attempt still needs the Hold; there
        // is no next attempt here, and a Hold left `active` with a null
        // `released_at` reserves capacity that only expiry will reclaim.
        await releaseLiveHolds(repository, options.ports, current, access, now(), tx)
      })
      throw new PermanentSubscriberError(failure)
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

  // Unbound is the default and costs nothing: no wrapper, no allocation, no
  // behavioural difference from before the port existed.
  return options.analytics
    ? withBookingSessionAnalytics(bookingSessionModule, {
        analytics: createSafeAnalytics(options.analytics),
        ...(options.analyticsClock ? { clock: options.analyticsClock } : {}),
      })
    : bookingSessionModule
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
  await input.repository.withTransactionContext(input.tx, async () => {
    const currentAt = input.now()
    const currentSession = await input.repository.getSession(input.session.id)
    // Re-read under the same rule the preflight used. The rows are re-loaded
    // here because they can move between the two, which for a settlement is
    // exactly what happens — and exactly what must not reject it (voyant#4636).
    const settling = input.access.settlementAuthority?.admitted === true
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
    const currentQuote = settling
      ? await loadSettledQuote(input.repository, input.quote.id, currentSession)
      : persistedSourcedCommit
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
      const loaded = settling
        ? await loadSettledHold(
            input.repository,
            input.hold.id,
            currentSession,
            currentQuote,
            currentAt,
          )
        : persistedSourcedCommit
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
      // Both fingerprints are re-checked inside the commit transaction, not
      // only in the preflight: the descriptor can move between the two the
      // same way the price can, and a Quote whose requirements changed is as
      // superseded as one whose price did.
      if (
        currentQuoteResult.status === "unavailable" ||
        (await priceFingerprint(currentQuoteResult.pricing)) !== currentQuote.priceFingerprint ||
        (await stableFingerprint(currentQuoteResult.requirements)) !==
          currentQuote.requirementsFingerprint
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
    const bankTransfer =
      input.input.checkoutIntent === "bank_transfer"
        ? await input.ports.payments?.establishBankTransfer?.({
            tx: input.tx,
            session: currentSession,
            quote: currentQuote,
            commit: input.input,
            access: input.access,
            bookingId: input.bookingId,
            now: currentAt,
          })
        : undefined
    const outcome: BookingLifecycleCommitOutcomeV1 = {
      kind: "committed",
      nextAction: "none",
      checkoutIntent: input.input.checkoutIntent,
      ...(bankTransfer ? { bankTransfer } : {}),
      booking: { id: input.bookingId, status: "confirmed" },
      allocationIds: input.allocationIds,
      consumedSessionId: input.session.id,
      consumedQuoteId: input.quote.id,
      ...(input.hold ? { convertedHoldId: input.hold.id } : {}),
      ...(input.supplierOperationId ? { supplierOperationId: input.supplierOperationId } : {}),
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
      ...(settling ? { settling } : {}),
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
  await input.repository.withTransactionContext(input.tx, async () => {
    const currentAt = input.now()
    const currentSession = await input.repository.getSession(input.session.id)
    // Same rule as the single-Booking path: a settlement re-reads the rows the
    // payment names, not the ones the shopper has moved on to (voyant#4636).
    const settling = input.access.settlementAuthority?.admitted === true
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
    const currentQuote = settling
      ? await loadSettledQuote(input.repository, input.quote.id, currentSession)
      : continuing
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
      ? settling
        ? await loadSettledHold(
            input.repository,
            input.hold.id,
            currentSession,
            currentQuote,
            currentAt,
          )
        : continuing
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
    const bankTransfer =
      input.input.checkoutIntent === "bank_transfer"
        ? await input.ports.payments?.establishBankTransfer?.({
            tx: input.tx,
            session: currentSession,
            quote: currentQuote,
            commit: input.input,
            access: input.access,
            bookingId: primary.bookingId,
            now: currentAt,
          })
        : undefined
    const outcome: BookingLifecycleCommitOutcomeV1 = {
      kind: "component_bookings_committed",
      nextAction: "none",
      checkoutIntent: input.input.checkoutIntent,
      ...(bankTransfer ? { bankTransfer } : {}),
      bookings: input.bookings.map((booking) => ({
        componentId: booking.componentId,
        bookingId: booking.bookingId,
        status: "confirmed",
        allocationIds: booking.allocationIds,
        ...(booking.supplierOperationId
          ? { supplierOperationId: booking.supplierOperationId }
          : {}),
      })),
      consumedSessionId: input.session.id,
      consumedQuoteId: input.quote.id,
      ...(input.hold ? { convertedHoldId: input.hold.id } : {}),
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
      ...(settling ? { settling } : {}),
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

/**
 * One rejection shape for both call sites. The quote path and the commit path
 * run the same validator and return the same typed outcome — two of either
 * would recreate the drift #4188 closes.
 */
function selectionIncomplete(
  unsatisfied: readonly UnsatisfiedRequirementV1[],
): BookingSessionOutcomeV1 {
  return {
    kind: "rejected",
    error: {
      kind: "selection_incomplete",
      unsatisfied: [...unsatisfied],
      nextAction: "update_selection",
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

async function supersedeActiveQuotes(
  repository: BookingSessionRepository,
  sessionId: string,
): Promise<void> {
  if (repository.supersedeActiveQuotes) {
    await repository.supersedeActiveQuotes(sessionId)
    return
  }
  for (const quote of await repository.listActiveQuotes(sessionId)) {
    quote.state = "superseded"
    await repository.saveQuote(quote)
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
  // A failed settlement leaves the Session exactly as it found it. Tearing the
  // Quote and Holds down is the right response to a shopper whose Commit was
  // refused — they will quote again — but a settlement has already taken the
  // money, and this runs on a retry path: the first attempt would strip the
  // Hold the payment was collected for, and every retry after it would then
  // fail for a second, self-inflicted reason (voyant#4636).
  if (access.settlementAuthority?.admitted) return
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

/**
 * Take the capacity a captured payment was collected for, when the Hold that
 * reserved it is no longer live.
 *
 * Only ever called with `settlementAuthority` and only after every live loader
 * has refused the recorded Hold. What that leaves is either a Hold an earlier
 * attempt of this same chain took — reused as-is — or Holds that cannot be
 * reserving this Commit's seat, which are released so they do not block the
 * retake. voyant#4636's rule therefore stands unchanged: a settlement still
 * never releases a Hold it could have used.
 *
 * The quantity comes from the Hold that is gone wherever there is one, because
 * that is the party the shopper actually paid for; the Session's current
 * selection is only the fallback. A port that rejects the quantity is answering
 * the same question as one that rejects the capacity — settlement could not
 * secure what the money bought — so both come back as `unavailable` and both
 * end as `capacity_unavailable`.
 */
async function reestablishSettlementHold(input: {
  repository: BookingSessionRepository
  ports: BookingSessionModulePorts
  session: BookingSessionInternalRecord
  quote: BookingQuoteInternalRecord
  previousHoldId: string | undefined
  access: BookingSessionAccessContext
  at: Date
  holdTtlMs: number
  tx: unknown
}): Promise<BookingHoldInternalRecord | "unavailable"> {
  const { repository, ports, session, quote, access, at, tx } = input
  // Settlement is a retry chain, and every attempt arrives with the same
  // recorded (stale) Hold id. Without this first pass, the second attempt would
  // ask for capacity the first attempt is already holding and be told there is
  // none — reporting `capacity_unavailable` for a seat it reserved itself.
  //
  // Nothing usable can be found here by accident: the loaders above already
  // refused the recorded Hold, so a live Hold bound to this Quote is one an
  // earlier attempt took.
  const live = await repository.listActiveHolds(session.id)
  const reusable = live.find((existing) => existing.quoteId === quote.id && existing.expiresAt > at)
  if (reusable) return reusable
  // What is left cannot be reserving the seat this Commit needs: it is lapsed,
  // or it belongs to a Quote the shopper took after the one the money was
  // collected against. Left in place it blocks the retake and then reads back
  // as "there is no capacity", which is the one verdict that may strand a
  // payment. voyant#4636's rule is unchanged — a settlement still never
  // releases a Hold it could have used.
  for (const stale of live) {
    await ports.releaseCapacityHold({ session, hold: stale, access, now: at, tx })
    stale.state = stale.expiresAt <= at ? "expired" : "released"
    await repository.saveHold(stale)
  }
  const previous = input.previousHoldId ? await repository.getHold(input.previousHoldId) : null
  const hold: BookingHoldInternalRecord = {
    id: newId("booking_session_holds"),
    sessionId: session.id,
    quoteId: quote.id,
    target: session.target,
    quantity:
      previous?.sessionId === session.id
        ? previous.quantity
        : partySizeFromSelection(session.statePayload),
    state: "active",
    capacityKey: capacityKeyForTarget(session.target),
    expiresAt: new Date(at.getTime() + input.holdTtlMs),
    createdAt: at,
  }
  const held = await ports.placeCapacityHold({
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
  if (held !== "held") return "unavailable"
  await repository.saveHold(hold)
  // Recorded as a Hold the system took, not the shopper: the operations log is
  // where a post-mortem reconstructs what happened between capture and commit,
  // and a Hold appearing there with no explanation is exactly the gap
  // voyant#4692 had to reason around.
  await appendSessionAudit(repository, session, "hold", access, at, {
    holdId: hold.id,
    quoteId: quote.id,
    reason: "settlement_reestablished",
    ...(input.previousHoldId ? { previousHoldId: input.previousHoldId } : {}),
    ...(previous ? { previousHoldState: previous.state } : {}),
  })
  return hold
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
    // Part of what the request asked for: replaying an idempotency key against
    // a different descriptor is a different Commit, not a replay of the first.
    requirementsFingerprint: input.requirementsFingerprint,
    // Omission is the v1 compatibility spelling of card. Fingerprint the
    // resolved meaning so omitted and explicit card replay, while a different
    // shopper choice conflicts before any payment or booking side effect.
    checkoutIntent: input.checkoutIntent ?? "card",
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

function settlementBookingId(outcome: BookingSessionOutcomeV1): string | null {
  if (outcome.kind !== "commit_result") return null
  const result =
    outcome.outcome.kind === "idempotent_replay" ? outcome.outcome.originalOutcome : outcome.outcome
  if (result.kind === "committed") return result.booking.id
  if (result.kind === "component_bookings_committed") {
    return result.bookings[0]?.bookingId ?? null
  }
  return null
}

function bookingIdFromCommit(commit: BookingCommitInternalRecord): string {
  if (!commit.bookingId) throw new Error("booking_session_settlement_commit_missing_booking")
  return commit.bookingId
}

/**
 * The verdict, as an operator has to read it off a dead-lettered outbox row.
 *
 * Carries the reason where there is one. `hold_failure` alone cannot be acted
 * on — it is the same string whether the seat is gone or a token merely lapsed,
 * and those need opposite responses (voyant#4692).
 */
function settlementFailure(outcome: BookingSessionOutcomeV1): string {
  if (outcome.kind === "rejected") return outcome.error.kind
  if (outcome.kind !== "commit_result") return outcome.kind
  const result = outcome.outcome
  return "reason" in result && typeof result.reason === "string"
    ? `${result.kind}:${result.reason}`
    : result.kind
}

/**
 * Whether this refusal is the settlement chain's answer rather than a step in
 * it.
 *
 * Default is "no", so anything unclassified keeps today's behaviour and retries
 * — the safe direction, because retrying a transient failure costs a delay and
 * abandoning one loses a booking. What is listed here is refused by re-reading
 * durable state that no later attempt changes: a Quote does not un-expire, a
 * consumed Session does not reopen, and a `capacity_unavailable` verdict was
 * already the answer to "ask inventory again", which is the whole of what a
 * retry would do.
 *
 * Supplier outcomes are deliberately absent: `supplier_pending` and
 * `supplier_in_doubt` are commits still underway, and reconciliation — not this
 * subscriber — decides how they end.
 */
function settlementRefusalIsFinal(outcome: BookingSessionOutcomeV1): boolean {
  if (outcome.kind === "commit_result") {
    return (
      outcome.outcome.kind === "hold_failure" ||
      outcome.outcome.kind === "quote_failure" ||
      outcome.outcome.kind === "revision_mismatch" ||
      outcome.outcome.kind === "proposal_acceptance_required"
    )
  }
  if (outcome.kind !== "rejected") return false
  switch (outcome.error.kind) {
    case "session_expired":
    case "session_consumed":
    case "not_authorized":
    case "checkout_intent_not_offered":
    case "idempotency_conflict":
    case "invalid_selection":
    case "selection_incomplete":
    case "commit_rejected":
      return true
    default:
      return false
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

/**
 * The Quote a captured payment is settled against.
 *
 * Deliberately blind to `superseded` and to the Session revision, which the two
 * live loaders both refuse. Neither says anything about this Quote: a shopper
 * left on a "confirming" screen keeps refreshing, and every refresh supersedes
 * the Quote behind them and bumps the revision. The row that was superseded is
 * still the row the money was collected for, and its price is not in question —
 * `prepare` already re-checked the captured amount against it before admitting
 * the settlement (voyant#4636).
 *
 * Still refuses a Quote belonging to another Session, and still refuses an
 * `expired` one: a Quote that timed out before the money arrived is a real
 * failure to surface, not a race to absorb.
 */
async function loadSettledQuote(
  repository: BookingSessionRepository,
  quoteId: string,
  session: BookingSessionInternalRecord,
): Promise<BookingQuoteInternalRecord | "expired" | null> {
  const quote = await repository.getQuote(quoteId)
  if (!quote || quote.sessionId !== session.id) return null
  if (quote.state === "expired") return "expired"
  return quote
}

/**
 * The Hold a captured payment is settled against. Same reasoning as
 * {@link loadSettledQuote} for the Quote binding: the Hold was taken against
 * the Quote the shopper paid for, which by settlement time is no longer the
 * Session's newest. An inactive Hold is still refused — capacity is the one
 * thing settlement may not assume.
 */
async function loadSettledHold(
  repository: BookingSessionRepository,
  holdId: string,
  session: BookingSessionInternalRecord,
  quote: BookingQuoteInternalRecord,
  now: Date,
): Promise<BookingHoldInternalRecord | "expired" | null> {
  const hold = await repository.getHold(holdId)
  if (!hold || hold.sessionId !== session.id || hold.quoteId !== quote.id) return null
  if (hold.state !== "active") return hold.state === "expired" ? "expired" : null
  return hold.expiresAt <= now ? "expired" : hold
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
  access?: BookingSessionAccessContext,
): BookingSessionRecordV1 {
  const redactComposite = session.target.kind === "trip_snapshot" && access?.actorKind !== "staff"
  return {
    id: session.id,
    target: redactComposite ? { kind: "managed_itinerary" } : session.target,
    ...(session.origin && !redactComposite ? { origin: session.origin } : {}),
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
  const record = serializeSession(session, requirements, access)
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
    requirementsFingerprint: quote.requirementsFingerprint,
    pricing: quote.pricing,
    quotedAt: quote.quotedAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
  }
}

function serializeHold(
  hold: BookingHoldInternalRecord,
  access: BookingSessionAccessContext,
): BookingHoldRecordV1 {
  return {
    id: hold.id,
    sessionId: hold.sessionId,
    quoteId: hold.quoteId,
    target:
      hold.target.kind === "trip_snapshot" && access.actorKind !== "staff"
        ? { kind: "managed_itinerary" }
        : hold.target,
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
  if (access.settlementAuthority?.admitted && action === "commit") return null
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
    actorKind: access.settlementAuthority?.admitted ? "system" : access.actorKind,
    principalId: access.principalId,
    organizationId: access.organizationId,
    authorityReason: access.settlementAuthority?.reason ?? access.staffAuthority?.reason,
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

/**
 * The fingerprint that decides whether a Quote's price still stands.
 *
 * One function rather than three call sites hashing `pricing` directly, because
 * the value is written once at quote time and compared twice at commit — in the
 * preflight and again inside the commit transaction — and a normalization
 * applied to some of those but not all is the same outage in a subtler form.
 *
 * See `priceFingerprintInput` for what it deliberately does not depend on.
 */
async function priceFingerprint(pricing: unknown): Promise<string> {
  return stableFingerprint(priceFingerprintInput(pricing))
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
