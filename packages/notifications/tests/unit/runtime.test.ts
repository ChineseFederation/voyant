import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { describe, expect, it, vi } from "vitest"

import { createNotificationsRuntime } from "../../src/runtime.js"

function primitives(env: Record<string, unknown>): VoyantRuntimeHostPrimitives {
  return {
    env: () => env,
    database: {
      resolve: vi.fn(),
      fromContext: vi.fn(),
      transaction: vi.fn(),
    },
    storage: {
      resolve: vi.fn(),
      read: vi.fn(),
      downloadUrl: vi.fn(),
    },
    events: { deliver: vi.fn() },
    config: { read: vi.fn() },
  } as never
}

describe("createNotificationsRuntime", () => {
  it("resolves the host-injected customer portal URL from bindings", () => {
    const runtime = createNotificationsRuntime(
      primitives({ VOYANT_CUSTOMER_PORTAL_URL: " https://portal.example.test/ " }),
    )

    expect(runtime.resolvePublicCustomerPortalBaseUrl?.({})).toBe("https://portal.example.test")
  })

  it("resolves no customer portal URL when deployment configuration is unset", () => {
    const runtime = createNotificationsRuntime(primitives({ APP_URL: "https://operator.test/api" }))

    expect(runtime.resolvePublicCustomerPortalBaseUrl?.({})).toBeNull()
    expect(runtime.resolvePublicCheckoutBaseUrl?.({})).toBe("https://operator.test")
  })
})
