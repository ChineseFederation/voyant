import { inquiryTargetAuthorityRuntimePort } from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import { describe, expect, it, vi } from "vitest"

import { resolveIntakeTargets } from "../../src/inquiry-intake-targets.js"
import { inquiryDepartureLink } from "../../src/standard-links.js"

const departureAuthority = {
  kind: "departure" as const,
  targetExists: async () => true,
  resolveSnapshot: async () => ({ title: "Departure 2026-09-01", startDate: "2026-09-01" }),
}

describe("intake target resolution", () => {
  it("keeps a target the owner resolves", async () => {
    const { targets, unresolved } = await resolveIntakeTargets(
      {},
      [departureAuthority],
      [{ kind: "departure", targetId: "avsl_1" }],
    )

    expect(unresolved).toEqual([])
    expect(targets).toEqual([
      {
        kind: "departure",
        targetId: "avsl_1",
        snapshot: { title: "Departure 2026-09-01", startDate: "2026-09-01" },
      },
    ])
  })

  // The submission is the customer's; a reference we cannot resolve is our
  // problem. Before #4838 this threw, the intake transaction rolled back, and
  // the storefront got a 500 with nothing recorded.
  it("records a reference no owner can resolve instead of losing the submission", async () => {
    const { targets, unresolved } = await resolveIntakeTargets(
      {},
      [{ ...departureAuthority, resolveSnapshot: async () => null }],
      [{ kind: "departure", targetId: "avsl_missing" }],
    )

    expect(targets).toEqual([])
    expect(unresolved).toEqual([
      { kind: "departure", targetId: "avsl_missing", reason: "not_found" },
    ])
  })

  it("records a reference whose owner is not bound to the deployment", async () => {
    const { targets, unresolved } = await resolveIntakeTargets(
      {},
      [],
      [{ kind: "product", targetId: "prod_1" }],
    )

    expect(targets).toEqual([])
    expect(unresolved).toEqual([
      { kind: "product", targetId: "prod_1", reason: "authority_unavailable" },
    ])
  })

  it("treats an ambiguous kind with two bound authorities as unresolvable", async () => {
    const second = { ...departureAuthority }
    const { unresolved } = await resolveIntakeTargets(
      {},
      [departureAuthority, second],
      [{ kind: "departure", targetId: "avsl_1" }],
    )

    expect(unresolved).toEqual([
      { kind: "departure", targetId: "avsl_1", reason: "authority_unavailable" },
    ])
  })

  it("resolves every requested target independently", async () => {
    const productAuthority = {
      kind: "product" as const,
      targetExists: async () => true,
      resolveSnapshot: vi.fn(async () => null),
    }
    const { targets, unresolved } = await resolveIntakeTargets(
      {},
      [productAuthority, departureAuthority],
      [
        { kind: "product", targetId: "prod_gone" },
        { kind: "departure", targetId: "avsl_1" },
      ],
    )

    expect(targets).toHaveLength(1)
    expect(targets[0]?.kind).toBe("departure")
    expect(unresolved).toHaveLength(1)
    expect(productAuthority.resolveSnapshot).toHaveBeenCalledOnce()
  })
})

describe("departure target naming", () => {
  // The kind is named for the entity its authority and link actually resolve.
  // It was briefly `option_unit`, which read as a product option unit while
  // resolving an availability slot, so callers passing a real option-unit id
  // were refused (#4838).
  it("resolves the departure kind against the departure linkable", () => {
    expect(inquiryDepartureLink.right.linkable.entity).toBe("departure")
    expect(inquiryDepartureLink.right.linkable.table).toBe("availability_slots")
  })

  it("accepts departure authorities and refuses the retired kind", () => {
    expect(() =>
      inquiryTargetAuthorityRuntimePort.test({
        kind: "departure",
        targetExists: async () => true,
      }),
    ).not.toThrow()
    expect(() =>
      inquiryTargetAuthorityRuntimePort.test({
        kind: "option_unit" as never,
        targetExists: async () => true,
      }),
    ).toThrow(/supported kind/)
  })
})
