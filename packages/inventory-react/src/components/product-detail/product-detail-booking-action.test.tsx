// @vitest-environment jsdom

import type { OperatorAdminMessages } from "@voyant-travel/i18n"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProductDetailHostProvider } from "./host.js"
import { ProductDetailHeader } from "./product-detail-header.js"
import type { ProductRecord } from "./product-detail-shared.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("ProductDetailHeader booking action", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("offers Create booking and hands off the owned product action", async () => {
    const onBookingCreate = vi.fn()
    await act(async () => {
      root.render(
        <ProductDetailHostProvider
          value={{
            messages: {
              products: {
                core: {
                  breadcrumbProducts: "Products",
                  pageTitle: "Product",
                  addBooking: "Create booking",
                  edit: "Edit",
                  duplicate: "Duplicate",
                  delete: "Delete",
                  statusActive: "Active",
                },
              },
            } as unknown as OperatorAdminMessages,
            api: {
              get: vi.fn(),
              post: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            locale: "en",
            navigate: {
              toProducts: vi.fn(),
              toProduct: vi.fn(),
              toAvailability: vi.fn(),
            },
          }}
        >
          <ProductDetailHeader
            product={{ id: "prod_1", name: "Danube Tour", status: "active" } as ProductRecord}
            isDuplicating={false}
            isDeleting={false}
            onEdit={vi.fn()}
            onDuplicate={vi.fn()}
            onDelete={vi.fn()}
            onBookingCreate={onBookingCreate}
          />
        </ProductDetailHostProvider>,
      )
    })
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Create booking",
    )
    expect(button).toBeDefined()
    await act(async () => button?.click())
    expect(onBookingCreate).toHaveBeenCalledOnce()
  })
})
