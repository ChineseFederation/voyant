import { describe, expect, it, vi } from "vitest"

import { catalogCheckoutDatabaseRuntimePort } from "../../src/checkout/runtime-ports.js"
import { createCommerceRuntimePortContribution } from "../../src/runtime-contributor.js"

describe("commerce checkout database runtime", () => {
  it("runs checkout finalization against the resolved database without an outer transaction", async () => {
    const bindings = { requestId: "req_1" }
    const primaryDb = { name: "primary-db" }
    const replicaAwareDb = { name: "replica-aware-db", $primary: primaryDb }
    const resolve = vi.fn(() => replicaAwareDb)
    const transaction = vi.fn(async () => {
      throw new Error("checkout finalization must not hold a saga-wide transaction")
    })
    const ports = createCommerceRuntimePortContribution({
      primitives: {
        database: {
          fromContext: vi.fn(),
          resolve,
          transaction,
        },
        env: () => ({}),
      } as never,
      getRuntimePort: async (port) => {
        if (port.id === "finance.inventory-payment-policy.runtime") {
          return {
            createPaymentPolicyRuntime: () => ({
              resolveSupplierPolicy: async () => null,
              resolveSupplierPolicyById: async () => null,
              resolveCategoryPolicy: async () => null,
              resolveListingPolicy: async () => null,
            }),
          } as never
        }
        if (port.id === "commerce.card-payment.runtime") return undefined as never
        return {} as never
      },
    })
    const checkoutDatabase = await ports[catalogCheckoutDatabaseRuntimePort.id]
    const operation = vi.fn(async (resolvedDb: unknown) => {
      expect(resolvedDb).toBe(primaryDb)
      return "completed"
    })

    await expect(
      (
        checkoutDatabase as {
          withDb<T>(bindings: unknown, operation: (db: unknown) => Promise<T>): Promise<T>
        }
      ).withDb(bindings, operation),
    ).resolves.toBe("completed")

    expect(resolve).toHaveBeenCalledWith(bindings)
    expect(transaction).not.toHaveBeenCalled()
    expect(operation).toHaveBeenCalledOnce()
  })
})
