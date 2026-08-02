// @vitest-environment jsdom

import { adminRootHead } from "@voyant-travel/admin/app"
import { describe, expect, it } from "vitest"

describe("operator document bootstrap", () => {
  it("disables Zod JIT before browser-dependent bootstrap work", () => {
    const script = adminRootHead({ title: "Voyant" }).scripts[0]?.children ?? ""
    const zodConfigPosition = script.indexOf("__zod_globalConfig")
    const browserPreferencePosition = script.indexOf('localStorage.getItem("theme")')

    expect(zodConfigPosition).toBeGreaterThanOrEqual(0)
    expect(browserPreferencePosition).toBeGreaterThan(zodConfigPosition)
    expect(script).toContain("jitless:true")
  })
})
