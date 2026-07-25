import { describe, expect, it, vi } from "vitest"

import {
  type PaymentReconciliationJobRuntime,
  reconcilePaymentAdapterStatuses,
} from "../../src/payment-reconciliation-job.js"

function adapter(status = true) {
  return {
    capabilities: { status },
    status: status ? vi.fn() : undefined,
  } as never
}

describe("scheduled payment reconciliation", () => {
  it("refreshes a bounded due set and isolates individual failures", async () => {
    const selectedAdapter = adapter()
    const warn = vi.fn()
    const runtime: PaymentReconciliationJobRuntime = {
      resolveDb: async () => ({}) as never,
      resolveAdapter: async () => selectedAdapter,
      resolveEnv: () => ({ deployment: "authenticated-by-managed-transport" }),
      warn,
    }
    const refresh = vi.fn(async (_adapter, _db, id: string) => {
      if (id === "psess_failed") throw new Error("platform unavailable")
      return id === "psess_leased" ? null : { id }
    })

    await expect(
      reconcilePaymentAdapterStatuses(
        runtime,
        {},
        {
          listDueSessionIds: async (_db, limit) => {
            expect(limit).toBe(100)
            return ["psess_paid", "psess_leased", "psess_failed"]
          },
          refresh,
        },
      ),
    ).resolves.toEqual({ examined: 3, refreshed: 1, failed: 1 })
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalledOnce()
  })

  it("is a no-op when the selected adapter does not advertise status", async () => {
    const listDueSessionIds = vi.fn()
    await expect(
      reconcilePaymentAdapterStatuses(
        {
          resolveDb: async () => ({}) as never,
          resolveAdapter: async () => adapter(false),
          resolveEnv: () => ({}),
        },
        {},
        {
          listDueSessionIds,
          refresh: vi.fn(),
        },
      ),
    ).resolves.toEqual({ examined: 0, refreshed: 0, failed: 0 })
    expect(listDueSessionIds).not.toHaveBeenCalled()
  })
})
