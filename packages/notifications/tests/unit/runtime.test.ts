import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

const resolveInvoicePayUrlTemplate = vi.fn<() => Promise<string | null>>()
vi.mock("@voyant-travel/operator-settings/service", () => ({
  resolveInvoicePayUrlTemplate: () => resolveInvoicePayUrlTemplate(),
}))

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

  it("does not reuse the admin origin for customer links", () => {
    const runtime = createNotificationsRuntime(primitives({ APP_URL: "https://operator.test/api" }))

    expect(runtime.resolvePublicCustomerPortalBaseUrl?.({})).toBeNull()
    expect(runtime.resolvePublicCheckoutBaseUrl?.({})).toBeNull()
  })
})

describe("createNotificationsRuntime payment-link template", () => {
  beforeEach(() => {
    resolveInvoicePayUrlTemplate.mockReset()
  })

  it("falls back to the Cloud-provided default when the organization sets none", async () => {
    resolveInvoicePayUrlTemplate.mockResolvedValue(null)
    const runtime = createNotificationsRuntime(
      primitives({ PUBLIC_PAYMENT_LINK_URL_TEMPLATE: "https://cloud.example.test/p/{sessionId}" }),
    )

    await expect(runtime.resolvePaymentLinkUrlTemplate?.(null as never, {})).resolves.toBe(
      "https://cloud.example.test/p/{sessionId}",
    )
  })

  it("gives the organization template precedence over the Cloud default", async () => {
    resolveInvoicePayUrlTemplate.mockResolvedValue("https://brand.example.test/pay?s={sessionId}")
    const runtime = createNotificationsRuntime(
      primitives({ PUBLIC_PAYMENT_LINK_URL_TEMPLATE: "https://cloud.example.test/p/{sessionId}" }),
    )

    await expect(runtime.resolvePaymentLinkUrlTemplate?.(null as never, {})).resolves.toBe(
      "https://brand.example.test/pay?s={sessionId}",
    )
  })

  it("resolves no template when neither is configured", async () => {
    resolveInvoicePayUrlTemplate.mockResolvedValue(null)
    const runtime = createNotificationsRuntime(primitives({}))

    await expect(runtime.resolvePaymentLinkUrlTemplate?.(null as never, {})).resolves.toBeNull()
  })
})
