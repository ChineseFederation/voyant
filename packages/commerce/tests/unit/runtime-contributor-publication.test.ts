import { catalogPublicationRuntimePort } from "@voyant-travel/catalog/runtime-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { describe, expect, it, vi } from "vitest"

import { catalogCheckoutApiRuntimePort } from "../../src/checkout/runtime-ports.js"
import { createCommerceRuntimePortContribution } from "../../src/runtime-contributor.js"

describe("commerce publication runtime wiring", () => {
  it("injects the selected publication provider into checkout", async () => {
    const isProductPublished = vi.fn(async () => true)
    const ports = createCommerceRuntimePortContribution({
      primitives: {
        database: {
          fromContext: () => ({}),
          resolve: () => ({}),
          transaction: async (_bindings, operation) => operation({}),
        },
        env: () => ({}),
      } as never,
      getRuntimePort: async (port) => {
        if (port.id === catalogPublicationRuntimePort.id) return { isProductPublished } as never
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

    const createCheckoutOptions = await ports[catalogCheckoutApiRuntimePort.id]
    const checkout = (
      createCheckoutOptions as (context: Context) => {
        publication?: {
          isProductPublished(input: {
            db: PostgresJsDatabase
            bookingId: string
            productId: string
            channelId: string
          }): Promise<boolean>
        }
      }
    )({} as Context)
    const db = {} as PostgresJsDatabase

    await expect(
      checkout.publication?.isProductPublished({
        db,
        bookingId: "book_1",
        productId: "prod_1",
        channelId: "chan_1",
      }),
    ).resolves.toBe(true)
    expect(isProductPublished).toHaveBeenCalledWith({
      db,
      productId: "prod_1",
      channelId: "chan_1",
    })
  })
})
