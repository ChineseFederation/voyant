import { describe, expect, it } from "vitest"
import {
  productDayServices,
  productDayServiceTranslations,
  productDays,
  productDayTranslations,
  productItineraries,
  productMedia,
  productOptions,
  productOptionTranslations,
  products,
  productTranslations,
} from "../../src/schema.js"
import { buildOwnedProductContent } from "../../src/service-content-owned.js"

describe("buildOwnedProductContent", () => {
  it("localizes itinerary days and day-service labels", async () => {
    const db = fakeDb(
      new Map<unknown, unknown[]>([
        [
          products,
          [
            {
              id: "prod_1",
              name: "Base tour",
              status: "active",
              description: "Base description",
              inclusionsHtml: null,
              exclusionsHtml: null,
              termsHtml: null,
              contractTemplateId: null,
              startDate: null,
              endDate: null,
              sellCurrency: "EUR",
              supplierId: null,
              tags: [],
            },
          ],
        ],
        [productOptions, []],
        [productOptionTranslations, []],
        [productMedia, []],
        [
          productTranslations,
          [
            {
              productId: "prod_1",
              languageTag: "ro-RO",
              name: "Tur localizat",
              shortDescription: "Descriere scurta",
              description: "Descriere localizata",
              inclusionsHtml: null,
              exclusionsHtml: null,
              termsHtml: null,
            },
          ],
        ],
        [
          productItineraries,
          [
            {
              id: "itin_1",
              productId: "prod_1",
              name: "Default",
              isDefault: true,
              sortOrder: 0,
            },
          ],
        ],
        [
          productDays,
          [
            {
              id: "day_1",
              itineraryId: "itin_1",
              dayNumber: 1,
              title: "Base day",
              description: "Base day description",
              location: "Base city",
            },
          ],
        ],
        [
          productDayTranslations,
          [
            {
              dayId: "day_1",
              languageTag: "ro-RO",
              title: "Zi localizata",
              description: "Descriere zi localizata",
              location: "Oras localizat",
            },
          ],
        ],
        [
          productDayServices,
          [
            {
              id: "svc_1",
              dayId: "day_1",
              serviceType: "activity",
              name: "Base activity",
              sortOrder: 0,
            },
          ],
        ],
        [
          productDayServiceTranslations,
          [
            {
              serviceId: "svc_1",
              languageTag: "ro-RO",
              name: "Activitate localizata",
              description: "Descriere serviciu localizata",
              notes: null,
            },
          ],
        ],
      ]),
    )

    const result = await buildOwnedProductContent(db, "prod_1", {
      preferredLocales: ["ro-RO", "en-GB"],
    })

    expect(result?.servedLocale).toBe("ro-RO")
    expect(result?.content.product.name).toBe("Tur localizat")
    expect(result?.content.days).toEqual([
      expect.objectContaining({
        day_number: 1,
        title: "Zi localizata",
        description: "Descriere zi localizata",
        location: "Oras localizat",
        services: ["Activitate localizata"],
      }),
    ])
  })

  it("keeps base day content authoritative for the product default language", async () => {
    const db = fakeDb(
      new Map<unknown, unknown[]>([
        [
          products,
          [
            {
              id: "prod_1",
              name: "Tur de baza",
              status: "active",
              description: "Descriere produs",
              defaultLanguageTag: "ro-ro",
              inclusionsHtml: null,
              exclusionsHtml: null,
              termsHtml: null,
              contractTemplateId: null,
              startDate: null,
              endDate: null,
              sellCurrency: "EUR",
              supplierId: null,
              tags: [],
            },
          ],
        ],
        [productOptions, []],
        [productOptionTranslations, []],
        [productMedia, []],
        [productTranslations, []],
        [
          productItineraries,
          [
            {
              id: "itin_1",
              productId: "prod_1",
              name: "Default",
              isDefault: true,
              sortOrder: 0,
            },
          ],
        ],
        [
          productDays,
          [
            {
              id: "day_1",
              itineraryId: "itin_1",
              dayNumber: 1,
              title: "Titlu romanesc actualizat",
              description: "Descriere romaneasca actualizata",
              location: "Brasov",
            },
          ],
        ],
        [
          productDayTranslations,
          [
            {
              dayId: "day_1",
              // Same BCP-47 locale with request-matching case. This stale row
              // must not outrank the authoritative base day.
              languageTag: "ro-RO",
              title: "Titlu romanesc vechi",
              description: "Descriere romaneasca veche",
              location: "Locatie veche",
            },
            {
              dayId: "day_1",
              languageTag: "en-GB",
              title: "English title",
              description: "English description",
              location: "English location",
            },
          ],
        ],
        [productDayServices, []],
        [productDayServiceTranslations, []],
      ]),
    )

    const romanian = await buildOwnedProductContent(db, "prod_1", {
      preferredLocales: ["ro-RO"],
    })
    expect(romanian?.content.days[0]).toMatchObject({
      title: "Titlu romanesc actualizat",
      description: "Descriere romaneasca actualizata",
      location: "Brasov",
    })

    const english = await buildOwnedProductContent(db, "prod_1", {
      preferredLocales: ["en-GB", "ro-RO"],
    })
    expect(english?.content.days[0]).toMatchObject({
      title: "English title",
      description: "English description",
      location: "English location",
    })
  })

  it("resolves localized SEO fallbacks and an explicit Open Graph image", async () => {
    const db = fakeDb(
      new Map<unknown, unknown[]>([
        [
          products,
          [
            {
              id: "prod_1",
              name: "Base tour",
              status: "active",
              description: "Base description",
              inclusionsHtml: null,
              exclusionsHtml: null,
              termsHtml: null,
              contractTemplateId: null,
              startDate: null,
              endDate: null,
              sellCurrency: "EUR",
              supplierId: null,
              tags: [],
            },
          ],
        ],
        [productOptions, []],
        [productOptionTranslations, []],
        [
          productMedia,
          [
            {
              id: "pmed_cover",
              productId: "prod_1",
              dayId: null,
              mediaType: "image",
              url: "https://example.com/cover.jpg",
              isCover: true,
              isOpenGraph: false,
              isBrochure: false,
              sortOrder: 0,
              createdAt: new Date(0),
              altText: null,
            },
            {
              id: "pmed_og",
              productId: "prod_1",
              dayId: null,
              mediaType: "image",
              url: "https://example.com/social.jpg",
              isCover: false,
              isOpenGraph: true,
              isBrochure: false,
              sortOrder: 1,
              createdAt: new Date(0),
              mimeType: "image/jpeg",
              width: 1200,
              height: 630,
              altText: "Tur montan",
            },
          ],
        ],
        [
          productTranslations,
          [
            {
              productId: "prod_1",
              languageTag: "ro-RO",
              name: "Tur localizat",
              shortDescription: "Descriere scurta",
              description: "Descriere localizata",
              inclusionsHtml: null,
              exclusionsHtml: null,
              termsHtml: null,
              seoTitle: null,
              seoDescription: null,
            },
          ],
        ],
        [productItineraries, []],
      ]),
    )

    const result = await buildOwnedProductContent(db, "prod_1", {
      preferredLocales: ["ro-RO"],
    })

    expect(result?.content.product.seo_title).toBe("Tur localizat")
    expect(result?.content.product.seo_description).toBe("Descriere scurta")
    expect(result?.content.product.open_graph_image_url).toBe("https://example.com/social.jpg")
    expect(result?.content.product.open_graph_image_width).toBe(1200)
    expect(result?.content.product.open_graph_image_height).toBe(630)
    expect(result?.content.product.open_graph_image_type).toBe("image/jpeg")
    expect(result?.content.product.open_graph_image_alt).toBe("Tur montan")
    // A product-level cover is still the hero when one exists.
    expect(result?.content.product.hero_image_url).toBe("https://example.com/cover.jpg")
  })

  it("falls back to a day image for the hero when the product has no product-level image", async () => {
    const db = fakeDb(
      new Map<unknown, unknown[]>([
        [
          products,
          [
            {
              id: "prod_1",
              name: "Food crawl",
              status: "active",
              description: null,
              inclusionsHtml: null,
              exclusionsHtml: null,
              termsHtml: null,
              contractTemplateId: null,
              startDate: null,
              endDate: null,
              sellCurrency: "EUR",
              supplierId: null,
              tags: [],
            },
          ],
        ],
        [productOptions, []],
        [productOptionTranslations, []],
        [
          productMedia,
          [
            {
              id: "pmed_day",
              productId: "prod_1",
              // Attached to an itinerary day, so it is excluded from the
              // product-level image list the cover is picked from.
              dayId: "day_1",
              mediaType: "image",
              url: "https://example.com/day.jpg",
              isCover: false,
              isOpenGraph: false,
              isBrochure: false,
              sortOrder: 0,
              createdAt: new Date(0),
              altText: null,
            },
          ],
        ],
        [productTranslations, []],
        [productItineraries, []],
      ]),
    )

    const result = await buildOwnedProductContent(db, "prod_1", { preferredLocales: ["en"] })

    // The image is already in `content.media`; reporting no hero made the
    // detail page render a placeholder next to it.
    expect(result?.content.product.hero_image_url).toBe("https://example.com/day.jpg")
    expect(result?.content.media.map((m) => m.url)).toContain("https://example.com/day.jpg")
    // Open Graph keeps the stricter rule — a day photo is not a share image.
    expect(result?.content.product.open_graph_image_url).toBeNull()
  })
})

function fakeDb(rowsByTable: Map<unknown, unknown[]>) {
  return {
    select: () => ({
      from: (table: unknown) => selectable(rowsByTable.get(table) ?? []),
    }),
    execute: async () => [],
  } as never
}

function selectable(rows: unknown[]) {
  const chain = {
    where: () => promiseChain(rows),
    orderBy: async () => rows,
    limit: async (limit: number) => rows.slice(0, limit),
    offset: () => chain,
  }
  return chain
}

type QueryPromise = Promise<unknown[]> & {
  orderBy: () => Promise<unknown[]>
  limit: (limit: number) => Promise<unknown[]>
  offset: () => QueryPromise
}

function promiseChain(rows: unknown[]): QueryPromise {
  const promise = Promise.resolve(rows) as QueryPromise
  promise.orderBy = async () => rows
  promise.limit = async (limit: number) => rows.slice(0, limit)
  promise.offset = () => promise
  return promise
}
