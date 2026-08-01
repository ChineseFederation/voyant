import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { resolveAdminNavigation } from "../../src/extensions.js"
import { useAppPageNavEntries } from "../../src/ui-extensions/app-pages.js"
import type {
  AppPageDescriptor,
  UiExtensionsClient,
} from "../../src/ui-extensions/ui-extensions-extension.js"
import { createAppPageNavigationContributions } from "../../src/ui-extensions/ui-extensions-extension.js"

function page(overrides: Partial<AppPageDescriptor> = {}): AppPageDescriptor {
  return {
    key: "apin_1:settings",
    installationId: "apin_1",
    path: "/settings",
    entryUrl: "https://app.example.com/settings",
    title: "App Settings",
    navLabel: "Settings",
    ...overrides,
  }
}

function clientWith(pages: AppPageDescriptor[]): UiExtensionsClient {
  return { list: async () => [], listPages: async () => pages }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe("useAppPageNavEntries", () => {
  it("maps the app-declared icon and splits the descriptor key into route parts", async () => {
    const { result } = renderHook(
      () => useAppPageNavEntries(clientWith([page({ icon: "https://app.example.com/i.svg" })])),
      { wrapper },
    )

    await waitFor(() => expect(result.current).toHaveLength(1))
    const entry = result.current[0]
    expect(entry?.installationId).toBe("apin_1")
    expect(entry?.pageKey).toBe("settings")
    expect(entry?.label).toBe("Settings")
    expect(entry?.icon).toBe("https://app.example.com/i.svg")
  })

  it("omits the icon when the page declares none", async () => {
    const { result } = renderHook(() => useAppPageNavEntries(clientWith([page()])), { wrapper })

    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(result.current[0]?.icon).toBeUndefined()
  })

  it("threads page ordering, grouping, and anchoring metadata", async () => {
    const { result } = renderHook(
      () =>
        useAppPageNavEntries(
          clientWith([
            page({ order: -10, group: "tools", groupLabel: "Tools", insertAfter: "bookings" }),
          ]),
        ),
      { wrapper },
    )

    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(result.current[0]).toMatchObject({
      order: -10,
      group: "tools",
      groupLabel: "Tools",
      insertAfter: "bookings",
    })
  })

  it("groups pages per installation and sorts grouped children deterministically", () => {
    const contributions = createAppPageNavigationContributions([
      {
        key: "apin_1:reports",
        installationId: "apin_1",
        pageKey: "reports",
        path: "/reports",
        label: "Reports",
        group: "tools",
        groupLabel: "Tools",
        order: 20,
        insertAfter: "bookings",
      },
      {
        key: "apin_1:settings",
        installationId: "apin_1",
        pageKey: "settings",
        path: "/settings",
        label: "Settings",
        group: "tools",
        groupLabel: "Tools",
        order: 10,
        insertAfter: "bookings",
      },
    ])

    expect(contributions).toHaveLength(1)
    expect(contributions[0]?.order).toBe(10)
    expect(contributions[0]?.insertAfter).toBe("bookings")
    expect(contributions[0]?.items[0]).toMatchObject({
      structural: true,
      title: "Tools",
    })
    expect(contributions[0]?.items[0]?.items?.map((item) => item.title)).toEqual([
      "Settings",
      "Reports",
    ])
  })

  it("preserves descriptor input order for grouped children with equal order", () => {
    const contributions = createAppPageNavigationContributions([
      {
        key: "apin_1:zeta",
        installationId: "apin_1",
        pageKey: "zeta",
        path: "/zeta",
        label: "Zeta",
        group: "tools",
      },
      {
        key: "apin_1:alpha",
        installationId: "apin_1",
        pageKey: "alpha",
        path: "/alpha",
        label: "Alpha",
        group: "tools",
      },
    ])

    expect(contributions[0]?.items[0]?.items?.map((item) => item.title)).toEqual(["Zeta", "Alpha"])
  })

  it("keeps legacy pages flat, appended, and in descriptor input order", () => {
    const contributions = createAppPageNavigationContributions([
      {
        key: "apin_1:zeta",
        installationId: "apin_1",
        pageKey: "zeta",
        path: "/zeta",
        label: "Zeta",
      },
      {
        key: "apin_1:alpha",
        installationId: "apin_1",
        pageKey: "alpha",
        path: "/alpha",
        label: "Alpha",
      },
    ])
    expect(contributions.map((item) => item.items[0]?.title)).toEqual(["Zeta", "Alpha"])

    const resolved = resolveAdminNavigation({
      baseItems: [{ id: "dashboard", title: "Dashboard", url: "/" }],
      extensions: [{ id: "installed-apps", navigation: contributions }],
    })
    expect(resolved.map((item) => item.title)).toEqual(["Dashboard", "Zeta", "Alpha"])
  })

  it("uses the standard shell resolver for host-item anchors", () => {
    const contributions = createAppPageNavigationContributions([
      {
        key: "apin_1:settings",
        installationId: "apin_1",
        pageKey: "settings",
        path: "/settings",
        label: "Settings",
        insertAfter: "bookings",
      },
    ])
    const resolved = resolveAdminNavigation({
      baseItems: [
        { id: "dashboard", title: "Dashboard", url: "/" },
        { id: "bookings", title: "Bookings", url: "/bookings" },
        { id: "finance", title: "Finance", url: "/finance" },
      ],
      extensions: [{ id: "installed-apps", navigation: contributions }],
    })

    expect(resolved.map((item) => item.title)).toEqual([
      "Dashboard",
      "Bookings",
      "Settings",
      "Finance",
    ])
  })
})
