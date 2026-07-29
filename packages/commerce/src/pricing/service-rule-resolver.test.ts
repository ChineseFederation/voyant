import { describe, expect, it } from "vitest"

import { pickRulesForDate, type ResolverScheduleInput } from "./service-rule-resolver.js"

describe("price rule date resolver", () => {
  it("matches persisted lowercase weekday names and legacy weekday codes identically", () => {
    const rules = [
      { id: "fallback", name: "Fallback", isDefault: true, priceScheduleId: null },
      { id: "scheduled", name: "Scheduled", isDefault: false, priceScheduleId: "schedule_1" },
    ]
    const schedule = {
      id: "schedule_1",
      active: true,
      priority: 10,
      recurrenceRule: "FREQ=DAILY",
      validFrom: "2026-07-01",
      validTo: "2026-07-31",
      timezone: null,
    } satisfies Omit<ResolverScheduleInput, "weekdays">

    expect(
      pickRulesForDate(
        rules,
        new Map([["schedule_1", { ...schedule, weekdays: ["wednesday"] }]]),
        "2026-07-01",
      )[0]?.id,
    ).toBe("scheduled")
    expect(
      pickRulesForDate(
        rules,
        new Map([["schedule_1", { ...schedule, weekdays: ["WE"] }]]),
        "2026-07-01",
      )[0]?.id,
    ).toBe("scheduled")
    expect(
      pickRulesForDate(
        rules,
        new Map([["schedule_1", { ...schedule, weekdays: ["wednesday"] }]]),
        "2026-07-02",
      )[0]?.id,
    ).toBe("fallback")
  })
})
