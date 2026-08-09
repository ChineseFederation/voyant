import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { ADMIN_ACTIVE_MODULES_QUERY_KEY } from "../../src/app/auth-runtime.js"
import {
  AdminExtensionUnavailableError,
  createLazySelectedAdminExtension,
} from "../../src/app/lazy-selected-extension.js"

describe("createLazySelectedAdminExtension", () => {
  it("composes import-cheap shell contributions without loading route implementations", () => {
    const implementationLoader = vi.fn()
    const shell = vi.fn(() => ({
      id: "catalog",
      navigation: [{ items: [{ id: "catalog", title: "Catalog", url: "/catalog" }] }],
      routes: [{ id: "catalog-index", path: "/catalog", title: "Catalog" }],
    }))

    const extension = createLazySelectedAdminExtension(
      {
        id: "catalog",
        moduleId: "catalog",
        shell,
        load: implementationLoader,
        routes: [{ id: "catalog-index", path: "/catalog", title: "Catalog" }],
      },
      { navMessages: { catalog: "Catalog" } },
    )

    expect(shell).toHaveBeenCalledOnce()
    expect(extension.id).toBe("catalog")
    expect(extension.navigation?.[0]?.items[0]).toMatchObject({ id: "catalog", title: "Catalog" })
    expect(extension.routes).toHaveLength(1)
    expect(implementationLoader).not.toHaveBeenCalled()
  })

  it("preserves shell route contracts while delegating implementation fields", async () => {
    const validateSearch = vi.fn((search) => search)
    const implementationLoader = vi.fn(async () => () => ({
      id: "catalog",
      routes: [
        {
          id: "catalog-products",
          path: "/catalog/products",
          title: "Products",
          page: async () => ({ default: () => null }),
        },
      ],
    }))
    const extension = createLazySelectedAdminExtension(
      {
        id: "@voyant-travel/catalog",
        moduleId: "catalog",
        shell: () => ({
          id: "catalog",
          routes: [
            {
              id: "catalog-products",
              path: "/catalog/products",
              title: "Products",
              validateSearch,
              destination: "catalog.browse" as never,
            },
            {
              id: "catalog-index",
              path: "/catalog",
              title: "Catalog",
              redirectTo: "/catalog/products",
            },
          ],
        }),
        load: implementationLoader,
        routes: [
          { id: "graph-products", path: "/catalog/products", title: "Products" },
          { id: "graph-index", path: "/catalog", title: "Catalog" },
        ],
      },
      { navMessages: {} },
    )

    expect(extension.routes?.[0]).toMatchObject({
      id: "graph-products",
      validateSearch,
      destination: "catalog.browse",
    })
    expect(extension.routes?.[1]).toMatchObject({
      id: "graph-index",
      redirectTo: "/catalog/products",
    })
    expect(extension.routes?.[1]?.page).toBeUndefined()
    expect(implementationLoader).not.toHaveBeenCalled()
  })

  it("fails loudly when shell and graph route ownership drift", () => {
    expect(() =>
      createLazySelectedAdminExtension(
        {
          id: "operations",
          moduleId: "operations",
          shell: () => ({
            id: "operations",
            routes: [{ id: "resources", path: "/operations/resources", title: "Resources" }],
          }),
          load: vi.fn(),
          routes: [{ id: "availability", path: "/operations/availability", title: "Availability" }],
        },
        { navMessages: {} },
      ),
    ).toThrow("missing: /operations/availability; extra: /operations/resources")
  })

  it("does not import the implementation until its route is used and caches it", async () => {
    const page = () => null
    const implementationLoader = vi.fn(async () => () => ({
      id: "settings-implementation",
      settingsPages: [
        {
          id: "settings",
          path: "/custom-fields",
          title: "Custom fields",
          page: async () => ({ default: page }),
          loader: vi.fn(async () => "loaded-data"),
        },
      ],
    }))
    const extension = createLazySelectedAdminExtension(
      {
        id: "@voyant-travel/custom-fields",
        moduleId: "custom-fields",
        load: implementationLoader,
        routes: [
          {
            id: "custom-fields-settings",
            path: "/settings/custom-fields",
            title: "Custom Fields",
          },
        ],
      },
      { navMessages: {} },
    )

    expect(implementationLoader).not.toHaveBeenCalled()
    const settingsPage = extension.settingsPages?.[0]
    const queryClient = new QueryClient()
    queryClient.setQueryData(ADMIN_ACTIVE_MODULES_QUERY_KEY, ["custom-fields"])

    await expect(
      settingsPage?.loader?.({ queryClient, runtime: { baseUrl: "/api" }, params: {} }),
    ).resolves.toBe("loaded-data")
    await expect(settingsPage?.page()).resolves.toEqual({ default: page })
    expect(implementationLoader).toHaveBeenCalledOnce()
  })

  it("rejects a disabled module before importing its implementation", async () => {
    const implementationLoader = vi.fn()
    const extension = createLazySelectedAdminExtension(
      {
        id: "@voyant-travel/auth#customer-business-accounts",
        moduleId: "auth.customer-business-accounts",
        load: implementationLoader,
        routes: [
          {
            id: "business-accounts",
            path: "/business-accounts",
            title: "Business Accounts",
          },
        ],
      },
      { navMessages: {} },
    )
    const queryClient = new QueryClient()
    queryClient.setQueryData(ADMIN_ACTIVE_MODULES_QUERY_KEY, ["catalog"])

    await expect(
      extension.routes?.[0]?.loader?.({
        queryClient,
        runtime: { baseUrl: "/api" },
        params: {},
      }),
    ).rejects.toBeInstanceOf(AdminExtensionUnavailableError)
    expect(implementationLoader).not.toHaveBeenCalled()
  })
})
