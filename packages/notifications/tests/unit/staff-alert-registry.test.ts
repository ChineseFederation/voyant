import { describe, expect, it } from "vitest"

import { STAFF_ALERT_DEFINITIONS } from "../../src/staff-alert-registry.js"

describe("staff alert registry", () => {
  it("does not default new Inquiry alerts to every member", () => {
    const definition = STAFF_ALERT_DEFINITIONS.find(
      (entry) => entry.key === "staff.inquiry.created",
    )
    expect(definition?.defaultRoles).toEqual(["owner", "admin"])
  })
})
