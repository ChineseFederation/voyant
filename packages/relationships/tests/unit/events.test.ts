import { describe, expect, it, vi } from "vitest"

import {
  emitOrganizationChanged,
  emitPersonChanged,
  ORGANIZATION_CHANGED_EVENT,
  PERSON_CHANGED_EVENT,
} from "../../src/events.js"

function fakeBus() {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

describe("relationship change events", () => {
  it("emits person.changed with the id, action and domain metadata", async () => {
    const bus = fakeBus()
    await emitPersonChanged(bus as never, { id: "per_1", action: "updated" })

    expect(bus.emit).toHaveBeenCalledWith(
      PERSON_CHANGED_EVENT,
      { id: "per_1", action: "updated" },
      { category: "domain", source: "service" },
    )
  })

  it("emits organization.changed and honours the source override", async () => {
    const bus = fakeBus()
    await emitOrganizationChanged(bus as never, { id: "org_1", action: "created" }, "route")

    expect(bus.emit).toHaveBeenCalledWith(
      ORGANIZATION_CHANGED_EVENT,
      { id: "org_1", action: "created" },
      { category: "domain", source: "route" },
    )
  })

  it("is a no-op when no event bus is provided", async () => {
    await expect(
      emitPersonChanged(undefined, { id: "per_1", action: "deleted" }),
    ).resolves.toBeUndefined()
    await expect(
      emitOrganizationChanged(undefined, { id: "org_1", action: "deleted" }),
    ).resolves.toBeUndefined()
  })
})
