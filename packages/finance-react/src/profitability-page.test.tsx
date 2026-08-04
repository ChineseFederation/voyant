import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ProfitabilityPage } from "./components/profitability-page.js"
import { FinanceUiMessagesProvider } from "./i18n/index.js"

const departureRow = {
  departureId: "dep_123",
  departureLabel: "Bucharest Weekend",
  productId: "prod_123",
  productName: "City Break",
  departureDate: "2026-07-01",
  currency: "RON",
  revenueCents: 10796949,
  actualCostCents: 7500050,
  plannedCostCents: 8000000,
  profitCents: 3296899,
  marginPercent: 30.5,
  varianceCents: 499950,
}

const productRow = {
  productId: "prod_123",
  productName: "City Break",
  currency: "RON",
  departureCount: 1,
  revenueCents: 10796949,
  actualCostCents: 7500050,
  plannedCostCents: 8000000,
  profitCents: 3296899,
  marginPercent: 30.5,
  varianceCents: 499950,
}

vi.mock("./index.js", () => ({
  useDepartureProfitability: () => ({
    data: {
      data: {
        rows: [departureRow],
        costByServiceType: [
          { serviceType: "accommodation", currency: "RON", amountCents: 7500050 },
        ],
        unattributed: [{ currency: "RON", amountCents: 120050 }],
        unallocated: [{ currency: "RON", amountCents: 45000 }],
        base: {
          currency: "RON",
          rows: [departureRow],
          costByServiceType: [
            { serviceType: "accommodation", currency: "RON", amountCents: 7500050 },
          ],
          unattributedCents: 120050,
          unallocatedCents: 45000,
          unconvertibleCurrencies: [],
        },
      },
    },
    isError: false,
  }),
  useProductProfitability: () => ({
    data: {
      data: {
        rows: [productRow],
        costByServiceType: [
          { serviceType: "accommodation", currency: "RON", amountCents: 7500050 },
        ],
        unattributed: [{ currency: "RON", amountCents: 120050 }],
        unallocated: [{ currency: "RON", amountCents: 45000 }],
        base: {
          currency: "RON",
          rows: [productRow],
          costByServiceType: [
            { serviceType: "accommodation", currency: "RON", amountCents: 7500050 },
          ],
          unattributedCents: 120050,
          unallocatedCents: 45000,
          unconvertibleCurrencies: [],
        },
      },
    },
    isError: false,
  }),
  useTravelerProfitability: () => ({
    data: { data: { departureId: "dep_123", currency: "RON", travelerCount: 0, rows: [] } },
    isError: false,
    isPending: false,
  }),
  useAccountantShares: () => ({
    data: { data: [] },
  }),
  useAccountantShareMutation: () => ({
    create: { mutate: vi.fn(), isPending: false },
    revoke: { mutate: vi.fn(), isPending: false },
  }),
}))

describe("ProfitabilityPage", () => {
  it("formats KPI and table monetary values with locale-aware currency formatting", () => {
    const html = renderToStaticMarkup(
      <FinanceUiMessagesProvider locale="en-US">
        <ProfitabilityPage />
      </FinanceUiMessagesProvider>,
    )

    expect(html).toContain(
      new Intl.NumberFormat("en-US", { currency: "RON", style: "currency" }).format(107969.49),
    )
    expect(html).toContain(
      new Intl.NumberFormat("en-US", { currency: "RON", style: "currency" }).format(75000.5),
    )
    expect(html).not.toContain("107969.49 RON")
  })
})
