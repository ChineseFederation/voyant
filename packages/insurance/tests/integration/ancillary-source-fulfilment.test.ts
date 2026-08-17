/**
 * The far side of the checkout ancillary seam, driven as checkout drives it.
 *
 * `packages/commerce`'s own integration test proves that an accepted offer is
 * prepared at commit, charged onto the booking, and fulfilled after payment —
 * against a scripted `AncillaryOfferSource`, because commerce may not depend on
 * a module that binds one. This is the other half: the same two calls, in the
 * same order, made on the real insurance source with a scripted insurer behind
 * it, so the things only this module can show are actually shown:
 *
 *  - `prepare` opens a real application row against the Booking Session.
 *  - `fulfill` issues, and the certificate reaches the booking through the
 *    booking-document path rather than being left at the insurer.
 *  - an issue that fails *after* payment leaves `issue_failed` with the reason
 *    and the retryable flag, and raises the staff alert — the path that was
 *    unreachable until something started calling `fulfill` (voyant#4756).
 *  - a second `fulfill` for the same application does not ask the insurer to
 *    issue again, because a redelivered `payment.completed` re-runs the saga.
 */

import { bookings } from "@voyant-travel/bookings"
import type {
  InsuranceApplication,
  InsuranceApplicationInput,
  InsuranceDocument,
  InsurancePolicy,
  InsuranceProviderAdapter,
  InsuranceQuote,
} from "@voyant-travel/insurance-contracts"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createInsuranceAncillaryOfferSource } from "../../src/ancillary-source.js"
import type {
  InsuranceBookingIntegration,
  InsuranceIssueFailedAlertContext,
} from "../../src/booking-integration.js"
import { createInsurancePiiService } from "../../src/pii.js"
import { insuranceApplications } from "../../src/schema-applications.js"
import { insurancePolicies } from "../../src/schema-policies.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

/** Cleanup truncates the whole operator schema; 5s is not a realistic budget. */
const DB_TEST_TIMEOUT = 60_000

const PREMIUM = { amountMinor: 4_200, currency: "EUR" } as const
const BOOKING_SESSION_ID = "bses_ancillary_fixture"

const CERTIFICATE: InsuranceDocument = {
  documentId: "doc-cert-1",
  kind: "policy_certificate",
  filename: "certificate.pdf",
  mimeType: "application/pdf",
  source: { kind: "url", url: "https://insurer.test/certificate.pdf" },
}

type IssueStep =
  | { kind: "issues"; policyNumber: string; premiumMinor?: number }
  | { kind: "refuses"; code: string; message: string; retryable: boolean }

function insurer(options: { script: readonly IssueStep[] }) {
  const applyCalls: InsuranceApplicationInput[] = []
  const issueCalls: string[] = []
  let issued = 0

  const provider: InsuranceProviderAdapter = {
    providerId: "test-insurer",
    displayName: "Test Insurer",
    async quote(): Promise<InsuranceQuote[]> {
      return []
    },
    async apply(input, context): Promise<InsuranceApplication> {
      applyCalls.push(input)
      return {
        applicationId: `app-provider-${applyCalls.length}`,
        providerId: "test-insurer",
        quoteId: input.quoteId,
        status: "open",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        premium: PREMIUM,
        insuredPersons: input.insuredPersons,
        contractingParty: input.contractingParty,
        outstandingQuestions: [],
        answers: [],
        eligibility: { status: "eligible", reasons: [] },
        createdAt: new Date().toISOString(),
        metadata: { idempotencyKey: context.idempotencyKey ?? null },
      }
    },
    async issue(_input, context): Promise<InsurancePolicy> {
      issueCalls.push(context.idempotencyKey ?? "")
      const step = options.script[Math.min(issued, options.script.length - 1)]
      issued += 1
      if (!step) throw new Error("insurer script exhausted")
      const base = {
        policyId: "pol-provider-1",
        providerId: "test-insurer",
        applicationId: "app-provider-1",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2026-09-08",
        insuredPersons: [
          {
            ref: "traveler-0",
            givenName: "Ana",
            familyName: "Popescu",
            dateOfBirth: "1990-04-02",
            identityDocuments: [],
          },
        ],
        contractingParty: {
          givenName: "Ana",
          familyName: "Popescu",
          email: "ana@example.test",
        },
        covers: [],
        // Deliberately NOT `as const`: it makes `covers` a `readonly []`, and a
        // readonly array is not assignable to the mutable one `InsurancePolicy`
        // declares. `build` never sees this — only `typecheck` reads `tests/**`.
      } satisfies Partial<InsurancePolicy>

      if (step.kind === "refuses") {
        return {
          ...base,
          issueState: "issue_failed",
          premium: PREMIUM,
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
        ...base,
        policyNumber: step.policyNumber,
        issueState: "issued",
        issuedAt: "2026-08-16T10:00:00.000Z",
        premium: { amountMinor: step.premiumMinor ?? PREMIUM.amountMinor, currency: "EUR" },
        documents: [CERTIFICATE],
        providerReference: "PRV-1",
      }
    },
    async document(): Promise<InsuranceDocument> {
      return CERTIFICATE
    },
    async cancel() {
      throw new Error("cancel is not exercised by this test")
    },
  }

  return { provider, applyCalls, issueCalls }
}

describe.skipIf(!DB_AVAILABLE)("insurance as a checkout ancillary source", () => {
  let db: PostgresJsDatabase
  let sequence = 0

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  }, DB_TEST_TIMEOUT)

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function pii() {
    const { generateEnvKmsKey, EnvKmsProvider } = await import("@voyant-travel/utils")
    return createInsurancePiiService({ kms: new EnvKmsProvider({ key: generateEnvKmsKey() }) })
  }

  async function seedBooking() {
    sequence += 1
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-ANC-${sequence}-${Math.floor(Math.random() * 1_000_000)}`,
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Popescu",
        contactEmail: "ana@example.test",
        sellCurrency: "EUR",
        sellAmountCents: 120_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      })
      .returning()
    return booking!
  }

  /** What checkout hands the source once the traveller has accepted an offer. */
  function acceptedSelection(quoteRef: string) {
    return {
      kind: "insurance",
      decision: "accepted" as const,
      offerId: "quote-1",
      sourceId: "insurance",
      providerId: "test-insurer",
      quoteRef,
      travelers: [
        {
          ref: "traveler-0",
          fields: {
            given_name: "Ana",
            family_name: "Popescu",
            date_of_birth: "1990-04-02",
          },
        },
      ],
      selectedOptionIds: [],
      acceptedDisclosures: [
        { kind: "ipid", versionId: "v1", acceptedAt: "2026-08-16T09:00:00.000Z" },
      ],
    }
  }

  async function sourceFor(
    provider: InsuranceProviderAdapter,
    integration?: InsuranceBookingIntegration,
  ) {
    const piiService = await pii()
    return createInsuranceAncillaryOfferSource({
      resolveProviders: async () => [provider],
      resolveDb: () => db,
      resolvePii: () => piiService,
      ...(integration ? { resolveIntegration: () => integration } : {}),
    })
  }

  function documentRecorder() {
    const recorded: Array<{ bookingId: string; fileName: string; issuedNumber: string | null }> = []
    return {
      recorded,
      integration: {
        documents: {
          async record(input: {
            bookingId: string
            fileName: string
            issuedNumber: string | null
          }) {
            recorded.push({
              bookingId: input.bookingId,
              fileName: input.fileName,
              issuedNumber: input.issuedNumber,
            })
            return { documentId: `bdoc_${recorded.length}`, replayed: false }
          },
        },
      } satisfies InsuranceBookingIntegration,
    }
  }

  it(
    "opens an application at prepare and issues a certificate at fulfil",
    async () => {
      const booking = await seedBooking()
      const { provider, applyCalls, issueCalls } = insurer({
        script: [{ kind: "issues", policyNumber: "POL-1" }],
      })
      const { recorded, integration } = documentRecorder()
      const source = await sourceFor(provider, integration)

      // Pre-payment: the accepted offer becomes a held application, and the
      // price it hands back is what the booking will charge.
      const prepared = await source.prepare({
        bookingSessionId: BOOKING_SESSION_ID,
        selection: acceptedSelection(encodeQuoteRef("test-insurer", "quote-1")),
        contact: {
          firstName: "Ana",
          lastName: "Popescu",
          email: "ana@example.test",
        },
        idempotencyKey: `ancillary-prepare:${booking.id}:insurance::test-insurer::quote-1`,
      })

      expect(applyCalls).toHaveLength(1)
      expect(prepared.priceMinor).toBe(PREMIUM.amountMinor)
      const [application] = await db
        .select()
        .from(insuranceApplications)
        .where(eq(insuranceApplications.id, prepared.applicationRef))
      expect(application).toMatchObject({
        bookingSessionId: BOOKING_SESSION_ID,
        providerId: "test-insurer",
        premiumAmountMinor: PREMIUM.amountMinor,
      })
      // Not attached to a booking yet — there is no booking on a Session.
      expect(application?.bookingId).toBeNull()

      // Post-payment: issue, attach, and report what was settled.
      const result = await source.fulfill({
        bookingId: booking.id,
        applicationRef: prepared.applicationRef,
        sourceId: prepared.sourceId,
        chargedPriceMinor: prepared.priceMinor,
        currency: prepared.currency,
        idempotencyKey: `ancillary-fulfill:${booking.id}:bitm_1`,
      })

      expect(result).toMatchObject({
        status: "fulfilled",
        reference: "POL-1",
        settledPriceMinor: PREMIUM.amountMinor,
        currency: "EUR",
      })
      expect(result.status === "fulfilled" && result.documentIds).toEqual(["bdoc_1"])

      // The certificate went onto the booking through the sanctioned path, not
      // into a column this module invented.
      expect(recorded).toEqual([
        { bookingId: booking.id, fileName: "certificate.pdf", issuedNumber: "POL-1" },
      ])

      const [policy] = await db
        .select()
        .from(insurancePolicies)
        .where(eq(insurancePolicies.applicationId, prepared.applicationRef))
      expect(policy).toMatchObject({
        issueState: "issued",
        policyNumber: "POL-1",
        bookingId: booking.id,
      })
      expect(issueCalls).toHaveLength(1)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "leaves issue_failed with the reason and raises the staff alert after payment",
    async () => {
      const booking = await seedBooking()
      const { provider } = insurer({
        script: [
          {
            kind: "refuses",
            code: "underwriting_declined",
            message: "The insurer refused the risk.",
            retryable: false,
          },
        ],
      })
      const alerts: InsuranceIssueFailedAlertContext[] = []
      const source = await sourceFor(provider, {
        staffAlerts: { raiseIssueFailed: async (context) => void alerts.push(context) },
      })

      const prepared = await source.prepare({
        bookingSessionId: BOOKING_SESSION_ID,
        selection: acceptedSelection(encodeQuoteRef("test-insurer", "quote-1")),
        contact: { firstName: "Ana", lastName: "Popescu", email: "ana@example.test" },
        idempotencyKey: `ancillary-prepare:${booking.id}:key`,
      })

      const result = await source.fulfill({
        bookingId: booking.id,
        applicationRef: prepared.applicationRef,
        sourceId: prepared.sourceId,
        chargedPriceMinor: prepared.priceMinor,
        currency: prepared.currency,
        idempotencyKey: `ancillary-fulfill:${booking.id}:bitm_1`,
      })

      // A refusal after the money is a result, never a thrown error.
      expect(result).toMatchObject({
        status: "failed",
        code: "underwriting_declined",
        retryable: false,
      })

      const [policy] = await db
        .select()
        .from(insurancePolicies)
        .where(eq(insurancePolicies.applicationId, prepared.applicationRef))
      expect(policy).toMatchObject({
        issueState: "issue_failed",
        failureCode: "underwriting_declined",
        failureMessage: "The insurer refused the risk.",
        failureRetryable: false,
      })

      // The alert exists for exactly this state: charged, and no policy.
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toMatchObject({
        bookingId: booking.id,
        paid: true,
        failureCode: "underwriting_declined",
        retryable: false,
        premium: { amountMinor: PREMIUM.amountMinor, currency: "EUR" },
      })
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "does not ask the insurer to issue twice when fulfilment is redelivered",
    async () => {
      const booking = await seedBooking()
      const { provider, issueCalls } = insurer({
        script: [{ kind: "issues", policyNumber: "POL-1" }],
      })
      const source = await sourceFor(provider)

      const prepared = await source.prepare({
        bookingSessionId: BOOKING_SESSION_ID,
        selection: acceptedSelection(encodeQuoteRef("test-insurer", "quote-1")),
        contact: { firstName: "Ana", lastName: "Popescu", email: "ana@example.test" },
        idempotencyKey: `ancillary-prepare:${booking.id}:key`,
      })

      const fulfilment = {
        bookingId: booking.id,
        applicationRef: prepared.applicationRef,
        sourceId: prepared.sourceId,
        chargedPriceMinor: prepared.priceMinor,
        currency: prepared.currency,
        idempotencyKey: `ancillary-fulfill:${booking.id}:bitm_1`,
      }
      const first = await source.fulfill(fulfilment)
      const second = await source.fulfill(fulfilment)

      expect(issueCalls).toHaveLength(1)
      expect(first.status).toBe("fulfilled")
      expect(second).toMatchObject({ status: "fulfilled", reference: "POL-1" })
      const policies = await db
        .select()
        .from(insurancePolicies)
        .where(eq(insurancePolicies.applicationId, prepared.applicationRef))
      expect(policies).toHaveLength(1)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "reports what the insurer settled when it differs from what was charged",
    async () => {
      const booking = await seedBooking()
      const { provider } = insurer({
        script: [
          { kind: "issues", policyNumber: "POL-3", premiumMinor: PREMIUM.amountMinor + 100 },
        ],
      })
      const source = await sourceFor(provider)

      const prepared = await source.prepare({
        bookingSessionId: BOOKING_SESSION_ID,
        selection: acceptedSelection(encodeQuoteRef("test-insurer", "quote-1")),
        contact: { firstName: "Ana", lastName: "Popescu", email: "ana@example.test" },
        idempotencyKey: `ancillary-prepare:${booking.id}:key`,
      })

      const result = await source.fulfill({
        bookingId: booking.id,
        applicationRef: prepared.applicationRef,
        sourceId: prepared.sourceId,
        chargedPriceMinor: prepared.priceMinor,
        currency: prepared.currency,
        idempotencyKey: `ancillary-fulfill:${booking.id}:bitm_1`,
      })

      // The source reports the settled amount honestly; deciding what to do
      // about the gap is the caller's, and `reconcileAncillaryPremium` records
      // it rather than quietly adjusting the booking.
      expect(result).toMatchObject({
        status: "fulfilled",
        settledPriceMinor: PREMIUM.amountMinor + 100,
      })
    },
    DB_TEST_TIMEOUT,
  )
})

/** Local mirror of the source's own opaque handle, so the test builds a real one. */
function encodeQuoteRef(providerId: string, quoteId: string): string {
  return Buffer.from(JSON.stringify({ p: providerId, q: quoteId }), "utf8").toString("base64url")
}
