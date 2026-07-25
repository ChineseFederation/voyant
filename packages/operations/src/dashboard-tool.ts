import {
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  type ToolDefinition,
} from "@voyant-travel/tools"
import { z } from "zod"

import { availabilitySlotStatusSchema } from "./availability/validation.js"
import type { OperationsToolServices } from "./tool-services.js"

const VERSION = "v1"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const

export interface OperatorDashboardBookingsServices {
  getBookingAggregates(query: {
    from?: string
    to?: string
    upcomingLimit?: number
  }): Promise<unknown>
}

export interface OperatorDashboardFinanceServices {
  getFinanceAggregates(query: {
    range: "custom"
    from: string
    to: string
    outstandingTopLimit: number
  }): Promise<unknown>
}

export interface OperatorDashboardInventoryServices {
  getProductAggregates(query: { from?: string; to?: string }): Promise<unknown>
}

export interface OperatorDashboardDistributionServices {
  getSupplierAggregates(query: { from?: string; to?: string }): Promise<unknown>
}

export type OperatorDashboardToolContext = ToolContext & {
  operations?: OperationsToolServices
  bookings?: OperatorDashboardBookingsServices
  finance?: OperatorDashboardFinanceServices
  inventory?: OperatorDashboardInventoryServices
  distribution?: OperatorDashboardDistributionServices
}

const operatorDashboardRangeSchema = z.enum(["today", "this-week", "this-month", "last-30-days"])

export const operatorDashboardSummaryInputSchema = z.object({
  range: operatorDashboardRangeSchema.default("this-week"),
})

const bookingAggregatesSchema = z.object({
  total: z.number().int(),
  totalPax: z.number().int(),
  countsByStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
  monthlyCounts: z.array(z.object({ yearMonth: z.string(), count: z.number().int() })),
  monthlyRevenue: z.array(
    z.object({
      yearMonth: z.string(),
      currency: z.string(),
      sellAmountCents: z.number().int(),
    }),
  ),
  upcomingDepartures: z.object({
    count: z.number().int(),
    items: z.array(
      z.object({
        id: z.string(),
        bookingNumber: z.string().nullable(),
        status: z.string(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        pax: z.number().int().nullable(),
        sellCurrency: z.string().nullable(),
        sellAmountCents: z.number().int().nullable(),
      }),
    ),
  }),
})

const productAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
  active: z.number().int(),
  publicActive: z.number().int(),
  monthlyCreatedCounts: z.array(z.object({ yearMonth: z.string(), count: z.number().int() })),
})

const supplierAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
  countsByType: z.array(z.object({ type: z.string(), count: z.number().int() })),
  active: z.number().int(),
})

const financeAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
  counts: z.object({
    invoices: z.object({
      issued: z.number().int(),
      paid: z.number().int(),
      void: z.number().int(),
      overdue: z.number().int(),
    }),
    proformas: z.object({
      issued: z.number().int(),
      converted: z.number().int(),
      void: z.number().int(),
    }),
    paymentSessions: z.object({
      pending: z.number().int(),
      paid: z.number().int(),
      failed: z.number().int(),
    }),
  }),
  totals: z.array(
    z.object({
      currency: z.string(),
      invoiced: z.number().int(),
      collected: z.number().int(),
      outstanding: z.number().int(),
      refunded: z.number().int(),
    }),
  ),
  monthlyRevenue: z.array(
    z.object({ yearMonth: z.string(), currency: z.string(), totalCents: z.number().int() }),
  ),
  monthlyInvoiceCounts: z.array(z.object({ yearMonth: z.string(), count: z.number().int() })),
  outstanding: z.array(
    z.object({ currency: z.string(), balanceDueCents: z.number().int(), count: z.number().int() }),
  ),
  overdue: z.array(
    z.object({ currency: z.string(), balanceDueCents: z.number().int(), count: z.number().int() }),
  ),
  outstandingTopN: z.array(
    z.object({
      id: z.string(),
      invoiceNumber: z.string().nullable(),
      bookingId: z.string().nullable(),
      status: z.string(),
      currency: z.string(),
      totalCents: z.number().int(),
      balanceDueCents: z.number().int(),
      issueDate: z.string().nullable(),
      dueDate: z.string().nullable(),
    }),
  ),
})

const availabilityAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(
    z.object({ status: availabilitySlotStatusSchema, count: z.number().int() }),
  ),
  upcomingSlots: z.number().int(),
  upcomingPax: z.number().int(),
  monthlyDepartures: z.array(
    z.object({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/), count: z.number().int() }),
  ),
})

const operatorDashboardAlertSchema = z.object({
  kind: z.enum([
    "overdue-invoices",
    "no-public-products",
    "no-active-suppliers",
    "no-upcoming-departures",
  ]),
  severity: z.enum(["warning", "critical"]),
  count: z.number().int(),
  currency: z.string().nullable(),
  amountCents: z.number().int().nullable(),
})

export const operatorDashboardSummaryOutputSchema = z.object({
  range: z.object({
    key: operatorDashboardRangeSchema,
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  generatedAt: z.string().datetime(),
  kpis: z.object({
    bookings: z.object({
      total: z.number().int(),
      active: z.number().int(),
      travelers: z.number().int(),
    }),
    products: z.object({
      total: z.number().int(),
      active: z.number().int(),
      publicActive: z.number().int(),
    }),
    suppliers: z.object({ total: z.number().int(), active: z.number().int() }),
    availability: z.object({ upcomingDepartures: z.number().int(), upcomingPax: z.number().int() }),
    revenue: z.array(z.object({ currency: z.string(), amountCents: z.number().int() })),
    outstanding: z.array(
      z.object({ currency: z.string(), amountCents: z.number().int(), count: z.number().int() }),
    ),
  }),
  alerts: z.array(operatorDashboardAlertSchema),
  projections: z.object({
    bookings: bookingAggregatesSchema,
    products: productAggregatesSchema,
    suppliers: supplierAggregatesSchema,
    finance: financeAggregatesSchema,
    availability: availabilityAggregatesSchema,
  }),
})

export const getOperatorDashboardSummaryDefinition = {
  owner: "@voyant-travel/operations#dashboard",
  capabilityId: "@voyant-travel/operations#dashboard#tool.get-operator-dashboard-summary",
  capabilityVersion: VERSION,
  name: "get_operator_dashboard_summary",
  description:
    "Compose an operator dashboard summary from the selected Bookings, Finance, Inventory, " +
    "Distribution, and Operations aggregate services. Staff-only and read-only.",
  inputSchema: operatorDashboardSummaryInputSchema,
  outputSchema: operatorDashboardSummaryOutputSchema,
  requiredScopes: [
    "operations:read",
    "bookings:read",
    "finance:read",
    "products:read",
    "suppliers:read",
  ],
  audience: STAFF_AUDIENCE,
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler({ range }, ctx: OperatorDashboardToolContext) {
    const generatedAt = new Date()
    const window = resolveOperatorDashboardWindow(range, generatedAt)
    const operations = requireService(ctx.operations, "operations")
    const bookings = requireService(ctx.bookings, "bookings")
    const finance = requireService(ctx.finance, "finance")
    const inventory = requireService(ctx.inventory, "inventory")
    const distribution = requireService(ctx.distribution, "distribution")

    const [bookingsValue, productsValue, suppliersValue, financeValue, availabilityValue] =
      await Promise.all([
        bookings.getBookingAggregates({ from: window.from, to: window.to, upcomingLimit: 8 }),
        inventory.getProductAggregates({ from: window.from, to: window.to }),
        distribution.getSupplierAggregates({ from: window.from, to: window.to }),
        finance.getFinanceAggregates({
          range: "custom",
          from: window.from,
          to: window.to,
          outstandingTopLimit: 5,
        }),
        operations.getAvailabilityAggregates({ from: window.from, to: window.to }),
      ])

    const bookingProjection = parseJsonResult(bookingAggregatesSchema, bookingsValue)
    const productProjection = parseJsonResult(productAggregatesSchema, productsValue)
    const supplierProjection = parseJsonResult(supplierAggregatesSchema, suppliersValue)
    const financeProjection = parseJsonResult(financeAggregatesSchema, financeValue)
    const availabilityProjection = parseJsonResult(availabilityAggregatesSchema, availabilityValue)

    return operatorDashboardSummaryOutputSchema.parse({
      range: { key: range, ...window },
      generatedAt: generatedAt.toISOString(),
      kpis: {
        bookings: {
          total: bookingProjection.total,
          active: countStatuses(bookingProjection.countsByStatus, ["confirmed", "in_progress"]),
          travelers: bookingProjection.totalPax,
        },
        products: {
          total: productProjection.total,
          active: productProjection.active,
          publicActive: productProjection.publicActive,
        },
        suppliers: { total: supplierProjection.total, active: supplierProjection.active },
        availability: {
          upcomingDepartures: availabilityProjection.upcomingSlots,
          upcomingPax: availabilityProjection.upcomingPax,
        },
        revenue: sumRevenueByCurrency(financeProjection.monthlyRevenue),
        outstanding: financeProjection.outstanding.map(({ currency, balanceDueCents, count }) => ({
          currency,
          amountCents: balanceDueCents,
          count,
        })),
      },
      alerts: buildOperatorDashboardAlerts({
        products: productProjection,
        suppliers: supplierProjection,
        finance: financeProjection,
        availability: availabilityProjection,
      }),
      projections: {
        bookings: bookingProjection,
        products: productProjection,
        suppliers: supplierProjection,
        finance: financeProjection,
        availability: availabilityProjection,
      },
    })
  },
} as const satisfies ToolDefinition<
  z.output<typeof operatorDashboardSummaryInputSchema>,
  z.output<typeof operatorDashboardSummaryOutputSchema>,
  OperatorDashboardToolContext
>

export function resolveOperatorDashboardWindow(
  range: z.infer<typeof operatorDashboardRangeSchema>,
  now = new Date(),
): { from: string; to: string } {
  const from = new Date(now)
  switch (range) {
    case "today":
      from.setUTCHours(0, 0, 0, 0)
      break
    case "this-week": {
      const daysSinceMonday = (from.getUTCDay() + 6) % 7
      from.setUTCDate(from.getUTCDate() - daysSinceMonday)
      from.setUTCHours(0, 0, 0, 0)
      break
    }
    case "this-month":
      from.setUTCDate(1)
      from.setUTCHours(0, 0, 0, 0)
      break
    case "last-30-days":
      from.setUTCDate(from.getUTCDate() - 30)
      break
  }
  return { from: from.toISOString(), to: now.toISOString() }
}

function countStatuses(
  rows: Array<{ status: string; count: number }>,
  statuses: readonly string[],
): number {
  const accepted = new Set(statuses)
  return rows.reduce((total, row) => total + (accepted.has(row.status) ? row.count : 0), 0)
}

function sumRevenueByCurrency(
  rows: Array<{ currency: string; totalCents: number }>,
): Array<{ currency: string; amountCents: number }> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.totalCents)
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountCents]) => ({ currency, amountCents }))
}

function buildOperatorDashboardAlerts(input: {
  products: z.infer<typeof productAggregatesSchema>
  suppliers: z.infer<typeof supplierAggregatesSchema>
  finance: z.infer<typeof financeAggregatesSchema>
  availability: z.infer<typeof availabilityAggregatesSchema>
}): Array<z.infer<typeof operatorDashboardAlertSchema>> {
  const alerts: Array<z.infer<typeof operatorDashboardAlertSchema>> = input.finance.overdue.map(
    ({ currency, balanceDueCents, count }) => ({
      kind: "overdue-invoices",
      severity: "critical",
      count,
      currency,
      amountCents: balanceDueCents,
    }),
  )
  if (input.products.publicActive === 0) {
    alerts.push({
      kind: "no-public-products",
      severity: "warning",
      count: 0,
      currency: null,
      amountCents: null,
    })
  }
  if (input.suppliers.active === 0) {
    alerts.push({
      kind: "no-active-suppliers",
      severity: "warning",
      count: 0,
      currency: null,
      amountCents: null,
    })
  }
  if (input.availability.upcomingSlots === 0) {
    alerts.push({
      kind: "no-upcoming-departures",
      severity: "warning",
      count: 0,
      currency: null,
      amountCents: null,
    })
  }
  return alerts
}

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
