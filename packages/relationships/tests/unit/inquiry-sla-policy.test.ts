import { describe, expect, it } from "vitest"

import {
  createInquiryFirstResponseSlaPolicy,
  firstResponseDueAtForInquiry,
} from "../../src/inquiry-sla-policy.js"
import { buildRelationshipsRouteRuntime } from "../../src/route-runtime.js"

describe("Inquiry first-response SLA policy", () => {
  const createdAt = new Date("2026-08-18T08:00:00.000Z")

  it("applies documented defaults by source and priority", () => {
    expect(
      firstResponseDueAtForInquiry({ source: "storefront", priority: "normal", createdAt }),
    ).toEqual(new Date("2026-08-19T08:00:00.000Z"))
    expect(
      firstResponseDueAtForInquiry({ source: "admin", priority: "normal", createdAt }),
    ).toEqual(new Date("2026-08-18T16:00:00.000Z"))
  })

  it("honors deployment overrides and explicit no-SLA cells", () => {
    const policy = createInquiryFirstResponseSlaPolicy({
      storefront: { normal: 90 },
      admin: { low: null },
    })
    expect(
      firstResponseDueAtForInquiry({ source: "storefront", priority: "normal", createdAt, policy }),
    ).toEqual(new Date("2026-08-18T09:30:00.000Z"))
    expect(
      firstResponseDueAtForInquiry({ source: "admin", priority: "low", createdAt, policy }),
    ).toBeNull()
  })

  it("resolves deployment policy through the route runtime", () => {
    const runtime = buildRelationshipsRouteRuntime(
      { deployment: "custom" },
      {
        resolveInquiryFirstResponseSla: (bindings) =>
          bindings.deployment === "custom" ? { storefront: { urgent: 15 } } : undefined,
      },
    )
    expect(runtime.inquiryFirstResponseSlaPolicy("storefront", "urgent")).toBe(15)
    expect(runtime.inquiryFirstResponseSlaPolicy("storefront", "normal")).toBe(1_440)
  })
})
