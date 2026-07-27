import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DASHBOARD_HEADER_SLOT_HINT_KEY,
  readDashboardHeaderSlotHint,
  writeDashboardHeaderSlotHint,
} from "../../src/dashboard/dashboard-layout.js"

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe("dashboard header slot hint", () => {
  it("reserves the slot for a workspace that has never resolved the widget", () => {
    // First ever dashboard load: nothing is known, so reserve rather than
    // risk the strip appearing and pushing the page down.
    expect(readDashboardHeaderSlotHint()).toBe(true)
  })

  it("stops reserving once a widget reports that it renders nothing", () => {
    writeDashboardHeaderSlotHint(false)

    expect(window.localStorage.getItem(DASHBOARD_HEADER_SLOT_HINT_KEY)).toBe("hidden")
    expect(readDashboardHeaderSlotHint()).toBe(false)
  })

  it("reserves again once a widget reports that it renders", () => {
    writeDashboardHeaderSlotHint(false)
    writeDashboardHeaderSlotHint(true)

    expect(readDashboardHeaderSlotHint()).toBe(true)
  })

  it("reserves when storage is unreadable rather than throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled")
    })

    expect(readDashboardHeaderSlotHint()).toBe(true)
  })

  it("never throws when storage rejects writes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded")
    })

    expect(() => writeDashboardHeaderSlotHint(false)).not.toThrow()
  })
})
