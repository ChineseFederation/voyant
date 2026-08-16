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
  PublicApiUiProvider,
  publicApiMessagesEn,
} from "@voyant-travel/public-api-react/public-api"
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
        <PublicApiUiProvider value={testPublicApiUiValue()}>
          <CruiseDetailPage entityId="cdmi_demo_cruise_20260629" />
        </PublicApiUiProvider>,
      )
    })

    expect(host.textContent).toContain("Detail content isn't available for this item yet.")
    expect(host.textContent).not.toContain("Book this")
    expect(host.textContent).not.toContain("Subtotal")
    expect(host.querySelector("aside")).toBeNull()
  })
})

function testPublicApiUiValue() {
  return {
    apiUrl: "https://example.test",
    navigate: mocks.navigate,
    scope: {},
    messages: {
      shop: publicApiMessagesEn.shop,
      shopDetailProducts: publicApiMessagesEn.shopDetailProducts,
      shopDetailAccommodations: publicApiMessagesEn.shopDetailAccommodations,
      shopDetailCruises: publicApiMessagesEn.shopDetailCruises,
      shopDetailShared: {
        ...publicApiMessagesEn.shopDetailShared,
        backToAll: "Back to all",
        bookThis: "Book this",
        detailUnavailable: "Detail content isn't available for this item yet.",
        subtotal: "Subtotal",
      },
    },
  }
}
