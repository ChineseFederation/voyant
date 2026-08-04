import type { PaxBandDependencyV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import { describe, expect, it } from "vitest"

import { evaluatePaxBandDependencies } from "../../src/journey/lib/pax-band-dependencies.js"

const bands = [
  { code: "adult", label: "Adult" },
  { code: "child", label: "Child under 6" },
]

describe("evaluatePaxBandDependencies", () => {
  it("returns no violations when there are no dependencies", () => {
    expect(evaluatePaxBandDependencies({ adult: 0, child: 2 }, undefined, bands)).toEqual([])
    expect(evaluatePaxBandDependencies({ adult: 0, child: 2 }, [], bands)).toEqual([])
  })

  it("does not fire a rule when no dependents are picked", () => {
    const deps: PaxBandDependencyV1[] = [
      { dependentCode: "child", masterCode: "adult", type: "requires" },
    ]
    expect(evaluatePaxBandDependencies({ adult: 0, child: 0 }, deps, bands)).toEqual([])
  })

  it("flags `requires` when a dependent is picked without its master", () => {
    const deps: PaxBandDependencyV1[] = [
      { dependentCode: "child", masterCode: "adult", type: "requires" },
    ]
    const out = evaluatePaxBandDependencies({ adult: 0, child: 1 }, deps, bands)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      type: "requires",
      dependentLabel: "Child under 6",
      masterLabel: "Adult",
    })
    // Satisfied once a master is present.
    expect(evaluatePaxBandDependencies({ adult: 1, child: 1 }, deps, bands)).toEqual([])
  })

  it("flags `excludes` when both bands are present", () => {
    const deps: PaxBandDependencyV1[] = [
      { dependentCode: "child", masterCode: "adult", type: "excludes" },
    ]
    expect(evaluatePaxBandDependencies({ adult: 1, child: 1 }, deps, bands)).toHaveLength(1)
    expect(evaluatePaxBandDependencies({ adult: 0, child: 1 }, deps, bands)).toEqual([])
  })

  it("enforces `limits_per_master`", () => {
    const deps: PaxBandDependencyV1[] = [
      { dependentCode: "child", masterCode: "adult", type: "limits_per_master", maxPerMaster: 2 },
    ]
    // 2 adults × 2 = up to 4 children allowed.
    expect(evaluatePaxBandDependencies({ adult: 2, child: 4 }, deps, bands)).toEqual([])
    const out = evaluatePaxBandDependencies({ adult: 2, child: 5 }, deps, bands)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: "limits_per_master", limit: 2 })
  })

  it("enforces `limits_sum`", () => {
    const deps: PaxBandDependencyV1[] = [
      { dependentCode: "child", masterCode: "adult", type: "limits_sum", maxDependentSum: 3 },
    ]
    expect(evaluatePaxBandDependencies({ adult: 1, child: 3 }, deps, bands)).toEqual([])
    expect(evaluatePaxBandDependencies({ adult: 1, child: 4 }, deps, bands)).toHaveLength(1)
  })
})
