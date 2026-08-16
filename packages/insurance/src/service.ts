/**
 * The reads the admin surface and the customer portal are built on.
 *
 * Each one takes `reveal` explicitly. That is the whole design: the decision
 * about identity data is made once, at the boundary that can see the caller's
 * scopes, and travels down as a value. Nothing below this line consults ambient
 * authority, so nothing below this line can be called from a background job and
 * quietly return more than a route would have.
 */

import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { InsurancePiiService } from "./pii.js"
import { insuranceInsuredPersons } from "./schema-insured-persons.js"
import {
  getInsuranceApplication,
  listInsuranceApplicationsForBooking,
} from "./service-applications.js"
import {
  toInsuranceApplicationWire,
  toInsuranceInsuredPersonWire,
  toInsurancePolicyWire,
} from "./service-mapping.js"
import { listInsurancePoliciesForBooking } from "./service-policies.js"
import type {
  InsuranceApplicationWire,
  InsuranceBookingOverview,
  InsuranceInsuredPersonWire,
} from "./validation.js"

export interface InsuranceReadOptions {
  pii: InsurancePiiService
  /** Decided by the caller from `shouldRevealInsurancePii`. */
  reveal: boolean
  actorId?: string | null
}

async function projectInsuredPersons(
  db: PostgresJsDatabase,
  applicationId: string,
  options: InsuranceReadOptions,
): Promise<InsuranceInsuredPersonWire[]> {
  const rows = await db
    .select()
    .from(insuranceInsuredPersons)
    .where(eq(insuranceInsuredPersons.applicationId, applicationId))

  // Decrypting to then redact would fire an audited read for a caller who is
  // not allowed to see the result, which is both a lie in the audit log and a
  // decryption nobody asked for. So the unauthorised path never decrypts.
  if (!options.reveal) {
    return rows.map((row) => toInsuranceInsuredPersonWire({ row }, false))
  }

  const decrypted = await options.pii.readInsuredPersons(db, applicationId, options.actorId)
  const byId = new Map(decrypted.map((person) => [person.id, person]))
  return rows.map((row) => toInsuranceInsuredPersonWire({ row, decrypted: byId.get(row.id) }, true))
}

export const insuranceService = {
  /** Everything attached to one booking, for the operator's booking page. */
  async getBookingOverview(
    db: PostgresJsDatabase,
    bookingId: string,
    options: InsuranceReadOptions,
  ): Promise<InsuranceBookingOverview> {
    const [applications, policies] = await Promise.all([
      listInsuranceApplicationsForBooking(db, bookingId),
      listInsurancePoliciesForBooking(db, bookingId),
    ])

    const projected = await Promise.all(
      applications.map(async (application) =>
        toInsuranceApplicationWire(
          application,
          await projectInsuredPersons(db, application.id, options),
        ),
      ),
    )

    return {
      bookingId,
      applications: projected,
      policies: policies.map(toInsurancePolicyWire),
    }
  },

  async getApplication(
    db: PostgresJsDatabase,
    applicationId: string,
    options: InsuranceReadOptions,
  ): Promise<InsuranceApplicationWire | null> {
    const row = await getInsuranceApplication(db, applicationId)
    if (!row) return null
    return toInsuranceApplicationWire(row, await projectInsuredPersons(db, row.id, options))
  },
}

export type InsuranceService = typeof insuranceService
