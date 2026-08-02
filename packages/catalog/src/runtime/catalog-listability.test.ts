/**
 * catalog-listability — owned-product storefront listability predicate.
 *
 * Publication is Distribution-owned and channel-scoped. The catalog indexer may
 * still materialize unchannelled customer slices for compatibility, but they no
 * longer authorize product visibility.
 */

import { describe, expect, it, vi } from "vitest"
import { isOwnedProductStorefrontListable } from "./catalog-listability.js"

describe("isOwnedProductStorefrontListable", () => {
  it("default-denies unchannelled customer slices", async () => {
    const isEffectivelyPublished = vi.fn(async () => true)

    const listable = await isOwnedProductStorefrontListable({
      audience: "customer",
      isEffectivelyPublished,
    })

    expect(listable).toBe(false)
    expect(isEffectivelyPublished).not.toHaveBeenCalled()
  })

  it("requires effective publication for channel-scoped customer slices", async () => {
    const published = await isOwnedProductStorefrontListable({
      audience: "customer",
      channel: "chan_website",
      isEffectivelyPublished: async () => true,
    })
    const denied = await isOwnedProductStorefrontListable({
      audience: "customer",
      channel: "chan_b2b",
      isEffectivelyPublished: async () => false,
    })

    expect(published).toBe(true)
    expect(denied).toBe(false)
  })

  it("requires effective publication for external (partner) slices", async () => {
    const published = await isOwnedProductStorefrontListable({
      audience: "partner",
      channel: "chan_partner",
      isEffectivelyPublished: async () => true,
    })
    const denied = await isOwnedProductStorefrontListable({
      audience: "partner",
      channel: "chan_partner",
      isEffectivelyPublished: async () => false,
    })

    expect(published).toBe(true)
    expect(denied).toBe(false)
  })
})
