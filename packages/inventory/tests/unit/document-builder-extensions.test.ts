import type { IndexerSlice, ReferencedSubjectResolutionInput } from "@voyant-travel/catalog"
import { describe, expect, it, vi } from "vitest"

import { productDestinationsCatalogPolicy } from "../../src/catalog-policy-destinations.js"
import {
  createProductDocumentBuilder,
  createProductStorefrontCardProjectionExtension,
  createProductsRegistry,
  type ProductProjectionExtension,
} from "../../src/service-catalog-plane.js"

const sampleRow = {
  id: "prod_abc",
  name: "Bali Wellness Retreat",
  status: "active",
  description: "Source description",
  bookingMode: "date",
  capacityMode: "limited",
  timezone: "Asia/Jakarta",
  visibility: "public",
  activated: true,
  reservationTimeoutMinutes: 30,
  sellCurrency: "EUR",
  sellAmountCents: 250000,
  costAmountCents: 180000,
  marginPercent: 28,
  facilityId: null,
  startDate: "2026-05-01",
  endDate: "2026-12-31",
  pax: 12,
  productTypeId: "ptyp_wellness",
  tags: ["wellness", "yoga"],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-04-01"),
}

/**
 * Stub drizzle that satisfies the chained `select().from().where().limit()`
 * invocation without a real DB. Returns `rows` as the awaited result.
 */
function stubDb<T>(rows: T[]) {
  const tail = {
    limit: vi.fn().mockResolvedValue(rows),
  }
  const where = { where: vi.fn().mockReturnValue(tail) }
  const from = { from: vi.fn().mockReturnValue(where) }
  return {
    // biome-ignore lint/suspicious/noExplicitAny: stub for drizzle chained API -- owner: products; existing suppression is intentional pending typed cleanup.
    select: vi.fn().mockReturnValue(from) as any,
  }
}

function stubQueuedDb(rowSets: unknown[][]) {
  const queue = [...rowSets]
  const nextRows = async () => queue.shift() ?? []
  const result = () => {
    const chain = {
      limit: vi.fn(nextRows),
      orderBy: vi.fn(nextRows),
    }
    return chain
  }
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(result),
      })),
    })),
  }
}

function stubProductAndPropertyDb(productRow: unknown, propertyRow: unknown) {
  const queue = [[productRow], propertyRow ? [propertyRow] : []]
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const rows = queue.shift() ?? []
        const tail = {
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
          })),
        }
        return tail
      }),
    })),
  }
}

const customerSlice: IndexerSlice = {
  vertical: "products",
  locale: "en-GB",
  audience: "customer",
  market: "default",
}

const partnerSlice: IndexerSlice = {
  ...customerSlice,
  audience: "partner",
}

const staffAdminSlice: IndexerSlice = {
  ...customerSlice,
  audience: "staff-admin",
}

describe("createProductDocumentBuilder — projection extensions", () => {
  it("returns the base document unchanged when no extensions are provided", async () => {
    const db = stubDb([sampleRow])
    // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
    const build = createProductDocumentBuilder(db as any, { sellerOperatorId: "op_xyz" })
    const doc = await build("prod_abc", customerSlice)
    expect(doc).not.toBeNull()
    expect(doc?.id).toBe("prod_abc")
    expect(doc?.fields).toHaveProperty("name", "Bali Wellness Retreat")
    expect(doc?.fields).not.toHaveProperty("regions")
  })

  it("returns null when the product no longer exists", async () => {
    const db = stubDb<typeof sampleRow>([])
    // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
    const build = createProductDocumentBuilder(db as any, { sellerOperatorId: "op_xyz" })
    const doc = await build("prod_missing", customerSlice)
    expect(doc).toBeNull()
  })

  it("does not gate customer documents on the deprecated visibility field", async () => {
    const db = stubDb([{ ...sampleRow, visibility: "private" }])
    // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
    const build = createProductDocumentBuilder(db as any, { sellerOperatorId: "op_xyz" })
    const doc = await build("prod_private", customerSlice)
    expect(doc).not.toBeNull()
  })

  it("does not gate public audience documents on the deprecated activated field", async () => {
    const db = stubDb([{ ...sampleRow, activated: false }])
    // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
    const build = createProductDocumentBuilder(db as any, { sellerOperatorId: "op_xyz" })

    await expect(build("prod_inactive", customerSlice)).resolves.not.toBeNull()
    await expect(build("prod_inactive", partnerSlice)).resolves.not.toBeNull()
  })

  it("returns null before running extensions when a public audience predicate rejects the product", async () => {
    const db = stubDb([sampleRow])
    const gate = vi.fn().mockResolvedValue(false)
    const ext: ProductProjectionExtension = {
      name: "test:should-not-run",
      project: vi.fn().mockResolvedValue(new Map<string, unknown>()),
    }
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
      db as any,
      { sellerOperatorId: "op_xyz", extensions: [ext], isPublicAudienceListable: gate },
    )

    const doc = await build("prod_abc", customerSlice)

    expect(doc).toBeNull()
    expect(gate).toHaveBeenCalledWith({ db, product: sampleRow, slice: customerSlice })
    expect(ext.project).not.toHaveBeenCalled()
  })

  it("does not apply the public audience predicate to staff-admin slices", async () => {
    const db = stubDb([sampleRow])
    const gate = vi.fn().mockResolvedValue(false)
    // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
    const build = createProductDocumentBuilder(db as any, {
      sellerOperatorId: "op_xyz",
      isPublicAudienceListable: gate,
    })

    const doc = await build("prod_abc", staffAdminSlice)

    expect(doc).not.toBeNull()
    expect(gate).not.toHaveBeenCalled()
  })

  it("omits deprecated distribution flags from staff-admin slices", async () => {
    const db = stubDb([{ ...sampleRow, visibility: "private" }])
    // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
    const build = createProductDocumentBuilder(db as any, { sellerOperatorId: "op_xyz" })
    const doc = await build("prod_private", staffAdminSlice)
    expect(doc).not.toBeNull()
    expect(doc?.fields).not.toHaveProperty("visibility")
    expect(doc?.fields).not.toHaveProperty("activated")
  })

  it("merges extension projection entries into the document when registry includes them", async () => {
    const db = stubDb([sampleRow])
    const registry = createProductsRegistry(productDestinationsCatalogPolicy)
    const ext: ProductProjectionExtension = {
      name: "test:destinations",
      project: vi.fn().mockResolvedValue(
        new Map<string, unknown>([
          ["regions[]", ["Mediterranean"]],
          ["countries[]", ["Italy"]],
          ["cities[]", ["Rome"]],
          ["destinationSlugs[]", ["italy", "rome"]],
          ["destinationIds[]", ["dest_it", "dest_rm"]],
        ]),
      ),
    }
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
      db as any,
      { sellerOperatorId: "op_xyz", registry, extensions: [ext] },
    )
    const doc = await build("prod_abc", customerSlice)
    expect(doc?.fields).toHaveProperty("regions", ["Mediterranean"])
    expect(doc?.fields).toHaveProperty("countries", ["Italy"])
    expect(doc?.fields).toHaveProperty("cities", ["Rome"])
    expect(doc?.fields).toHaveProperty("destinationSlugs", ["italy", "rome"])
    // List paths drop the `[]` suffix on the indexed field name
    expect(doc?.fields).not.toHaveProperty("regions[]")
    expect(ext.project).toHaveBeenCalledWith(db, "prod_abc", customerSlice)
  })

  it("silently drops extension entries whose paths aren't in the registry", async () => {
    // Default registry does NOT include the destinations policy, so any
    // contributed entries are filtered out by buildIndexerDocument.
    const db = stubDb([sampleRow])
    const ext: ProductProjectionExtension = {
      name: "test:destinations",
      project: async () => new Map<string, unknown>([["regions[]", ["Mediterranean"]]]),
    }
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
      db as any,
      { sellerOperatorId: "op_xyz", extensions: [ext] },
    )
    const doc = await build("prod_abc", customerSlice)
    expect(doc?.fields).not.toHaveProperty("regions")
  })

  it("runs multiple extensions in parallel and merges all entries", async () => {
    const db = stubDb([sampleRow])
    const registry = createProductsRegistry(productDestinationsCatalogPolicy)
    const a: ProductProjectionExtension = {
      name: "test:a",
      project: async () => new Map<string, unknown>([["regions[]", ["Mediterranean"]]]),
    }
    const b: ProductProjectionExtension = {
      name: "test:b",
      project: async () => new Map<string, unknown>([["countries[]", ["Italy"]]]),
    }
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
      db as any,
      { sellerOperatorId: "op_xyz", registry, extensions: [a, b] },
    )
    const doc = await build("prod_abc", customerSlice)
    expect(doc?.fields).toHaveProperty("regions", ["Mediterranean"])
    expect(doc?.fields).toHaveProperty("countries", ["Italy"])
  })

  it("copies effective overlays from an owned property into namespaced product fields", async () => {
    const db = stubProductAndPropertyDb(
      { ...sampleRow, facilityId: "fac_1" },
      {
        id: "prop_1",
        brandName: null,
        groupName: null,
        facilityName: "Source hotel",
        facilityDescription: "Source description",
      },
    )
    const resolveReferencedSubject = vi.fn(async (input: ReferencedSubjectResolutionInput) => ({
      subject: { entityModule: input.entityModule, entityId: input.entityId },
      scope: customerSlice,
      values: new Map<string, unknown>([
        ["name", "Operator hotel name"],
        ["description", "Operator hotel description"],
        ["hero_image_url", "https://cdn.example/hotel.jpg"],
        ["gallery", ["https://cdn.example/room.jpg"]],
      ]),
    }))
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: focused drizzle stub -- owner: products
      db as any,
      { sellerOperatorId: "op_xyz" },
    )

    const doc = await build("prod_abc", customerSlice, { resolveReferencedSubject })

    expect(resolveReferencedSubject).toHaveBeenCalledWith({
      entityModule: "accommodation-properties",
      entityId: "prop_1",
      sourceValues: expect.any(Map),
    })
    expect(doc?.fields).toMatchObject({
      "property.name": "Operator hotel name",
      "property.description": "Operator hotel description",
      "property.heroImageUrl": "https://cdn.example/hotel.jpg",
      "property.gallery": ["https://cdn.example/room.jpg"],
    })
  })

  it("resolves a provider property subject id retained by the product reference", async () => {
    const db = stubProductAndPropertyDb({ ...sampleRow, facilityId: "properties_provider1" }, null)
    const resolveReferencedSubject = vi.fn(async (input: ReferencedSubjectResolutionInput) => ({
      subject: { entityModule: input.entityModule, entityId: input.entityId },
      scope: customerSlice,
      values: new Map<string, unknown>([["name", "Provider hotel overlay"]]),
    }))
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: focused drizzle stub -- owner: products
      db as any,
      { sellerOperatorId: "op_xyz" },
    )

    const doc = await build("prod_abc", customerSlice, { resolveReferencedSubject })

    expect(resolveReferencedSubject).toHaveBeenCalledWith({
      entityModule: "accommodation-properties",
      entityId: "properties_provider1",
    })
    expect(doc?.fields["property.name"]).toBe("Provider hotel overlay")
  })

  it("propagates extension errors instead of producing a partial document", async () => {
    const db = stubDb([sampleRow])
    const registry = createProductsRegistry(productDestinationsCatalogPolicy)
    const failing: ProductProjectionExtension = {
      name: "test:failing",
      project: async () => {
        throw new Error("destination lookup failed")
      },
    }
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
      db as any,
      { sellerOperatorId: "op_xyz", registry, extensions: [failing] },
    )
    await expect(build("prod_abc", customerSlice)).rejects.toThrow("destination lookup failed")
  })

  it("projects storefront-card fields onto customer documents", async () => {
    const db = stubQueuedDb([
      [sampleRow],
      [
        {
          languageTag: "en-GB",
          name: "Localized retreat",
          slug: "localized-retreat",
          shortDescription: "Short card copy",
        },
      ],
      [
        {
          url: "https://cdn.example/cover.jpg",
          mediaType: "image",
          isCover: true,
          isBrochure: false,
          sortOrder: 0,
          createdAt: new Date("2026-01-01"),
        },
      ],
      [
        {
          latitude: 45.76,
          longitude: 21.23,
          sortOrder: 0,
          createdAt: new Date("2026-01-01"),
        },
      ],
      [{ id: "itin_1", isDefault: true }],
      [{ dayNumber: 1 }, { dayNumber: 4 }],
    ])
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
      db as any,
      {
        sellerOperatorId: "op_xyz",
        extensions: [createProductStorefrontCardProjectionExtension()],
      },
    )

    const doc = await build("prod_abc", customerSlice)
    expect(doc?.fields).toMatchObject({
      name: "Localized retreat",
      slug: "localized-retreat",
      shortDescription: "Short card copy",
      primaryMediaUrl: "https://cdn.example/cover.jpg",
      thumbnailUrl: "https://cdn.example/cover.jpg",
      coverMediaUrl: "https://cdn.example/cover.jpg",
      durationDays: 4,
      latitude: 45.76,
      longitude: 21.23,
      startDateEpochDays: 20574,
      endDateEpochDays: 20818,
    })
  })

  it("preserves the base product name when storefront-card translations are missing", async () => {
    const db = stubQueuedDb([[sampleRow], [], [], [], []])
    const build = createProductDocumentBuilder(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle stub -- owner: products; existing suppression is intentional pending typed cleanup.
      db as any,
      {
        sellerOperatorId: "op_xyz",
        extensions: [createProductStorefrontCardProjectionExtension()],
      },
    )

    const doc = await build("prod_abc", customerSlice)
    expect(doc?.fields.name).toBe("Bali Wellness Retreat")
    expect(doc?.fields.slug).toBeNull()
  })
})
