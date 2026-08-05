/**
 * voyant#3950: the allocation status → Tool error code mapping.
 *
 * This is worth a direct test because the code is what sets `retryable`, and the
 * consequence of getting it wrong is asymmetric and invisible: an agent told a
 * transient failure is terminal silently abandons work that would have
 * succeeded, and nothing in the transcript says why.
 */
import { TOOL_ERROR_DEFAULTS } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { allocationToolErrorCode } from "../../src/allocation-tool-errors.js"

/** Whether the code this status maps to tells the caller a retry may succeed. */
const retryable = (status: number) => TOOL_ERROR_DEFAULTS[allocationToolErrorCode(status)].retryable

describe("allocationToolErrorCode", () => {
  it("maps a missing record to NOT_FOUND", () => {
    expect(allocationToolErrorCode(404)).toBe("NOT_FOUND")
  })

  it("treats a timeout and a rate limit as retryable despite being 4xx", () => {
    // The regression this fixes: both fell into the 4xx branch and came back as
    // INVALID_INPUT, which tells an agent to go correct an input that was never
    // wrong. It would rewrite a correct request rather than wait and repeat it.
    for (const status of [408, 429]) {
      expect(allocationToolErrorCode(status), `status ${status}`).toBe("PROVIDER_UNAVAILABLE")
      expect(retryable(status), `status ${status} should be retryable`).toBe(true)
    }
  })

  it("treats an unavailable upstream as retryable", () => {
    for (const status of [502, 503, 504]) {
      expect(allocationToolErrorCode(status), `status ${status}`).toBe("PROVIDER_UNAVAILABLE")
      expect(retryable(status), `status ${status} should be retryable`).toBe(true)
    }
  })

  it("keeps a plain 500 terminal", () => {
    // Deliberate: an unhandled server fault is not known to be transient, and
    // these wrap allocation WRITES where a wrong retry risks a duplicate
    // placement. Terminal is the safe default when we cannot characterise it.
    expect(allocationToolErrorCode(500)).toBe("PROVIDER_ERROR")
    expect(retryable(500)).toBe(false)
  })

  it("keeps ordinary client errors terminal input errors", () => {
    for (const status of [400, 403, 409, 422]) {
      expect(allocationToolErrorCode(status), `status ${status}`).toBe("INVALID_INPUT")
      expect(retryable(status), `status ${status} should be terminal`).toBe(false)
    }
  })
})
