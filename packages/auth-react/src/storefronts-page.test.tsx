// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type {
  StorefrontApiKeyDto,
  StorefrontDto,
} from "@voyant-travel/auth/storefront-admin-contracts"
import { ConfirmDialogHost } from "@voyant-travel/ui/components"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { createSelectedStorefrontAdminExtension } from "./admin.js"
import { StorefrontsPage } from "./components/storefronts-page.js"
import { authQueryKeys } from "./query-keys.js"
import { createStorefrontsAdminApi, type StorefrontsAdminApi } from "./storefronts-admin-api.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const STOREFRONT: StorefrontDto = {
  id: "storefront_1",
  name: "Web store",
  slug: "web",
  hostingKind: "external",
  siteId: null,
  allowedOrigins: ["https://shop.example"],
  methods: { emailCode: true, emailPassword: false, google: false, facebook: false, apple: false },
  accountPolicy: {
    allowedKinds: ["personal"],
    personalSignup: "open",
    businessOnboarding: "disabled",
  },
  hostOnlyCookies: true,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
}

const API_KEY: StorefrontApiKeyDto = {
  id: "key_1",
  storefrontId: "storefront_1",
  kind: "publishable",
  // Publishable keys carry no scope grant — they are bounded by the capability
  // line, not by scopes (voyant#4625).
  scopes: null,
  tokenPreview: "vpk_ab12",
  name: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
}

const CHANNEL_BINDING = {
  storefrontId: "storefront_1",
  channelId: "channel_1",
  channelName: "Partner OTA",
  channelStatus: "active",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  implicit: false,
}

/** What an unconfigured storefront resolves to: the deployment's Direct channel. */
const IMPLICIT_DIRECT_BINDING = {
  storefrontId: "storefront_1",
  channelId: "chan_system_direct",
  channelName: "Direct",
  channelStatus: "active",
  createdAt: null,
  updatedAt: null,
  implicit: true,
}

describe("storefront admin surface", () => {
  it("contributes a Storefronts nav section with a reparented Sites sub-view", () => {
    const extension = createSelectedStorefrontAdminExtension()

    const parent = extension.navigation?.[0]?.items[0]
    expect(parent).toMatchObject({ id: "storefronts", url: "/storefronts" })
    expect(parent?.items?.map((item) => item.url)).toEqual(["/storefronts", "/storefronts/sites"])

    expect(extension.routes?.map((route) => route.path)).toEqual([
      "/storefronts",
      "/storefronts/sites",
    ])
    expect(extension.routes?.[0]).toMatchObject({ id: "storefronts", ssr: "data-only" })
    expect(extension.routes?.[0]?.loader).toBeTypeOf("function")
    expect(extension.routes?.[1]?.id).toBe("storefront-sites")
  })

  it("prefetches capabilities and storefronts with credentialed admin calls", async () => {
    const extension = createSelectedStorefrontAdminExtension()
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/capabilities")) {
        return Response.json({
          data: { businessAccounts: true, manageProviders: true, channelBinding: true },
        })
      }
      return Response.json({ data: [STOREFRONT] })
    })
    const queryClient = new QueryClient()

    await extension.routes?.[0]?.loader?.({
      queryClient,
      runtime: { baseUrl: "/api", fetcher },
      params: {},
    })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/admin/storefronts/capabilities",
      "/api/v1/admin/storefronts/storefronts",
    ])
    expect(fetcher.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true)
    expect(queryClient.getQueryData(authQueryKeys.storefrontList())).toEqual([STOREFRONT])
  })

  it("lists storefronts whose hosting kind is owned by the runtime provider", async () => {
    // Voyant Cloud hosts the customer portal and booking engine itself and
    // reports hosting kinds this package does not enumerate. Validating them
    // against a closed enum rejects the whole array, so a healthy 200 renders
    // as "Storefronts unavailable" with no console error to explain it.
    const managed = { ...STOREFRONT, id: "storefront_2", hostingKind: "managed_portal" }
    const api = createStorefrontsAdminApi("/api", async () =>
      Response.json({ data: [STOREFRONT, managed] }),
    )

    await expect(api.listStorefronts()).resolves.toEqual([STOREFRONT, managed])
  })

  it("lists storefronts carrying fields the runtime provider owns", async () => {
    // Verbatim from a managed deployment's 200 on
    // GET /v1/admin/storefronts/storefronts: Voyant Cloud serves an
    // `organizationId` this package does not model. A strict response schema
    // rejected the whole array, so the page showed "Storefronts unavailable"
    // on a successful response and no retry could clear it (voyant#4342).
    const api = createStorefrontsAdminApi("/api", async () =>
      Response.json({
        data: [
          {
            id: "sf_km1j5lwnx9bv",
            organizationId: "org_01KSTAWP6CEKZ67731P2Q646CC",
            name: "Customer portal",
            slug: "customer-portal",
            hostingKind: "managed_portal",
            siteId: null,
            allowedOrigins: ["https://sandbox-account.onvoyant.net"],
            methods: {
              apple: false,
              google: false,
              facebook: false,
              emailCode: true,
              emailPassword: false,
            },
            accountPolicy: {
              allowedKinds: ["personal"],
              personalSignup: "open",
              businessOnboarding: "disabled",
            },
            hostOnlyCookies: true,
            createdAt: "2026-08-02T05:52:32.166Z",
            updatedAt: "2026-08-02T05:52:34.106Z",
            channelBinding: null,
          },
        ],
      }),
    )

    const [storefront] = await api.listStorefronts()

    expect(storefront).toMatchObject({ id: "sf_km1j5lwnx9bv", hostingKind: "managed_portal" })
    expect(storefront).not.toHaveProperty("organizationId")
  })

  it("disables business controls when the runtime capability is unavailable", async () => {
    const queryClient = seededQueryClient({
      businessAccounts: false,
      manageProviders: true,
      channelBinding: true,
    })
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StorefrontsPage api={pageApi()} />
        </QueryClientProvider>,
      )
    })
    await clickButton(container, "Web store")

    const businessSwitch = container.querySelector<HTMLButtonElement>(
      "#allow-business-storefront_1",
    )
    expect(businessSwitch?.disabled).toBe(true)
    expect(container.textContent).toContain("Business accounts are not enabled")

    await act(async () => root.unmount())
  })

  it("reveals a freshly issued key exactly once", async () => {
    const queryClient = seededQueryClient({
      businessAccounts: true,
      manageProviders: true,
      channelBinding: true,
    })
    const api = pageApi()
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StorefrontsPage api={api} />
          <ConfirmDialogHost />
        </QueryClientProvider>,
      )
    })
    await clickButton(container, "Web store")
    await clickButton(container, "Issue publishable key")

    await vi.waitFor(() => expect(api.issueApiKey).toHaveBeenCalledOnce())
    expect(api.issueApiKey).toHaveBeenCalledWith("storefront_1", { kind: "publishable" })
    await vi.waitFor(() => {
      const reveal = container.querySelector<HTMLInputElement>("input[readonly]")
      expect(reveal?.value).toBe("vpk-test-one-time-secret")
    })

    await act(async () => root.unmount())
  })

  it("overrides the implicit Direct default with an explicit channel", async () => {
    const queryClient = seededQueryClient({
      businessAccounts: true,
      manageProviders: true,
      channelBinding: true,
    })
    const api = pageApi()
    let currentBinding: typeof CHANNEL_BINDING | typeof IMPLICIT_DIRECT_BINDING =
      IMPLICIT_DIRECT_BINDING
    api.getChannelBinding = vi.fn(async () => currentBinding)
    api.setChannelBinding = vi.fn(async () => {
      currentBinding = CHANNEL_BINDING
      return CHANNEL_BINDING
    })
    api.clearChannelBinding = vi.fn(async () => {
      currentBinding = IMPLICIT_DIRECT_BINDING
    })
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StorefrontsPage api={api} />
        </QueryClientProvider>,
      )
    })
    await clickButton(container, "Web store")

    expect(container.textContent).toContain("publishes to Direct")
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Publishing to Direct (default)"),
    )
    const select = container.querySelector<HTMLSelectElement>("#storefront-channel-storefront_1")
    expect(select).not.toBeNull()
    await vi.waitFor(() => expect(select!.options.length).toBeGreaterThan(1))
    await act(async () => {
      setSelectValue(select!, "channel_1")
    })
    await vi.waitFor(() => expect(select!.value).toBe("channel_1"))
    await clickButton(container, "Save channel")
    await vi.waitFor(() =>
      expect(api.setChannelBinding).toHaveBeenCalledWith("storefront_1", {
        channelId: "channel_1",
      }),
    )
    await vi.waitFor(() => expect(container.textContent).toContain("Publishing to Partner OTA"))

    await act(async () => root.unmount())
  })

  it("returns an explicitly bound storefront to Direct after confirmation", async () => {
    const queryClient = seededQueryClient({
      businessAccounts: true,
      manageProviders: true,
      channelBinding: true,
    })
    const api = pageApi()
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StorefrontsPage api={api} />
          <ConfirmDialogHost />
        </QueryClientProvider>,
      )
    })
    await clickButton(container, "Web store")
    await vi.waitFor(() => expect(container.textContent).toContain("Publishing to Partner OTA"))

    const clearButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Use Direct") && !button.disabled,
    )
    expect(clearButton).toBeDefined()
    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Publish this storefront to Direct again?"),
    )
    const clearDialogButton = Array.from(document.body.querySelectorAll("button"))
      .reverse()
      .find((button) => button.textContent?.includes("Use Direct"))
    await act(async () => {
      clearDialogButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await vi.waitFor(() => expect(api.clearChannelBinding).toHaveBeenCalledWith("storefront_1"))

    await act(async () => root.unmount())
  })

  it("shows channel binding unavailable state", async () => {
    const queryClient = seededQueryClient({
      businessAccounts: true,
      manageProviders: true,
      channelBinding: false,
    })
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StorefrontsPage api={pageApi()} />
          <ConfirmDialogHost />
        </QueryClientProvider>,
      )
    })
    await clickButton(container, "Web store")

    expect(container.textContent).toContain("Channel binding is not configured")
    expect(container.querySelector("#storefront-channel-storefront_1")).toBeNull()

    await act(async () => root.unmount())
  })

  it("recovers from any query the load banner speaks for, not just the list", async () => {
    // The banner reports capabilities and storefronts together, so a refresh
    // that retried only the list left a failed capabilities query showing an
    // error no click could clear (voyant#4342).
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const api = pageApi()
    let capabilitiesFail = true
    api.getCapabilities = vi.fn(async () => {
      if (capabilitiesFail) throw new Error("cold start")
      return { businessAccounts: true, manageProviders: true, channelBinding: true }
    })
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StorefrontsPage api={api} />
        </QueryClientProvider>,
      )
    })
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Storefronts could not be loaded."),
    )

    capabilitiesFail = false
    await clickButton(container, "Refresh")

    await vi.waitFor(() =>
      expect(container.textContent).not.toContain("Storefronts could not be loaded."),
    )

    await act(async () => root.unmount())
  })
})

function pageApi(): StorefrontsAdminApi {
  return {
    getCapabilities: vi.fn(async () => ({
      businessAccounts: true,
      manageProviders: true,
      channelBinding: true,
    })),
    listStorefronts: vi.fn(async () => [STOREFRONT]),
    getStorefront: vi.fn(async () => STOREFRONT),
    createStorefront: vi.fn(async () => STOREFRONT),
    updateStorefront: vi.fn(async () => STOREFRONT),
    deleteStorefront: vi.fn(async () => undefined),
    setAllowedOrigins: vi.fn(async () => STOREFRONT),
    listChannels: vi.fn(async () => [
      { id: "channel_1", name: "Partner OTA", status: "active" as const },
    ]),
    getChannelBinding: vi.fn(async () => CHANNEL_BINDING),
    setChannelBinding: vi.fn(async () => CHANNEL_BINDING),
    clearChannelBinding: vi.fn(async () => undefined),
    listApiKeys: vi.fn(async () => [API_KEY]),
    issueApiKey: vi.fn(async () => ({ ...API_KEY, token: "vpk-test-one-time-secret" })),
    rotateApiKey: vi.fn(async () => ({ ...API_KEY, token: "vpk-test-one-time-secret" })),
    revokeApiKey: vi.fn(async () => undefined),
    updateAccountPolicy: vi.fn(async () => STOREFRONT),
    updateMethods: vi.fn(async () => STOREFRONT),
    listProviderCredentials: vi.fn(async () => [
      { provider: "google" as const, configured: false, updatedAt: null },
      { provider: "facebook" as const, configured: false, updatedAt: null },
      { provider: "apple" as const, configured: false, updatedAt: null },
    ]),
    putProviderCredential: vi.fn(async () => undefined),
    deleteProviderCredential: vi.fn(async () => undefined),
  }
}

function seededQueryClient(capabilities: {
  businessAccounts: boolean
  manageProviders: boolean
  channelBinding: boolean
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(authQueryKeys.storefrontCapabilities(), capabilities)
  queryClient.setQueryData(authQueryKeys.storefrontList(), [STOREFRONT])
  queryClient.setQueryData(authQueryKeys.storefrontApiKeys(STOREFRONT.id), [API_KEY])
  queryClient.setQueryData(authQueryKeys.storefrontProviderCredentials(STOREFRONT.id), [
    { provider: "google", configured: false, updatedAt: null },
    { provider: "facebook", configured: false, updatedAt: null },
    { provider: "apple", configured: false, updatedAt: null },
  ])
  return queryClient
}

async function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  )
  if (!button) throw new Error(`Button with text "${text}" not found`)
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event("input", { bubbles: true }))
  select.dispatchEvent(new Event("change", { bubbles: true }))
}
