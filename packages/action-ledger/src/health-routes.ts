/**
 * Action-ledger health route module, owned by `@voyant-travel/action-ledger`.
 *
 *   GET    /health         — read-only drift check (no canary write)
 *   POST   /health/check   — drift check + synthetic canary write
 *
 * The routes mount at `/v1/admin/action-ledger` via the deployment's
 * composition (the `action-ledger-health` extension).
 *
 * The package owns the route shape, the request/response contract, and its
 * own canary logic. The per-module drift checks compose results from
 * `@voyant-travel/bookings`, `@voyant-travel/finance`, and
 * `@voyant-travel/inventory` — all of which DEPEND ON action-ledger. To avoid
 * an import cycle, those drift checks are INJECTED by the deployment as
 * structurally-typed option functions; this package never imports them.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { openApiValidationHook, stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiExtension } from "@voyant-travel/hono/module"

import {
  type RunActionLedgerCanaryInput,
  type RunActionLedgerCanaryResult,
  runActionLedgerCanary,
} from "./canary.js"

/**
 * Structural drift-check input. Mirrors the shared
 * `Check{Booking,Finance,Product}ActionLedgerDriftInput` shape so the package
 * needn't import bookings/finance/inventory.
 */
export interface ActionLedgerDriftCheckInput {
  createdAtFrom?: string | null
  sampleLimit?: number | null
}

/**
 * Structural single drift-check result row. Mirrors the row shape returned by
 * each module's drift check.
 */
export interface ActionLedgerDriftCheckRow {
  check: string
  missingCount: number
  sampleIds: string[]
}

/**
 * Structural drift-check result. Mirrors the
 * `Check{Booking,Finance,Product}ActionLedgerDriftResult` shape.
 */
export interface ActionLedgerDriftCheckResult {
  ok: boolean
  rows: ActionLedgerDriftCheckRow[]
}

/**
 * A deployment-supplied per-module drift check. Structurally typed so the
 * package can compose `@voyant-travel/{bookings,finance,inventory}`'s drift
 * checks without importing them (those modules depend on action-ledger).
 */
export type ActionLedgerDriftCheck = (
  db: AnyDrizzleDb,
  input: ActionLedgerDriftCheckInput,
) => Promise<ActionLedgerDriftCheckResult>

type ActionLedgerHealthVariables = {
  db: AnyDrizzleDb
  userId?: string
  organizationId?: string
}

const actionLedgerHealthQuerySchema = z.object({
  createdAtFrom: z.string().datetime().optional(),
  sampleLimit: z.coerce.number().int().min(1).max(100).optional(),
})

const actionLedgerHealthCheckBodySchema = actionLedgerHealthQuerySchema.extend({
  organizationId: z.string().trim().min(1).optional(),
  principalId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
})

const actionLedgerDriftCheckResultSchema = z.object({
  ok: z.boolean(),
  rows: z.array(
    z.object({
      check: z.string(),
      missingCount: z.number().int().nonnegative(),
      sampleIds: z.array(z.string()),
    }),
  ),
})

const actionLedgerHealthResponseSchema = z.object({
  data: z.object({
    ok: z.boolean(),
    canary: z
      .object({
        ok: z.boolean(),
        actionId: z.string(),
        replayed: z.boolean(),
        observedWrite: z.boolean(),
      })
      .nullable(),
    bookingDrift: actionLedgerDriftCheckResultSchema,
    financeDrift: actionLedgerDriftCheckResultSchema,
    productDrift: actionLedgerDriftCheckResultSchema,
  }),
})

const healthResponses = {
  200: {
    description: "The action ledger and domain projections are healthy",
    content: { "application/json": { schema: actionLedgerHealthResponseSchema } },
  },
  503: {
    description: "An action ledger or domain projection health check failed",
    content: { "application/json": { schema: actionLedgerHealthResponseSchema } },
  },
} as const

const getActionLedgerHealthRoute = createRoute({
  method: "get",
  path: "/health",
  request: { query: actionLedgerHealthQuerySchema },
  responses: healthResponses,
})

/**
 * `/health/check` runs the canary and the drift checks; `/health` reports the
 * projections. Sharing `healthResponses` described both with the projection
 * wording, which is not what this endpoint reports — the published document had
 * the accurate prose and the routes did not, so generating it from them would
 * have replaced a correct description with a generic one.
 */
const checkHealthResponses = {
  200: {
    description: "The canary and all drift checks passed",
    content: { "application/json": { schema: actionLedgerHealthResponseSchema } },
  },
  503: {
    description: "The canary or a drift check failed",
    content: { "application/json": { schema: actionLedgerHealthResponseSchema } },
  },
} as const

const checkActionLedgerHealthRoute = createRoute({
  method: "post",
  path: "/health/check",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: actionLedgerHealthCheckBodySchema } },
    },
  },
  responses: checkHealthResponses,
})

export interface ActionLedgerHealthResponse {
  data: {
    ok: boolean
    canary: RunActionLedgerCanaryResult | null
    bookingDrift: ActionLedgerDriftCheckResult
    financeDrift: ActionLedgerDriftCheckResult
    productDrift: ActionLedgerDriftCheckResult
  }
}

export interface RunActionLedgerHealthCheckInput {
  db: AnyDrizzleDb
  drift: ActionLedgerDriftCheckInput
  canary?: RunActionLedgerCanaryInput | null
  runCanary: boolean
  checkBookingDrift: ActionLedgerDriftCheck
  checkFinanceDrift: ActionLedgerDriftCheck
  checkProductDrift: ActionLedgerDriftCheck
  runCanaryCheck?: (
    db: AnyDrizzleDb,
    input: RunActionLedgerCanaryInput,
  ) => Promise<RunActionLedgerCanaryResult>
}

export async function runActionLedgerHealthCheck({
  db,
  drift,
  canary,
  runCanary,
  checkBookingDrift,
  checkFinanceDrift,
  checkProductDrift,
  runCanaryCheck = runActionLedgerCanary,
}: RunActionLedgerHealthCheckInput): Promise<ActionLedgerHealthResponse["data"]> {
  const [bookingDrift, financeDrift, productDrift, canaryResult] = await Promise.all([
    checkBookingDrift(db, drift),
    checkFinanceDrift(db, drift),
    checkProductDrift(db, drift),
    runCanary ? runCanaryCheck(db, canary ?? {}) : Promise.resolve(null),
  ])

  return {
    ok: bookingDrift.ok && financeDrift.ok && productDrift.ok && (canaryResult?.ok ?? true),
    canary: canaryResult,
    bookingDrift,
    financeDrift,
    productDrift,
  }
}

/**
 * Deployment-supplied options for the action-ledger health route module.
 * Structural only — the three per-module drift checks are INJECTED so this
 * foundational package never imports bookings/finance/inventory.
 */
export interface ActionLedgerHealthRoutesOptions {
  /** Drift check from `@voyant-travel/bookings/action-ledger-drift`. */
  checkBookingDrift: ActionLedgerDriftCheck
  /** Drift check from `@voyant-travel/finance/action-ledger-drift`. */
  checkFinanceDrift: ActionLedgerDriftCheck
  /** Drift check from `@voyant-travel/inventory/action-ledger-drift`. */
  checkProductDrift: ActionLedgerDriftCheck
  /**
   * Override the canary writer (defaults to this package's
   * `runActionLedgerCanary`). Mostly for tests.
   */
  runCanaryCheck?: (
    db: AnyDrizzleDb,
    input: RunActionLedgerCanaryInput,
  ) => Promise<RunActionLedgerCanaryResult>
}

/**
 * Build the action-ledger health routes (relative paths; mount at
 * `/v1/admin/action-ledger`). The deployment injects the per-module drift
 * checks via `options`.
 */
export function createActionLedgerHealthRoutes(options: ActionLedgerHealthRoutesOptions) {
  const { checkBookingDrift, checkFinanceDrift, checkProductDrift, runCanaryCheck } = options
  const hono = new OpenAPIHono<{ Variables: ActionLedgerHealthVariables }>({
    defaultHook: openApiValidationHook,
  })

  hono.openapi(getActionLedgerHealthRoute, async (c) => {
    const query = c.req.valid("query")
    const data = await runActionLedgerHealthCheck({
      db: c.get("db"),
      drift: {
        createdAtFrom: query.createdAtFrom ?? null,
        sampleLimit: query.sampleLimit ?? null,
      },
      runCanary: false,
      checkBookingDrift,
      checkFinanceDrift,
      checkProductDrift,
      ...(runCanaryCheck ? { runCanaryCheck } : {}),
    })

    return data.ok
      ? c.json({ data } satisfies ActionLedgerHealthResponse, 200)
      : c.json({ data } satisfies ActionLedgerHealthResponse, 503)
  })

  hono.openapi(checkActionLedgerHealthRoute, async (c) => {
    const body = c.req.valid("json")
    const data = await runActionLedgerHealthCheck({
      db: c.get("db"),
      drift: {
        createdAtFrom: body.createdAtFrom ?? null,
        sampleLimit: body.sampleLimit ?? null,
      },
      canary: {
        organizationId: body.organizationId ?? c.get("organizationId") ?? null,
        principalId: body.principalId ?? c.get("userId") ?? "operator-action-ledger-health",
        idempotencyKey: body.idempotencyKey ?? null,
      },
      runCanary: true,
      checkBookingDrift,
      checkFinanceDrift,
      checkProductDrift,
      ...(runCanaryCheck ? { runCanaryCheck } : {}),
    })

    return data.ok
      ? c.json({ data } satisfies ActionLedgerHealthResponse, 200)
      : c.json({ data } satisfies ActionLedgerHealthResponse, 503)
  })

  return stampOpenApiRegistryApiId(hono, "@voyant-travel/action-ledger#health-extension.api")
}

/** Package-owned descriptor; domain-specific drift checks remain injected. */
export function createActionLedgerHealthApiExtension(
  options: ActionLedgerHealthRoutesOptions,
): ApiExtension {
  return {
    extension: { name: "action-ledger-health", module: "action-ledger" },
    adminRoutes: createActionLedgerHealthRoutes(options),
  }
}
