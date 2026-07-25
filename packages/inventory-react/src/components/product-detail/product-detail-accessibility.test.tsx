// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  type OperatorAdminMessages,
  operatorAdminMessageDefinitions,
  resolveLocaleMessages,
} from "@voyant-travel/i18n"
import { DropdownMenuItem } from "@voyant-travel/ui/components"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@voyant-travel/ui/components/rich-text-editor", () => ({
  RichTextEditor: ({
    id,
    "aria-labelledby": ariaLabelledby,
    "aria-describedby": ariaDescribedby,
    "aria-invalid": ariaInvalid,
  }: {
    id?: string
    "aria-labelledby"?: string
    "aria-describedby"?: string
    "aria-invalid"?: boolean
  }) => (
    <textarea
      id={id}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      aria-invalid={ariaInvalid}
      readOnly
    />
  ),
}))

vi.mock("../../index.js", () => ({
  useProductTranslations: () => ({ data: { data: [] }, isPending: false }),
  useProductTranslationMutation: () => ({
    create: { mutateAsync: vi.fn() },
    remove: { mutateAsync: vi.fn() },
    update: { mutateAsync: vi.fn() },
  }),
}))

vi.mock("./product-option-price-rule-dialog.js", () => ({
  OptionPriceRuleDialog: () => null,
}))

vi.mock("./product-option-pricing-grid.js", () => ({
  OptionPricingGrid: () => null,
}))

vi.mock("./product-options-extra-price-rules.js", () => ({
  ExtraPriceRulesPanel: () => null,
}))

vi.mock("./product-options-unit-price-matrix.js", () => ({
  UnitPriceMatrix: () => null,
}))

import { type ProductDetailApi, ProductDetailHostProvider } from "./host.js"
import { ProductChannelsSection } from "./product-detail-channel-section.js"
import { type ProductData, ProductDetailForm } from "./product-detail-form.js"
import { ActionMenu } from "./product-detail-section-shell.js"
import { PricingPanel } from "./product-options-pricing-panel.js"
import { ContentLanguageSwitcher } from "./product-translation-popover.js"

const messages = resolveLocaleMessages<OperatorAdminMessages>({
  locale: "en",
  fallbackLocale: "en",
  definitions: operatorAdminMessageDefinitions,
})

const api: ProductDetailApi = {
  get: async <T,>() => ({ data: [] }) as T,
  post: async <T,>() => ({ id: "product_1" }) as T,
  patch: async <T,>() => ({}) as T,
  delete: async <T,>() => ({}) as T,
}

const product: ProductData = {
  id: "product_1",
  name: "",
  status: "draft",
  description: null,
  inclusionsHtml: null,
  exclusionsHtml: null,
  termsHtml: null,
  bookingMode: "itinerary",
  visibility: "private",
  activated: false,
  productTypeId: null,
  taxClassId: null,
  sellCurrency: "E",
  tags: ["featured"],
  defaultLanguageTag: "en",
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function renderWithHost(children: ReactNode, hostApi: ProductDetailApi = api) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ProductDetailHostProvider
          value={{
            messages,
            api: hostApi,
            locale: "en",
            navigate: {
              toProducts: () => undefined,
              toProduct: () => undefined,
              toAvailability: () => undefined,
            },
          }}
        >
          {children}
        </ProductDetailHostProvider>
      </QueryClientProvider>,
    )
  })
}

describe("product detail accessibility", () => {
  it("associates labels with all fourteen product controls and validation messages", async () => {
    await renderWithHost(<ProductDetailForm product={product} onSuccess={() => undefined} />)

    const controlIds = [
      "product-detail-name",
      "product-detail-description",
      "product-detail-slug",
      "product-detail-inclusions",
      "product-detail-exclusions",
      "product-detail-terms",
      "product-detail-default-language",
      "product-detail-tags",
      "product-detail-booking-mode",
      "product-detail-visibility",
      "product-detail-product-type",
      "product-detail-status",
      "product-detail-tax-class",
      "product-detail-sell-currency",
    ]

    expect(controlIds).toHaveLength(14)
    for (const id of controlIds) {
      expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull()
      expect(document.getElementById(id)).not.toBeNull()
    }

    for (const id of [
      "product-detail-description",
      "product-detail-inclusions",
      "product-detail-exclusions",
      "product-detail-terms",
    ]) {
      expect(document.getElementById(id)?.getAttribute("aria-labelledby")).toBe(`${id}-label`)
    }

    const form = document.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    for (const [controlId, errorId] of [
      ["product-detail-name", "product-detail-name-error"],
      ["product-detail-sell-currency", "product-detail-sell-currency-error"],
    ] as const) {
      const control = document.getElementById(controlId)
      expect(control?.getAttribute("aria-invalid")).toBe("true")
      expect(control?.getAttribute("aria-describedby")).toBe(errorId)
      expect(document.getElementById(errorId)).not.toBeNull()
    }

    expect(document.querySelector('button[aria-label="Delete: featured"]')).not.toBeNull()
    expect(document.querySelectorAll('button[aria-label="Not translated"]')).toHaveLength(6)
  })

  it("names translation, action-menu, and channel helper buttons", async () => {
    await renderWithHost(
      <>
        <ContentLanguageSwitcher
          activeLanguage="en"
          defaultLanguageTag="en"
          languageTags={["fr"]}
          messages={messages.products.core}
          onSelect={() => undefined}
          onAddLanguage={() => undefined}
          onRemoveLanguage={() => undefined}
        />
        <ActionMenu label="Product actions">
          <DropdownMenuItem>Edit</DropdownMenuItem>
        </ActionMenu>
        <ProductChannelsSection
          allChannels={[{ id: "channel_1", name: "Website", kind: "direct", status: "active" }]}
          mappings={[
            { id: "mapping_1", channelId: "channel_1", productId: "product_1", active: true },
          ]}
          onAddChannel={() => undefined}
          onRemoveChannel={() => undefined}
        />
      </>,
    )

    for (const label of ["Remove language: French", "Product actions", "Delete: Website"]) {
      const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      expect(button?.title).toBe(label)
    }
  })

  it("names the pricing panel's local action menu for an additional price rule", async () => {
    const priceRule = {
      id: "price_rule_2",
      productId: "product_1",
      optionId: "option_1",
      priceCatalogId: "catalog_1",
      priceScheduleId: null,
      cancellationPolicyId: null,
      name: "Flexible rate",
      code: null,
      description: null,
      pricingMode: "per_person" as const,
      baseSellAmountCents: 12500,
      baseCostAmountCents: null,
      minPerBooking: null,
      maxPerBooking: null,
      allPricingCategories: true,
      isDefault: false,
      active: true,
      notes: null,
    }
    const pricingApi: ProductDetailApi = {
      ...api,
      get: async <T,>() =>
        ({
          data: [{ ...priceRule, id: "price_rule_1", name: "Default", isDefault: true }, priceRule],
        }) as T,
    }

    await renderWithHost(
      <PricingPanel
        productId="product_1"
        optionId="option_1"
        optionName="Standard"
        productCurrency="EUR"
        layout="seats"
      />,
      pricingApi,
    )

    const advancedButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(messages.products.operations.pricingGrid.advancedToggle),
    )
    expect(advancedButton).toBeDefined()

    await act(async () => {
      advancedButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await vi.waitFor(() => {
        expect(
          document.querySelector('button[aria-label="Flexible rate: Edit / Delete"]'),
        ).not.toBeNull()
      })
    })

    const menu = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Flexible rate: Edit / Delete"]',
    )
    expect(menu?.title).toBe("Flexible rate: Edit / Delete")
  })
})
