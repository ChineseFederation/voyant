import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CONTRACT_DOCUMENT_ROUTE_PATHS,
  type ContractDocumentRoutesOptions,
  createContractDocumentApiModule,
  createContractDocumentRoutes,
} from "./contract-document-routes.js"

function stubOptions(
  over: Partial<ContractDocumentRoutesOptions> = {},
): ContractDocumentRoutesOptions {
  return {
    resolveStorage: vi.fn(() => ({ get: vi.fn(async () => null) })),
    guessMimeType: (key: string) => {
      if (key.endsWith(".pdf")) return "application/pdf"
      if (key.endsWith(".svg")) return "image/svg+xml"
      return "application/octet-stream"
    },
    ...over,
  }
}

function mount(options: ContractDocumentRoutesOptions) {
  const app = new Hono<{ Variables: { db: unknown; eventBus?: unknown } }>()
  app.use("*", async (c, next) => {
    c.set("db", {})
    await next()
  })
  return app.route("/", createContractDocumentRoutes(options))
}

describe("contract document routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exposes only the private document stream matcher", () => {
    expect(CONTRACT_DOCUMENT_ROUTE_PATHS).toEqual(["/v1/admin/documents/files/*"])
  })

  it("describes the package-owned lazy route module", () => {
    const module = createContractDocumentApiModule(stubOptions())

    expect(module.module.name).toBe("contract-document")
    expect(module.lazyRoutes?.paths).toBe(CONTRACT_DOCUMENT_ROUTE_PATHS)
    expect(module.lazyRoutes?.load).toBeTypeOf("function")
  })

  it("does not expose booking document generation or preview", async () => {
    const app = mount(stubOptions())

    for (const path of [
      "/v1/admin/bookings/bk_123/generate-contract",
      "/v1/admin/bookings/bk_123/contract-preview",
    ]) {
      expect((await app.request(path, { method: "POST" })).status).toBe(404)
    }
  })

  it("documents/files returns 503 when storage is not configured", async () => {
    const app = mount(stubOptions({ resolveStorage: () => null }))

    const res = await app.request("/v1/admin/documents/files/contracts/example.pdf")

    expect(res.status).toBe(503)
  })

  it("documents/files returns 404 when storage has no object", async () => {
    const get = vi.fn(async () => null)
    const app = mount(stubOptions({ resolveStorage: () => ({ get }) }))

    const res = await app.request("/v1/admin/documents/files/contracts/missing.pdf")

    expect(res.status).toBe(404)
    expect(get).toHaveBeenCalledWith("contracts/missing.pdf")
  })

  it("documents/files streams bytes with safe headers when present", async () => {
    const get = vi.fn(async () => new TextEncoder().encode("pdf").buffer)
    const app = mount(stubOptions({ resolveStorage: () => ({ get }) }))

    const res = await app.request("/v1/admin/documents/files/contracts/example.pdf")

    expect(res.status).toBe(200)
    expect(get).toHaveBeenCalledWith("contracts/example.pdf")
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="example.pdf"')
    await expect(res.text()).resolves.toBe("pdf")
  })

  it("forces scriptable document content types to octet-stream", async () => {
    const get = vi.fn(async () => new TextEncoder().encode("<svg />").buffer)
    const app = mount(stubOptions({ resolveStorage: () => ({ get }) }))

    const res = await app.request("/v1/admin/documents/files/contracts/evil.svg")

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/octet-stream")
  })

  it("rejects malformed encoded document keys", async () => {
    const get = vi.fn(async () => new TextEncoder().encode("secret").buffer)
    const app = mount(stubOptions({ resolveStorage: () => ({ get }) }))

    const res = await app.request("/v1/admin/documents/files/contracts/%2Fsecret.pdf")

    expect(res.status).toBe(400)
    expect(get).not.toHaveBeenCalled()
  })
})
