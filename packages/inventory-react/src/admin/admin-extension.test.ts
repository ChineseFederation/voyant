import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { inventoryVoyantModule } from "../../../inventory/src/voyant.js"
import { DEFAULT_PRODUCTS_LIST_FILTERS, getProductsQueryOptions } from "../query-options.js"
import {
  createInventoryAdminExtension,
  createSelectedInventoryAdminExtension,
  ProductDetailSkeleton,
  ProductsListSkeleton,
  productDetailOptionExtrasSlot,
} from "./index.js"
import { ProductCategoriesHost } from "./product-categories-host.js"
import { ProductsHost } from "./products-host.js"

describe("createInventoryAdminExtension", () => {
  it("owns selected copy and the option-extras slot", () => {
    const extension = createSelectedInventoryAdminExtension({
      navMessages: { products: "Produse", categories: "Categorii" },
    })
    expect(extension.routes?.every((route) => route.routeMessagesProvider)).toBe(true)
    expect(extension.navigation?.[0]).toMatchObject({
      order: -120,
      items: [
        {
          id: "products",
          title: "Produse",
          url: "/products",
          items: [{ id: "product-categories", title: "Categorii", url: "/products/categories" }],
        },
      ],
    })
    expect(extension.navigation?.[0]?.items[0]?.icon).toBeDefined()
    expect(extension.setupSteps?.[0]).toMatchObject({
      id: "@voyant-travel/inventory#setup.first-product",
    })
    expect(extension.setupSteps?.[0]?.actionComponent).toBeTypeOf("function")
    expect(productDetailOptionExtrasSlot).toBe("product.details.option-extras")
    expect(inventoryVoyantModule.admin?.slots?.map((slot) => slot.id)).toContain(
      productDetailOptionExtrasSlot,
    )
  })

  it("falls back to stable English selected navigation copy", () => {
    const extension = createSelectedInventoryAdminExtension({ navMessages: {} })
    expect(extension.navigation?.[0]?.items[0]).toMatchObject({
      title: "Products",
      items: [{ title: "Categories" }],
    })
  })

  it("keeps the package-owned deployment facets aligned with the admin extension", () => {
    const extension = createInventoryAdminExtension()
    expect(inventoryVoyantModule.admin?.routes?.map((route) => route.path)).toEqual(
      extension.routes?.map((route) => route.path),
    )
    expect(inventoryVoyantModule.admin?.routes?.map((route) => route.runtime)).toEqual(
      extension.routes?.map(() => ({
        entry: "@voyant-travel/inventory-react/admin",
        export: "createInventoryAdminExtension",
      })),
    )
    expect(inventoryVoyantModule.admin?.copy?.[0]?.runtime).toEqual({
      entry: "@voyant-travel/inventory-react/i18n",
      export: "productsUiMessageDefinitions",
    })
  })

  it("leaves standard navigation to the graph-selected factory", () => {
    const extension = createInventoryAdminExtension()
    expect(extension.id).toBe("inventory")
    expect(extension.navigation).toBeUndefined()
  })

  it("describes the list, categories and detail routes with unique ids and paths", () => {
    const extension = createInventoryAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(3)
    expect(new Set(routes.map((route) => route.id)).size).toBe(3)
    expect(routes.map((route) => route.path)).toEqual([
      "/products",
      "/products/categories",
      "/products/$id",
    ])
  })

  it("honors basePath and labels", () => {
    const extension = createInventoryAdminExtension({
      basePath: "/tours",
      labels: { products: "Produse", categories: "Categorii" },
    })
    const index = extension.routes?.find((route) => route.id === "products-index")
    expect(index?.path).toBe("/tours")
    expect(index?.title).toBe("Produse")
    const categories = extension.routes?.find((route) => route.id === "products-categories")
    expect(categories?.path).toBe("/tours/categories")
    expect(categories?.title).toBe("Categorii")
    const detail = extension.routes?.find((route) => route.id === "products-detail")
    expect(detail?.path).toBe("/tours/$id")
    expect(detail?.title).toBe("Produse")
  })

  it("carries no search contracts (the pages keep their filters local)", () => {
    const extension = createInventoryAdminExtension()
    for (const route of extension.routes ?? []) {
      expect(route.validateSearch).toBeUndefined()
    }
  })

  it("carries lazy page loaders instead of eager components", async () => {
    // The full route implementation lives on the contribution (RFC §4.8):
    // `page` resolves the page module lazily so it stays code-split; no
    // eager `component` reference pins it into the workspace-chrome chunk.
    const extension = createInventoryAdminExtension()
    for (const route of extension.routes ?? []) {
      expect(route.component).toBeUndefined()
      expect(typeof route.page).toBe("function")
      const module = await route.page?.()
      expect(typeof module?.default).toBe("function")
    }
  }, 15_000)

  it("attaches data loaders to every route and marks them data-only for SSR", () => {
    const extension = createInventoryAdminExtension()
    expect(extension.routes).toHaveLength(3)
    for (const route of extension.routes ?? []) {
      expect(typeof route.loader).toBe("function")
      expect(route.ssr).toBe("data-only")
    }
  })

  it("loads the exact first-page query that the products page mounts", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [], total: 0, limit: 25, offset: 0 }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    })
    const route = createInventoryAdminExtension().routes?.find(
      (candidate) => candidate.id === "products-index",
    )

    await route?.loader?.({
      queryClient,
      runtime: { baseUrl: "/api", fetcher },
      params: {},
    })
    await queryClient.fetchQuery(
      getProductsQueryOptions({ baseUrl: "/api", fetcher }, DEFAULT_PRODUCTS_LIST_FILTERS),
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/admin/products?sortBy=createdAt&sortDir=desc&limit=25&offset=0",
      expect.any(Object),
    )
  })

  it("annotates the route-backed destinations", () => {
    const extension = createInventoryAdminExtension()
    const byId = new Map(extension.routes?.map((route) => [route.id, route]))
    expect(byId.get("products-index")?.destination).toBe("product.list")
    expect(byId.get("products-categories")?.destination).toBe("productCategory.list")
    expect(byId.get("products-detail")?.destination).toBe("product.detail")
    expect(byId.get("products-detail")?.destinationParams).toEqual({ id: "productId" })
  })
})

describe("packaged products admin hosts", () => {
  // Importable + renderable component types — host apps bind these from
  // their SPECIFIC modules (the admin barrel re-exports types only, so the
  // workspace-chrome chunk that evaluates the factory never pins the heavy
  // hosts). A broken import surface fails here, not in an app build.
  it("exports the page hosts as components from their specific modules", () => {
    for (const host of [
      ProductCategoriesHost,
      ProductDetailSkeleton,
      ProductsHost,
      ProductsListSkeleton,
    ]) {
      expect(typeof host).toBe("function")
    }
  })
})
