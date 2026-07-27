import { queryOptions } from "@tanstack/react-query"
import type { VoyantFetcher } from "@voyant-travel/react"
import type { ChartConfig } from "@voyant-travel/ui/components/chart"

export interface DashboardQueryClient {
  baseUrl: string
  fetcher: VoyantFetcher
}

export type BookingsAggregates = {
  total: number
  totalPax: number
  countsByStatus: Array<{ status: string; count: number }>
  monthlyCounts: Array<{ yearMonth: string; count: number }>
  monthlyRevenue: Array<{ yearMonth: string; currency: string; sellAmountCents: number }>
  upcomingDepartures: {
    count: number
    items: Array<{
      id: string
      bookingNumber: string | null
      status: string
      startDate: string | null
      endDate: string | null
      pax: number | null
      sellCurrency: string | null
      sellAmountCents: number | null
    }>
  }
}

export type ProductsAggregates = {
  total: number
  active: number
  publicActive: number
  countsByStatus: Array<{ status: string; count: number }>
  monthlyCreatedCounts: Array<{ yearMonth: string; count: number }>
}

export type SuppliersAggregates = {
  total: number
  active: number
  countsByStatus: Array<{ status: string; count: number }>
  countsByType: Array<{ type: string | null; count: number }>
}

export type FinanceAggregates = {
  total: number
  countsByStatus: Array<{ status: string; count: number }>
  monthlyRevenue: Array<{ yearMonth: string; currency: string; totalCents: number }>
  monthlyInvoiceCounts: Array<{ yearMonth: string; count: number }>
  outstanding: Array<{ currency: string; balanceDueCents: number; count: number }>
  overdue: Array<{ currency: string; balanceDueCents: number; count: number }>
  outstandingTopN: Array<{
    id: string
    invoiceNumber: string | null
    bookingId: string | null
    status: string
    currency: string
    totalCents: number
    balanceDueCents: number
    issueDate: string | null
    dueDate: string | null
  }>
}

export class DashboardApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message)
    this.name = "DashboardApiError"
  }
}

export const dashboardQueryKeys = {
  bookingsAggregates: (from: string) => ["dashboard-bookings-aggregates", from] as const,
  productsAggregates: () => ["dashboard-products-aggregates"] as const,
  suppliersAggregates: () => ["dashboard-suppliers-aggregates"] as const,
  financeAggregates: (from: string) => ["dashboard-finance-aggregates", from] as const,
}

/** Selectable dashboard windows, in months. The default matches the prefetch. */
export const DASHBOARD_RANGE_MONTHS = [3, 6, 12] as const
export type DashboardRangeMonths = (typeof DASHBOARD_RANGE_MONTHS)[number]
export const DEFAULT_DASHBOARD_RANGE_MONTHS: DashboardRangeMonths = 6

export function buildDashboardWindow(
  months: DashboardRangeMonths = DEFAULT_DASHBOARD_RANGE_MONTHS,
) {
  const now = new Date()
  const fromDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1, 0, 0, 0, 0),
  )
  return { from: fromDate.toISOString() }
}

export function buildDashboardSixMonthWindow() {
  return buildDashboardWindow(6)
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${trimmedPath}`
}

function extractErrorMessage(status: number, statusText: string, body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const errorField = (body as { error: unknown }).error
    if (typeof errorField === "string") return errorField
    if (typeof errorField === "object" && errorField !== null && "message" in errorField) {
      return String((errorField as { message: unknown }).message)
    }
  }
  return `Dashboard API error: ${status} ${statusText}`
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function fetchDashboardJson<T>(client: DashboardQueryClient, path: string): Promise<T> {
  const response = await client.fetcher(joinUrl(client.baseUrl, path), {
    headers: { Accept: "application/json" },
    method: "GET",
  })

  const body = await readBody(response)

  if (!response.ok) {
    throw new DashboardApiError(
      extractErrorMessage(response.status, response.statusText, body),
      response.status,
      body,
    )
  }

  return body as T
}

export function getDashboardBookingsAggregatesQueryOptions(
  client: DashboardQueryClient,
  months: DashboardRangeMonths = DEFAULT_DASHBOARD_RANGE_MONTHS,
) {
  const { from } = buildDashboardWindow(months)
  return queryOptions({
    queryKey: dashboardQueryKeys.bookingsAggregates(from),
    queryFn: () =>
      fetchDashboardJson<{ data: BookingsAggregates }>(
        client,
        `/v1/admin/bookings/aggregates?from=${encodeURIComponent(from)}&upcomingLimit=8`,
      ),
    staleTime: 60_000,
  })
}

export function getDashboardProductsAggregatesQueryOptions(client: DashboardQueryClient) {
  return queryOptions({
    queryKey: dashboardQueryKeys.productsAggregates(),
    queryFn: () =>
      fetchDashboardJson<{ data: ProductsAggregates }>(client, "/v1/admin/products/aggregates"),
    staleTime: 60_000,
  })
}

export function getDashboardSuppliersAggregatesQueryOptions(client: DashboardQueryClient) {
  return queryOptions({
    queryKey: dashboardQueryKeys.suppliersAggregates(),
    queryFn: () =>
      fetchDashboardJson<{ data: SuppliersAggregates }>(client, "/v1/admin/suppliers/aggregates"),
    staleTime: 60_000,
  })
}

export function getDashboardFinanceAggregatesQueryOptions(
  client: DashboardQueryClient,
  months: DashboardRangeMonths = DEFAULT_DASHBOARD_RANGE_MONTHS,
) {
  const { from } = buildDashboardWindow(months)
  return queryOptions({
    queryKey: dashboardQueryKeys.financeAggregates(from),
    queryFn: () =>
      fetchDashboardJson<{ data: FinanceAggregates }>(
        client,
        `/v1/admin/finance/aggregates?from=${encodeURIComponent(from)}&outstandingTopLimit=5`,
      ),
    staleTime: 60_000,
  })
}

export function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function getStatusColor(status: string): string {
  // Status colors are intentionally hard-coded — they carry meaning
  // (green = confirmed, red = cancelled, etc.) and shouldn't change
  // with theme palette tokens like --chart-1..5, which are general
  // chart palette slots and may be set to a monochromatic series.
  const map: Record<string, string> = {
    confirmed: "#86cb3c",
    completed: "#6172f3",
    in_progress: "hsl(47 96% 53%)",
    draft: "#efefeb",
    cancelled: "#ff4405",
  }
  return map[status] ?? "#efefeb"
}

export const revenueChartConfig = {
  revenue: {
    label: operatorAdminDashboardMessages.en.dashboard.chartRevenueLabel,
    color: "#ff4405",
  },
  bookings: {
    label: operatorAdminDashboardMessages.en.dashboard.chartBookingsLabel,
    color: "#86cb3c",
  },
} satisfies ChartConfig

export const bookingStatusConfig = {
  confirmed: {
    label: operatorAdminDashboardMessages.en.dashboard.statusConfirmedLabel,
    color: "#86cb3c",
  },
  completed: {
    label: operatorAdminDashboardMessages.en.dashboard.statusCompletedLabel,
    color: "#6172f3",
  },
  in_progress: {
    label: operatorAdminDashboardMessages.en.dashboard.statusInProgressLabel,
    color: "hsl(47 96% 53%)",
  },
  draft: { label: operatorAdminDashboardMessages.en.dashboard.statusDraftLabel, color: "#efefeb" },
  cancelled: {
    label: operatorAdminDashboardMessages.en.dashboard.statusCancelledLabel,
    color: "#ff4405",
  },
} satisfies ChartConfig

export const monthlyBookingsConfig = {
  count: {
    label: operatorAdminDashboardMessages.en.dashboard.chartBookingsLabel,
    color: "#ff4405",
  },
} satisfies ChartConfig

export function buildMonthSeries(months: number = DEFAULT_DASHBOARD_RANGE_MONTHS) {
  const now = new Date()
  return Array.from({ length: months }, (_, idx) => {
    const offset = months - 1 - idx
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    return {
      yearMonth: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      month: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    }
  })
}

export function pickPrimaryCurrency(
  rows: Array<{ currency: string; sellAmountCents: number }>,
): string {
  if (rows.length === 0) return "USD"
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.sellAmountCents)
  }
  let bestCurrency = "USD"
  let bestTotal = -1
  for (const [currency, total] of totals) {
    if (total > bestTotal) {
      bestCurrency = currency
      bestTotal = total
    }
  }
  return bestCurrency
}

import { operatorAdminDashboardMessages } from "@voyant-travel/i18n"
