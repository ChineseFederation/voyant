import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureAvailabilityHoldExpiryWake,
  OPERATIONS_EXPIRED_HOLDS_JOB_ID,
  requestAvailabilityHoldExpiryWake,
  resetAvailabilityHoldExpiryWake,
} from "../../src/availability/hold-expiry-wake.js"
import * as holds from "../../src/availability/service-holds.js"
import { runOperationsReleaseExpiredHoldsJob } from "../../src/expired-holds-job.js"
import { operationsExpiredHoldsJobRuntimePort } from "../../src/expired-holds-job-runtime-port.js"

const db = {} as never

function jobContext(): VoyantGraphRuntimeFactoryContext {
  return {
    getPort: async (port: { id: string }) => {
      expect(port.id).toBe(operationsExpiredHoldsJobRuntimePort.id)
      return { resolveDb: () => db }
    },
  } as unknown as VoyantGraphRuntimeFactoryContext
}

afterEach(() => {
  resetAvailabilityHoldExpiryWake()
  vi.restoreAllMocks()
})

describe("availability hold expiry wake channel", () => {
  it("stays inert until a deployment binds it", () => {
    expect(() => requestAvailabilityHoldExpiryWake(new Date())).not.toThrow()
  })

  it("addresses the reaper by its graph job id", () => {
    const wake = vi.fn()
    configureAvailabilityHoldExpiryWake(wake)
    const expiresAt = new Date("2026-08-03T10:15:00.000Z")

    requestAvailabilityHoldExpiryWake(expiresAt)

    expect(wake).toHaveBeenCalledWith(OPERATIONS_EXPIRED_HOLDS_JOB_ID, expiresAt)
  })
})

describe("runOperationsReleaseExpiredHoldsJob", () => {
  it("arms its own next run from the earliest hold still outstanding", async () => {
    const next = new Date("2026-08-03T10:45:00.000Z")
    const releaseExpiredHolds = vi.spyOn(holds, "releaseExpiredHolds").mockResolvedValue(2)
    vi.spyOn(holds, "earliestOutstandingHoldExpiry").mockResolvedValue(next)
    const wake = vi.fn()
    configureAvailabilityHoldExpiryWake(wake)

    await runOperationsReleaseExpiredHoldsJob(jobContext())

    expect(releaseExpiredHolds).toHaveBeenCalledWith(db)
    expect(wake).toHaveBeenCalledWith(OPERATIONS_EXPIRED_HOLDS_JOB_ID, next)
  })

  it("arms nothing when no hold is outstanding, so an idle tenant stops waking", async () => {
    vi.spyOn(holds, "releaseExpiredHolds").mockResolvedValue(0)
    vi.spyOn(holds, "earliestOutstandingHoldExpiry").mockResolvedValue(undefined)
    const wake = vi.fn()
    configureAvailabilityHoldExpiryWake(wake)

    await runOperationsReleaseExpiredHoldsJob(jobContext())

    expect(wake).not.toHaveBeenCalled()
  })
})
