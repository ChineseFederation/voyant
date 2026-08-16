import { describe, expect, it } from "vitest"

import {
  buildOperatorShellBootstrap,
  type OperatorCurrentUser,
  resolveOperatorShellBootstrapCapabilities,
} from "../../src/shell-bootstrap.js"

const user: OperatorCurrentUser = {
  id: "usr_1",
  email: "staff@example.test",
  firstName: "Staff",
  lastName: "User",
  locale: "en",
  timezone: null,
  uiPrefs: null,
  isSuperAdmin: false,
  isSupportUser: false,
  createdAt: "2026-08-16T00:00:00.000Z",
  profilePictureUrl: null,
}

describe("operator shell bootstrap contract", () => {
  it("declares only the base capabilities when the host answers for nothing", () => {
    expect(resolveOperatorShellBootstrapCapabilities({})).toEqual([
      "admin.shell-bootstrap.v1",
      "admin.shell-bootstrap.focus-invalidation",
    ])
  })

  it("claims a slice the host answered for even when the answer is empty", () => {
    // The regression this pins: a host that resolved "no navigation
    // preferences stored" used to drop the capability, and the shell then
    // spent a round trip per page load re-asking for the same nothing.
    const capabilities = resolveOperatorShellBootstrapCapabilities({
      navigationPreferences: null,
      entitlements: {},
      extensions: [],
    })

    expect(capabilities).toContain("admin.shell-bootstrap.navigation-preferences")
    expect(capabilities).toContain("admin.shell-bootstrap.entitlements")
    expect(capabilities).toContain("admin.shell-bootstrap.extensions")
  })

  it("does not claim a slice the host left out", () => {
    const capabilities = resolveOperatorShellBootstrapCapabilities({ entitlements: { beta: true } })

    expect(capabilities).toContain("admin.shell-bootstrap.entitlements")
    expect(capabilities).not.toContain("admin.shell-bootstrap.navigation-preferences")
    expect(capabilities).not.toContain("admin.shell-bootstrap.extensions")
  })

  it("assembles the versioned payload with the deployment's active modules", () => {
    const bootstrap = buildOperatorShellBootstrap({
      user,
      activeModules: ["catalog", "bookings"],
      additions: {
        entitlements: { "apps.install": true },
        navigationPreferences: { pinned: ["bookings"] },
        extensions: [{ id: "ext_1" }],
      },
    })

    expect(bootstrap).toMatchObject({
      version: 1,
      compatibility: { minimumShellVersion: 1 },
      user,
      activeModules: ["catalog", "bookings"],
      entitlements: { "apps.install": true },
      navigationPreferences: { pinned: ["bookings"] },
      extensions: [{ id: "ext_1" }],
    })
  })

  it("gives a self-hosted deployment the same shape with empty additions", () => {
    const bootstrap = buildOperatorShellBootstrap({ user })

    expect(bootstrap.activeModules).toEqual([])
    expect(bootstrap.entitlements).toEqual({})
    expect(bootstrap.navigationPreferences).toBeNull()
    expect(bootstrap.extensions).toEqual([])
    expect(bootstrap.compatibility.capabilities).toEqual([
      "admin.shell-bootstrap.v1",
      "admin.shell-bootstrap.focus-invalidation",
    ])
  })
})
