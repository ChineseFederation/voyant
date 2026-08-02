import { describe, expect, it, vi } from "vitest"
import {
  createLocalAuthRouteContribution,
  submitLocalAuthEmailSignUp,
} from "./local-auth-routes.js"

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
      signUpWithEmail: vi.fn(),
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

  it("delegates local operator sign-up to the realm-specific runtime", async () => {
    const signUpWithEmail = vi.fn(async () => ({ data: { user: { id: "user_1" } } }))

    await expect(
      submitLocalAuthEmailSignUp(
        { signUpWithEmail },
        {
          name: "Local Admin",
          email: "admin@example.com",
          password: "correct horse battery staple",
          redirectTo: "/",
        },
      ),
    ).resolves.toEqual({ user: { id: "user_1" } })
    expect(signUpWithEmail).toHaveBeenCalledWith({
      name: "Local Admin",
      email: "admin@example.com",
      password: "correct horse battery staple",
      callbackURL: "/",
    })
  })

  it("surfaces realm-specific sign-up failures", async () => {
    await expect(
      submitLocalAuthEmailSignUp(
        { signUpWithEmail: vi.fn(async () => ({ error: { message: "Email already exists" } })) },
        { name: "Admin", email: "admin@example.com", password: "password" },
      ),
    ).rejects.toThrow("Email already exists")
  })
})
