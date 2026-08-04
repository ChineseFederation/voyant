/**
 * Admin routes for finance reports + report-adjacent resources — mounted by the
 * operator starter under `/v1/admin/finance/...` (staff-actor-gated by the
 * parent app's middleware chain). Covers the finance report reads (revenue,
 * aging, profitability and its departure/product/traveller variants, plus two
 * CSV exports) and two small CRUD-ish resources: operator-configurable cost
 * categories and revocable accountant shares.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — finance sub-batch 9D). Query/request schemas reuse the existing
 * `validation.ts` (`@voyant-travel/finance-contracts`) schemas the handlers
 * already parse. Response schemas are authored from the service interfaces
 * (`§17`: `date`/timestamp values serialize to strings; integer money columns
 * stay numbers). The departure/product profitability reports are aggregate
 * read models (RFC §8) — the top-level shape is modelled and the per-currency
 * `base` rollup is bounded.
 *
 * Static paths are declared before `/:id`-style paths so the more specific
 * route wins (e.g. `/reports/profitability/departures/export`). The two CSV
 * exports return a `text/csv` body; their OpenAPI response documents the
 * `text/csv` content type (the handler returns the streamed download Response).
 *
 * Each resource is its own small `OpenAPIHono` sub-chain composed onto
 * `financeReportRoutes` via `.route("/")` — keeping per-resource chains small
 * bounds the type-inference cost (one flat 14-leg chain has O(n²) inference
 * cost and OOMs the framework build).
 *
 * agent-quality: file-size exception — intentional: a mechanically-repetitive
 * report bundle over the finance report reads + cost-categories + accountant
 * shares (14 legs), each with a `createRoute` def + handler co-located per the
 * established admin route pattern. See voyant#2114 / voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"

import { csvDownload, getFinanceRouteRuntime } from "./routes-runtime.js"
import { type Env, notFound } from "./routes-shared.js"
import { financeService } from "./service.js"
import { accountantSharesService } from "./service-accountant-shares.js"
import {
  buildDepartureProfitabilityCsv,
  buildProductProfitabilityCsv,
} from "./service-profitability.js"
import {
  agingReportQuerySchema,
  createAccountantShareSchema,
  departureProfitabilityQuerySchema,
  insertCostCategorySchema,
  productProfitabilityQuerySchema,
  profitabilityQuerySchema,
  revenueReportQuerySchema,
  travelerProfitabilityQuerySchema,
  updateCostCategorySchema,
} from "./validation.js"

const errorResponseSchema = z.object({ error: z.string() })

/** `date`/timestamp values serialize to strings (§17). */
const isoString = z.string()

// --- report response schemas (authored from the service interfaces) -------

const revenueReportRowSchema = z.object({
  month: z.string(),
  totalCents: z.number().int(),
  count: z.number().int(),
})

const agingReportRowSchema = z.object({
  bucket: z.string(),
  totalCents: z.number().int(),
  count: z.number().int(),
})

const profitabilityReportRowSchema = z.object({
  bookingId: z.string(),
  bookingNumber: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().nullable(),
})

const profitabilityCostByServiceTypeSchema = z.object({
  serviceType: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
})

const profitabilityUnattributedSchema = z.object({
  currency: z.string(),
  amountCents: z.number().int(),
})

/**
 * The under-allocated remainder of recorded supplier cost — an invoice total
 * minus every allocation row against it. Distinct from `unattributed`, which is
 * cost deliberately allocated to no departure.
 */
const profitabilityUnallocatedSchema = z.object({
  currency: z.string(),
  amountCents: z.number().int(),
})

const departureProfitabilityRowSchema = z.object({
  departureId: z.string(),
  departureLabel: z.string().nullable(),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  departureDate: z.string().nullable(),
  currency: z.string(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  committedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
  breakEvenRevenueCents: z.number().int().nullable(),
  loadFactorPercent: z.number().nullable(),
})

const profitabilityCostCompletenessSchema = z.object({
  unallocated: z.array(profitabilityUnallocatedSchema),
  linesMissingCostBlock: z.number().int(),
  fallbackDepartureCount: z.number().int(),
  complete: z.boolean(),
})

const profitabilityIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["critical", "warning"]),
  subjectType: z.literal("departure"),
  subjectId: z.string(),
  message: z.string(),
})

const departureProfitabilityReportSchema = z.object({
  rows: z.array(departureProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributed: z.array(profitabilityUnattributedSchema),
  unallocated: z.array(profitabilityUnallocatedSchema),
  costCompleteness: profitabilityCostCompletenessSchema,
  issues: z.array(profitabilityIssueSchema),
  base: z
    .object({
      currency: z.string(),
      rows: z.array(departureProfitabilityRowSchema),
      costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
      unattributedCents: z.number().int(),
      unallocatedCents: z.number().int(),
      unconvertibleCurrencies: z.array(z.string()),
    })
    .optional(),
})

const productProfitabilityRowSchema = z.object({
  productId: z.string(),
  productName: z.string().nullable(),
  currency: z.string(),
  departureCount: z.number().int(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  committedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
  breakEvenRevenueCents: z.number().int().nullable(),
  loadFactorPercent: z.number().nullable(),
})

const productProfitabilityReportSchema = z.object({
  rows: z.array(productProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributed: z.array(profitabilityUnattributedSchema),
  unallocated: z.array(profitabilityUnallocatedSchema),
  costCompleteness: profitabilityCostCompletenessSchema,
  base: z
    .object({
      currency: z.string(),
      rows: z.array(productProfitabilityRowSchema),
      costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
      unattributedCents: z.number().int(),
      unallocatedCents: z.number().int(),
      unconvertibleCurrencies: z.array(z.string()),
    })
    .optional(),
})

const travelerProfitabilityRowSchema = z.object({
  travelerId: z.string(),
  travelerName: z.string(),
  bookingId: z.string(),
  currency: z.string(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})

const travelerProfitabilityReportSchema = z.object({
  departureId: z.string(),
  currency: z.string(),
  travelerCount: z.number().int(),
  rows: z.array(travelerProfitabilityRowSchema),
})

const costCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
  createdAt: isoString,
  updatedAt: isoString,
})

const accountantShareScopeShape = {
  from: z.string().nullable(),
  to: z.string().nullable(),
  baseCurrency: z.string().nullable(),
}

const accountantShareRecordSchema = z.object({
  id: z.string(),
  ...accountantShareScopeShape,
  createdAt: isoString,
  expiresAt: isoString,
  lastAccessedAt: isoString.nullable(),
  accessCount: z.number().int(),
})

/** `create` returns the minted grant id + public url + scope. */
const createdAccountantShareSchema = z.object({
  id: z.string(),
  url: z.string(),
  expiresAt: isoString.nullable(),
  ...accountantShareScopeShape,
})

const csvBodySchema = z.string()

// ===========================================================================
// Reports (static paths first; `/export` variants before `/:id`-style reads)
// ===========================================================================

const revenueReportRoute = createRoute({
  method: "get",
  path: "/reports/revenue",
  request: { query: revenueReportQuerySchema },
  responses: {
    200: {
      description: "Revenue grouped by month",
      content: {
        "application/json": { schema: z.object({ data: z.array(revenueReportRowSchema) }) },
      },
    },
  },
})

const agingReportRoute = createRoute({
  method: "get",
  path: "/reports/aging",
  request: { query: agingReportQuerySchema },
  responses: {
    200: {
      description: "Outstanding invoice balances bucketed by age",
      content: {
        "application/json": { schema: z.object({ data: z.array(agingReportRowSchema) }) },
      },
    },
  },
})

const profitabilityReportRoute = createRoute({
  method: "get",
  path: "/reports/profitability",
  request: { query: profitabilityQuerySchema },
  responses: {
    200: {
      description: "Per-booking margin summary",
      content: {
        "application/json": { schema: z.object({ data: z.array(profitabilityReportRowSchema) }) },
      },
    },
  },
})

const departureProfitabilityRoute = createRoute({
  method: "get",
  path: "/reports/profitability/departures",
  request: { query: departureProfitabilityQuerySchema },
  responses: {
    200: {
      description: "Per-departure P&L read model (RFC §8)",
      content: {
        "application/json": { schema: z.object({ data: departureProfitabilityReportSchema }) },
      },
    },
  },
})

const productProfitabilityRoute = createRoute({
  method: "get",
  path: "/reports/profitability/products",
  request: { query: productProfitabilityQuerySchema },
  responses: {
    200: {
      description: "Per-product P&L roll-up (RFC §8)",
      content: {
        "application/json": { schema: z.object({ data: productProfitabilityReportSchema }) },
      },
    },
  },
})

const travelerProfitabilityRoute = createRoute({
  method: "get",
  path: "/reports/profitability/travelers",
  request: { query: travelerProfitabilityQuerySchema },
  responses: {
    200: {
      description: "Per-traveller P&L for one departure (RFC §6)",
      content: {
        "application/json": { schema: z.object({ data: travelerProfitabilityReportSchema }) },
      },
    },
  },
})

const departureProfitabilityExportRoute = createRoute({
  method: "get",
  path: "/reports/profitability/departures/export",
  request: { query: departureProfitabilityQuerySchema },
  responses: {
    200: {
      description: "Per-departure P&L as a CSV download for accountant sharing",
      content: { "text/csv": { schema: csvBodySchema } },
    },
  },
})

const productProfitabilityExportRoute = createRoute({
  method: "get",
  path: "/reports/profitability/products/export",
  request: { query: productProfitabilityQuerySchema },
  responses: {
    200: {
      description: "Per-product P&L as a CSV download for accountant sharing",
      content: { "text/csv": { schema: csvBodySchema } },
    },
  },
})

const reportRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(revenueReportRoute, async (c) =>
    c.json({ data: await financeService.getRevenueReport(c.get("db"), c.req.valid("query")) }, 200),
  )
  .openapi(agingReportRoute, async (c) =>
    c.json({ data: await financeService.getAgingReport(c.get("db"), c.req.valid("query")) }, 200),
  )
  .openapi(profitabilityReportRoute, async (c) =>
    c.json(
      { data: await financeService.getProfitabilityReport(c.get("db"), c.req.valid("query")) },
      200,
    ),
  )
  .openapi(departureProfitabilityRoute, async (c) =>
    c.json(
      {
        data: await financeService.getDepartureProfitability(
          c.get("db"),
          c.req.valid("query"),
          getFinanceRouteRuntime(c),
        ),
      },
      200,
    ),
  )
  .openapi(productProfitabilityRoute, async (c) =>
    c.json(
      {
        data: await financeService.getProductProfitability(
          c.get("db"),
          c.req.valid("query"),
          getFinanceRouteRuntime(c),
        ),
      },
      200,
    ),
  )
  .openapi(travelerProfitabilityRoute, async (c) =>
    c.json(
      { data: await financeService.getTravelerProfitability(c.get("db"), c.req.valid("query")) },
      200,
    ),
  )
  .openapi(departureProfitabilityExportRoute, async (c) => {
    const report = await financeService.getDepartureProfitability(
      c.get("db"),
      c.req.valid("query"),
      getFinanceRouteRuntime(c),
    )
    return csvDownload(buildDepartureProfitabilityCsv(report), "departure-profitability.csv")
  })
  .openapi(productProfitabilityExportRoute, async (c) => {
    const report = await financeService.getProductProfitability(
      c.get("db"),
      c.req.valid("query"),
      getFinanceRouteRuntime(c),
    )
    return csvDownload(buildProductProfitabilityCsv(report), "product-profitability.csv")
  })

// ===========================================================================
// Cost categories (operator-configurable cost classification)
// ===========================================================================

const listCostCategoriesRoute = createRoute({
  method: "get",
  path: "/cost-categories",
  request: {
    query: z.object({
      includeArchived: z
        .enum(["true", "false"])
        .optional()
        .openapi({ description: "Include archived categories when `true`." }),
    }),
  },
  responses: {
    200: {
      description: "The operator's cost categories",
      content: {
        "application/json": { schema: z.object({ data: z.array(costCategorySchema) }) },
      },
    },
  },
})

const createCostCategoryRoute = createRoute({
  method: "post",
  path: "/cost-categories",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertCostCategorySchema } },
    },
  },
  responses: {
    201: {
      description: "The created cost category",
      content: { "application/json": { schema: z.object({ data: costCategorySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateCostCategoryRoute = createRoute({
  method: "patch",
  path: "/cost-categories/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: updateCostCategorySchema } },
    },
  },
  responses: {
    200: {
      description: "The updated cost category",
      content: { "application/json": { schema: z.object({ data: costCategorySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Cost category not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const costCategoryRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listCostCategoriesRoute, async (c) =>
    c.json(
      {
        data: await financeService.costCategories.list(c.get("db"), {
          includeArchived: c.req.valid("query").includeArchived === "true",
        }),
      },
      200,
    ),
  )
  .openapi(createCostCategoryRoute, async (c) =>
    c.json(
      { data: await financeService.costCategories.create(c.get("db"), c.req.valid("json")) },
      201,
    ),
  )
  .openapi(updateCostCategoryRoute, async (c) => {
    const row = await financeService.costCategories.update(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    if (!row) {
      return notFound(c, "Cost category not found")
    }
    return c.json({ data: row }, 200)
  })

// ===========================================================================
// Accountant shares (revocable public finance-portal links, RFC §13.2)
// ===========================================================================

const listAccountantSharesRoute = createRoute({
  method: "get",
  path: "/accountant-shares",
  responses: {
    200: {
      description: "Active (non-revoked) accountant shares",
      content: {
        "application/json": { schema: z.object({ data: z.array(accountantShareRecordSchema) }) },
      },
    },
  },
})

const createAccountantShareRoute = createRoute({
  method: "post",
  path: "/accountant-shares",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createAccountantShareSchema } },
    },
  },
  responses: {
    201: {
      description: "The created accountant share + its public url",
      content: {
        "application/json": { schema: z.object({ data: createdAccountantShareSchema }) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const revokeAccountantShareRoute = createRoute({
  method: "post",
  path: "/accountant-shares/{id}/revoke",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The revoked share id",
      content: {
        "application/json": { schema: z.object({ data: z.object({ id: z.string() }) }) },
      },
    },
    404: {
      description: "Accountant share not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const accountantShareRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listAccountantSharesRoute, async (c) =>
    c.json({ data: await accountantSharesService.list(c.get("db")) }, 200),
  )
  .openapi(createAccountantShareRoute, async (c) => {
    const share = await accountantSharesService.create(c.get("db"), c.req.valid("json"), {
      publicBaseUrl: new URL(c.req.url).origin,
      userId: c.get("userId") ?? null,
    })
    return c.json({ data: share }, 201)
  })
  .openapi(revokeAccountantShareRoute, async (c) => {
    const revoked = await accountantSharesService.revoke(
      c.get("db"),
      c.req.valid("param").id,
      c.get("userId") ?? null,
    )
    if (!revoked) {
      return notFound(c, "Accountant share not found")
    }
    return c.json({ data: { id: revoked.id } }, 200)
  })

// Compose the three per-resource sub-chains onto a single OpenAPIHono so the
// `.openapi()` operations propagate up through the parent `financeRoutes`
// registry (OpenAPIHono.route copies the sub-app's registered routes).
export const financeReportRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", reportRoutes)
  .route("/", costCategoryRoutes)
  .route("/", accountantShareRoutes)
