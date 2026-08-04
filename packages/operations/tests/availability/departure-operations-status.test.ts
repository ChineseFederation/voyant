import { describe, expect, it } from "vitest"
import {
  assertDepartureServiceOperationTransition,
  canTransitionDepartureServiceOperation,
  DepartureServiceOperationTransitionError,
} from "../../src/availability/departure-operations-status.js"

describe("departure service operation status transitions", () => {
  it("permits the happy path from planned to completed", () => {
    expect(canTransitionDepartureServiceOperation("planned", "requested")).toBe(true)
    expect(canTransitionDepartureServiceOperation("requested", "confirmed")).toBe(true)
    expect(canTransitionDepartureServiceOperation("confirmed", "ready")).toBe(true)
    expect(canTransitionDepartureServiceOperation("ready", "completed")).toBe(true)
  })

  it("treats a no-op transition as allowed so idempotent re-apply never trips", () => {
    expect(canTransitionDepartureServiceOperation("completed", "completed")).toBe(true)
    expect(canTransitionDepartureServiceOperation("planned", "planned")).toBe(true)
  })

  it("allows any non-terminal state to be cancelled or flagged as an exception", () => {
    expect(canTransitionDepartureServiceOperation("planned", "cancelled")).toBe(true)
    expect(canTransitionDepartureServiceOperation("confirmed", "exception")).toBe(true)
  })

  it("lets an exception recover back into the flow", () => {
    expect(canTransitionDepartureServiceOperation("exception", "confirmed")).toBe(true)
    expect(canTransitionDepartureServiceOperation("exception", "cancelled")).toBe(true)
  })

  it("rejects exits from terminal states", () => {
    expect(canTransitionDepartureServiceOperation("completed", "ready")).toBe(false)
    expect(canTransitionDepartureServiceOperation("completed", "planned")).toBe(false)
    expect(canTransitionDepartureServiceOperation("cancelled", "ready")).toBe(false)
  })

  it("rejects skipping backwards to planned from a later state", () => {
    expect(canTransitionDepartureServiceOperation("ready", "planned")).toBe(false)
    expect(canTransitionDepartureServiceOperation("confirmed", "requested")).toBe(false)
  })

  it("throws a typed error from the assert helper on an illegal transition", () => {
    expect(() => assertDepartureServiceOperationTransition("completed", "ready")).toThrow(
      DepartureServiceOperationTransitionError,
    )
    expect(() => assertDepartureServiceOperationTransition("ready", "completed")).not.toThrow()
  })
})
