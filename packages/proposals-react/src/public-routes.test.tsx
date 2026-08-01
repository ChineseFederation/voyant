import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { createProposalsPublicRouteContribution } from "./public-routes.js"

describe("proposals public presentation", () => {
  it("matches the package-owned presentation declaration", () => {
    const contribution = createProposalsPublicRouteContribution({
      getApiUrl: vi.fn(() => "/api"),
      StorefrontMessagesProvider: ({ children }: { children: ReactNode }) => children,
      useProposalMessages: vi.fn(),
    } as never)

    expect(contribution.id).toBe("@voyant-travel/proposals#presentation.public")
    expect(Object.keys(contribution.routes)).toEqual(["proposal"])
  })
})
