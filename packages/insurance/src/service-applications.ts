/**
 * Opening, reading and closing applications.
 *
 * An application is the only thing that stands between an accepted offer and a
 * charge, so the rules here are about time: it is opened with an expiry the
 * insurer set, and `isInsuranceApplicationIssuableAt` — not the stored status —
 * decides whether it can still become a policy. A row that expired five minutes
 * ago still says `accepted` until something notices, and the thing that notices
 * must not be the charge.
 */

import type { EventBus } from "@voyant-travel/core"
import type {
  InsuranceAnswer,
  InsuranceContractingParty,
  InsuranceEligibility,
  InsuranceMoney,
} from "@voyant-travel/insurance-contracts"
import { and, desc, eq, inArray, lt } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { emitInsuranceApplicationOpened } from "./events.js"
import type { InsuranceInsuredPersonInput, InsurancePiiService } from "./pii.js"
import { type InsuranceApplicationRow, insuranceApplications } from "./schema-applications.js"

export interface CreateInsuranceApplicationInput {
  bookingSessionId?: string | null
  bookingId?: string | null
  sourceId: string
  providerId: string
  providerApplicationRef?: string | null
  quoteRef: string
  title: string
  planName?: string | null
  planLabel?: string | null
  status?: InsuranceApplicationRow["status"]
  expiresAt: Date
  premium: InsuranceMoney
  eligibility: InsuranceEligibility
  selectedOptionalCoverIds?: readonly string[]
  acceptedDisclosures?: ReadonlyArray<{ kind: string; versionId: string; acceptedAt: string }>
  insuredPersons: readonly InsuranceInsuredPersonInput[]
  contractingParty: InsuranceContractingParty
  answers?: readonly InsuranceAnswer[]
  metadata?: Record<string, unknown> | null
}

export interface InsuranceApplicationServiceDeps {
  pii: InsurancePiiService
  actorId?: string | null
  /** Optional: a deployment that binds no bus still opens applications. */
  eventBus?: EventBus
}

/**
 * Open an application and store its toxic parts encrypted, in one transaction.
 *
 * The transaction is not decoration. The row and the insured persons are one
 * fact — an application with no insured persons cannot be issued and cannot be
 * repaired, because the identity data it needs was never anywhere else.
 */
export async function createInsuranceApplication(
  db: PostgresJsDatabase,
  deps: InsuranceApplicationServiceDeps,
  input: CreateInsuranceApplicationInput,
): Promise<InsuranceApplicationRow> {
  const row = await db.transaction(async (tx) => {
    const transaction = tx as PostgresJsDatabase
    const [row] = await transaction
      .insert(insuranceApplications)
      .values({
        bookingSessionId: input.bookingSessionId ?? null,
        bookingId: input.bookingId ?? null,
        sourceId: input.sourceId,
        providerId: input.providerId,
        providerApplicationRef: input.providerApplicationRef ?? null,
        quoteRef: input.quoteRef,
        title: input.title,
        planName: input.planName ?? null,
        planLabel: input.planLabel ?? null,
        status: input.status ?? "open",
        expiresAt: input.expiresAt,
        premiumAmountMinor: input.premium.amountMinor,
        premiumCurrency: input.premium.currency,
        eligibilityStatus: input.eligibility.status,
        eligibilityReasons: input.eligibility.reasons.map((reason) => ({
          code: reason.code,
          message: reason.message,
        })),
        selectedOptionalCoverIds: [...(input.selectedOptionalCoverIds ?? [])],
        acceptedDisclosures: [...(input.acceptedDisclosures ?? [])],
        metadata: input.metadata ?? null,
      })
      .returning()

    if (!row) {
      throw new Error("Opening an insurance application inserted no row.")
    }

    await deps.pii.writeInsuredPersons(transaction, row.id, input.insuredPersons, deps.actorId)
    await deps.pii.writeContractingParty(transaction, row.id, input.contractingParty, deps.actorId)
    await deps.pii.writeAnswers(transaction, row.id, input.answers ?? [], deps.actorId)

    return row
  })

  // After the transaction, not inside it: a subscriber that reads the
  // application back has to find it, and a bus emit inside a transaction
  // announces a row that may still roll back.
  await emitInsuranceApplicationOpened(deps.eventBus, {
    applicationId: row.id,
    bookingSessionId: row.bookingSessionId,
    providerId: row.providerId,
    premiumAmountMinor: row.premiumAmountMinor,
    premiumCurrency: row.premiumCurrency,
    insuredPersonCount: input.insuredPersons.length,
  })

  return row
}

export async function getInsuranceApplication(
  db: PostgresJsDatabase,
  applicationId: string,
): Promise<InsuranceApplicationRow | null> {
  const [row] = await db
    .select()
    .from(insuranceApplications)
    .where(eq(insuranceApplications.id, applicationId))
    .limit(1)
  return row ?? null
}

export async function getInsuranceApplicationByQuoteRef(
  db: PostgresJsDatabase,
  sourceId: string,
  quoteRef: string,
): Promise<InsuranceApplicationRow | null> {
  const [row] = await db
    .select()
    .from(insuranceApplications)
    .where(
      and(
        eq(insuranceApplications.sourceId, sourceId),
        eq(insuranceApplications.quoteRef, quoteRef),
      ),
    )
    .orderBy(desc(insuranceApplications.createdAt))
    .limit(1)
  return row ?? null
}

export async function listInsuranceApplicationsForBooking(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<InsuranceApplicationRow[]> {
  return db
    .select()
    .from(insuranceApplications)
    .where(eq(insuranceApplications.bookingId, bookingId))
    .orderBy(desc(insuranceApplications.createdAt))
}

export async function listInsuranceApplicationsForSession(
  db: PostgresJsDatabase,
  bookingSessionId: string,
): Promise<InsuranceApplicationRow[]> {
  return db
    .select()
    .from(insuranceApplications)
    .where(eq(insuranceApplications.bookingSessionId, bookingSessionId))
    .orderBy(desc(insuranceApplications.createdAt))
}

/** Called once payment produced a booking, closing the soft link both ways. */
export async function attachInsuranceApplicationToBooking(
  db: PostgresJsDatabase,
  applicationId: string,
  bookingId: string,
): Promise<InsuranceApplicationRow | null> {
  const [row] = await db
    .update(insuranceApplications)
    .set({ bookingId, updatedAt: new Date() })
    .where(eq(insuranceApplications.id, applicationId))
    .returning()
  return row ?? null
}

export async function setInsuranceApplicationStatus(
  db: PostgresJsDatabase,
  applicationId: string,
  status: InsuranceApplicationRow["status"],
): Promise<InsuranceApplicationRow | null> {
  const [row] = await db
    .update(insuranceApplications)
    .set({ status, updatedAt: new Date() })
    .where(eq(insuranceApplications.id, applicationId))
    .returning()
  return row ?? null
}

/**
 * Mark applications whose window has closed.
 *
 * Only the states that could still have become a policy are moved. An
 * application that was already declined or withdrawn did not expire — it ended
 * — and rewriting its outcome would erase why.
 */
export async function expireInsuranceApplications(
  db: PostgresJsDatabase,
  at: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(insuranceApplications)
    .set({ status: "expired", updatedAt: at })
    .where(
      and(
        lt(insuranceApplications.expiresAt, at),
        inArray(insuranceApplications.status, ["open", "submitted", "accepted"]),
      ),
    )
    .returning({ id: insuranceApplications.id })
  return rows.length
}

/** The application's premium as the money shape the rest of the platform reads. */
export function insuranceApplicationPremium(row: InsuranceApplicationRow): InsuranceMoney {
  return { amountMinor: row.premiumAmountMinor, currency: row.premiumCurrency }
}

/**
 * Whether the row can still become a policy.
 *
 * Deliberately takes `at` rather than reading the clock, so a batch reconciling
 * many applications evaluates them all against one instant and a test does not
 * have to move time.
 */
export function isInsuranceApplicationRowIssuableAt(
  row: InsuranceApplicationRow,
  at: Date,
): boolean {
  if (row.status !== "open" && row.status !== "accepted" && row.status !== "submitted") {
    return false
  }
  return row.expiresAt.getTime() > at.getTime()
}
