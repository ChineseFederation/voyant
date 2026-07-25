import type { AnyDrizzleDb } from "@voyant-travel/db"
import { describe, expect, it } from "vitest"

import { NoOwnedHandlerRegisteredError } from "./errors.js"
import {
  type ComputeQuoteRequest,
  createOwnedBookingHandlerRegistry,
  type OwnedBookingHandler,
  type OwnedHandlerContext,
} from "./owned-handler.js"

function stubHandler(entityModule: string): OwnedBookingHandler {
  return {
    entityModule,
    async computeQuote(_ctx: OwnedHandlerContext, _req: ComputeQuoteRequest) {
      return { available: true }
    },
  }
}

const stubDb = {} as AnyDrizzleDb

describe("OwnedBookingHandlerRegistry", () => {
  it("registers and resolves handlers by entity_module", () => {
    const reg = createOwnedBookingHandlerRegistry()
    const products = stubHandler("products")
    reg.register(products)

    expect(reg.has("products")).toBe(true)
    expect(reg.has("accommodations")).toBe(false)
    expect(reg.resolve("products")).toBe(products)
    expect(reg.resolveOrThrow("products")).toBe(products)
    expect(reg.modules()).toEqual(["products"])
  })

  it("replaces handler when a module re-registers", () => {
    const reg = createOwnedBookingHandlerRegistry()
    const a = stubHandler("products")
    const b = stubHandler("products")
    reg.register(a)
    reg.register(b)
    expect(reg.resolveOrThrow("products")).toBe(b)
    expect(reg.modules()).toHaveLength(1)
  })

  it("throws NoOwnedHandlerRegisteredError when missing", () => {
    const reg = createOwnedBookingHandlerRegistry()
    expect(() => reg.resolveOrThrow("accommodations")).toThrow(NoOwnedHandlerRegisteredError)
    expect(reg.resolve("accommodations")).toBeUndefined()
  })

  it("dispatches computeQuote through resolved handler", async () => {
    const reg = createOwnedBookingHandlerRegistry()
    const captured: ComputeQuoteRequest[] = []
    reg.register({
      entityModule: "products",
      async computeQuote(_ctx, req) {
        captured.push(req)
        return { available: true, pricing: undefined }
      },
    })

    const handler = reg.resolveOrThrow("products")
    const result = await handler.computeQuote(
      { db: stubDb, adapterContext: { connection_id: "test" } },
      {
        entityModule: "products",
        entityId: "prod_1",
        scope: { locale: "en-GB", audience: "staff", market: "default" },
      },
    )
    expect(result.available).toBe(true)
    expect(captured[0]?.entityId).toBe("prod_1")
  })
})
