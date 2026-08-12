import type {
  PaymentCallbackEvent,
  PaymentHostedCheckout,
  PaymentInitiationResult,
  PaymentProcessorIdentity,
  PaymentSessionState,
  PaymentStatusResult,
} from "@voyant-travel/payments"
import { isEmbeddedPaymentCheckout, paymentCheckoutRedirectUrl } from "@voyant-travel/payments"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  assertPaymentAdapterProcessorIdentityForLockedSession,
  assertPaymentAdapterProcessorReferencesForLockedSession,
  canApplyPaymentAdapterStateTransition,
  PAYMENT_ADAPTER_STATUS_LEASE_TOKEN_KEY,
} from "./payment-adapter-session-guard.js"
import { paymentSessions } from "./schema/payment-sessions.js"
import { financePaymentDisputeService } from "./service-payment-disputes.js"
import { financePaymentSessionCompletionService } from "./service-payment-session-completion.js"
import {
  type FinanceServiceRuntime,
  PaymentValidationError,
  sql,
  toTimestamp,
  touchLinkedBookingUpdatedAt,
} from "./service-shared.js"

function mergeJsonbColumn(
  column: typeof paymentSessions.providerPayload | typeof paymentSessions.metadata,
  value: Record<string, unknown> | null | undefined,
) {
  if (value === undefined) return undefined
  if (value === null) return null
  return sql`coalesce(${column}, '{}'::jsonb) || ${JSON.stringify(value)}::jsonb`
}

type PaymentAdapterStateUpdate = {
  source: "callback" | "initiation" | "status"
  paymentSessionId: string
  nextState: PaymentSessionState
  occurredAt: string
  processorIdentity?: PaymentProcessorIdentity
  processorSessionId?: string | null
  processorPaymentId?: string | null
  redirectUrl?: string | null
  /** The whole handoff. `redirectUrl` stays its flattened redirect-arm view. */
  checkout?: PaymentHostedCheckout | null
  idempotencyKey?: string
  initiationClaimedAt?: Date
  statusLeaseToken?: string
}

type PaymentAdapterProviderData = {
  provider: string | undefined
  providerConnectionId: string | undefined
  providerSessionId: string | undefined
  providerPaymentId: string | undefined
  providerPayload: Record<string, unknown> | undefined
  metadata: Record<string, unknown>
}

const PAYMENT_ADAPTER_INITIATION_CLAIM_KEY = "paymentAdapterInitiationClaim"

async function applyLockedNonCompletionStateUpdate(
  db: PostgresJsDatabase,
  update: PaymentAdapterStateUpdate,
  providerData: PaymentAdapterProviderData,
) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(paymentSessions)
      .where(eq(paymentSessions.id, update.paymentSessionId))
      .for("update")
      .limit(1)
    if (!session) return null

    if (
      update.source === "status" &&
      session.metadata?.[PAYMENT_ADAPTER_STATUS_LEASE_TOKEN_KEY] !== update.statusLeaseToken
    ) {
      return null
    }

    const adoptedIdentity = assertPaymentAdapterProcessorIdentityForLockedSession(
      session,
      update.processorIdentity,
    )
    const pinnedReferences = assertPaymentAdapterProcessorReferencesForLockedSession(session, {
      processorSessionId: update.processorSessionId,
      processorPaymentId: update.processorPaymentId,
    })
    const provider = adoptedIdentity.provider ?? session.provider ?? providerData.provider
    const providerConnectionId =
      adoptedIdentity.providerConnectionId ?? providerData.providerConnectionId

    const nextState = update.nextState
    const mayFinalizeUncontestedInitiationClaim =
      update.source === "initiation" &&
      session.status === "processing" &&
      (nextState === "pending" || nextState === "requires_redirect") &&
      session.metadata?.[PAYMENT_ADAPTER_INITIATION_CLAIM_KEY] === update.idempotencyKey &&
      session.updatedAt.getTime() === update.initiationClaimedAt?.getTime() &&
      !session.providerConnectionId &&
      !session.providerSessionId &&
      !session.providerPaymentId
    const shouldTransition =
      mayFinalizeUncontestedInitiationClaim ||
      canApplyPaymentAdapterStateTransition(session.status as PaymentSessionState, nextState)
    const failedAt = shouldTransition && nextState === "failed" ? new Date() : undefined
    const cancelledAt = shouldTransition && nextState === "cancelled" ? new Date() : undefined
    const expiredAt = shouldTransition && nextState === "expired" ? new Date() : undefined

    const [updated] = await tx
      .update(paymentSessions)
      .set({
        status: shouldTransition ? nextState : undefined,
        provider,
        providerConnectionId,
        providerSessionId: pinnedReferences.providerSessionId,
        providerPaymentId: pinnedReferences.providerPaymentId,
        providerPayload: mergeJsonbColumn(
          paymentSessions.providerPayload,
          providerData.providerPayload,
        ),
        metadata: mergeJsonbColumn(paymentSessions.metadata, providerData.metadata),
        redirectUrl: update.redirectUrl,
        checkout: update.checkout,
        idempotencyKey: update.idempotencyKey,
        failedAt,
        cancelledAt,
        expiredAt,
        failureCode:
          shouldTransition && nextState === "failed"
            ? `payment_adapter_${update.source}`
            : undefined,
        failureMessage:
          shouldTransition && nextState === "failed"
            ? `Payment adapter ${update.source} mapped this session to failed.`
            : undefined,
        completedAt: shouldTransition && nextState === "paid" ? new Date() : undefined,
        expiresAt:
          shouldTransition && nextState === "expired" ? toTimestamp(update.occurredAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(paymentSessions.id, update.paymentSessionId))
      .returning()

    await touchLinkedBookingUpdatedAt(tx, updated?.bookingId)
    return updated ?? null
  })
}

async function applyPaymentAdapterStateUpdate(
  db: PostgresJsDatabase,
  update: PaymentAdapterStateUpdate,
  providerData: PaymentAdapterProviderData,
  runtime: FinanceServiceRuntime,
) {
  if (update.nextState === "paid" || update.nextState === "authorized") {
    return financePaymentSessionCompletionService.completePaymentSession(
      db,
      update.paymentSessionId,
      {
        status: update.nextState,
        captureMode: "automatic",
        ...providerData,
      },
      runtime,
      {
        requireProcessorIdentityWhenConnectionPinned: true,
        expectedPaymentAdapterStatusLeaseToken: update.statusLeaseToken,
        sessionUpdate: {
          redirectUrl: update.redirectUrl,
          checkout: update.checkout,
          idempotencyKey: update.idempotencyKey,
        },
      },
    )
  }

  return applyLockedNonCompletionStateUpdate(db, update, providerData)
}

/**
 * The state an initiation leaves the session in.
 *
 * `requires_redirect` names a fact — there is a URL the shopper must be sent to
 * — and the embedded arm has none: `redirectUrl` is null for it, so the two
 * columns would contradict each other and every reader keyed on that state (the
 * status pollers, the pending aggregates, the reuse arms) would sit waiting for
 * a return that nobody was ever sent on.
 *
 * The framework settles this rather than the adapter. `PaymentSessionState` is
 * the framework's own vocabulary, the conformance kit does not pin a state to
 * the embedded arm, and a processor that has just learned to return a client
 * secret cannot be relied on to also pick the right word for it. `pending` is
 * the honest answer and is already an expected initiation outcome — see the
 * uncontested-claim finalisation below — so no new state member is needed
 * (voyant#4346).
 */
export function initiationNextState(result: PaymentInitiationResult): PaymentSessionState {
  if (result.nextState !== "requires_redirect") return result.nextState
  if (!result.checkout || !isEmbeddedPaymentCheckout(result.checkout)) return result.nextState
  return "pending"
}

export async function applyPaymentAdapterInitiationResult(
  db: PostgresJsDatabase,
  paymentSessionId: string,
  adapterId: string,
  result: PaymentInitiationResult,
  claim: { idempotencyKey: string; claimedAt: Date },
  runtime: FinanceServiceRuntime = {},
) {
  if (result.idempotencyKey !== claim.idempotencyKey) {
    throw new PaymentValidationError(
      "Payment adapter initiation returned a different idempotency key",
      { paymentSessionId, expectedIdempotencyKey: claim.idempotencyKey },
      { status: 409, code: "payment_adapter_idempotency_mismatch" },
    )
  }

  return applyPaymentAdapterStateUpdate(
    db,
    {
      source: "initiation",
      paymentSessionId,
      nextState: initiationNextState(result),
      occurredAt: new Date().toISOString(),
      processorIdentity: result.processorIdentity,
      processorSessionId: result.processorSessionId,
      processorPaymentId: result.processorPaymentId,
      redirectUrl: paymentCheckoutRedirectUrl(result.checkout),
      checkout: result.checkout ?? null,
      idempotencyKey: result.idempotencyKey,
      initiationClaimedAt: claim.claimedAt,
    },
    {
      provider: result.processorIdentity?.providerId ?? adapterId,
      providerConnectionId: result.processorIdentity?.connectionId,
      providerSessionId: result.processorSessionId ?? undefined,
      providerPaymentId: result.processorPaymentId ?? undefined,
      providerPayload: result.raw === undefined ? undefined : { initiation: result.raw },
      metadata: {
        paymentAdapterInitiationClaim: null,
        paymentAdapterInitiationIdempotencyKey: result.idempotencyKey,
        paymentAdapterInitiationState: "complete",
      },
    },
    runtime,
  )
}

export async function applyPaymentAdapterCallbackEvent(
  db: PostgresJsDatabase,
  event: PaymentCallbackEvent,
  runtime: FinanceServiceRuntime = {},
) {
  const update: PaymentAdapterStateUpdate = { ...event, source: "callback" }
  const providerData = {
    provider: event.processorIdentity?.providerId,
    providerConnectionId: event.processorIdentity?.connectionId,
    providerSessionId: event.processorSessionId ?? undefined,
    providerPaymentId: event.processorPaymentId ?? undefined,
    providerPayload: event.raw === undefined ? undefined : { callback: event.raw },
    metadata: { paymentAdapterEventId: event.eventId, paymentAdapterOccurredAt: event.occurredAt },
  }

  const session = await applyPaymentAdapterStateUpdate(db, update, providerData, runtime)

  // A dispute rides alongside the state rather than in it: the payment's own
  // lifecycle does not move when the money is contested, so `nextState` stays
  // whatever the session already was and this is what changed (voyant#4289).
  if (event.dispute) {
    await applyPaymentAdapterDisputeSignal(db, event, runtime)
  }

  // Same shape as a dispute, for the same reason: an instrument stored during
  // this payment, or a reissued card that lost its agreement long after the
  // payment settled, changes nothing about the session's own lifecycle.
  if (event.storedInstrument) {
    await recordStoredInstrumentForSession(
      db,
      event.paymentSessionId,
      event.storedInstrument,
      event.processorIdentity?.providerId ?? null,
      runtime,
    )
  }

  return session
}

/**
 * Attach a stored instrument to the person the session named as payer.
 *
 * Every early return here is a case where recording would be a guess:
 *
 * - No recorder wired, so nothing in this deployment keeps customer records.
 * - No provider id, so the token could not be charged later even if kept, and
 *   a token attributed to the wrong adapter is worse than no token.
 * - No payer person, which is the ordinary anonymous checkout. An instrument
 *   with nobody to attach it to is not an error; there is simply no customer
 *   record for it to belong to.
 *
 * Failure to record never fails the payment. The money moved and the session is
 * already correct; losing the instrument is a degraded outcome, not a reason to
 * reject a callback the provider will otherwise retry forever.
 */
async function recordStoredInstrumentForSession(
  db: PostgresJsDatabase,
  paymentSessionId: string,
  instrument: NonNullable<PaymentCallbackEvent["storedInstrument"]>,
  providerId: string | null,
  runtime: FinanceServiceRuntime,
) {
  const recorder = runtime.storedInstrumentRecorder
  if (!recorder) return

  const [session] = await db
    .select({ payerPersonId: paymentSessions.payerPersonId, provider: paymentSessions.provider })
    .from(paymentSessions)
    .where(eq(paymentSessions.id, paymentSessionId))
    .limit(1)

  const resolvedProviderId = providerId ?? session?.provider ?? null
  if (!session?.payerPersonId || !resolvedProviderId) return

  await recorder.recordStoredInstrument(db, {
    personId: session.payerPersonId,
    providerId: resolvedProviderId,
    token: instrument.token,
    authorizedReuses: instrument.authorizedReuses,
    status: instrument.status,
    providerCustomerReference: instrument.customerReference ?? null,
    fingerprint: instrument.fingerprint ?? null,
    brand: instrument.brand ?? null,
    last4: instrument.last4 ?? null,
    holderName: instrument.holderName ?? null,
    expMonth: instrument.expMonth ?? null,
    expYear: instrument.expYear ?? null,
  })
}

async function applyPaymentAdapterDisputeSignal(
  db: PostgresJsDatabase,
  event: PaymentCallbackEvent,
  runtime: FinanceServiceRuntime,
) {
  const dispute = event.dispute
  if (!dispute) return

  await financePaymentDisputeService.recordPaymentDispute(
    db,
    {
      paymentSessionId: event.paymentSessionId,
      processorReference: dispute.processorDisputeId,
      status: dispute.status,
      amountCents: dispute.money.amountMinor,
      currency: dispute.money.currency,
      openedAt: dispute.openedAt,
      respondBy: dispute.respondBy ?? null,
      reasonCode: dispute.reasonCode ?? null,
      resolvedAt: dispute.resolvedAt ?? null,
      resolutionNote: null,
      evidenceSubmittedAt: dispute.evidenceSubmittedAt ?? null,
      provider: event.processorIdentity?.providerId ?? null,
      providerConnectionId: event.processorIdentity?.connectionId ?? null,
      notes: null,
      providerPayload: { callbackEventId: event.eventId, occurredAt: event.occurredAt },
      metadata: null,
    },
    runtime,
  )
}

export async function applyPaymentAdapterStatusResult(
  db: PostgresJsDatabase,
  paymentSessionId: string,
  result: PaymentStatusResult,
  statusLeaseToken: string,
  runtime: FinanceServiceRuntime = {},
  checkedAt = new Date(),
) {
  const occurredAt = checkedAt.toISOString()
  // The poll is the backstop for a shopper who closed the tab before the
  // callback landed. It has to record the instrument too, or which of the two
  // paths arrives first decides whether the customer has a card on file.
  // Idempotent on (provider, token), so both arriving is a no-op.
  if (result.storedInstrument) {
    await recordStoredInstrumentForSession(
      db,
      paymentSessionId,
      result.storedInstrument,
      result.processorIdentity?.providerId ?? null,
      runtime,
    )
  }
  return applyPaymentAdapterStateUpdate(
    db,
    {
      source: "status",
      paymentSessionId,
      nextState: result.nextState,
      occurredAt,
      processorIdentity: result.processorIdentity,
      processorSessionId: result.processorSessionId,
      processorPaymentId: result.processorPaymentId,
      statusLeaseToken,
    },
    {
      provider: result.processorIdentity?.providerId,
      providerConnectionId: result.processorIdentity?.connectionId,
      providerSessionId: result.processorSessionId ?? undefined,
      providerPaymentId: result.processorPaymentId ?? undefined,
      providerPayload: result.raw === undefined ? undefined : { status: result.raw },
      metadata: {
        paymentAdapterStatusCheckedAt: occurredAt,
        paymentAdapterStatusRefreshAfter: checkedAt.getTime() + 30_000,
        [PAYMENT_ADAPTER_STATUS_LEASE_TOKEN_KEY]: null,
      },
    },
    runtime,
  )
}
