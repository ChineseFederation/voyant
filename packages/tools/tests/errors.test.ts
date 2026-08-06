import { describe, expect, it } from "vitest"

import { TOOL_ERROR_DEFAULTS, ToolError, type ToolErrorCode } from "../src/index.js"

describe("ToolError actionable fields", () => {
  it("gives every code a documented remediation and a defensible retry default", () => {
    const codes = Object.keys(TOOL_ERROR_DEFAULTS) as ToolErrorCode[]
    for (const code of codes) {
      const error = new ToolError("boom", code)
      expect(error.nextSteps.length).toBeGreaterThan(0)
      expect(error.nextSteps.every((step) => step.trim().length > 0)).toBe(true)
      expect(typeof error.retryable).toBe("boolean")
    }
  })

  it("treats only a transient provider failure as retryable", () => {
    expect(new ToolError("x", "PROVIDER_UNAVAILABLE").retryable).toBe(true)
    expect(new ToolError("x", "PROVIDER_ERROR").retryable).toBe(false)
    expect(new ToolError("x", "AUTHORIZATION_DENIED").retryable).toBe(false)
    expect(new ToolError("x", "INVALID_INPUT").retryable).toBe(false)
    expect(new ToolError("x", "NOT_FOUND").retryable).toBe(false)
  })

  it("states the exact remediation for approval and confirmation gates", () => {
    expect(new ToolError("x", "APPROVAL_REQUIRED").nextSteps.join(" ")).toContain('"approvalId"')
    expect(new ToolError("x", "CONFIRMATION_REQUIRED").nextSteps.join(" ")).toContain(
      '"confirmed": true',
    )
  })

  it("keeps the legacy positional constructor working and defaults per code", () => {
    const legacy = new ToolError("legacy", "NOT_FOUND", { id: "trip_1" }, { cause: new Error("x") })
    expect(legacy.code).toBe("NOT_FOUND")
    expect(legacy.meta).toEqual({ id: "trip_1" })
    expect(legacy.retryable).toBe(false)
    expect(legacy.candidates).toBeUndefined()
    expect(legacy.didYouMean).toBeUndefined()
  })

  it("carries per-throw-site overrides when provided", () => {
    const error = new ToolError("nope", "NOT_FOUND", { id: "trp_1" }, undefined, {
      candidates: ["trip_1", "trip_2"],
      didYouMean: "trip_1",
      nextSteps: ["Use trip_1."],
    })
    expect(error.candidates).toEqual(["trip_1", "trip_2"])
    expect(error.didYouMean).toBe("trip_1")
    expect(error.nextSteps).toEqual(["Use trip_1."])
  })
})

describe("ToolError with a code outside the union", () => {
  it("does not throw while constructing, so the real failure is not masked", () => {
    // A domain may raise its own code; the transport forwards it verbatim.
    // Constructing must never crash — a TypeError here would replace the real
    // failure with an unrelated one and lose the cause.
    const error = new ToolError("record is locked", "RECORD_LOCKED" as ToolErrorCode)

    expect(error.code).toBe("RECORD_LOCKED")
    expect(error.retryable).toBe(false)
    expect(error.nextSteps.length).toBeGreaterThan(0)
  })
})
