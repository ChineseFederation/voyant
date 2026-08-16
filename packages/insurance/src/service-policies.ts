/**
 * Issuing, failing to issue, and cancelling.
 *
 * The shape of this file follows from one fact: issuing happens AFTER the money
 * has been taken. So a failure is an ordinary recorded outcome and never a
 * thrown error that unwinds anything — the booking stays intact, the row says
 * `issue_failed` with the reason and whether a retry could work, an operator is
 * told, and the traveller's money is not quietly refunded by a code path nobody
 * reviewed.
 *
 * A `pending` row is written BEFORE the provider is called, for the same
 * reason. If the process dies mid-call there has to be something on disk saying
 * an issue was attempted; otherwise the only record of a charged traveller with
 * no policy is a log line.
 */

import type { EventBus } from "@voyant-travel/core"
import type {
  InsuranceDocument,
  InsurancePolicy as InsurancePolicyContract,
  InsuranceProviderAdapter,
} from "@voyant-travel/insurance-contracts"
import { and, desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  INSURANCE_BOOKING_ACTIVITY_EVENTS,
  type InsuranceBookingIntegration,
  recordInsuranceBookingActivity,
} from "./booking-integration.js"
import {
  emitInsurancePolicyCancelled,
  emitInsurancePolicyIssued,
  emitInsurancePolicyIssueFailed,
} from "./events.js"
import type { InsurancePiiService } from "./pii.js"
import type { InsuranceApplicationRow } from "./schema-applications.js"
import { type InsurancePolicyRow, insurancePolicies } from "./schema-policies.js"
import { setInsuranceApplicationStatus } from "./service-applications.js"

export interface InsurancePolicyServiceDeps {
  pii: InsurancePiiService
  integration?: InsuranceBookingIntegration
  actorId?: string | null
  now?: () => Date
  /** Optional: a deployment that binds no bus still issues policies. */
  eventBus?: EventBus
}

export interface IssueInsurancePolicyInput {
  application: InsuranceApplicationRow
  provider: InsuranceProviderAdapter
  /** The booking the premium was charged on, when there is one. */
  bookingId?: string | null
  bookingNumber?: string | null
  /**
   * Required. A retried `issue` that produces a second policy is a second real
   * charge on a real traveller, so the insurer has to be able to recognise the
   * retry.
   */
  idempotencyKey: string
  /** Whether the traveller has already paid. Drives the staff alert on failure. */
  paid?: boolean
  locale?: string
}

export type IssueInsurancePolicyResult =
  | { status: "issued"; policy: InsurancePolicyRow; documentIds: string[] }
  | {
      status: "failed"
      policy: InsurancePolicyRow
      code: string
      message: string
      retryable: boolean
    }

function nowFrom(deps: InsurancePolicyServiceDeps): Date {
  return deps.now?.() ?? new Date()
}

/** The `pending` row that must exist before the provider is called. */
async function ensurePendingPolicy(
  db: PostgresJsDatabase,
  input: IssueInsurancePolicyInput,
  at: Date,
): Promise<InsurancePolicyRow> {
  const existing = await getInsurancePolicyForApplication(db, input.application.id)
  if (existing) {
    const [bumped] = await db
      .update(insurancePolicies)
      .set({ issueAttempts: existing.issueAttempts + 1, updatedAt: at })
      .where(eq(insurancePolicies.id, existing.id))
      .returning()
    return bumped ?? existing
  }

  const effectiveFrom = isoDate(at)
  const [row] = await db
    .insert(insurancePolicies)
    .values({
      applicationId: input.application.id,
      bookingId: input.bookingId ?? input.application.bookingId ?? null,
      providerId: input.application.providerId,
      issueState: "pending",
      // Overwritten with the insurer's own window the moment it issues. Until
      // then the trip has to be described by something, and "today" is the only
      // honest placeholder available before the insurer answers.
      effectiveFrom,
      effectiveTo: effectiveFrom,
      premiumAmountMinor: input.application.premiumAmountMinor,
      premiumCurrency: input.application.premiumCurrency,
      issueAttempts: 1,
    })
    .returning()

  if (!row) throw new Error("Recording a pending insurance policy inserted no row.")
  return row
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/**
 * Ask the insurer to issue, and record whatever comes back.
 *
 * Never throws for a provider outcome. The only throws left are programming
 * errors — a missing row, a database that refused a write — because those are
 * the ones a caller genuinely cannot handle.
 */
export async function issueInsurancePolicy(
  db: PostgresJsDatabase,
  deps: InsurancePolicyServiceDeps,
  input: IssueInsurancePolicyInput,
): Promise<IssueInsurancePolicyResult> {
  const at = nowFrom(deps)
  const pending = await ensurePendingPolicy(db, input, at)

  let issued: InsurancePolicyContract
  try {
    issued = await input.provider.issue(
      {
        applicationId: input.application.providerApplicationRef ?? input.application.id,
        expectedPremium: {
          amountMinor: input.application.premiumAmountMinor,
          currency: input.application.premiumCurrency,
        },
      },
      {
        idempotencyKey: input.idempotencyKey,
        ...(input.locale ? { locale: input.locale } : {}),
        currency: input.application.premiumCurrency,
      },
    )
  } catch (error) {
    return recordInsuranceIssueFailure(db, deps, {
      policy: pending,
      application: input.application,
      bookingNumber: input.bookingNumber ?? null,
      failure: {
        code: failureCode(error),
        message: error instanceof Error ? error.message : String(error),
        // A transport failure is the retryable kind by construction: an insurer
        // that refused the risk returns a policy in `issue_failed`, it does not
        // throw. Assuming otherwise here strands a paid traveller.
        retryable: true,
        occurredAt: at.toISOString(),
      },
      paid: input.paid ?? false,
    })
  }

  if (issued.issueState !== "issued") {
    return recordInsuranceIssueFailure(db, deps, {
      policy: pending,
      application: input.application,
      bookingNumber: input.bookingNumber ?? null,
      failure: {
        code: issued.failure?.code ?? "provider_declined",
        message: issued.failure?.message ?? "The insurer did not issue the policy.",
        retryable: issued.failure?.retryable ?? false,
        occurredAt: issued.failure?.occurredAt ?? at.toISOString(),
      },
      paid: input.paid ?? false,
    })
  }

  const documents = await collectPolicyDocuments(input.provider, issued, input.locale)

  const [row] = await db
    .update(insurancePolicies)
    .set({
      issueState: "issued",
      policyNumber: issued.policyNumber ?? null,
      issuedAt: issued.issuedAt ? new Date(issued.issuedAt) : at,
      effectiveFrom: issued.effectiveFrom,
      effectiveTo: issued.effectiveTo,
      premiumAmountMinor: issued.premium.amountMinor,
      premiumCurrency: issued.premium.currency,
      sumInsuredAmountMinor: issued.sumInsured?.amountMinor ?? null,
      sumInsuredCurrency: issued.sumInsured?.currency ?? null,
      covers: issued.covers,
      documents,
      providerReference: issued.providerReference ?? null,
      failureCode: null,
      failureMessage: null,
      failureRetryable: null,
      failureOccurredAt: null,
      updatedAt: at,
    })
    .where(eq(insurancePolicies.id, pending.id))
    .returning()

  const policy = row ?? pending
  await deps.pii.attachPolicy(db, input.application.id, policy.id)
  await setInsuranceApplicationStatus(db, input.application.id, "accepted")

  await emitInsurancePolicyIssued(deps.eventBus, {
    policyId: policy.id,
    applicationId: input.application.id,
    bookingId: policy.bookingId ?? input.bookingId ?? null,
    providerId: policy.providerId,
    policyNumber: policy.policyNumber,
    premiumAmountMinor: policy.premiumAmountMinor,
    premiumCurrency: policy.premiumCurrency,
  })

  const bookingId = policy.bookingId ?? input.bookingId ?? null
  const documentIds: string[] = []

  if (bookingId) {
    await recordInsuranceBookingActivity(db, bookingId, {
      event: INSURANCE_BOOKING_ACTIVITY_EVENTS.issued,
      description: `Travel insurance issued by ${input.provider.displayName}`,
      actorId: deps.actorId ?? null,
      metadata: {
        policyId: policy.id,
        applicationId: input.application.id,
        providerId: policy.providerId,
        policyNumber: policy.policyNumber,
      },
    })

    const recorder = deps.integration?.documents
    if (recorder) {
      for (const document of documents) {
        const recorded = await recorder.record({
          bookingId,
          fileName: document.filename,
          fileUrl: document.source.kind === "url" ? document.source.url : "",
          issuedBy: input.provider.displayName,
          issuedNumber: policy.policyNumber,
          issuedAt: policy.issuedAt?.toISOString() ?? null,
          notes: null,
        })
        if (recorded) documentIds.push(recorded.documentId)
      }
    }

    if (documentIds.length > 0) {
      // Best effort by contract: a delivery failure must not unwind an issued
      // policy, so the notifier reports rather than throws.
      await deps.integration?.notifier?.sendIssuedPolicyDocuments({
        bookingId,
        policyId: policy.id,
        documentIds,
      })
    }
  }

  return { status: "issued", policy, documentIds }
}

/**
 * The insurer's paperwork, gathered at issue time.
 *
 * If the issued policy already carries a certificate, that is used; otherwise
 * the certificate is fetched explicitly, because a policy the traveller cannot
 * produce at a border is not much of a policy. A provider that cannot supply
 * one does not fail the issue — the policy exists, and an operator can chase
 * the document.
 */
async function collectPolicyDocuments(
  provider: InsuranceProviderAdapter,
  issued: InsurancePolicyContract,
  locale: string | undefined,
): Promise<InsuranceDocument[]> {
  const documents = [...issued.documents]
  if (documents.some((document) => document.kind === "policy_certificate")) return documents

  try {
    const certificate = await provider.document(
      {
        policyId: issued.policyId,
        kind: "policy_certificate",
        ...(locale ? { locale } : {}),
      },
      { ...(locale ? { locale } : {}) },
    )
    documents.push(certificate)
  } catch {
    // Deliberately swallowed: see the doc comment above.
  }
  return documents
}

function failureCode(error: unknown): string {
  if (error instanceof Error && error.name && error.name !== "Error") return error.name
  return "provider_unavailable"
}

export interface RecordInsuranceIssueFailureInput {
  policy: InsurancePolicyRow
  application: InsuranceApplicationRow
  bookingNumber?: string | null
  failure: { code: string; message: string; retryable: boolean; occurredAt: string }
  /** Whether the traveller had already been charged. Decides the alert. */
  paid: boolean
  providerLabel?: string | null
}

/**
 * Record that issuing failed — and, when the money was already taken, tell
 * somebody.
 *
 * The alert is conditional on `paid` on purpose. A pre-payment failure is a
 * checkout that did not complete, which the traveller sees and can retry; a
 * post-payment failure is the state nobody finds out about until the traveller
 * needs to claim.
 */
export async function recordInsuranceIssueFailure(
  db: PostgresJsDatabase,
  deps: InsurancePolicyServiceDeps,
  input: RecordInsuranceIssueFailureInput,
): Promise<IssueInsurancePolicyResult> {
  const at = nowFrom(deps)
  const [row] = await db
    .update(insurancePolicies)
    .set({
      issueState: "issue_failed",
      failureCode: input.failure.code,
      failureMessage: input.failure.message,
      failureRetryable: input.failure.retryable,
      failureOccurredAt: new Date(input.failure.occurredAt),
      updatedAt: at,
    })
    .where(eq(insurancePolicies.id, input.policy.id))
    .returning()

  const policy = row ?? input.policy
  const bookingId = policy.bookingId ?? input.application.bookingId ?? null

  await emitInsurancePolicyIssueFailed(deps.eventBus, {
    policyId: policy.id,
    applicationId: input.application.id,
    bookingId,
    providerId: policy.providerId,
    failureCode: input.failure.code,
    failureMessage: input.failure.message,
    retryable: input.failure.retryable,
    paid: input.paid,
  })

  if (bookingId) {
    await recordInsuranceBookingActivity(db, bookingId, {
      event: INSURANCE_BOOKING_ACTIVITY_EVENTS.issueFailed,
      description: `Travel insurance could not be issued: ${input.failure.message}`,
      actorId: deps.actorId ?? null,
      metadata: {
        policyId: policy.id,
        applicationId: input.application.id,
        providerId: policy.providerId,
        failureCode: input.failure.code,
        retryable: input.failure.retryable,
        paid: input.paid,
      },
    })

    if (input.paid) {
      await deps.integration?.staffAlerts?.raiseIssueFailed({
        adminPath: `/bookings/${bookingId}`,
        bookingId,
        bookingNumber: input.bookingNumber ?? null,
        policyId: policy.id,
        applicationId: input.application.id,
        providerId: policy.providerId,
        providerLabel: input.providerLabel ?? null,
        premium: {
          amountMinor: policy.premiumAmountMinor,
          currency: policy.premiumCurrency,
        },
        paid: true,
        failureCode: input.failure.code,
        failureMessage: input.failure.message,
        retryable: input.failure.retryable,
        occurredAt: input.failure.occurredAt,
      })
    }
  }

  return {
    status: "failed",
    policy,
    code: input.failure.code,
    message: input.failure.message,
    retryable: input.failure.retryable,
  }
}

export interface CancelInsurancePolicyServiceInput {
  policy: InsurancePolicyRow
  provider: InsuranceProviderAdapter
  reason: string
  idempotencyKey: string
}

export type CancelInsurancePolicyResult =
  | { status: "cancelled"; policy: InsurancePolicyRow }
  | { status: "failed"; code: string; message: string }

/**
 * Cancel at the insurer, then record what it said.
 *
 * Order matters and is not interchangeable: marking the row cancelled first
 * would leave a live policy the operator believes is dead. If the insurer
 * refuses or is unreachable, nothing local changes and the caller is told.
 */
export async function cancelInsurancePolicy(
  db: PostgresJsDatabase,
  deps: InsurancePolicyServiceDeps,
  input: CancelInsurancePolicyServiceInput,
): Promise<CancelInsurancePolicyResult> {
  const at = nowFrom(deps)
  let cancellation: Awaited<ReturnType<InsuranceProviderAdapter["cancel"]>>
  try {
    cancellation = await input.provider.cancel(
      { policyId: input.policy.providerReference ?? input.policy.id, reason: input.reason },
      { idempotencyKey: input.idempotencyKey },
    )
  } catch (error) {
    return {
      status: "failed",
      code: failureCode(error),
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const [row] = await db
    .update(insurancePolicies)
    .set({
      issueState: "cancelled",
      cancelledAt: new Date(cancellation.cancelledAt),
      cancellationReason: cancellation.reason,
      refundAmountMinor: cancellation.refund?.amountMinor ?? null,
      refundCurrency: cancellation.refund?.currency ?? null,
      updatedAt: at,
    })
    .where(eq(insurancePolicies.id, input.policy.id))
    .returning()

  const policy = row ?? input.policy
  const bookingId = policy.bookingId ?? null

  await emitInsurancePolicyCancelled(deps.eventBus, {
    policyId: policy.id,
    bookingId,
    providerId: policy.providerId,
    reason: cancellation.reason,
    refundAmountMinor: cancellation.refund?.amountMinor ?? null,
    refundCurrency: cancellation.refund?.currency ?? null,
  })

  if (bookingId) {
    await recordInsuranceBookingActivity(db, bookingId, {
      event: INSURANCE_BOOKING_ACTIVITY_EVENTS.cancelled,
      description: `Travel insurance cancelled: ${cancellation.reason}`,
      actorId: deps.actorId ?? null,
      metadata: {
        policyId: policy.id,
        providerId: policy.providerId,
        refundAmountMinor: cancellation.refund?.amountMinor ?? null,
        refundCurrency: cancellation.refund?.currency ?? null,
      },
    })
  }

  return { status: "cancelled", policy }
}

export async function getInsurancePolicy(
  db: PostgresJsDatabase,
  policyId: string,
): Promise<InsurancePolicyRow | null> {
  const [row] = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.id, policyId))
    .limit(1)
  return row ?? null
}

export async function getInsurancePolicyForApplication(
  db: PostgresJsDatabase,
  applicationId: string,
): Promise<InsurancePolicyRow | null> {
  const [row] = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.applicationId, applicationId))
    .orderBy(desc(insurancePolicies.createdAt))
    .limit(1)
  return row ?? null
}

export async function listInsurancePoliciesForBooking(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<InsurancePolicyRow[]> {
  return db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.bookingId, bookingId))
    .orderBy(desc(insurancePolicies.createdAt))
}

/** The traveller-facing read: a booking's policies that actually exist. */
export async function listIssuedInsurancePoliciesForBooking(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<InsurancePolicyRow[]> {
  return db
    .select()
    .from(insurancePolicies)
    .where(
      and(eq(insurancePolicies.bookingId, bookingId), eq(insurancePolicies.issueState, "issued")),
    )
    .orderBy(desc(insurancePolicies.createdAt))
}
