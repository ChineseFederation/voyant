// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FinanceUiMessagesProvider } from "../../i18n/index.js"
import type { DepartureProfitabilityRow, ProductProfitabilityRow } from "../../index.js"
import { DepartureTable, ProductTable } from "./sections.js"

const departureRow: DepartureProfitabilityRow = {
  departureId: "avsl_dl",
  departureLabel: "Bucharest Weekend",
  productId: "prod_dl",
  productName: "City Break",
  departureDate: "2026-07-01",
  currency: "RON",
  revenueCents: 100000,
  actualCostCents: 60000,
  plannedCostCents: 70000,
  profitCents: 40000,
  marginPercent: 40,
  varianceCents: 10000,
}

const productRow: ProductProfitabilityRow = {
  productId: "prod_dl",
  productName: "City Break",
  currency: "RON",
  departureCount: 1,
  revenueCents: 100000,
  actualCostCents: 60000,
  plannedCostCents: 70000,
  profitCents: 40000,
  marginPercent: 40,
  varianceCents: 10000,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("profitability deep-links", () => {
  it("fires onOpenDeparture with the departure id when the row link is clicked", () => {
    const onOpenDeparture = vi.fn()
    act(() => {
      root.render(
        <FinanceUiMessagesProvider locale="en-US">
          <DepartureTable rows={[departureRow]} currency="RON" onOpenDeparture={onOpenDeparture} />
        </FinanceUiMessagesProvider>,
      )
    })
    const button = container.querySelector("button")
    expect(button).not.toBeNull()
    expect(button?.getAttribute("aria-label")).toContain("Open departure")
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onOpenDeparture).toHaveBeenCalledWith("avsl_dl")
  })

  it("fires onOpenProduct with the product id when the row link is clicked", () => {
    const onOpenProduct = vi.fn()
    act(() => {
      root.render(
        <FinanceUiMessagesProvider locale="en-US">
          <ProductTable rows={[productRow]} currency="RON" onOpenProduct={onOpenProduct} />
        </FinanceUiMessagesProvider>,
      )
    })
    const button = container.querySelector("button")
    expect(button?.getAttribute("aria-label")).toContain("Open product")
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onOpenProduct).toHaveBeenCalledWith("prod_dl")
  })

  it("renders no link affordance when no navigation handler is supplied", () => {
    act(() => {
      root.render(
        <FinanceUiMessagesProvider locale="en-US">
          <DepartureTable rows={[departureRow]} currency="RON" />
        </FinanceUiMessagesProvider>,
      )
    })
    expect(container.querySelector("button")).toBeNull()
  })
})
