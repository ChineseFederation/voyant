import { describe, expect, it, vi } from "vitest"
import { createLocalAuthRouteContribution } from "./local-auth-routes.js"
import { createMcpConsentRouteContribution } from "./mcp-consent-routes.js"

describe("mcp consent presentation", () => {
  it("matches the package-owned presentation declaration", () => {
    const contribution = createMcpConsentRouteContribution()

    expect(contribution.id).toBe("@voyant-travel/mcp#presentation.consent")
    expect(Object.keys(contribution.routes)).toEqual(["layout", "consent"])
  })

  it("mounts without a local-auth host runtime", () => {
    // A broker-authenticated deployment has no local sign-in runtime to hand
    // over, so the factory must take no arguments at all.
    expect(createMcpConsentRouteContribution.length).toBe(0)
  })

  it("is not reachable through the local-auth contribution", () => {
    const localAuth = createLocalAuthRouteContribution({
      getCurrentUser: vi.fn(async () => null),
      getBootstrapStatus: vi.fn(async () => ({ hasUsers: true, authMode: "local" as const })),
      cloudAuthStartHref: vi.fn(() => "/api/auth/admin/cloud/start"),
      useMessages: vi.fn(),
      getInvitation: vi.fn(),
      redeemInvitation: vi.fn(),
      signInWithEmail: vi.fn(),
      signInWithSocial: vi.fn(),
      sendVerificationOtp: vi.fn(),
      refreshAuthStatus: vi.fn(),
    } as never)

    expect(Object.keys(localAuth.routes)).not.toContain("mcpConsent")
  })
})
