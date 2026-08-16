/**
 * The durability evidence behind `retry-insurance-issue` and
 * `cancel-insurance-policy`.
 *
 * Both actions declare `durability: { strategy: "saga" }` in the module
 * manifest, and the deployment graph refuses an available external execute
 * action that claims durability without pointing at a test. This is that test,
 * and it drives the real service against a real database rather than asserting
 * against a hand-built row — a saga's whole claim is about what survives when
 * the external call does not, which a mock cannot show.
 *
 * The four properties that make the strategy a saga rather than a hope:
 *
 * 1. The local record is written BEFORE the insurer is called, so a process
 *    that dies mid-call leaves something to recover from.
 * 2. A retry resumes that record instead of starting a second one. A second
 *    policy is a second real charge on a real traveller.
 * 3. An insurer's refusal and an insurer's silence are both recorded, and are
 *    told apart, because only one of them is worth retrying.
 * 4. The compensating action commits locally only after the insurer confirms
 *    it. Marking a policy dead that is still live at the insurer is worse than
 *    failing loudly.
 */

import { bookings } from "@voyant-travel/bookings"
import type {
  InsuranceApplicationInput,
  InsuranceDocument,
  InsurancePolicy,
  InsuranceProviderAdapter,
  InsuranceProviderContext,
  InsuranceQuote,
} from "@voyant-travel/insurance-contracts"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { InsuranceIssueFailedAlertContext } from "../../src/booking-integration.js"
import { createInsurancePiiService } from "../../src/pii.js"
import { insuranceApplications } from "../../src/schema-applications.js"
import { insurancePolicies } from "../../src/schema-policies.js"
import {
  cancelInsurancePolicy,
  getInsurancePolicyForApplication,
  issueInsurancePolicy,
} from "../../src/service-policies.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

/** Cleanup truncates the whole operator schema; 5s is not a realistic budget. */
const DB_TEST_TIMEOUT = 60_000

const PREMIUM = { amountMinor: 4200, currency: "EUR" } as const

/**
 * An insurer that does exactly what the test tells it to, one call at a time.
 *
 * `script` is consumed per `issue` call so a retry can be given a different
 * outcome from the first attempt, which is the only way to observe that the
 * second attempt resumed the first one's record.
 */
function insurer(options: {
  script: ReadonlyArray<
    | { kind: "throws"; error: Error }
    | { kind: "refuses"; code: string; message: string; retryable: boolean }
    | { kind: "issues"; policyNumber: string }
  >
  onIssue?: (context: InsuranceProviderContext) => void | Promise<void>
  cancel?: { kind: "throws"; error: Error } | { kind: "cancels"; refundMinor?: number }
}) {
  const issueCalls: InsuranceProviderContext[] = []
  const cancelCalls: InsuranceProviderContext[] = []
  let issued = 0

  const provider: InsuranceProviderAdapter = {
    providerId: "test-insurer",
    displayName: "Test Insurer",
    async quote(): Promise<InsuranceQuote[]> {
      return []
    },
    async apply(_input: InsuranceApplicationInput) {
      throw new Error("apply is not exercised by this test")
    },
    async issue(_input, context): Promise<InsurancePolicy> {
      issueCalls.push(context)
      await options.onIssue?.(context)
      const step = options.script[Math.min(issued, options.script.length - 1)]
      issued += 1
      if (!step) throw new Error("insurer script exhausted")
      if (step.kind === "throws") throw step.error
      if (step.kind === "refuses") {
        return {
          policyId: "pol-provider-1",
          providerId: "test-insurer",
          applicationId: "app-provider-1",
          issueState: "issue_failed",
          effectiveFrom: "2026-09-01",
          effectiveTo: "2026-09-08",
          premium: PREMIUM,
          insuredPersons: [
            {
              ref: "t1",
              givenName: "Ana",
              familyName: "Pop",
              dateOfBirth: "1990-02-03",
              identityDocuments: [],
            },
          ],
          contractingParty: {
            givenName: "Ana",
            familyName: "Pop",
            email: "ana@example.test",
          },
          covers: [],
          documents: [],
          failure: {
            code: step.code,
            message: step.message,
            retryable: step.retryable,
            occurredAt: "2026-08-16T10:00:00.000Z",
          },
        }
      }
      return {
        policyId: "pol-provider-1",
        providerId: "test-insurer",
        applicationId: "app-provider-1",
        policyNumber: step.policyNumber,
        issueState: "issued",
        issuedAt: "2026-08-16T10:00:00.000Z",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2026-09-08",
        premium: PREMIUM,
        insuredPersons: [
          {
            ref: "t1",
            givenName: "Ana",
            familyName: "Pop",
            dateOfBirth: "1990-02-03",
            identityDocuments: [],
          },
        ],
        contractingParty: {
          givenName: "Ana",
          familyName: "Pop",
          email: "ana@example.test",
        },
        covers: [],
        documents: [],
        providerReference: "PRV-1",
      }
    },
    async document(): Promise<InsuranceDocument> {
      throw new Error("no certificate available")
    },
    async cancel(_input, context) {
      cancelCalls.push(context)
      const outcome = options.cancel ?? { kind: "cancels" as const }
      if (outcome.kind === "throws") throw outcome.error
      return {
        cancelledAt: "2026-08-17T09:00:00.000Z",
        reason: "traveller cancelled the trip",
        ...(outcome.refundMinor === undefined
          ? {}
          : { refund: { amountMinor: outcome.refundMinor, currency: "EUR" } }),
        providerReference: "PRV-CANCEL-1",
      }
    },
  }

  return { provider, issueCalls, cancelCalls }
}

describe.skipIf(!DB_AVAILABLE)("insurance issue is a durable command", () => {
  let db: PostgresJsDatabase

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function pii() {
    const { generateEnvKmsKey, EnvKmsProvider } = await import("@voyant-travel/utils")
    return createInsurancePiiService({ kms: new EnvKmsProvider({ key: generateEnvKmsKey() }) })
  }

  async function seedBooking(suffix: string) {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-INS-${suffix}`,
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        contactPreferredLanguage: "en",
        sellCurrency: "EUR",
        sellAmountCents: 120_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        pax: 2,
      })
      .returning()
    return booking!
  }

  async function seedApplication(bookingId: string | null) {
    const [application] = await db
      .insert(insuranceApplications)
      .values({
        bookingSessionId: "bs_test_1",
        bookingId,
        sourceId: "insurance",
        providerId: "test-insurer",
        quoteRef: "quote-ref-1",
        title: "Travel insurance",
        planName: "Standard",
        status: "open",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        premiumAmountMinor: PREMIUM.amountMinor,
        premiumCurrency: PREMIUM.currency,
      })
      .returning()
    return application!
  }

  it(
    "records the attempt before the insurer is called, so a death mid-call is recoverable",
    async () => {
      const application = await seedApplication(null)
      const seeded = await db
        .select()
        .from(insuranceApplications)
        .where(eq(insuranceApplications.id, application.id))
      expect(seeded).toHaveLength(1)
      let seenDuringCall: { issueState: string; attempts: number } | null = null

      const { provider } = insurer({
        script: [{ kind: "issues", policyNumber: "POL-1" }],
        // Read the table from inside the external call: this is the window a
        // crash would land in, and what is on disk here is all a recovery has.
        onIssue: async () => {
          const row = await getInsurancePolicyForApplication(db, application.id)
          seenDuringCall = row ? { issueState: row.issueState, attempts: row.issueAttempts } : null
        },
      })

      await issueInsurancePolicy(
        db,
        { pii: await pii() },
        { application, provider, idempotencyKey: "idem-1" },
      )

      expect(seenDuringCall).toEqual({ issueState: "pending", attempts: 1 })
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "resumes the same policy on retry rather than issuing a second one",
    async () => {
      const application = await seedApplication(null)
      const { provider, issueCalls } = insurer({
        script: [
          { kind: "throws", error: new Error("insurer timed out") },
          { kind: "issues", policyNumber: "POL-RETRY" },
        ],
      })
      const service = { pii: await pii() }

      const first = await issueInsurancePolicy(db, service, {
        application,
        provider,
        idempotencyKey: "idem-retry",
      })
      const second = await issueInsurancePolicy(db, service, {
        application,
        provider,
        idempotencyKey: "idem-retry",
      })

      expect(first.status).toBe("failed")
      expect(second.status).toBe("issued")

      const rows = await db
        .select()
        .from(insurancePolicies)
        .where(eq(insurancePolicies.applicationId, application.id))

      // One row, two attempts: the retry resumed rather than restarted.
      expect(rows).toHaveLength(1)
      expect(rows[0]?.issueState).toBe("issued")
      expect(rows[0]?.policyNumber).toBe("POL-RETRY")
      expect(rows[0]?.issueAttempts).toBe(2)
      // A cleared failure, not a stale one sitting next to a live policy.
      expect(rows[0]?.failureCode).toBeNull()

      // The insurer saw the same key both times, which is what lets it
      // recognise the retry as the same request rather than a new sale.
      expect(issueCalls.map((call) => call.idempotencyKey)).toEqual(["idem-retry", "idem-retry"])
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "tells a refusal apart from silence, because only one is worth retrying",
    async () => {
      const declined = await seedApplication(null)
      const unreachable = await seedApplication(null)
      const service = { pii: await pii() }

      const refusal = insurer({
        script: [
          {
            kind: "refuses",
            code: "age_above_maximum",
            message: "The insurer will not cover a traveller over 85.",
            retryable: false,
          },
        ],
      })
      const silence = insurer({ script: [{ kind: "throws", error: new Error("socket hang up") }] })

      const refused = await issueInsurancePolicy(db, service, {
        application: declined,
        provider: refusal.provider,
        idempotencyKey: "idem-refused",
      })
      const timedOut = await issueInsurancePolicy(db, service, {
        application: unreachable,
        provider: silence.provider,
        idempotencyKey: "idem-silent",
      })

      // Neither is an exception: a refusal is an ordinary outcome of asking.
      expect(refused.status).toBe("failed")
      expect(timedOut.status).toBe("failed")
      if (refused.status !== "failed" || timedOut.status !== "failed") return

      expect(refused.retryable).toBe(false)
      expect(refused.code).toBe("age_above_maximum")
      expect(timedOut.retryable).toBe(true)

      const refusedRow = await getInsurancePolicyForApplication(db, declined.id)
      expect(refusedRow?.issueState).toBe("issue_failed")
      expect(refusedRow?.failureRetryable).toBe(false)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "alerts staff only when the money was already taken",
    async () => {
      const paidBooking = await seedBooking("PAID")
      const unpaidBooking = await seedBooking("UNPAID")
      const paidApplication = await seedApplication(paidBooking.id)
      const unpaidApplication = await seedApplication(unpaidBooking.id)
      const alerts: InsuranceIssueFailedAlertContext[] = []
      const service = {
        pii: await pii(),
        integration: {
          staffAlerts: {
            async raiseIssueFailed(context: InsuranceIssueFailedAlertContext) {
              alerts.push(context)
            },
          },
        },
      }

      await issueInsurancePolicy(db, service, {
        application: paidApplication,
        provider: insurer({ script: [{ kind: "throws", error: new Error("gateway 502") }] })
          .provider,
        idempotencyKey: "idem-paid",
        paid: true,
      })
      await issueInsurancePolicy(db, service, {
        application: unpaidApplication,
        provider: insurer({ script: [{ kind: "throws", error: new Error("gateway 502") }] })
          .provider,
        idempotencyKey: "idem-unpaid",
        paid: false,
      })

      // A pre-payment failure is a checkout the traveller can see and retry. A
      // post-payment one is the state nobody finds out about on their own.
      expect(alerts).toHaveLength(1)
      expect(alerts[0]?.bookingId).toBe(paidBooking.id)
      expect(alerts[0]?.paid).toBe(true)
      expect(alerts[0]?.premium).toEqual(PREMIUM)
      expect(alerts[0]?.retryable).toBe(true)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "commits a cancellation only after the insurer confirms it",
    async () => {
      const application = await seedApplication(null)
      const service = { pii: await pii() }

      const issuedResult = await issueInsurancePolicy(db, service, {
        application,
        provider: insurer({ script: [{ kind: "issues", policyNumber: "POL-CANCEL" }] }).provider,
        idempotencyKey: "idem-cancel-setup",
      })
      expect(issuedResult.status).toBe("issued")
      if (issuedResult.status !== "issued") return

      const refusing = insurer({
        script: [],
        cancel: { kind: "throws", error: new Error("insurer unreachable") },
      })
      const failed = await cancelInsurancePolicy(db, service, {
        policy: issuedResult.policy,
        provider: refusing.provider,
        reason: "traveller cancelled the trip",
        idempotencyKey: "idem-cancel",
      })

      expect(failed.status).toBe("failed")
      // Still live at the insurer, so still live here. A local row saying
      // "cancelled" over a policy that is not is the worse of the two errors.
      const afterFailure = await getInsurancePolicyForApplication(db, application.id)
      expect(afterFailure?.issueState).toBe("issued")
      expect(afterFailure?.cancelledAt).toBeNull()

      const accepting = insurer({
        script: [],
        cancel: { kind: "cancels", refundMinor: 1500 },
      })
      const cancelled = await cancelInsurancePolicy(db, service, {
        policy: issuedResult.policy,
        provider: accepting.provider,
        reason: "traveller cancelled the trip",
        idempotencyKey: "idem-cancel",
      })

      expect(cancelled.status).toBe("cancelled")
      const afterSuccess = await getInsurancePolicyForApplication(db, application.id)
      expect(afterSuccess?.issueState).toBe("cancelled")
      expect(afterSuccess?.refundAmountMinor).toBe(1500)
      expect(accepting.cancelCalls[0]?.idempotencyKey).toBe("idem-cancel")
    },
    DB_TEST_TIMEOUT,
  )
})
