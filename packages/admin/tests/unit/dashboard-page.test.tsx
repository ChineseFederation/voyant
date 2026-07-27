import { QueryClient } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { type VoyantFetcher, VoyantReactProvider } from "@voyant-travel/react"
import type { AnchorHTMLAttributes, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DashboardPage } from "../../src/dashboard/dashboard-page.js"
import { AdminProvider } from "../../src/providers/admin-provider.js"
import { OperatorAdminMessagesProvider } from "../../src/providers/operator-admin-messages.js"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: {
    children: ReactNode
    params?: Record<string, string>
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const href = params?.id ? to.replace("$id", params.id) : to
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

const emptyBookings = {
  countsByStatus: [],
  monthlyCounts: [],
  monthlyRevenue: [],
  total: 0,
  totalPax: 0,
  upcomingDepartures: { count: 0, items: [] },
}

const emptyProducts = {
  active: 0,
  countsByStatus: [],
  monthlyCreatedCounts: [],
  publicActive: 0,
  total: 0,
}

const emptySuppliers = {
  active: 0,
  countsByStatus: [],
  countsByType: [],
  total: 0,
}

const emptyFinance = {
  countsByStatus: [],
  monthlyInvoiceCounts: [],
  monthlyRevenue: [],
  outstanding: [],
  outstandingTopN: [],
  overdue: [],
  total: 0,
}

function json(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status: 200,
  })
}

function createDashboardFetcher({
  bookings = emptyBookings,
  finance = emptyFinance,
  products = emptyProducts,
  suppliers = emptySuppliers,
}: {
  bookings?: typeof emptyBookings
  finance?: typeof emptyFinance
  products?: typeof emptyProducts
  suppliers?: typeof emptySuppliers
} = {}): VoyantFetcher {
  return async (url) => {
    const path = new URL(url, "https://example.test").pathname

    if (path.endsWith("/bookings/aggregates")) return json(bookings)
    if (path.endsWith("/products/aggregates")) return json(products)
    if (path.endsWith("/suppliers/aggregates")) return json(suppliers)
    if (path.endsWith("/finance/aggregates")) return json(finance)

    return new Response("Not found", { status: 404 })
  }
}

function renderDashboard({
  children,
  fetcher = createDashboardFetcher(),
}: {
  children?: ReactNode
  fetcher?: VoyantFetcher
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <AdminProvider queryClient={queryClient} themeStorageKey={null}>
      <VoyantReactProvider baseUrl="/api" fetcher={fetcher}>
        <OperatorAdminMessagesProvider>
          {children ?? <DashboardPage />}
        </OperatorAdminMessagesProvider>
      </VoyantReactProvider>
    </AdminProvider>,
  )
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("DashboardPage empty states", () => {
  it("renders the KPI dashboard with section empty states when every aggregate is empty", async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText("No revenue in the selected window yet.")).not.toBeNull()
    })
    expect(screen.getByText("Revenue Trend")).not.toBeNull()
    expect(screen.getByText("No bookings to break down.")).not.toBeNull()
    expect(
      screen.getByText("No bookings created in the selected period (Last 6 months)."),
    ).not.toBeNull()
    expect(screen.getByText("No upcoming departures in the next 30 days")).not.toBeNull()
    expect(screen.getByText("All invoices settled — nothing outstanding.")).not.toBeNull()
    expect(screen.queryByText("Welcome to Voyant.")).toBeNull()
  })

  it("renders section empty states for sparse tenants instead of blank charts", async () => {
    renderDashboard({
      fetcher: createDashboardFetcher({
        finance: { ...emptyFinance, total: 1 },
        products: { ...emptyProducts, total: 1 },
      }),
    })

    await waitFor(() => {
      expect(screen.getByText("No revenue in the selected window yet.")).not.toBeNull()
    })
    expect(screen.getByText("No bookings to break down.")).not.toBeNull()
    expect(
      screen.getByText("No bookings created in the selected period (Last 6 months)."),
    ).not.toBeNull()
    expect(screen.getByText("No upcoming departures in the next 30 days")).not.toBeNull()
    expect(screen.getByText("All invoices settled — nothing outstanding.")).not.toBeNull()
    expect(screen.getByRole("link", { name: /View invoices/ }).getAttribute("href")).toBe(
      "/finance",
    )
    expect(screen.getAllByLabelText("Not enough data yet").length).toBeGreaterThan(0)
  })

  it("allows consumers to override empty copy and actions", async () => {
    renderDashboard({
      children: (
        <DashboardPage
          emptyStates={{
            revenueTrend: {
              action: { href: "/reports", label: "Open reports" },
              title: "No tracked revenue yet",
            },
          }}
        />
      ),
      fetcher: createDashboardFetcher({
        finance: { ...emptyFinance, total: 1 },
        products: { ...emptyProducts, total: 1 },
      }),
    })

    await waitFor(() => {
      expect(screen.getByText("No tracked revenue yet")).not.toBeNull()
    })
    expect(screen.getByRole("link", { name: "Open reports" }).getAttribute("href")).toBe("/reports")
  })
})
