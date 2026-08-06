import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { ADMIN_ACTIVE_MODULES_QUERY_KEY } from "../../src/app/auth-runtime.js"
import {
  AdminExtensionUnavailableError,
  createLazySelectedAdminExtension,
} from "../../src/app/lazy-selected-extension.js"

describe("createLazySelectedAdminExtension", () => {
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
