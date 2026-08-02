import { describe, expect, it, vi } from "vitest"

import { createProductDetailRestApi } from "./product-detail-api.js"

describe("product detail REST API", () => {
  it("uses structured issue guidance instead of an internal error code", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "product_not_ready_to_publish",
            issues: [
              {
                code: "no_future_open_departure",
                message:
                  "Scheduled products need at least one future open departure before they can be published.",
                fix: "Create a future availability slot with status 'open', then publish the product again.",
              },
            ],
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    )
    const api = createProductDetailRestApi({ baseUrl: "/api", fetcher })

    await expect(api.patch("/v1/admin/products/product_1", {})).rejects.toThrow(
      "Scheduled products need at least one future open departure before they can be published. Create a future availability slot with status 'open', then publish the product again.",
    )
  })
})
