import { describe, expect, test, vi } from "vitest"

import { fetchCatalogIndexDocument } from "./catalog-offers-client.js"

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function searchResponse(hits: Array<{ id: string; fields: Record<string, unknown> }>) {
  return {
    vertical: "products",
    mode: "keyword" as const,
    total: hits.length,
    hits: hits.map((hit) => ({
      id: hit.id,
      score: 1,
      document: { id: hit.id, fields: hit.fields },
    })),
  }
}

/**
 * The URL-addressable detail pages are entered by id, so they have no result
 * row to carry the index projection — and everything the detail body renders
 * off `hit.document.fields` (price, offers, status, the Attributes tab) lives
 * only in the index.
 */
describe("fetchCatalogIndexDocument", () => {
  test("reads the document by id through an eq filter on the search route", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () =>
      ok(
        searchResponse([{ id: "prod_1", fields: { name: "Food crawl", sellAmountCents: 11500 } }]),
      ),
    )

    const doc = await fetchCatalogIndexDocument(
      { baseUrl: "https://operator.example/api", fetcher },
      { vertical: "products", id: "prod_1" },
    )

    expect(doc?.document.fields.sellAmountCents).toBe(11500)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe("https://operator.example/api/v1/admin/catalog/search")
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      vertical: "products",
      filters: [{ kind: "eq", field: "id", value: "prod_1" }],
      pagination: { limit: 1 },
    })
  })

  test("switches to the public surface when asked", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => ok(searchResponse([])))

    await fetchCatalogIndexDocument(
      { baseUrl: "/api", fetcher, surface: "public" },
      { vertical: "cruises", id: "crus_1" },
    )

    expect(fetcher.mock.calls[0]![0]).toBe("/api/v1/public/catalog/search")
  })

  test("resolves null when the id is not indexed", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => ok(searchResponse([])))

    await expect(
      fetchCatalogIndexDocument(
        { baseUrl: "/api", fetcher },
        { vertical: "products", id: "prod_1" },
      ),
    ).resolves.toBeNull()
  })

  test("ignores a hit the search route returned for some other id", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () =>
      ok(searchResponse([{ id: "prod_other", fields: { name: "Wrong record" } }])),
    )

    await expect(
      fetchCatalogIndexDocument(
        { baseUrl: "/api", fetcher },
        { vertical: "products", id: "prod_1" },
      ),
    ).resolves.toBeNull()
  })
})
