/**
 * Settings → Payments admin routes.
 *
 * `/v1/admin/settings/payments/*` — list the provider catalog, read the current
 * connection, connect a provider (managed), activate an already-connected ready
 * connection as the active default, and disconnect. Mounted onto the
 * operator-settings OpenAPIHono chain (see `routes.ts`), so it inherits the
 * shared validation hook and `/v1/admin/settings/*` lazy matcher.
 *
 * No processor credentials are persisted here; connect/activate delegate to the
 * `PaymentProviderRegistry` (managed → control plane; self-host → read-only).
 * Activation delegates generically: a registry that does not implement
 * `activate()` fails closed rather than reporting a switch that never happened.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { ModuleContainer } from "@voyant-travel/core"
import { openApiValidationHook } from "@voyant-travel/hono"
import {
  type PaymentProviderRegistry,
  type PaymentProviderRegistryResolver,
  paymentProviderRegistryRuntimePort,
} from "@voyant-travel/payments"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context, Hono } from "hono"

import { createDefaultPaymentProviderRegistry } from "./payment-provider-registry.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    container: ModuleContainer
  }
}

/**
 * Resolve the registry for this request: the deployment-injected one when a
 * resolver was registered under the payment registry runtime port (managed →
 * control plane), else the default self-host registry.
 */
async function resolveRegistry(c: Context<Env>): Promise<PaymentProviderRegistry> {
  const db = c.get("db")
  const env = c.env as Record<string, unknown>
  const container = c.get("container")
  if (container?.has(paymentProviderRegistryRuntimePort.id)) {
    const resolver = container.resolve<PaymentProviderRegistryResolver>(
      paymentProviderRegistryRuntimePort.id,
    )
    return resolver({ db, env, request: c.req.raw })
  }
  return createDefaultPaymentProviderRegistry({ db, env })
}

export interface OpenApiMountTarget {
  // biome-ignore lint/suspicious/noExplicitAny: accept any Env-typed sub-app; the mount only composes routes.
  route(path: string, app: Hono<any, any, any>): unknown
}

// biome-ignore lint/suspicious/noExplicitAny: bridges handler payloads to the inferred typed-response union.
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

const capabilitiesSchema = z.object({
  hostedCheckout: z.boolean(),
  redirectCheckout: z.boolean(),
  // Optional for the same reason it is optional on the adapter contract: a
  // descriptor written before in-page checkout existed means `false`.
  embeddedCheckout: z.boolean().optional(),
  authorize: z.boolean(),
  capture: z.boolean(),
  void: z.boolean(),
  refund: z.boolean(),
  status: z.boolean(),
  callbackSignatureVerification: z.boolean(),
  idempotencyKeys: z.boolean(),
  retrySafeInitiation: z.boolean(),
})

const credentialFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(["text", "secret", "boolean", "select"]),
  required: z.boolean(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
})

const providerDescriptorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  logoRef: z.string().optional(),
  capabilities: capabilitiesSchema,
  connectionMethod: z.enum(["credentials", "embedded_onboarding", "read_only"]),
  credentialFieldSchema: z.array(credentialFieldSchema),
  regions: z.array(z.string()).optional(),
  currencies: z.array(z.string()).optional(),
  availability: z.enum(["available", "coming_soon"]),
  modes: z.array(z.enum(["sandbox", "test", "live"])),
})

const connectionStateSchema = z.enum([
  "pending_requirements",
  "pending_verification",
  "connected",
  "restricted",
  "error",
  "disconnected",
])

const requirementSchema = z.object({
  code: z.string(),
  message: z.string(),
  deadlineAt: z.string().nullable().optional(),
})

/** Non-sensitive per-connection summary. No credentials or platform secrets. */
const connectionSummarySchema = z.object({
  providerId: z.string(),
  connectionId: z.string(),
  displayName: z.string().optional(),
  state: connectionStateSchema,
  readiness: z.enum(["ready", "not_ready", "unknown"]),
  mode: z.enum(["sandbox", "test", "live"]).nullable(),
  active: z.boolean(),
  requirements: z.array(requirementSchema).optional(),
  lastHealthAt: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  readOnly: z.boolean().optional(),
})

const connectionStatusSchema = z.object({
  activeProviderId: z.string().nullable(),
  status: connectionStateSchema,
  mode: z.enum(["sandbox", "test", "live"]).nullable(),
  activeConnectionId: z.string().nullable().optional(),
  connections: z.array(connectionSummarySchema).optional(),
  lastHealthAt: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  requirements: z.array(requirementSchema).optional(),
  readOnly: z.boolean().optional(),
})

const connectRequestSchema = z.object({
  providerId: z.string().min(1),
  mode: z.enum(["sandbox", "test", "live"]),
  credentials: z.record(z.string(), z.unknown()),
})

const connectResultSchema = z.object({
  ok: z.boolean(),
  status: connectionStatusSchema,
  error: z.string().optional(),
})

const activateRequestSchema = z.object({
  providerId: z.string().min(1),
  connectionId: z.string().min(1),
})

const activationResultSchema = z.object({
  ok: z.boolean(),
  status: connectionStatusSchema,
  activated: z.object({ providerId: z.string(), connectionId: z.string() }).optional(),
  error: z.string().optional(),
})

const onboardingSetupRequestSchema = z.object({
  providerId: z.string().min(1),
  mode: z.enum(["sandbox", "test", "live"]),
})

const onboardingSessionSchema = z.object({
  type: z.literal("embedded_onboarding"),
  publishableKey: z.string().min(1),
  clientSecret: z.string().min(1),
  expiresAt: z.string(),
})

const onboardingSetupResultSchema = z.object({
  ok: z.boolean(),
  status: connectionStatusSchema,
  session: onboardingSessionSchema.optional(),
  error: z.string().optional(),
})

function dataEnvelope<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema })
}

const jsonContent = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})

const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
})

const listProvidersRoute = createRoute({
  method: "get",
  path: "/v1/admin/settings/payments/providers",
  responses: {
    200: jsonContent(
      dataEnvelope(z.array(providerDescriptorSchema)),
      "The catalog of payment providers the operator can connect",
    ),
  },
})

const getConnectionRoute = createRoute({
  method: "get",
  path: "/v1/admin/settings/payments",
  responses: {
    200: jsonContent(dataEnvelope(connectionStatusSchema), "The current payment connection"),
  },
})

const connectRoute = createRoute({
  method: "post",
  path: "/v1/admin/settings/payments/connect",
  request: { body: jsonBody(connectRequestSchema) },
  responses: {
    200: jsonContent(dataEnvelope(connectResultSchema), "The connect attempt result"),
  },
})

const activateRoute = createRoute({
  method: "post",
  path: "/v1/admin/settings/payments/activate",
  request: { body: jsonBody(activateRequestSchema) },
  responses: {
    200: jsonContent(dataEnvelope(activationResultSchema), "The activation attempt result"),
  },
})

const beginOnboardingRoute = createRoute({
  method: "post",
  path: "/v1/admin/settings/payments/onboarding",
  request: { body: jsonBody(onboardingSetupRequestSchema) },
  responses: {
    200: jsonContent(
      dataEnvelope(onboardingSetupResultSchema),
      "The embedded onboarding setup or fail-closed result",
    ),
  },
})

const disconnectRoute = createRoute({
  method: "post",
  path: "/v1/admin/settings/payments/disconnect",
  responses: {
    200: jsonContent(dataEnvelope(connectionStatusSchema), "The connection after disconnecting"),
    409: jsonContent(z.object({ error: z.string() }), "The disconnect was rejected"),
  },
})

export function mountPaymentProviderRoutes(hono: OpenApiMountTarget): void {
  const routes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listProvidersRoute, (c) =>
      asRouteResponse(
        (async () => {
          const registry = await resolveRegistry(c)
          return c.json({ data: await registry.listProviders() }, 200)
        })(),
      ),
    )
    .openapi(getConnectionRoute, (c) =>
      asRouteResponse(
        (async () => {
          const registry = await resolveRegistry(c)
          return c.json({ data: await registry.getConnection() }, 200)
        })(),
      ),
    )
    .openapi(connectRoute, (c) =>
      asRouteResponse(
        (async () => {
          const registry = await resolveRegistry(c)
          return c.json({ data: await registry.connect(c.req.valid("json")) }, 200)
        })(),
      ),
    )
    .openapi(activateRoute, (c) =>
      asRouteResponse(
        (async () => {
          const registry = await resolveRegistry(c)
          const input = c.req.valid("json")
          // Generic delegation: the deployment-injected registry owns the real
          // readiness gate and switch. A registry that does not implement
          // activation fails closed here instead of faking success.
          if (typeof registry.activate !== "function") {
            return c.json(
              {
                data: {
                  ok: false,
                  status: await registry.getConnection(),
                  error: "Payment activation is not supported by this deployment.",
                },
              },
              200,
            )
          }
          return c.json({ data: await registry.activate(input) }, 200)
        })(),
      ),
    )
    .openapi(beginOnboardingRoute, (c) =>
      asRouteResponse(
        (async () => {
          const registry = await resolveRegistry(c)
          return c.json({ data: await registry.beginOnboarding(c.req.valid("json")) }, 200)
        })(),
      ),
    )
    .openapi(disconnectRoute, (c) =>
      asRouteResponse(
        (async () => {
          const registry = await resolveRegistry(c)
          try {
            await registry.disconnect()
          } catch (error) {
            return c.json(
              {
                error: error instanceof Error ? error.message : "Payment disconnect failed.",
              },
              409,
            )
          }
          return c.json({ data: await registry.getConnection() }, 200)
        })(),
      ),
    )

  hono.route("/", routes)
}
