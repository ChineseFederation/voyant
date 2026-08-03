import { createToolRegistry } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { catalogBookingTools } from "./tools.js"

describe("catalog booking tools", () => {
  it("publishes provider-neutral order inspection capabilities", () => {
    expect(catalogBookingTools).toHaveLength(2)
    expect(new Set(catalogBookingTools.map((tool) => tool.capabilityId)).size).toBe(2)
    expect(() => createToolRegistry().registerAll(catalogBookingTools)).not.toThrow()
  })
})
