import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { describe, expect, it } from "vitest"

import type { IdentityAccessRuntimeProvider } from "./identity-access-runtime-port.js"
import { identityAccessRuntimePort } from "./identity-access-runtime-port.js"
import { createAuthRuntimePortContribution } from "./runtime-contributor.js"

describe("auth runtime contributor", () => {
  it("derives auth mode from deployment provider authority", () => {
    const contribution = createAuthRuntimePortContribution(hostWithAuthProvider("better-auth"))
    const runtime = contribution[identityAccessRuntimePort.id] as IdentityAccessRuntimeProvider

    expect(
      runtime.resolveDeployment({
        APP_URL: "https://operator.example",
        VOYANT_ADMIN_AUTH_MODE: "voyant-cloud",
      }),
    ).toMatchObject({
      appUrl: "https://operator.example",
      authMode: "local",
    })
  })

  it("fails closed when auth provider authority is absent", () => {
    const contribution = createAuthRuntimePortContribution(hostWithAuthProvider(undefined))
    const runtime = contribution[identityAccessRuntimePort.id] as IdentityAccessRuntimeProvider

    expect(() => runtime.resolveDeployment({})).toThrow(/deployment\.providers\.adminAuth/)
  })

  it("does not read the removed shared auth provider selector", () => {
    const contribution = createAuthRuntimePortContribution(
      hostWithAuthProvider(undefined, "voyant-cloud"),
    )
    const runtime = contribution[identityAccessRuntimePort.id] as IdentityAccessRuntimeProvider

    expect(() => runtime.resolveDeployment({})).toThrow(/deployment\.providers\.adminAuth/)
  })

  it("delivers invitation email through the provider's durable capability", async () => {
    const sends: Array<{ payload: unknown; idempotencyKey: string }> = []
    const host = hostWithAuthProvider("better-auth", undefined, () => [
      {
        name: "test-email",
        channels: ["email"],
        durableDelivery: {
          protocol: "notification-provider-idempotency-v1",
          async send(payload: unknown, context: { idempotencyKey: string }) {
            sends.push({ payload, idempotencyKey: context.idempotencyKey })
            return { id: "msg_1", provider: "test-email" }
          },
        },
      },
    ])
    const contribution = createAuthRuntimePortContribution(host)
    const runtime = contribution[identityAccessRuntimePort.id] as IdentityAccessRuntimeProvider
    const message = {
      acceptUrl: "https://operator.example/accept-invite?token=secret",
      expiresInHours: 72,
      to: "new.member@example.com",
    }

    await expect(runtime.sendInvitationEmail({}, message)).resolves.toBe(true)
    await expect(runtime.sendInvitationEmail({}, message)).resolves.toBe(true)

    expect(sends).toHaveLength(2)
    expect(sends[0]).toMatchObject({
      payload: {
        channel: "email",
        to: "new.member@example.com",
        template: "auth.invitation",
        subject: "You've been invited to Voyant",
      },
      idempotencyKey: expect.stringMatching(/^auth-invitation:/),
    })
    expect(sends[1]?.idempotencyKey).toBe(sends[0]?.idempotencyKey)
  })
})

function hostWithAuthProvider(
  provider: "better-auth" | "voyant-cloud" | undefined,
  removedSharedProvider?: "better-auth" | "voyant-cloud",
  notificationProviders?: (env: Readonly<Record<string, unknown>>) => ReadonlyArray<unknown>,
): {
  primitives: VoyantRuntimeHostPrimitives
} {
  return {
    primitives: {
      env: (bindings) => bindings as Readonly<Record<string, unknown>>,
      database: {} as VoyantRuntimeHostPrimitives["database"],
      storage: {} as VoyantRuntimeHostPrimitives["storage"],
      events: {} as VoyantRuntimeHostPrimitives["events"],
      jobs: {} as VoyantRuntimeHostPrimitives["jobs"],
      config: {
        read: (_bindings, key) => {
          if (key === "deployment.providers.adminAuth") return provider
          if (key === "deployment.providers.auth") return removedSharedProvider
          if (key === "notificationProviders") return notificationProviders
          return undefined
        },
      },
    },
  }
}
