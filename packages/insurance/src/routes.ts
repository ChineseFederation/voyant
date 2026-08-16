/**
 * The insurance admin surface: what an operator can see, and the two things
 * they can do.
 *
 * Reads are the bulk of it, because most of what an operator needs from
 * insurance is "what did we sell, and did it actually get issued". The two
 * writes both exist for the same failure — a traveller paid and has no policy —
 * so `retry-issue` asks the insurer again and `cancel` unwinds a policy that
 * should not exist.
 *
 * Neither write invents state: retrying an issue sends the insurer the
 * application it already holds, and cancelling goes to the insurer BEFORE the
 * row changes, so the operator never sees a cancelled policy that is still live
 * upstream.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { EventBus } from "@voyant-travel/core"
import { openApiValidationHook, parseJsonBody } from "@voyant-travel/hono"
import type { InsuranceProviderAdapter } from "@voyant-travel/insurance-contracts/provider"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import {
  INSURANCE_BOOKING_ACTIVITY_EVENTS,
  recordInsuranceBookingActivity,
} from "./booking-integration.js"
import { shouldRevealInsurancePii } from "./pii-redaction.js"
import { INSURANCE_OPENAPI_API_IDS } from "./routes-openapi.js"
import type { InsuranceRuntime } from "./runtime-port.js"
import { insuranceService } from "./service.js"
import { getInsuranceApplication } from "./service-applications.js"
import { toInsurancePolicyWire } from "./service-mapping.js"
import {
  cancelInsurancePolicy,
  getInsurancePolicy,
  issueInsurancePolicy,
} from "./service-policies.js"
import {
  applicationParamsSchema,
  bookingInsuranceParamsSchema,
  cancelInsurancePolicySchema,
  insuranceApplicationWireSchema,
  insuranceBookingOverviewSchema,
  insuranceErrorSchema,
  insurancePolicyWireSchema,
  policyParamsSchema,
  retryInsuranceIssueSchema,
} from "./validation.js"

export type InsuranceRoutesEnv = {
  Bindings: Record<string, unknown>
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    actor?: string | null
    scopes?: string[] | null
    callerType?: string | null
    isInternalRequest?: boolean
    eventBus?: EventBus
    /** Bound by the deployment from `insurance.runtime`. */
    insuranceRuntime?: InsuranceRuntime
  }
}

export interface InsuranceAdminRouteOptions {
  resolveRuntime(c: Context<InsuranceRoutesEnv>): InsuranceRuntime | undefined
  /**
   * Every bound `insurance.provider-source`. The retry and cancel legs need the
   * adapter that owns the policy; a deployment with none bound can still read.
   */
  resolveProviders?: () => Promise<readonly InsuranceProviderAdapter[]>
}

const jsonResponse = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
})

const errorResponse = (description: string) => jsonResponse(description, insuranceErrorSchema)

const dataEnvelope = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema })

function revealPii(c: Context<InsuranceRoutesEnv>): boolean {
  return shouldRevealInsurancePii({
    actor: c.get("actor"),
    scopes: c.get("scopes"),
    callerType: c.get("callerType"),
    isInternalRequest: c.get("isInternalRequest"),
    enforceRbac: true,
  })
}

const runtimeUnavailable = {
  error: "insurance_runtime_unavailable",
  detail:
    "No `insurance.runtime` provider is bound on this deployment, so insurance records cannot be read.",
}

const providerUnavailable = (providerId: string) => ({
  error: "insurance_provider_not_connected",
  detail: `No insurance provider is connected for '${providerId}'.`,
})

export function createInsuranceAdminRoutes(options: InsuranceAdminRouteOptions) {
  const routes = new OpenAPIHono<InsuranceRoutesEnv>({ defaultHook: openApiValidationHook })

  const bookingOverviewRoute = createRoute({
    "x-voyant-api-id": INSURANCE_OPENAPI_API_IDS.admin,
    method: "get",
    path: "/bookings/{bookingId}",
    summary: "Read a booking's insurance applications and policies",
    request: { params: bookingInsuranceParamsSchema },
    responses: {
      200: jsonResponse(
        "Applications and policies attached to the booking.",
        dataEnvelope(insuranceBookingOverviewSchema),
      ),
      503: errorResponse("Insurance runtime is not bound on this deployment."),
    },
  })

  const applicationRoute = createRoute({
    "x-voyant-api-id": INSURANCE_OPENAPI_API_IDS.admin,
    method: "get",
    path: "/applications/{applicationId}",
    summary: "Read one insurance application",
    request: { params: applicationParamsSchema },
    responses: {
      200: jsonResponse("The application.", dataEnvelope(insuranceApplicationWireSchema)),
      404: errorResponse("No such application."),
      503: errorResponse("Insurance runtime is not bound on this deployment."),
    },
  })

  const policyRoute = createRoute({
    "x-voyant-api-id": INSURANCE_OPENAPI_API_IDS.admin,
    method: "get",
    path: "/policies/{policyId}",
    summary: "Read one insurance policy",
    request: { params: policyParamsSchema },
    responses: {
      200: jsonResponse("The policy.", dataEnvelope(insurancePolicyWireSchema)),
      404: errorResponse("No such policy."),
    },
  })

  const retryRoute = createRoute({
    "x-voyant-api-id": INSURANCE_OPENAPI_API_IDS.admin,
    method: "post",
    path: "/policies/{policyId}/retry-issue",
    summary: "Ask the insurer to issue a policy again",
    request: {
      params: policyParamsSchema,
      body: {
        required: true,
        content: { "application/json": { schema: retryInsuranceIssueSchema } },
      },
    },
    responses: {
      200: jsonResponse("The policy after the retry.", dataEnvelope(insurancePolicyWireSchema)),
      404: errorResponse("No such policy, or its application is gone."),
      409: errorResponse("The policy is not in a state a retry applies to."),
      503: errorResponse("Insurance runtime or provider is not available."),
    },
  })

  const cancelRoute = createRoute({
    "x-voyant-api-id": INSURANCE_OPENAPI_API_IDS.admin,
    method: "post",
    path: "/policies/{policyId}/cancel",
    summary: "Cancel an issued policy at the insurer",
    request: {
      params: policyParamsSchema,
      body: {
        required: true,
        content: { "application/json": { schema: cancelInsurancePolicySchema } },
      },
    },
    responses: {
      200: jsonResponse("The cancelled policy.", dataEnvelope(insurancePolicyWireSchema)),
      404: errorResponse("No such policy."),
      409: errorResponse("Only an issued policy can be cancelled."),
      502: errorResponse("The insurer refused or could not be reached."),
      503: errorResponse("Insurance runtime or provider is not available."),
    },
  })

  const reads = new OpenAPIHono<InsuranceRoutesEnv>({ defaultHook: openApiValidationHook })
    .openapi(bookingOverviewRoute, async (c) => {
      const runtime = options.resolveRuntime(c)
      if (!runtime) return c.json(runtimeUnavailable, 503)
      const { bookingId } = c.req.valid("param")
      const data = await insuranceService.getBookingOverview(c.get("db"), bookingId, {
        pii: runtime.createPiiService(),
        reveal: revealPii(c),
        actorId: c.get("userId") ?? null,
      })
      return c.json({ data }, 200)
    })
    .openapi(applicationRoute, async (c) => {
      const runtime = options.resolveRuntime(c)
      if (!runtime) return c.json(runtimeUnavailable, 503)
      const { applicationId } = c.req.valid("param")
      const data = await insuranceService.getApplication(c.get("db"), applicationId, {
        pii: runtime.createPiiService(),
        reveal: revealPii(c),
        actorId: c.get("userId") ?? null,
      })
      if (!data) return c.json({ error: "not_found" }, 404)
      return c.json({ data }, 200)
    })
    .openapi(policyRoute, async (c) => {
      const policy = await getInsurancePolicy(c.get("db"), c.req.valid("param").policyId)
      if (!policy) return c.json({ error: "not_found" }, 404)
      return c.json({ data: toInsurancePolicyWire(policy) }, 200)
    })

  const actions = new OpenAPIHono<InsuranceRoutesEnv>({ defaultHook: openApiValidationHook })
    .openapi(retryRoute, async (c) => {
      const runtime = options.resolveRuntime(c)
      if (!runtime) return c.json(runtimeUnavailable, 503)
      const db = c.get("db")
      const { policyId } = c.req.valid("param")
      const body = await parseJsonBody(c, retryInsuranceIssueSchema)

      const policy = await getInsurancePolicy(db, policyId)
      if (!policy) return c.json({ error: "not_found" }, 404)
      // Retrying an issued policy would buy the traveller a second one at a
      // second real charge. Only a failed or still-pending attempt is retryable.
      if (policy.issueState === "issued" || policy.issueState === "cancelled") {
        return c.json({ error: "not_retryable", detail: `Policy is ${policy.issueState}.` }, 409)
      }

      const application = await getInsuranceApplication(db, policy.applicationId)
      if (!application) return c.json({ error: "not_found" }, 404)

      const providers = (await options.resolveProviders?.()) ?? []
      const provider = providers.find(({ providerId }) => providerId === application.providerId)
      if (!provider) return c.json(providerUnavailable(application.providerId), 503)

      if (policy.bookingId) {
        await recordInsuranceBookingActivity(db, policy.bookingId, {
          event: INSURANCE_BOOKING_ACTIVITY_EVENTS.issueRetried,
          description: body.reason
            ? `Insurance issue retried: ${body.reason}`
            : "Insurance issue retried by an operator",
          actorId: c.get("userId") ?? null,
          metadata: { policyId: policy.id, applicationId: application.id },
        })
      }

      const result = await issueInsurancePolicy(
        db,
        {
          pii: runtime.createPiiService(),
          integration: runtime.bookingIntegration(),
          actorId: c.get("userId") ?? null,
          eventBus: c.get("eventBus"),
        },
        {
          application,
          provider,
          bookingId: policy.bookingId,
          // A staff-initiated retry is by definition after the money was taken.
          paid: true,
          idempotencyKey: `insurance-retry:${policy.id}:${policy.issueAttempts + 1}`,
        },
      )

      return c.json({ data: toInsurancePolicyWire(result.policy) }, 200)
    })
    .openapi(cancelRoute, async (c) => {
      const runtime = options.resolveRuntime(c)
      if (!runtime) return c.json(runtimeUnavailable, 503)
      const db = c.get("db")
      const { policyId } = c.req.valid("param")
      const body = await parseJsonBody(c, cancelInsurancePolicySchema)

      const policy = await getInsurancePolicy(db, policyId)
      if (!policy) return c.json({ error: "not_found" }, 404)
      if (policy.issueState !== "issued") {
        return c.json({ error: "not_cancellable", detail: `Policy is ${policy.issueState}.` }, 409)
      }

      const providers = (await options.resolveProviders?.()) ?? []
      const provider = providers.find(({ providerId }) => providerId === policy.providerId)
      if (!provider) return c.json(providerUnavailable(policy.providerId), 503)

      const result = await cancelInsurancePolicy(
        db,
        {
          pii: runtime.createPiiService(),
          integration: runtime.bookingIntegration(),
          actorId: c.get("userId") ?? null,
          eventBus: c.get("eventBus"),
        },
        {
          policy,
          provider,
          reason: body.reason,
          idempotencyKey: `insurance-cancel:${policy.id}`,
        },
      )

      if (result.status === "failed") {
        return c.json({ error: result.code, detail: result.message }, 502)
      }
      return c.json({ data: toInsurancePolicyWire(result.policy) }, 200)
    })

  return routes.route("/", reads).route("/", actions)
}

/**
 * The instance a deployment mounts. It reads the runtime from the request
 * context, which is what the generated node host sets from the bound port.
 */
export const insuranceAdminRoutes = createInsuranceAdminRoutes({
  resolveRuntime: (c) => c.get("insuranceRuntime"),
})

export type InsuranceAdminRoutes = ReturnType<typeof createInsuranceAdminRoutes>
