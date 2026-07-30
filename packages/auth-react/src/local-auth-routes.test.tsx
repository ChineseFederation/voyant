import { describe, expect, it, vi } from "vitest"
import { createLocalAuthRouteContribution } from "./local-auth-routes.js"

describe("local auth presentation", () => {
  it("matches the package-owned presentation declaration", () => {
    const contribution = createLocalAuthRouteContribution({
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

    expect(contribution.id).toBe("@voyant-travel/auth#presentation.local-auth")
    expect(Object.keys(contribution.routes)).toEqual([
      "layout",
      "acceptInvitation",
      "acceptInvite",
      "forgotPassword",
      "onboarding",
      "resetPassword",
      "signIn",
      "signUp",
      "verifyEmail",
    ])
  })
})
