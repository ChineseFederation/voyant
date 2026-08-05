import { describe, expect, it, vi } from "vitest"

import {
  ANALYTICS_EVENT_CATALOGUE,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_FAILURE_REASONS,
  type AnalyticsPort,
  analyticsFailureReason,
  analyticsPort,
  analyticsProperties,
  createSafeAnalytics,
  noopAnalytics,
} from "../../src/analytics.js"

/**
 * A provider whose methods return a promise. Legal at runtime and exactly what
 * a batching vendor client does, but not expressible through `AnalyticsPort`,
 * whose methods are declared `void` so no caller can await one.
 */
function asyncProvider(track: () => Promise<unknown>): AnalyticsPort {
  return { track, identify: () => undefined, group: () => undefined } as unknown as AnalyticsPort
}

function recorder(): AnalyticsPort & { calls: unknown[][] } {
  const calls: unknown[][] = []
  return {
    calls,
    track: (...args) => calls.push(["track", ...args]),
    identify: (...args) => calls.push(["identify", ...args]),
    group: (...args) => calls.push(["group", ...args]),
  }
}

describe("noopAnalytics", () => {
  it("accepts every call and returns nothing", () => {
    expect(
      noopAnalytics.track("engine.quote.requested", { booking_session_id: "s_1" }),
    ).toBeUndefined()
    expect(noopAnalytics.identify("u_1")).toBeUndefined()
    expect(noopAnalytics.group("workspace", "w_1")).toBeUndefined()
  })
})

describe("createSafeAnalytics", () => {
  it("returns the no-op for an unbound host", () => {
    expect(createSafeAnalytics(undefined)).toBe(noopAnalytics)
    expect(createSafeAnalytics(null)).toBe(noopAnalytics)
  })

  it("forwards to the bound provider", () => {
    const provider = recorder()
    const analytics = createSafeAnalytics(provider)

    analytics.track("engine.quote.succeeded", { booking_session_id: "s_1", total: 100 })
    analytics.identify("u_1", { role: "staff" })
    analytics.group("workspace", "w_1")

    expect(provider.calls).toEqual([
      ["track", "engine.quote.succeeded", { booking_session_id: "s_1", total: 100 }],
      ["identify", "u_1", { role: "staff" }],
      ["group", "workspace", "w_1", undefined],
    ])
  })

  it("swallows a provider that throws synchronously", () => {
    const analytics = createSafeAnalytics({
      track: () => {
        throw new Error("vendor is down")
      },
      identify: () => {
        throw new Error("vendor is down")
      },
      group: () => {
        throw new Error("vendor is down")
      },
    })

    expect(() => analytics.track("engine.commit.attempted")).not.toThrow()
    expect(() => analytics.identify("u_1")).not.toThrow()
    expect(() => analytics.group("workspace", "w_1")).not.toThrow()
  })

  it("swallows a provider whose returned promise rejects", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const analytics = createSafeAnalytics(
        asyncProvider(() => Promise.reject(new Error("batch failed"))),
      )

      analytics.track("engine.commit.attempted")
      await new Promise((resolve) => setImmediate(resolve))

      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("does not await the provider", () => {
    let resolved = false
    const analytics = createSafeAnalytics(
      asyncProvider(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              resolved = true
              resolve()
            }, 50)
          }),
      ),
    )

    analytics.track("engine.commit.attempted")
    // Returned before the provider settled: `track` is fire-and-forget, so a
    // slow vendor cannot become latency on a booking operation.
    expect(resolved).toBe(false)
  })
})

describe("analyticsProperties", () => {
  it("drops undefined values so a vendor does not bucket 'we did not know'", () => {
    expect(
      analyticsProperties({ booking_session_id: "s_1", market: undefined, channel: null }),
    ).toEqual({ booking_session_id: "s_1", channel: null })
  })
})

describe("analyticsPort", () => {
  it("accepts a conforming provider", () => {
    expect(() => analyticsPort.test(recorder())).not.toThrow()
  })

  it.each([
    ["null", null],
    ["a non-object", "provider"],
    ["a partial provider", { track: () => undefined }],
  ])("rejects %s", (_label, provider) => {
    expect(() => analyticsPort.test(provider as unknown as AnalyticsPort)).toThrow(
      /must implement track\(\), identify\(\), and group\(\)/,
    )
  })
})

describe("the catalogue", () => {
  it("names every event in `surface.object.verb` form", () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      expect(name).toMatch(/^(engine|admin|portal)\.[a-z]+\.[a-z]+$/)
    }
  })

  it("declares snake_case properties and no duplicates", () => {
    for (const [name, properties] of Object.entries(ANALYTICS_EVENT_CATALOGUE)) {
      expect(new Set(properties).size, `${name} lists a property twice`).toBe(properties.length)
      for (const property of properties) expect(property).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it("carries a booking_session_id on every stitchable engine event", () => {
    // Journey stitching is the whole reason browser and server events are one
    // taxonomy. The two exceptions mint no session: the Offer Preview writes
    // nothing, and `journey.started` fires before Create returns.
    const exempt = new Set(["engine.offer.previewed", "engine.journey.started"])
    for (const [name, properties] of Object.entries(ANALYTICS_EVENT_CATALOGUE)) {
      if (!name.startsWith("engine.") || exempt.has(name)) continue
      expect(properties as readonly string[], name).toContain("booking_session_id")
    }
  })
})

describe("analyticsFailureReason", () => {
  it("passes through a declared reason", () => {
    for (const reason of ANALYTICS_FAILURE_REASONS) {
      expect(analyticsFailureReason(reason)).toBe(reason)
    }
  })

  it("maps anything undeclared to `unknown` rather than leaking it", () => {
    expect(analyticsFailureReason("Card declined: insufficient funds")).toBe("unknown")
    expect(analyticsFailureReason(undefined)).toBe("unknown")
  })

  it("has no duplicate members", () => {
    expect(new Set(ANALYTICS_FAILURE_REASONS).size).toBe(ANALYTICS_FAILURE_REASONS.length)
  })
})
