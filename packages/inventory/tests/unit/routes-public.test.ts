import { beforeEach, describe, expect, it, vi } from "vitest"

// The route handlers are wired through publicProductsService; we mock it so
// the tests exercise query parsing (clamping, includeContent) and response
// headers without a database.
vi.mock("../../src/service-public.js", () => ({
  publicProductsService: {
    listCatalogProducts: vi.fn(),
    getCatalogProductById: vi.fn(),
    getCatalogProductBySlug: vi.fn(),
    getCatalogProductBrochure: vi.fn(),
    listCatalogCategories: vi.fn(),
    listCatalogTags: vi.fn(),
    listCatalogDestinations: vi.fn(),
  },
}))

// Import after mock so the routes use the mocked module.
import { publicProductRoutes } from "../../src/routes-public.js"
import { publicProductsService } from "../../src/service-public.js"

const mockedService = vi.mocked(publicProductsService)

const PUBLIC_CACHE_CONTROL = "public, s-maxage=900, stale-while-revalidate=3600"

function emptyList(limit: number, offset = 0) {
  return { data: [], total: 0, limit, offset }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedService.listCatalogProducts.mockImplementation(async (_db, query) =>
    emptyList(query.limit, query.offset),
  )
  mockedService.listCatalogCategories.mockImplementation(async (_db, query) =>
    emptyList(query.limit, query.offset),
  )
  mockedService.listCatalogTags.mockImplementation(async (_db, query) =>
    emptyList(query.limit, query.offset),
  )
  mockedService.listCatalogDestinations.mockImplementation(async (_db, query) =>
    emptyList(query.limit, query.offset),
  )
})

describe("GET /v1/public/products — pagination clamping", () => {
  it("defaults the limit to 20", async () => {
    const res = await publicProductRoutes.request("/")

    expect(res.status).toBe(200)
    expect(mockedService.listCatalogProducts.mock.calls[0]?.[1]?.limit).toBe(20)
  })

  it("clamps an oversized limit to the 100 hard max instead of erroring", async () => {
    const res = await publicProductRoutes.request("/?limit=5000")

    expect(res.status).toBe(200)
    expect(mockedService.listCatalogProducts.mock.calls[0]?.[1]?.limit).toBe(100)
  })

  it("clamps zero / negative limits up to 1", async () => {
    const res = await publicProductRoutes.request("/?limit=0")

    expect(res.status).toBe(200)
    expect(mockedService.listCatalogProducts.mock.calls[0]?.[1]?.limit).toBe(1)
  })

  it("falls back to the default for malformed limits", async () => {
    const res = await publicProductRoutes.request("/?limit=abc")

    expect(res.status).toBe(200)
    expect(mockedService.listCatalogProducts.mock.calls[0]?.[1]?.limit).toBe(20)
  })

  it("clamps the taxonomy list endpoints to the hard max too", async () => {
    await publicProductRoutes.request("/categories?limit=9999")
    await publicProductRoutes.request("/tags?limit=9999")
    await publicProductRoutes.request("/destinations?limit=9999")

    expect(mockedService.listCatalogCategories.mock.calls[0]?.[1]?.limit).toBe(100)
    expect(mockedService.listCatalogTags.mock.calls[0]?.[1]?.limit).toBe(100)
    expect(mockedService.listCatalogDestinations.mock.calls[0]?.[1]?.limit).toBe(100)
  })
})

describe("GET /v1/public/products — includeContent opt-in", () => {
  it("requests the trimmed (no richtext) payload by default", async () => {
    await publicProductRoutes.request("/")

    const query = mockedService.listCatalogProducts.mock.calls[0]?.[1]
    expect(query?.includeContent).not.toBe(true)
  })

  it("passes includeContent=true through to the service", async () => {
    await publicProductRoutes.request("/?includeContent=true")

    expect(mockedService.listCatalogProducts.mock.calls[0]?.[1]?.includeContent).toBe(true)
  })
})

describe("public catalog GET endpoints — cache headers", () => {
  it("sets the shared cache header on the product list", async () => {
    const res = await publicProductRoutes.request("/")

    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CACHE_CONTROL)
  })

  it("sets the shared cache header on the product detail", async () => {
    mockedService.getCatalogProductById.mockResolvedValueOnce({
      id: "prod_01j00000000000000000000000",
    } as never)

    const res = await publicProductRoutes.request("/prod_01j00000000000000000000000")

    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CACHE_CONTROL)
  })

  it("sets the shared cache header on categories, tags and destinations", async () => {
    for (const path of ["/categories", "/tags", "/destinations"]) {
      const res = await publicProductRoutes.request(path)

      expect(res.status).toBe(200)
      expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CACHE_CONTROL)
    }
  })

  it("does not set the cache header on 404 responses", async () => {
    mockedService.getCatalogProductById.mockResolvedValueOnce(null)

    const res = await publicProductRoutes.request("/prod_missing")

    expect(res.status).toBe(404)
    expect(res.headers.get("Cache-Control")).toBeNull()
  })
})
