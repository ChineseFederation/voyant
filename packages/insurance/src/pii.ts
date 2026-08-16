/**
 * Every encrypt and every decrypt of insurance identity data goes through here.
 *
 * Modelled on `packages/bookings/src/pii.ts`: a KMS envelope in the column, a
 * schema parse on the way out, and an audit callback on every operation. The
 * audit callback is not optional decoration — an insurer application carries a
 * document number and, routinely, a medical declaration, and "who read this and
 * when" is the only thing that makes storing it defensible.
 *
 * Nothing outside this module decrypts. The routes hand back the redacted shape
 * from `pii-redaction.ts` unless the caller holds `insurance-pii:read`, and the
 * decrypted shape never reaches an event payload, a log line or a tool result.
 */

import {
  type InsuranceAnswer,
  type InsuranceContractingParty,
  type InsuranceInsuredPerson,
  insuranceAnswerSchema,
  insuranceContractingPartySchema,
  insuranceCountryCodeSchema,
  insuranceDateSchema,
  insuranceIdentityDocumentSchema,
} from "@voyant-travel/insurance-contracts"
import type { KeyRef, KmsProvider } from "@voyant-travel/utils/kms"
import { decryptOptionalJsonEnvelope, encryptOptionalJsonEnvelope } from "@voyant-travel/utils/kms"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import { insuranceApplications } from "./schema-applications.js"
import { insuranceInsuredPersons } from "./schema-insured-persons.js"

/** The plaintext shape stored inside `insurance_insured_persons.identity_encrypted`. */
export const insuranceInsuredIdentitySchema = z
  .object({
    givenName: z.string().min(1),
    familyName: z.string().min(1),
    dateOfBirth: insuranceDateSchema,
    residencyCountry: insuranceCountryCodeSchema.optional(),
    identityDocuments: z.array(insuranceIdentityDocumentSchema).default([]),
  })
  .strict()

export type InsuranceInsuredIdentity = z.infer<typeof insuranceInsuredIdentitySchema>

/** The plaintext shape stored inside `insurance_applications.answers_encrypted`. */
export const insuranceAnswersEnvelopeSchema = z
  .object({ answers: z.array(insuranceAnswerSchema).default([]) })
  .strict()

export interface InsurancePiiAuditEvent {
  action: "encrypt" | "decrypt" | "delete"
  /** What was touched, so an audit row says more than "insurance". */
  subject: "insured_person" | "contracting_party" | "answers"
  applicationId: string
  insuredPersonId?: string | null
  actorId?: string | null
}

export interface InsurancePiiServiceOptions {
  kms: KmsProvider
  keyRef?: KeyRef
  onAudit?: (event: InsurancePiiAuditEvent) => void | Promise<void>
}

/** An insured person as the caller supplies them, before encryption. */
export interface InsuranceInsuredPersonInput {
  ref: string
  identity: InsuranceInsuredIdentity
  /** The traveller on the booking this person corresponds to, when they do. */
  bookingTravelerId?: string | null
}

/** An insured person as a decrypting caller gets them back. */
export interface DecryptedInsuranceInsuredPerson {
  id: string
  applicationId: string
  policyId: string | null
  ref: string
  bookingTravelerId: string | null
  identity: InsuranceInsuredIdentity | null
}

export interface InsurancePiiService {
  /** Replaces the application's insured set. Encrypts each identity. */
  writeInsuredPersons(
    db: PostgresJsDatabase,
    applicationId: string,
    persons: readonly InsuranceInsuredPersonInput[],
    actorId?: string | null,
  ): Promise<void>
  readInsuredPersons(
    db: PostgresJsDatabase,
    applicationId: string,
    actorId?: string | null,
  ): Promise<DecryptedInsuranceInsuredPerson[]>
  writeContractingParty(
    db: PostgresJsDatabase,
    applicationId: string,
    party: InsuranceContractingParty | null,
    actorId?: string | null,
  ): Promise<void>
  readContractingParty(
    db: PostgresJsDatabase,
    applicationId: string,
    actorId?: string | null,
  ): Promise<InsuranceContractingParty | null>
  writeAnswers(
    db: PostgresJsDatabase,
    applicationId: string,
    answers: readonly InsuranceAnswer[],
    actorId?: string | null,
  ): Promise<void>
  readAnswers(
    db: PostgresJsDatabase,
    applicationId: string,
    actorId?: string | null,
  ): Promise<InsuranceAnswer[]>
  /** Links insured persons to the policy that was issued for their application. */
  attachPolicy(db: PostgresJsDatabase, applicationId: string, policyId: string): Promise<void>
}

/**
 * The one non-toxic thing kept in plaintext: a single character so an operator
 * list can tell two insured people apart. Never a name, never a fragment long
 * enough to become one.
 */
export function insuredDisplayInitial(identity: InsuranceInsuredIdentity): string | null {
  const first = identity.familyName.trim()[0] ?? identity.givenName.trim()[0]
  return first ? first.toUpperCase() : null
}

/** Convert the contract's insured-person shape into what this module stores. */
export function toInsuredPersonInput(
  person: InsuranceInsuredPerson,
  bookingTravelerId?: string | null,
): InsuranceInsuredPersonInput {
  return {
    ref: person.ref,
    bookingTravelerId: bookingTravelerId ?? null,
    identity: insuranceInsuredIdentitySchema.parse({
      givenName: person.givenName,
      familyName: person.familyName,
      dateOfBirth: person.dateOfBirth,
      ...(person.residencyCountry ? { residencyCountry: person.residencyCountry } : {}),
      identityDocuments: person.identityDocuments,
    }),
  }
}

export function createInsurancePiiService(
  options: InsurancePiiServiceOptions,
): InsurancePiiService {
  const keyRef = options.keyRef ?? { keyType: "people" as const }

  return {
    async writeInsuredPersons(db, applicationId, persons, actorId) {
      await db
        .delete(insuranceInsuredPersons)
        .where(eq(insuranceInsuredPersons.applicationId, applicationId))

      if (persons.length === 0) return

      const now = new Date()
      const rows = await Promise.all(
        persons.map(async (person) => ({
          applicationId,
          ref: person.ref,
          displayInitial: insuredDisplayInitial(person.identity),
          bookingTravelerId: person.bookingTravelerId ?? null,
          identityEncrypted: await encryptOptionalJsonEnvelope(
            options.kms,
            keyRef,
            person.identity,
          ),
          updatedAt: now,
        })),
      )

      await db.insert(insuranceInsuredPersons).values(rows)
      await options.onAudit?.({
        action: "encrypt",
        subject: "insured_person",
        applicationId,
        actorId,
      })
    },

    async readInsuredPersons(db, applicationId, actorId) {
      const rows = await db
        .select()
        .from(insuranceInsuredPersons)
        .where(eq(insuranceInsuredPersons.applicationId, applicationId))

      const decrypted = await Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          applicationId: row.applicationId,
          policyId: row.policyId ?? null,
          ref: row.ref,
          bookingTravelerId: row.bookingTravelerId ?? null,
          identity: await decryptOptionalJsonEnvelope(
            options.kms,
            keyRef,
            row.identityEncrypted,
            insuranceInsuredIdentitySchema,
          ),
        })),
      )

      if (decrypted.length > 0) {
        await options.onAudit?.({
          action: "decrypt",
          subject: "insured_person",
          applicationId,
          actorId,
        })
      }
      return decrypted
    },

    async writeContractingParty(db, applicationId, party, actorId) {
      const contractingPartyEncrypted = await encryptOptionalJsonEnvelope(
        options.kms,
        keyRef,
        party,
      )
      await db
        .update(insuranceApplications)
        .set({ contractingPartyEncrypted, updatedAt: new Date() })
        .where(eq(insuranceApplications.id, applicationId))
      await options.onAudit?.({
        action: party ? "encrypt" : "delete",
        subject: "contracting_party",
        applicationId,
        actorId,
      })
    },

    async readContractingParty(db, applicationId, actorId) {
      const [row] = await db
        .select({ envelope: insuranceApplications.contractingPartyEncrypted })
        .from(insuranceApplications)
        .where(eq(insuranceApplications.id, applicationId))
        .limit(1)
      if (!row) return null

      const party = await decryptOptionalJsonEnvelope(
        options.kms,
        keyRef,
        row.envelope,
        insuranceContractingPartySchema,
      )
      if (party) {
        await options.onAudit?.({
          action: "decrypt",
          subject: "contracting_party",
          applicationId,
          actorId,
        })
      }
      return party
    },

    async writeAnswers(db, applicationId, answers, actorId) {
      const answersEncrypted = await encryptOptionalJsonEnvelope(
        options.kms,
        keyRef,
        answers.length > 0 ? { answers: [...answers] } : null,
      )
      await db
        .update(insuranceApplications)
        .set({ answersEncrypted, updatedAt: new Date() })
        .where(eq(insuranceApplications.id, applicationId))
      await options.onAudit?.({
        action: answers.length > 0 ? "encrypt" : "delete",
        subject: "answers",
        applicationId,
        actorId,
      })
    },

    async readAnswers(db, applicationId, actorId) {
      const [row] = await db
        .select({ envelope: insuranceApplications.answersEncrypted })
        .from(insuranceApplications)
        .where(eq(insuranceApplications.id, applicationId))
        .limit(1)
      if (!row) return []

      const payload = await decryptOptionalJsonEnvelope(
        options.kms,
        keyRef,
        row.envelope,
        insuranceAnswersEnvelopeSchema,
      )
      if (!payload) return []
      await options.onAudit?.({
        action: "decrypt",
        subject: "answers",
        applicationId,
        actorId,
      })
      return payload.answers
    },

    async attachPolicy(db, applicationId, policyId) {
      await db
        .update(insuranceInsuredPersons)
        .set({ policyId, updatedAt: new Date() })
        .where(eq(insuranceInsuredPersons.applicationId, applicationId))
    },
  }
}
