// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useOfferPreview: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}))

vi.mock("@voyant-travel/catalog-react/booking-engine", () => ({
  useOfferPreview: mocks.useOfferPreview,
}))

import {
  StorefrontUiProvider,
  storefrontMessagesEn,
} from "@voyant-travel/storefront-react/storefront"
import { CruiseDetailPage } from "./cruise-detail-page.js"

describe("CruiseDetailPage", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    mocks.useQuery.mockReset()
    mocks.useOfferPreview.mockReset()
    mocks.navigate.mockReset()
    mocks.useOfferPreview.mockReturnValue({
      data: null,
      isPreviewing: false,
      isSettling: false,
      error: null,
      refresh: vi.fn(),
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("shows unavailable detail content without a booking sidebar when cruise content cannot resolve", async () => {
    mocks.useQuery.mockReturnValue({ data: null, isLoading: false })

    await act(async () => {
      root.render(
        <StorefrontUiProvider value={testStorefrontUiValue()}>
          <CruiseDetailPage entityId="cdmi_demo_cruise_20260629" />
        </StorefrontUiProvider>,
      )
    })

    expect(host.textContent).toContain("Detail content isn't available for this item yet.")
    expect(host.textContent).not.toContain("Book this")
    expect(host.textContent).not.toContain("Subtotal")
    expect(host.querySelector("aside")).toBeNull()
  })
})

function testStorefrontUiValue() {
  return {
    apiUrl: "https://example.test",
    navigate: mocks.navigate,
    scope: {},
    messages: {
      shop: storefrontMessagesEn.shop,
      shopDetailProducts: storefrontMessagesEn.shopDetailProducts,
      shopDetailAccommodations: storefrontMessagesEn.shopDetailAccommodations,
      shopDetailCruises: storefrontMessagesEn.shopDetailCruises,
      shopDetailShared: {
        ...storefrontMessagesEn.shopDetailShared,
        backToAll: "Back to all",
        bookThis: "Book this",
        detailUnavailable: "Detail content isn't available for this item yet.",
        subtotal: "Subtotal",
      },
    },
  }
}
