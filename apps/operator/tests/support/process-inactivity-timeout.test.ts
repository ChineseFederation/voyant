import { describe, expect, it, vi } from "vitest"

import { createProcessInactivityTimeout } from "./process-inactivity-timeout.js"

describe("createProcessInactivityTimeout", () => {
  it("resets the deadline while a long-running process remains active", () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const timeout = createProcessInactivityTimeout(180_000, onTimeout)

    vi.advanceTimersByTime(170_000)
    timeout.touch()
    vi.advanceTimersByTime(170_000)

    expect(onTimeout).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10_000)
    expect(onTimeout).toHaveBeenCalledOnce()

    timeout.clear()
    vi.useRealTimers()
  })

  it("can be cleared after the process exits", () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const timeout = createProcessInactivityTimeout(180_000, onTimeout)

    timeout.clear()
    vi.advanceTimersByTime(180_000)

    expect(onTimeout).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
