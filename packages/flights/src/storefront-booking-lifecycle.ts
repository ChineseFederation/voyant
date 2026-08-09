import type { FlightAdapterContext, FlightConnectorAdapter } from "./contract/adapter.js"
import type {
  AncillarySelection,
  FlightOffer,
  FlightOrder,
  FlightPassenger,
} from "./contract/types.js"
import { FLIGHT_CAPABILITIES } from "./contract/types.js"
import type {
  AdmittedFlightShoppingSource,
  FlightStorefrontShoppingContext,
} from "./runtime-port.js"

const DEFAULT_PRICE_LOCK_TTL_MS = 10 * 60_000

/** Exact server-only authority sealed into a Storefront opaque offer ref. */
export interface BoundStorefrontFlightOffer {
  authority: FlightStorefrontShoppingContext
  connectionId: string
  offer: FlightOffer
  revision: number
}

export interface StorefrontFlightPriceLock extends BoundStorefrontFlightOffer {
  pricedAt: string
  expiresAt: string
}

export interface StorefrontFlightHold {
  authority: FlightStorefrontShoppingContext
  connectionId: string
  offerId: string
  orderId: string
  revision: number
  expiresAt: string
}

export type StorefrontFlightHoldOutcome =
  | { kind: "held"; hold: StorefrontFlightHold; order: FlightOrder }
  | { kind: "compensated"; reason: string }
  | { kind: "in_doubt"; operationId: string; reason: string }

export type StorefrontFlightCommitOutcome =
  | { kind: "committed"; order: FlightOrder }
  | { kind: "in_doubt"; operationId: string; reason: string }

export type StorefrontFlightMutationOutcome =
  | StorefrontFlightHoldOutcome
  | StorefrontFlightCommitOutcome

export interface StorefrontFlightOperationClaimInput {
  operation: "hold" | "commit"
  storefrontId: string
  channelId: string
  idempotencyKey: string
  requestFingerprint: string
}

export type StorefrontFlightOperationClaim =
  | { status: "claimed"; operationId: string }
  | { status: "replay"; outcome: StorefrontFlightMutationOutcome }
  | { status: "conflict" }
  | { status: "in_progress"; operationId: string }

/**
 * Durable server-owned operation store. Implementations must atomically claim
 * `(storefront, channel, operation, idempotencyKey)` and persist the exact
 * fingerprint before any supplier call.
 */
export interface StorefrontFlightOperationStore {
  claim(input: StorefrontFlightOperationClaimInput): Promise<StorefrontFlightOperationClaim>
  complete(operationId: string, outcome: StorefrontFlightMutationOutcome): Promise<void>
  markInDoubt(
    operationId: string,
    outcome: Extract<StorefrontFlightMutationOutcome, { kind: "in_doubt" }>,
  ): Promise<void>
}

export interface ProviderFirstFlightBookingLifecycleOptions {
  /** Revalidate active storefront, channel, market, locale, and currency. */
  assertActiveStorefrontScope(context: FlightStorefrontShoppingContext): Promise<void>
  listAdmittedShoppingSources(
    context: FlightStorefrontShoppingContext,
  ): Promise<readonly AdmittedFlightShoppingSource[]>
  operations: StorefrontFlightOperationStore
  now?: () => Date
  priceLockTtlMs?: number
}

export interface ProviderFirstFlightBookingLifecycle {
  requote(input: {
    context: FlightStorefrontShoppingContext
    binding: BoundStorefrontFlightOffer
    expectedRevision: number
  }): Promise<StorefrontFlightPriceLock>
  hold(input: {
    context: FlightStorefrontShoppingContext
    lock: StorefrontFlightPriceLock
    expectedRevision: number
    idempotencyKey: string
    passengers: FlightPassenger[]
    contact?: { email?: string; phone?: string }
    ancillaries?: AncillarySelection
  }): Promise<StorefrontFlightHoldOutcome>
  commit(input: {
    context: FlightStorefrontShoppingContext
    hold: StorefrontFlightHold
    expectedRevision: number
    idempotencyKey: string
  }): Promise<StorefrontFlightCommitOutcome>
}

/**
 * Closed provider-first lifecycle for Storefront flight offers.
 *
 * This is not an HTTP API and accepts no provider, connection, payment, or
 * booking-engine selector. Callers must resolve an opaque ref into the bound
 * objects above on the server. Catalog Booking Sessions remain the general
 * booking/payment commitment authority; this seam only performs the flight
 * supplier operations they cannot model as indexed Catalog inventory.
 */
export function createProviderFirstFlightBookingLifecycle(
  options: ProviderFirstFlightBookingLifecycleOptions,
): ProviderFirstFlightBookingLifecycle {
  const now = options.now ?? (() => new Date())
  const priceLockTtlMs = options.priceLockTtlMs ?? DEFAULT_PRICE_LOCK_TTL_MS

  return {
    async requote(input) {
      assertAuthority(input.context, input.binding.authority)
      assertRevision(input.expectedRevision, input.binding.revision)
      assertNotExpired(input.binding.offer.expiresAt, now(), "flight_offer_expired")
      const source = await resolveAdmittedSource(options, input.context, input.binding.connectionId)
      const response = await source.adapter.priceOffer(sourceContext(source), {
        offerId: input.binding.offer.offerId,
        offer: input.binding.offer,
      })
      if (!response.valid) {
        throw new StorefrontFlightLifecycleError(
          "flight_offer_unavailable",
          response.invalidReason ?? "Provider rejected the selected flight offer.",
        )
      }
      if (response.offer.offerId !== input.binding.offer.offerId) {
        throw new StorefrontFlightLifecycleError(
          "flight_offer_identity_changed",
          "Provider changed the selected offer identity while repricing.",
        )
      }
      const pricedAt = now()
      const expiresAt = boundedExpiry(
        pricedAt,
        priceLockTtlMs,
        response.offer.expiresAt,
        "flight_price_lock_expired",
      )
      return {
        authority: input.binding.authority,
        connectionId: input.binding.connectionId,
        offer: response.offer,
        revision: input.binding.revision + 1,
        pricedAt: pricedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }
    },

    async hold(input) {
      assertAuthority(input.context, input.lock.authority)
      assertRevision(input.expectedRevision, input.lock.revision)
      assertNotExpired(input.lock.expiresAt, now(), "flight_price_lock_expired")
      const source = await resolveAdmittedSource(options, input.context, input.lock.connectionId)
      requireHoldCapability(source.adapter)
      const fingerprint = await stableFingerprint({
        authority: input.lock.authority,
        connectionId: input.lock.connectionId,
        offer: input.lock.offer,
        revision: input.lock.revision,
        passengers: input.passengers,
        contact: input.contact,
        ancillaries: input.ancillaries,
      })
      const claim = await options.operations.claim({
        operation: "hold",
        storefrontId: input.context.storefrontId,
        channelId: input.context.channelId,
        idempotencyKey: requiredKey(input.idempotencyKey),
        requestFingerprint: fingerprint,
      })
      const replay = mutationClaimOutcome<StorefrontFlightHoldOutcome>(claim)
      if (replay) return replay
      const operationId = claimedOperationId(claim)

      const adapterContext = sourceContext(source, input.idempotencyKey)
      let order: FlightOrder
      try {
        order = (
          await source.adapter.bookFlight(adapterContext, {
            offerId: input.lock.offer.offerId,
            offer: input.lock.offer,
            passengers: input.passengers,
            ...(input.contact ? { contact: input.contact } : {}),
            ...(input.ancillaries ? { ancillaries: input.ancillaries } : {}),
            paymentIntent: { type: "hold" },
          })
        ).order
      } catch (error) {
        const reason = safeErrorClass(error)
        const outcome = { kind: "in_doubt", operationId, reason } as const
        await options.operations.markInDoubt(operationId, outcome)
        return outcome
      }

      const deadline = order.paymentDeadline
      if (order.status !== "confirmed" || !deadline || isExpired(deadline, now())) {
        const compensated = await compensateHold(source, adapterContext, order.orderId)
        const outcome: StorefrontFlightHoldOutcome = compensated
          ? { kind: "compensated", reason: "provider_did_not_return_a_live_hold" }
          : {
              kind: "in_doubt",
              operationId,
              reason: "invalid_hold_compensation_failed",
            }
        return (await settle(options.operations, operationId, outcome))
          ? outcome
          : settlementInDoubt(operationId)
      }

      const outcome: StorefrontFlightHoldOutcome = {
        kind: "held",
        hold: {
          authority: input.lock.authority,
          connectionId: input.lock.connectionId,
          offerId: input.lock.offer.offerId,
          orderId: order.orderId,
          revision: input.lock.revision + 1,
          expiresAt: deadline,
        },
        order,
      }
      const settled = await settle(options.operations, operationId, outcome, async () => {
        await compensateHold(source, adapterContext, order.orderId)
      })
      return settled ? outcome : settlementInDoubt(operationId)
    },

    async commit(input) {
      assertAuthority(input.context, input.hold.authority)
      assertRevision(input.expectedRevision, input.hold.revision)
      assertNotExpired(input.hold.expiresAt, now(), "flight_hold_expired")
      const source = await resolveAdmittedSource(options, input.context, input.hold.connectionId)
      requireHoldCapability(source.adapter)
      const fingerprint = await stableFingerprint({
        authority: input.hold.authority,
        connectionId: input.hold.connectionId,
        offerId: input.hold.offerId,
        orderId: input.hold.orderId,
        revision: input.hold.revision,
      })
      const claim = await options.operations.claim({
        operation: "commit",
        storefrontId: input.context.storefrontId,
        channelId: input.context.channelId,
        idempotencyKey: requiredKey(input.idempotencyKey),
        requestFingerprint: fingerprint,
      })
      const replay = mutationClaimOutcome<StorefrontFlightCommitOutcome>(claim)
      if (replay) return replay
      const operationId = claimedOperationId(claim)

      try {
        const response = await source.adapter.ticketOrder!(
          sourceContext(source, input.idempotencyKey),
          input.hold.orderId,
        )
        if (response.order.status !== "ticketed") {
          const outcome: StorefrontFlightCommitOutcome = {
            kind: "in_doubt",
            operationId,
            reason: `provider_commit_status_${response.order.status}`,
          }
          return (await settle(options.operations, operationId, outcome))
            ? outcome
            : settlementInDoubt(operationId)
        }
        const outcome: StorefrontFlightCommitOutcome = {
          kind: "committed",
          order: response.order,
        }
        return (await settle(options.operations, operationId, outcome))
          ? outcome
          : settlementInDoubt(operationId)
      } catch (error) {
        const reason = safeErrorClass(error)
        try {
          const current = await source.adapter.getOrder(sourceContext(source), input.hold.orderId)
          if (current.order.status === "ticketed") {
            const outcome: StorefrontFlightCommitOutcome = {
              kind: "committed",
              order: current.order,
            }
            return (await settle(options.operations, operationId, outcome))
              ? outcome
              : settlementInDoubt(operationId)
          }
        } catch {
          // The durable claim remains the reconciliation authority.
        }
        const outcome = { kind: "in_doubt", operationId, reason } as const
        await options.operations.markInDoubt(operationId, outcome)
        return outcome
      }
    },
  }
}

export class StorefrontFlightLifecycleError extends Error {
  constructor(
    readonly code:
      | "flight_scope_mismatch"
      | "flight_revision_conflict"
      | "flight_offer_expired"
      | "flight_price_lock_expired"
      | "flight_hold_expired"
      | "flight_source_not_admitted"
      | "flight_hold_unsupported"
      | "flight_offer_unavailable"
      | "flight_offer_identity_changed"
      | "flight_idempotency_key_invalid"
      | "flight_idempotency_conflict"
      | "flight_operation_in_progress",
    message: string,
  ) {
    super(message)
    this.name = "StorefrontFlightLifecycleError"
  }
}

async function resolveAdmittedSource(
  options: ProviderFirstFlightBookingLifecycleOptions,
  context: FlightStorefrontShoppingContext,
  connectionId: string,
): Promise<AdmittedFlightShoppingSource> {
  assertContext(context)
  await options.assertActiveStorefrontScope(context)
  const sources = await options.listAdmittedShoppingSources(context)
  const source = sources.find((candidate) => candidate.connectionId === connectionId)
  if (!source) {
    throw new StorefrontFlightLifecycleError(
      "flight_source_not_admitted",
      "The selected flight source is no longer admitted for this Storefront scope.",
    )
  }
  return source
}

function sourceContext(
  source: AdmittedFlightShoppingSource,
  idempotencyKey?: string,
): FlightAdapterContext {
  return {
    ...source.context,
    connectionId: source.connectionId,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }
}

function requireHoldCapability(adapter: FlightConnectorAdapter): void {
  if (
    !adapter.capabilities.declared.includes(FLIGHT_CAPABILITIES.HOLDS) ||
    typeof adapter.ticketOrder !== "function"
  ) {
    throw new StorefrontFlightLifecycleError(
      "flight_hold_unsupported",
      "The admitted provider cannot complete the required hold-then-ticket lifecycle.",
    )
  }
}

function assertAuthority(
  actual: FlightStorefrontShoppingContext,
  expected: FlightStorefrontShoppingContext,
): void {
  assertContext(actual)
  if (
    actual.storefrontId !== expected.storefrontId ||
    actual.channelId !== expected.channelId ||
    actual.marketId !== expected.marketId ||
    actual.locale !== expected.locale ||
    actual.currency !== expected.currency
  ) {
    throw new StorefrontFlightLifecycleError(
      "flight_scope_mismatch",
      "Opaque flight authority does not match the active Storefront scope.",
    )
  }
}

function assertContext(context: FlightStorefrontShoppingContext): void {
  if (Object.values(context).some((value) => !value.trim())) {
    throw new StorefrontFlightLifecycleError(
      "flight_scope_mismatch",
      "Storefront flight authority must be fully resolved server-side.",
    )
  }
}

function assertRevision(expected: number, actual: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected !== actual) {
    throw new StorefrontFlightLifecycleError(
      "flight_revision_conflict",
      "Flight lifecycle revision changed after it was read.",
    )
  }
}

function assertNotExpired(
  value: string | undefined,
  now: Date,
  code: StorefrontFlightLifecycleError["code"],
): void {
  if (value && isExpired(value, now)) {
    throw new StorefrontFlightLifecycleError(code, "Flight lifecycle authority has expired.")
  }
}

function boundedExpiry(
  now: Date,
  ttlMs: number,
  upstream: string | undefined,
  code: StorefrontFlightLifecycleError["code"],
): Date {
  const local = new Date(now.getTime() + ttlMs)
  if (!upstream) return local
  const parsed = new Date(upstream)
  if (!Number.isFinite(parsed.getTime()) || parsed <= now) {
    throw new StorefrontFlightLifecycleError(code, "Provider returned an expired flight offer.")
  }
  return parsed < local ? parsed : local
}

function isExpired(value: string, now: Date): boolean {
  const parsed = Date.parse(value)
  return !Number.isFinite(parsed) || parsed <= now.getTime()
}

function requiredKey(value: string): string {
  if (!value.trim() || value !== value.trim() || value.length > 200) {
    throw new StorefrontFlightLifecycleError(
      "flight_idempotency_key_invalid",
      "Flight lifecycle idempotency key is invalid.",
    )
  }
  return value
}

function mutationClaimOutcome<T extends StorefrontFlightMutationOutcome>(
  claim: StorefrontFlightOperationClaim,
): T | undefined {
  if (claim.status === "replay") return claim.outcome as T
  if (claim.status === "conflict") {
    throw new StorefrontFlightLifecycleError(
      "flight_idempotency_conflict",
      "Flight lifecycle idempotency key was reused for different input.",
    )
  }
  if (claim.status === "in_progress") {
    throw new StorefrontFlightLifecycleError(
      "flight_operation_in_progress",
      `Flight lifecycle operation ${claim.operationId} is already in progress.`,
    )
  }
  return undefined
}

function claimedOperationId(claim: StorefrontFlightOperationClaim): string {
  if (claim.status !== "claimed") throw new Error("flight_operation_claim_invalid")
  return claim.operationId
}

async function settle(
  operations: StorefrontFlightOperationStore,
  operationId: string,
  outcome: StorefrontFlightMutationOutcome,
  compensate?: () => Promise<void>,
): Promise<boolean> {
  try {
    await operations.complete(operationId, outcome)
    return true
  } catch {
    if (compensate) {
      try {
        await compensate()
      } catch {
        // Failure to record after a supplier effect is necessarily in doubt.
      }
    }
    const inDoubt = settlementInDoubt(operationId)
    await operations.markInDoubt(operationId, inDoubt)
    return false
  }
}

function settlementInDoubt(operationId: string) {
  return {
    kind: "in_doubt",
    operationId,
    reason: "operation_settlement_failed",
  } as const
}

async function compensateHold(
  source: AdmittedFlightShoppingSource,
  context: FlightAdapterContext,
  orderId: string,
): Promise<boolean> {
  try {
    const response = await source.adapter.cancelOrder(context, orderId, "operational")
    return response.order.status === "cancelled"
  } catch {
    return false
  }
}

async function stableFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`
}

function safeErrorClass(error: unknown): string {
  if (error instanceof Error && error.name.trim()) return error.name.slice(0, 100)
  return "provider_operation_failed"
}
