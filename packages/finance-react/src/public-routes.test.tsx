import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { createFinancePublicRouteContribution } from "./public-routes.js"

describe("finance public presentation", () => {
  it("matches the package-owned presentation declaration", () => {
    const contribution = createFinancePublicRouteContribution({
      getApiUrl: vi.fn(() => "/api"),
      PublicApiMessagesProvider: ({ children }: { children: ReactNode }) => children,
      usePaymentResolverMessages: vi.fn(),
      usePaymentLinkMessages: vi.fn(),
    } as never)

    expect(contribution.id).toBe("@voyant-travel/finance#presentation.public")
    expect(Object.keys(contribution.routes)).toEqual(["pay", "paymentLink", "accountant"])
  })
})
