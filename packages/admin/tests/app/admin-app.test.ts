import { describe, expect, it, vi } from "vitest"
import { adminRootHead } from "../../src/app/root.js"
import {
  AdminPendingFallback,
  createAdminQueryClient,
  createAdminRouter,
} from "../../src/app/router.js"
import {
  createAdminWorkspaceBeforeLoad,
  defaultAdminWorkspaceUser,
} from "../../src/app/workspace.js"

describe("createAdminQueryClient", () => {
  it("applies the admin defaults", () => {
    const queryClient = createAdminQueryClient()
    const defaults = queryClient.getDefaultOptions()

    expect(defaults.queries?.refetchOnWindowFocus).toBe(false)
    expect(defaults.queries?.retry).toBe(1)
    expect(defaults.queries?.staleTime).toBe(30_000)
  })
})

describe("createAdminRouter", () => {
  it("uses the package pending fallback by default", async () => {
    const { createRootRoute } = await import("@tanstack/react-router")
    const routeTree = createRootRoute()
    const router = createAdminRouter({ routeTree })

    expect(router.options.defaultPendingComponent).toBe(AdminPendingFallback)
  })

  it("allows hosts to override the pending fallback", async () => {
    const { createRootRoute } = await import("@tanstack/react-router")
    const routeTree = createRootRoute()
    const Pending = () => null
    const router = createAdminRouter({ routeTree, pendingComponent: Pending })

    expect(router.options.defaultPendingComponent).toBe(Pending)
  })
})

describe("adminRootHead", () => {
  it("emits title, og tags, favicon, and the bootstrap script", () => {
    const head = adminRootHead({ title: "Acme Admin", description: "Acme workspace" })

    expect(head.meta).toContainEqual({ title: "Acme Admin" })
    expect(head.meta).toContainEqual({ property: "og:title", content: "Acme Admin" })
    expect(head.meta).toContainEqual({ name: "description", content: "Acme workspace" })
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex,nofollow" })
    expect(head.links).toContainEqual({ rel: "icon", type: "image/png", href: "/fav128.png" })
    const script = head.scripts[0]?.children ?? ""
    expect(script).toContain("__zod_globalConfig")
    expect(script).toContain("jitless:true")
    expect(script).toContain('localStorage.getItem("theme")')
    expect(script).toContain('localStorage.getItem("admin-locale")')
  })

  it("supports custom favicon and extra meta/links", () => {
    const head = adminRootHead({
      title: "Acme",
      faviconHref: "/acme.png",
      meta: [{ name: "x-custom", content: "1" }],
      links: [{ rel: "manifest", href: "/manifest.json" }],
    })

    expect(head.links).toContainEqual({ rel: "icon", type: "image/png", href: "/acme.png" })
    expect(head.meta).toContainEqual({ name: "x-custom", content: "1" })
    expect(head.links).toContainEqual({ rel: "manifest", href: "/manifest.json" })
  })

  it("omits the description meta when not provided", () => {
    const head = adminRootHead({ title: "Acme" })

    expect(head.meta.some((tag) => "name" in tag && tag.name === "description")).toBe(false)
  })
})

describe("createAdminWorkspaceBeforeLoad", () => {
  type TestUser = { id: string }
  function authStub(
    overrides: Partial<{
      user: TestUser | null | undefined
      authMode: "local" | "voyant-cloud"
    }> = {},
  ) {
    return {
      getCurrentUser: vi.fn(async () => ("user" in overrides ? overrides.user : { id: "usr_1" })),
      getBootstrapStatus: vi.fn(async () => ({
        hasUsers: true,
        ...(overrides.authMode ? { authMode: overrides.authMode } : {}),
      })),
      cloudAuthStartHref: (next?: string) =>
        `/api/auth/admin/cloud/start${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    }
  }

  it("returns the user in route context when authenticated", async () => {
    const user = { id: "usr_1" }
    const beforeLoad = createAdminWorkspaceBeforeLoad({ auth: authStub({ user }) })

    await expect(beforeLoad({ location: { href: "/bookings" } })).resolves.toEqual({ user })
  })

  it("redirects unauthenticated visitors to sign-in with a next param (local mode)", async () => {
    const beforeLoad = createAdminWorkspaceBeforeLoad({ auth: authStub({ user: null }) })

    const thrown = await beforeLoad({ location: { href: "/bookings?tab=upcoming" } }).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(thrown).toBeDefined()
    const options = (thrown as { options?: { to?: string; search?: { next?: string } } }).options
    expect(options?.to).toBe("/sign-in")
    expect(options?.search?.next).toBe("/bookings?tab=upcoming")
  })

  it("redirects unauthenticated visitors to the Cloud broker in voyant-cloud mode", async () => {
    const beforeLoad = createAdminWorkspaceBeforeLoad({
      auth: authStub({ user: null, authMode: "voyant-cloud" }),
    })

    const thrown = await beforeLoad({ location: { href: "/bookings" } }).then(
      () => undefined,
      (error: unknown) => error,
    )

    const options = (
      thrown as { options?: { href?: string; to?: string; reloadDocument?: boolean } }
    ).options
    expect(options?.href).toBe("/api/auth/admin/cloud/start?next=%2Fbookings")
    expect(options?.to).toBeUndefined()
    // The broker href is a relative API path, so force a full-document redirect
    // (TanStack only infers it for absolute hrefs).
    expect(options?.reloadDocument).toBe(true)
  })

  it("honors a custom sign-in path", async () => {
    const beforeLoad = createAdminWorkspaceBeforeLoad({
      auth: authStub({ user: undefined }),
      signInPath: "/login",
    })

    const thrown = await beforeLoad({ location: { href: "/" } }).then(
      () => undefined,
      (error: unknown) => error,
    )

    const options = (thrown as { options?: { to?: string } }).options
    expect(options?.to).toBe("/login")
  })
})

describe("defaultAdminWorkspaceUser", () => {
  it("maps the common user fields", () => {
    expect(
      defaultAdminWorkspaceUser({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
        profilePictureUrl: "/ada.png",
        locale: "en",
        timezone: "Europe/Bucharest",
      }),
    ).toEqual({
      name: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      avatar: "/ada.png",
      locale: "en",
      timeZone: "Europe/Bucharest",
    })
  })

  it("prefers timeZone over timezone and tolerates missing fields", () => {
    const mapped = defaultAdminWorkspaceUser({
      firstName: "Ada",
      timeZone: "UTC",
      timezone: "Europe/Bucharest",
    })

    expect(mapped.name).toBe("Ada")
    expect(mapped.timeZone).toBe("UTC")
    // AdminUser.email is a required string — missing email maps to "".
    expect(mapped.email).toBe("")
  })
})

describe("attachAdminExtensionRoutes", () => {
  it("grafts extension routes under the parent and is idempotent by path", async () => {
    const { createRootRoute, createRoute } = await import("@tanstack/react-router")
    const { attachAdminExtensionRoutes } = await import("../../src/app/extension-routes.js")

    const rootRoute = createRootRoute()
    const layout = createRoute({ getParentRoute: () => rootRoute, id: "workspace" })
    const fileChild = createRoute({ getParentRoute: () => layout, path: "/settings" })
    layout.addChildren([fileChild])
    const tree = rootRoute.addChildren([layout])

    const extensionRoute = createRoute({ getParentRoute: () => layout, path: "/bookings" })
    const result = attachAdminExtensionRoutes(tree, layout, [extensionRoute])
    expect(result).toBe(tree)
    expect(layout.children).toHaveLength(2)

    // Re-evaluation (dev-server module reload) replaces by path, never duplicates.
    const reloadedRoute = createRoute({ getParentRoute: () => layout, path: "/bookings" })
    attachAdminExtensionRoutes(tree, layout, [reloadedRoute])
    const children = layout.children as Array<{ options: { path?: string } }>
    expect(children).toHaveLength(2)
    expect(children.filter((child) => child.options.path === "/bookings")).toHaveLength(1)

    const duplicateRoute = createRoute({ getParentRoute: () => layout, path: "/bookings" })
    attachAdminExtensionRoutes(tree, layout, [reloadedRoute, duplicateRoute])
    const deduplicated = layout.children as Array<{ options: { path?: string } }>
    expect(deduplicated).toHaveLength(2)
    expect(deduplicated.filter((child) => child.options.path === "/bookings")).toHaveLength(1)
  })
})

describe("adminExtensionRouteOptions", () => {
  it("binds contribution loader/ssr/boundaries and resolves the runtime per call", async () => {
    const { adminExtensionRouteOptions } = await import("../../src/app/extension-routes.js")
    const loader = vi.fn()
    const extension = {
      id: "demo",
      routes: [
        {
          id: "demo-index",
          path: "/demo",
          title: "Demo",
          ssr: "data-only" as const,
          page: () => Promise.resolve({ default: () => null }),
          loader,
        },
      ],
    }

    const options = adminExtensionRouteOptions(extension, "demo-index", () => ({
      baseUrl: "https://api.test",
    }))
    expect(options.ssr).toBe("data-only")
    expect(options.wrapInSuspense).toBe(true)
    expect(typeof options.component).toBe("function")

    const queryClient = createAdminQueryClient()
    options.loader({ context: { queryClient }, params: { id: "x" } })
    expect(loader).toHaveBeenCalledWith({
      queryClient,
      runtime: { baseUrl: "https://api.test" },
      params: { id: "x" },
    })
  })

  it("throws loudly when the contribution has no implementation", async () => {
    const { adminExtensionRouteOptions } = await import("../../src/app/extension-routes.js")
    expect(() =>
      adminExtensionRouteOptions(
        { id: "demo", routes: [{ id: "bare", path: "/bare", title: "Bare" }] },
        "bare",
        { baseUrl: "x" },
      ),
    ).toThrow(/carries no/)
  })
})

describe("adminExtensionRouteOptions (redirect contributions)", async () => {
  const { adminExtensionRouteOptions } = await import("../../src/app/extension-routes.js")
  const { defineAdminExtension } = await import("@voyant-travel/admin")

  const extension = defineAdminExtension({
    id: "catalog",
    routes: [
      { id: "catalog-index", path: "/catalog", title: "Catalog", redirectTo: "/catalog/products" },
    ],
  })

  it("emits a beforeLoad that throws the router redirect", () => {
    const options = adminExtensionRouteOptions(extension, "catalog-index", { baseUrl: "/api" })

    expect(options.component).toBeUndefined()
    expect(options.beforeLoad).toBeDefined()
    let thrown: unknown
    try {
      options.beforeLoad?.()
    } catch (error) {
      thrown = error
    }
    const redirectOptions = (thrown as { options?: { to?: string; replace?: boolean } }).options
    expect(redirectOptions?.to).toBe("/catalog/products")
    expect(redirectOptions?.replace).toBe(true)
  })

  it("omits beforeLoad for page contributions", async () => {
    const pageExtension = defineAdminExtension({
      id: "demo",
      routes: [
        {
          id: "demo-page",
          path: "/demo",
          title: "Demo",
          page: () => Promise.resolve({ default: () => null }),
        },
      ],
    })
    const options = adminExtensionRouteOptions(pageExtension, "demo-page", { baseUrl: "/api" })

    expect(options.beforeLoad).toBeUndefined()
    expect(options.component).toBeDefined()
  })
})
