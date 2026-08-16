// @vitest-environment jsdom
/**
 * The admin cold-load request budget (voyant#4754).
 *
 * The regression this guards is not a slow endpoint — every response here is
 * instant. It is the *shape* of the traffic: a serial chain of session/shell
 * probes before any page data is asked for, and page queries that fire twice
 * because the authenticated tree settles a beat after it mounts. Neither is
 * visible to a per-endpoint assertion and both are obvious in a request
 * ledger, so this mounts the real router + workspace over a recording fetch
 * and asserts against the ledger.
 *
 * It composes through `createAdminHostWorkspace` rather than assembling the
 * shell by hand, because the pieces it adds — the current-user provider, the
 * realtime boundary — are themselves places a duplicate read has come from.
 */
import { type QueryClient, useQuery } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import type { AdminExtension, AdminNavigationPreferencesSnapshot } from "@voyant-travel/admin"
import { ADMIN_ACTIVE_MODULES_QUERY_KEY } from "@voyant-travel/admin/app"
import { createAdminQueryClient } from "@voyant-travel/admin/app/router"
import { useLocale } from "@voyant-travel/admin/providers/locale"
import { OperatorAdminShellProvider } from "@voyant-travel/admin/providers/operator-admin-shell"
import { UI_EXTENSIONS_QUERY_KEY } from "@voyant-travel/admin/ui-extensions"
import { useVoyantReactContext } from "@voyant-travel/react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAdminHostWorkspace } from "../src/workspace.js"

/** Mirrors `navigationPreferencesQueryKey` in `@voyant-travel/navigation-preferences-react`. */
const navigationPreferencesQueryKey = (memberKey: string) =>
  ["navigation-preferences", memberKey] as const

const ENTITLEMENTS_QUERY_KEY = ["voyant", "admin", "entitlements"] as const

interface ShellUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  /**
   * A regional tag, not a supported admin locale. The shell narrows it to
   * `en`; narrowing a render late is what re-keys every locale-derived query
   * and makes a page fetch itself twice.
   */
  locale: string
  timezone: string | null
}

const USER: ShellUser = {
  id: "usr_1",
  email: "staff@example.test",
  firstName: "Staff",
  lastName: "User",
  locale: "en-GB",
  timezone: "Europe/Bucharest",
}

const SHELL_BOOTSTRAP = {
  version: 1,
  compatibility: {
    minimumShellVersion: 1,
    capabilities: [
      "admin.shell-bootstrap.v1",
      "admin.shell-bootstrap.focus-invalidation",
      "admin.shell-bootstrap.entitlements",
      "admin.shell-bootstrap.navigation-preferences",
      "admin.shell-bootstrap.extensions",
    ],
  },
  user: USER,
  activeModules: ["catalog"],
  entitlements: { "catalog.read": true },
  // The host resolved this member's preferences and found none stored. That is
  // an answer, and the shell must not go asking for it again.
  navigationPreferences: null,
  extensions: [],
} as const

let requests: string[] = []

function recordFetch(): void {
  requests = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const path = url.replace("http://localhost", "")
    requests.push(path)
    const body = path.startsWith("/api/auth/shell-bootstrap") ? SHELL_BOOTSTRAP : { path }
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    })
  })
}

const fetchJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(`/api${path}`, { credentials: "include" })
  return (await response.json()) as T
}

const auth = {
  getCurrentUser: () => fetchJson<ShellUser>("/auth/me"),
  getShellBootstrap: () => fetchJson<typeof SHELL_BOOTSTRAP>("/auth/shell-bootstrap"),
  getBootstrapStatus: () => fetchJson<{ hasUsers: boolean }>("/auth/bootstrap-status"),
  cloudAuthStartHref: () => "/api/auth/admin/cloud/start",
  signOut: async () => {},
}

/** Mirrors `hydrateShellBootstrap` in `@voyant-travel/operator-standard`. */
function hydrateShellBootstrap(bootstrap: typeof SHELL_BOOTSTRAP, queryClient: QueryClient): void {
  const capabilities = new Set<string>(bootstrap.compatibility.capabilities)
  if (capabilities.has("admin.shell-bootstrap.navigation-preferences")) {
    queryClient.setQueryData(
      navigationPreferencesQueryKey(bootstrap.user.id),
      bootstrap.navigationPreferences,
    )
  }
  if (capabilities.has("admin.shell-bootstrap.extensions")) {
    queryClient.setQueryData(UI_EXTENSIONS_QUERY_KEY, bootstrap.extensions)
  }
  if (capabilities.has("admin.shell-bootstrap.entitlements")) {
    queryClient.setQueryData(ENTITLEMENTS_QUERY_KEY, bootstrap.entitlements)
  }
  queryClient.setQueryData(ADMIN_ACTIVE_MODULES_QUERY_KEY, bootstrap.activeModules)
}

/** Stands in for the shell chrome that reads the installed extension list. */
function UiExtensionsProbe() {
  useQuery({
    queryKey: UI_EXTENSIONS_QUERY_KEY,
    queryFn: () => fetchJson("/v1/admin/ui-extensions"),
  })
  return null
}

/** Stands in for the entitlement-gated chrome. */
function EntitlementsProbe() {
  useQuery({
    queryKey: ENTITLEMENTS_QUERY_KEY,
    queryFn: () => fetchJson("/v1/admin/entitlements"),
  })
  return null
}

/**
 * Stands in for a catalog detail page: one React Query read and one
 * effect-driven read, both keyed on the resolved admin locale. The second
 * shape is the one that bit hardest — an effect has no request cache, so a
 * locale that settles after mount re-runs it outright.
 */
function CatalogDetailPage() {
  const { resolvedLocale } = useLocale()
  const { baseUrl } = useVoyantReactContext()

  useQuery({
    queryKey: ["catalog", "detail", "prd_1", resolvedLocale],
    queryFn: () => fetchJson(`/v1/admin/catalog/prd_1/content?locale=${resolvedLocale}`),
  })

  const [enrichment, setEnrichment] = useState<unknown>(null)
  const fetchers = useMemo(
    () => ({ load: () => fetchJson(`${baseUrl}/v1/admin/catalog/prd_1/slots`) }),
    [baseUrl],
  )
  useEffect(() => {
    let cancelled = false
    void fetchers.load().then((result) => {
      if (!cancelled) setEnrichment(result)
    })
    return () => {
      cancelled = true
    }
  }, [fetchers])

  return (
    <div>
      <span data-testid="catalog-detail">catalog detail</span>
      <span data-testid="enriched">{enrichment ? "enriched" : "pending"}</span>
    </div>
  )
}

function DashboardPage() {
  return <span data-testid="dashboard">dashboard</span>
}

const extensions: AdminExtension[] = [
  {
    id: "catalog",
    navigationPreferences: {
      queryKey: navigationPreferencesQueryKey,
      load: () => fetchJson<AdminNavigationPreferencesSnapshot>("/v1/admin/navigation-preferences"),
    },
  },
]

function PassthroughRealtimeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function buildRouter() {
  const queryClient = createAdminQueryClient()
  const workspace = createAdminHostWorkspace({
    auth,
    presentation: { extensions, createExtensions: () => extensions },
    api: { getBaseUrl: () => "/api", fetcher: fetch },
    realtime: { Provider: PassthroughRealtimeProvider, channel: {}, useSession: () => null },
    hydrateShellBootstrap,
  })

  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => (
      <OperatorAdminShellProvider
        baseUrl="/api"
        queryClient={queryClient}
        localeStorageKey={null}
        themeStorageKey={null}
        timeZoneStorageKey={null}
      >
        <Outlet />
      </OperatorAdminShellProvider>
    ),
  })

  const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_workspace",
    beforeLoad: ({ location, context }) => workspace.beforeLoad({ location, context }),
    loader: ({ context }) => ({ user: context.user }),
    pendingComponent: workspace.PendingComponent,
    component: WorkspaceLayout,
  })

  function WorkspaceLayout(): ReactNode {
    const { user } = workspaceRoute.useLoaderData()
    return (
      <workspace.Workspace initialUser={user}>
        <UiExtensionsProbe />
        <EntitlementsProbe />
        <Outlet />
      </workspace.Workspace>
    )
  }

  const dashboardRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/",
    component: DashboardPage,
  })
  const catalogRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/catalog/prd_1",
    component: CatalogDetailPage,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([workspaceRoute.addChildren([dashboardRoute, catalogRoute])]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/catalog/prd_1"] }),
  })

  return { queryClient, router }
}

function duplicates(paths: readonly string[]): string[] {
  const seen = new Map<string, number>()
  for (const path of paths) seen.set(path, (seen.get(path) ?? 0) + 1)
  return [...seen.entries()].filter(([, count]) => count > 1).map(([path]) => path)
}

describe("admin cold-load request budget", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    recordFetch()
  })

  afterEach(() => {
    // Vitest runs without `globals`, so testing-library never registers its own
    // auto-cleanup and each render would otherwise stack in the same document.
    cleanup()
    vi.unstubAllGlobals()
  })

  it("opens the authenticated shell with one round trip and no duplicate reads", async () => {
    const { router } = buildRouter()

    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId("enriched").textContent).toBe("enriched"))

    // One authenticated bootstrap — and none of the probes it answers for.
    expect(requests.filter((path) => path === "/api/auth/shell-bootstrap")).toHaveLength(1)
    expect(requests).not.toContain("/api/auth/me")
    expect(requests).not.toContain("/api/auth/bootstrap-status")
    expect(requests.filter((path) => path.includes("/ui-extensions"))).toEqual([])
    expect(requests.filter((path) => path.includes("/entitlements"))).toEqual([])
    expect(requests.filter((path) => path.includes("/navigation-preferences"))).toEqual([])

    // Page data is asked for, once each.
    expect(requests.some((path) => path.includes("/catalog/prd_1/content"))).toBe(true)
    expect(requests.some((path) => path.includes("/catalog/prd_1/slots"))).toBe(true)
    expect(duplicates(requests)).toEqual([])
  })

  it("asks for page data without waiting on a session probe first", async () => {
    const { router } = buildRouter()

    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId("catalog-detail")).toBeTruthy())

    // Exactly one request may precede the first page read. Any more means a
    // hop was re-introduced ahead of the shell bootstrap.
    const firstPageRead = requests.findIndex((path) => path.includes("/v1/admin/catalog/"))
    expect(firstPageRead).toBe(1)
    expect(requests[0]).toBe("/api/auth/shell-bootstrap")
  })

  it("keeps the budget across a soft navigation away and back", async () => {
    const { router } = buildRouter()

    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId("enriched").textContent).toBe("enriched"))
    const afterColdLoad = requests.length

    await act(async () => {
      await router.navigate({ to: "/" })
    })
    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeTruthy())

    await act(async () => {
      await router.navigate({ to: "/catalog/prd_1" })
    })
    await waitFor(() => expect(screen.getByTestId("enriched").textContent).toBe("enriched"))

    // Re-entering the route re-runs its effect-driven read; the cached query
    // and every session/shell probe stay put.
    const added = requests.slice(afterColdLoad)
    expect(added.filter((path) => path.includes("/auth/"))).toEqual([])
    expect(duplicates(added)).toEqual([])
  })

  it("seeds every shell slice the bootstrap answered for", async () => {
    const { queryClient, router } = buildRouter()

    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId("catalog-detail")).toBeTruthy())

    expect(queryClient.getQueryData(UI_EXTENSIONS_QUERY_KEY)).toEqual([])
    expect(queryClient.getQueryData(ENTITLEMENTS_QUERY_KEY)).toEqual({ "catalog.read": true })
    expect(queryClient.getQueryData(ADMIN_ACTIVE_MODULES_QUERY_KEY)).toEqual(["catalog"])
    // Answered-with-nothing still counts as answered: the query must exist and
    // hold `null`, not be missing and send the shell asking.
    expect(queryClient.getQueryState(navigationPreferencesQueryKey(USER.id))?.data).toBeNull()
  })
})
