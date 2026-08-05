import type {
  PaymentCallbackEvent,
  PaymentHostedCheckout,
  PaymentInitiationResult,
  PaymentProcessorIdentity,
  PaymentSessionState,
  PaymentStatusResult,
} from "@voyant-travel/payments"
import { paymentCheckoutRedirectUrl } from "@voyant-travel/payments"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  assertPaymentAdapterProcessorIdentityForLockedSession,
  assertPaymentAdapterProcessorReferencesForLockedSession,
  canApplyPaymentAdapterStateTransition,
  PAYMENT_ADAPTER_STATUS_LEASE_TOKEN_KEY,
} from "./payment-adapter-session-guard.js"
import { paymentSessions } from "./schema/payment-sessions.js"
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
      nextState: result.nextState,
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

  return applyPaymentAdapterStateUpdate(db, update, providerData, runtime)
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
