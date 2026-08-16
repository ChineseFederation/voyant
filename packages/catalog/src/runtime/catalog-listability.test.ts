/**
 * catalog-listability — owned-product storefront listability predicate.
 *
 * Publication is Distribution-owned and channel-scoped. The catalog indexer may
 * still materialize unchannelled customer slices for compatibility, but they no
 * longer authorize product visibility.
 */

import { describe, expect, it, vi } from "vitest"
import {
  isOwnedProductPublicApiListable,
  isSourcedEntryPublicApiListable,
} from "./catalog-listability.js"

describe("isOwnedProductPublicApiListable", () => {
  it("default-denies unchannelled customer slices", async () => {
    const isEffectivelyPublished = vi.fn(async () => true)

    const listable = await isOwnedProductPublicApiListable({
      audience: "customer",
      isEffectivelyPublished,
    })

    expect(listable).toBe(false)
    expect(isEffectivelyPublished).not.toHaveBeenCalled()
  })

  it("requires effective publication for channel-scoped customer slices", async () => {
    const published = await isOwnedProductPublicApiListable({
      audience: "customer",
      channel: "chan_website",
      isEffectivelyPublished: async () => true,
    })
    const denied = await isOwnedProductPublicApiListable({
      audience: "customer",
      channel: "chan_b2b",
      isEffectivelyPublished: async () => false,
    })

    expect(published).toBe(true)
    expect(denied).toBe(false)
  })

  it("requires effective publication for external (partner) slices", async () => {
    const published = await isOwnedProductPublicApiListable({
      audience: "partner",
      channel: "chan_partner",
      isEffectivelyPublished: async () => true,
    })
    const denied = await isOwnedProductPublicApiListable({
      audience: "partner",
      channel: "chan_partner",
      isEffectivelyPublished: async () => false,
    })

    expect(published).toBe(true)
    expect(denied).toBe(false)
  })
})

describe("isSourcedEntryPublicApiListable", () => {
  it("leaves staff slices ungated so the operator can browse what it may publish", async () => {
    const isEffectivelyPublished = vi.fn(async () => false)

    const listable = await isSourcedEntryPublicApiListable({
      audience: "staff",
      channel: "chan_website",
      isEffectivelyPublished,
    })

    expect(listable).toBe(true)
    expect(isEffectivelyPublished).not.toHaveBeenCalled()
  })

  it("default-denies unchannelled customer slices", async () => {
    const isEffectivelyPublished = vi.fn(async () => true)

    const listable = await isSourcedEntryPublicApiListable({
      audience: "customer",
      isEffectivelyPublished,
    })

    expect(listable).toBe(false)
    expect(isEffectivelyPublished).not.toHaveBeenCalled()
  })

  it("requires effective publication for channel-scoped customer slices", async () => {
    const published = await isSourcedEntryPublicApiListable({
      audience: "customer",
      channel: "chan_website",
      isEffectivelyPublished: async () => true,
    })
    const denied = await isSourcedEntryPublicApiListable({
      audience: "customer",
      channel: "chan_website",
      isEffectivelyPublished: async () => false,
    })

    expect(published).toBe(true)
    expect(denied).toBe(false)
  })

  it("gates partner and supplier slices on the same rule as customer slices", async () => {
    for (const audience of ["partner", "supplier"] as const) {
      expect(
        await isSourcedEntryPublicApiListable({
          audience,
          channel: "chan_b2b",
          isEffectivelyPublished: async () => false,
        }),
      ).toBe(false)
    }
  })
})
