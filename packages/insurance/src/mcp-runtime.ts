/**
 * Wiring the insurance Tools to this deployment's database and bound insurers.
 *
 * Mirrors `packages/cruises/src/mcp-runtime.ts`: the Tool definitions in
 * `tools.ts` are pure and transport-neutral, and this file is the only place
 * that knows there is a request, a Drizzle client and a set of provider
 * adapters behind them.
 *
 * The reads here deliberately pass `reveal: false` into the service. An agent
 * holding `insurance:read` gets the commercial picture; identity data is behind
 * `insurance-pii:read` and behind a human-facing surface, and a tool result is
 * exactly the kind of thing that ends up copied into a transcript.
 */

import type { EventBus } from "@voyant-travel/core"
import type { InsuranceProviderAdapter } from "@voyant-travel/insurance-contracts/provider"
import { defineToolContextContribution } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import {
  INSURANCE_BOOKING_ACTIVITY_EVENTS,
  recordInsuranceBookingActivity,
} from "./booking-integration.js"
import type { InsuranceRuntime } from "./runtime-port.js"
import { insuranceInsuredPersons } from "./schema-insured-persons.js"
import type { InsurancePolicyRow } from "./schema-policies.js"
import { insuranceService } from "./service.js"
import {
  getInsuranceApplication,
  listInsuranceApplicationsForBooking,
} from "./service-applications.js"
import {
  cancelInsurancePolicy,
  getInsurancePolicy,
  issueInsurancePolicy,
  listInsurancePoliciesForBooking,
} from "./service-policies.js"
import type { InsuranceToolServices } from "./tools.js"

export * from "./tools.js"

type InsuranceToolRequestEnv = {
  Variables: {
    eventBus?: EventBus
    insuranceRuntime?: InsuranceRuntime
    insuranceProviders?: readonly InsuranceProviderAdapter[]
  }
}

function toPolicyTool(row: InsurancePolicyRow) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    bookingId: row.bookingId ?? null,
    providerId: row.providerId,
    policyNumber: row.policyNumber ?? null,
    issueState: row.issueState,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    premium: { amountMinor: row.premiumAmountMinor, currency: row.premiumCurrency },
    issueAttempts: row.issueAttempts,
    failure:
      row.failureCode && row.failureMessage
        ? {
            code: row.failureCode,
            message: row.failureMessage,
            retryable: row.failureRetryable ?? false,
          }
        : null,
  }
}

async function countInsuredPersons(db: PostgresJsDatabase, applicationId: string): Promise<number> {
  const rows = await db
    .select({ id: insuranceInsuredPersons.id })
    .from(insuranceInsuredPersons)
    .where(eq(insuranceInsuredPersons.applicationId, applicationId))
  return rows.length
}

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["insurance"],
  contribute({ request, context }) {
    const c = request as Context<InsuranceToolRequestEnv>
    const db = context.db as PostgresJsDatabase
    const runtime = c.get("insuranceRuntime")
    const providers = c.get("insuranceProviders") ?? []
    const eventBus = c.get("eventBus")

    const findProvider = (providerId: string) =>
      providers.find((provider) => provider.providerId === providerId) ?? null

    const services: InsuranceToolServices = {
      async getBookingInsurance({ bookingId }) {
        const [applications, policies] = await Promise.all([
          listInsuranceApplicationsForBooking(db, bookingId),
          listInsurancePoliciesForBooking(db, bookingId),
        ])
        return {
          bookingId,
          applications: await Promise.all(
            applications.map(async (application) => ({
              id: application.id,
              bookingId: application.bookingId ?? null,
              providerId: application.providerId,
              status: application.status,
              title: application.title,
              planLabel: application.planLabel ?? null,
              premium: {
                amountMinor: application.premiumAmountMinor,
                currency: application.premiumCurrency,
              },
              expiresAt: application.expiresAt.toISOString(),
              eligibilityStatus: application.eligibilityStatus,
              insuredPersonCount: await countInsuredPersons(db, application.id),
              createdAt: application.createdAt.toISOString(),
            })),
          ),
          policies: policies.map(toPolicyTool),
        }
      },

      async getPolicy({ policyId }) {
        const row = await getInsurancePolicy(db, policyId)
        return row ? toPolicyTool(row) : null
      },

      async retryIssue({ policyId, reason }) {
        if (!runtime) return null
        const policy = await getInsurancePolicy(db, policyId)
        if (!policy) return null
        if (policy.issueState === "issued" || policy.issueState === "cancelled") {
          return { status: "failed" as const, policy: toPolicyTool(policy) }
        }
        const application = await getInsuranceApplication(db, policy.applicationId)
        if (!application) return null
        const provider = findProvider(application.providerId)
        if (!provider) return { status: "failed" as const, policy: toPolicyTool(policy) }

        if (policy.bookingId) {
          await recordInsuranceBookingActivity(db, policy.bookingId, {
            event: INSURANCE_BOOKING_ACTIVITY_EVENTS.issueRetried,
            description: reason
              ? `Insurance issue retried: ${reason}`
              : "Insurance issue retried by an agent",
            metadata: { policyId: policy.id, applicationId: application.id },
          })
        }

        const result = await issueInsurancePolicy(
          db,
          { pii: runtime.createPiiService(), integration: runtime.bookingIntegration(), eventBus },
          {
            application,
            provider,
            bookingId: policy.bookingId,
            paid: true,
            idempotencyKey: `insurance-retry:${policy.id}:${policy.issueAttempts + 1}`,
          },
        )
        return {
          status: result.status === "issued" ? ("issued" as const) : ("failed" as const),
          policy: toPolicyTool(result.policy),
        }
      },

      async cancelPolicy({ policyId, reason }) {
        if (!runtime) return null
        const policy = await getInsurancePolicy(db, policyId)
        if (!policy) return null
        if (policy.issueState !== "issued") {
          return { error: `policy is ${policy.issueState}` }
        }
        const provider = findProvider(policy.providerId)
        if (!provider) return { error: `no provider connected for ${policy.providerId}` }

        const result = await cancelInsurancePolicy(
          db,
          { pii: runtime.createPiiService(), integration: runtime.bookingIntegration(), eventBus },
          { policy, provider, reason, idempotencyKey: `insurance-cancel:${policy.id}` },
        )
        if (result.status === "failed") return { error: result.message }
        return { status: "cancelled" as const, policy: toPolicyTool(result.policy) }
      },
    }

    return { insurance: services }
  },
})

/** Re-exported so a host that already holds a runtime can build the same reads. */
export { insuranceService }
