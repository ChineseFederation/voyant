import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import {
  ADMIN_CURRENT_USER_QUERY_KEY,
  ADMIN_SHELL_BOOTSTRAP_QUERY_KEY,
} from "../../src/app/auth-runtime.js"
import { createAdminWorkspaceBeforeLoad } from "../../src/app/workspace.js"

interface TestUser {
  id: string
  email: string
}

const user: TestUser = { id: "usr_1", email: "staff@example.test" }

function bootstrap() {
  return {
    version: 1,
    compatibility: { minimumShellVersion: 1, capabilities: ["admin.shell-bootstrap.v1"] },
    user,
    activeModules: ["catalog"],
    entitlements: {},
    navigationPreferences: null,
    extensions: [],
  }
}

const location = { href: "/catalog" }

describe("createAdminWorkspaceBeforeLoad", () => {
  it("resolves the shell bootstrap once per session, not once per navigation", async () => {
    const getShellBootstrap = vi.fn(async () => bootstrap())
    const queryClient = new QueryClient()
    const beforeLoad = createAdminWorkspaceBeforeLoad<TestUser>({
      auth: {
        getCurrentUser: vi.fn(),
        getShellBootstrap,
        getBootstrapStatus: vi.fn(async () => ({ hasUsers: true })),
        cloudAuthStartHref: () => "/cloud",
      },
    })

    await beforeLoad({ location, context: { queryClient } })
    await beforeLoad({ location, context: { queryClient } })
    await beforeLoad({ location, context: { queryClient } })

    expect(getShellBootstrap).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(ADMIN_SHELL_BOOTSTRAP_QUERY_KEY)).toMatchObject({ user })
  })

  it("hydrates the shell slices from a fresh response only", async () => {
    const hydrateShellBootstrap = vi.fn()
    const queryClient = new QueryClient()
    const beforeLoad = createAdminWorkspaceBeforeLoad<TestUser>({
      auth: {
        getCurrentUser: vi.fn(),
        getShellBootstrap: vi.fn(async () => bootstrap()),
        getBootstrapStatus: vi.fn(async () => ({ hasUsers: true })),
        cloudAuthStartHref: () => "/cloud",
      },
      hydrateShellBootstrap,
    })

    await beforeLoad({ location, context: { queryClient } })
    await beforeLoad({ location, context: { queryClient } })

    // Re-seeding on every navigation would overwrite whatever the shell has
    // since done with those slices with the snapshot the session started from.
    expect(hydrateShellBootstrap).toHaveBeenCalledOnce()
  })

  it("seeds the current-user query the shell provider reads", async () => {
    const getCurrentUser = vi.fn(async () => user)
    const queryClient = new QueryClient()
    const beforeLoad = createAdminWorkspaceBeforeLoad<TestUser>({
      auth: {
        getCurrentUser,
        getBootstrapStatus: vi.fn(async () => ({ hasUsers: true })),
        cloudAuthStartHref: () => "/cloud",
      },
    })

    await beforeLoad({ location, context: { queryClient } })
    await beforeLoad({ location, context: { queryClient } })

    expect(getCurrentUser).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(ADMIN_CURRENT_USER_QUERY_KEY)).toEqual(user)
  })

  it("never caches a signed-out probe", async () => {
    const queryClient = new QueryClient()
    const getShellBootstrap = vi.fn(async () => null)
    const beforeLoad = createAdminWorkspaceBeforeLoad<TestUser>({
      auth: {
        getCurrentUser: vi.fn(),
        getShellBootstrap,
        getBootstrapStatus: vi.fn(async () => ({ hasUsers: true })),
        cloudAuthStartHref: () => "/cloud",
      },
    })

    await expect(beforeLoad({ location, context: { queryClient } })).rejects.toBeTruthy()
    await expect(beforeLoad({ location, context: { queryClient } })).rejects.toBeTruthy()

    // Caching "signed out" would keep redirecting a member who has since
    // signed in, for as long as the entry lives.
    expect(getShellBootstrap).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(ADMIN_SHELL_BOOTSTRAP_QUERY_KEY)).toBeUndefined()
  })

  it("still works for a router that supplies no QueryClient", async () => {
    const getShellBootstrap = vi.fn(async () => bootstrap())
    const beforeLoad = createAdminWorkspaceBeforeLoad<TestUser>({
      auth: {
        getCurrentUser: vi.fn(),
        getShellBootstrap,
        getBootstrapStatus: vi.fn(async () => ({ hasUsers: true })),
        cloudAuthStartHref: () => "/cloud",
      },
    })

    await expect(beforeLoad({ location })).resolves.toEqual({ user })
    expect(getShellBootstrap).toHaveBeenCalledOnce()
  })
})
