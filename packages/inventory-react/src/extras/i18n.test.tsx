import type { ProductRecord } from "@voyant-travel/inventory-react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ProductCombobox } from "./components/product-combobox.js"
import {
  ExtrasUiMessagesProvider,
  getExtrasUiI18n,
  resolveExtrasUiMessages,
  useExtrasUiMessagesOrDefault,
} from "./i18n/index.js"

const product = {
  id: "product-1",
  name: "Danube Cruise",
  status: "active",
  description: null,
  inclusionsHtml: null,
  exclusionsHtml: null,
  termsHtml: null,
  termsShowOnContract: false,
  bookingMode: "date_time",
  capacityMode: "limited",
  timezone: null,
  visibility: "public",
  activated: true,
  reservationTimeoutMinutes: null,
  taxClassId: null,
  sellCurrency: "EUR",
  sellAmountCents: null,
  costAmountCents: null,
  marginPercent: null,
  facilityId: null,
  startDate: null,
  endDate: null,
  pax: null,
  productTypeId: null,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies ProductRecord

vi.mock("@voyant-travel/inventory-react", () => ({
  useProductSummaries: () => ({
    data: { data: [product] },
    isPending: false,
  }),
  useProduct: () => ({
    data: product,
    isPending: false,
  }),
}))

describe("extras-ui i18n", () => {
  it("resolves localized package messages with fallback and overrides", () => {
    const result = resolveExtrasUiMessages({
      locale: "ro-RO",
      overrides: {
        locales: {
          ro: {
            productCombobox: {
              empty: "Nu exista produse.",
            },
          },
        },
      },
    })

    expect(result.productCombobox.empty).toBe("Nu exista produse.")
    expect(result.productCombobox.bookingModeLabels.date_time).toBe("Activitate cu oră")
  })

  it("returns locale-aware formatters from the package helper", () => {
    const result = getExtrasUiI18n({ locale: "ro-RO" })

    expect(result.locale).toBe("ro-RO")
    expect(result.formatNumber(1200)).toBe(new Intl.NumberFormat("ro-RO").format(1200))
  })

  it("renders English copy without a provider", () => {
    const html = renderToStaticMarkup(
      <div>
        <ProductCombobox value={product.id} onChange={() => {}} />
        <ExtrasMessageProbe />
      </div>,
    )

    expect(html).toContain("Search products")
    expect(html).toContain("Active")
    expect(html).toContain("Timed activity")
  })

  it("renders Romanian copy with the package provider", () => {
    const html = renderToStaticMarkup(
      <ExtrasUiMessagesProvider locale="ro-RO">
        <div>
          <ProductCombobox value={product.id} onChange={() => {}} />
          <ExtrasMessageProbe />
        </div>
      </ExtrasUiMessagesProvider>,
    )

    expect(html).toContain("Cauta produse")
    expect(html).toContain("Activ")
    expect(html).toContain("Activitate cu oră")
  })
})

function ExtrasMessageProbe() {
  const messages = useExtrasUiMessagesOrDefault()

  return (
    <div>
      <span>{messages.productCombobox.statusLabels.active}</span>
      <span>{messages.productCombobox.bookingModeLabels.date_time}</span>
    </div>
  )
}
