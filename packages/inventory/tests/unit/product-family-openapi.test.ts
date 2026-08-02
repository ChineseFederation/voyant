import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const admin = readFileSync(new URL("../../openapi/admin/products.json", import.meta.url), "utf8")
const authoring = readFileSync(
  new URL("../../openapi/admin/inventory-authoring.json", import.meta.url),
  "utf8",
)
const storefront = readFileSync(
  new URL("../../openapi/storefront/products.json", import.meta.url),
  "utf8",
)

describe("product family OpenAPI artifacts", () => {
  it.each([
    ["admin products", admin],
    ["inventory authoring", authoring],
  ])("publishes classification fields in %s", (_name, document) => {
    expect(document).toContain('"productSubtypeCode"')
    expect(document).toContain('"durationMinutes"')
  })

  it("documents immutable family codes on update", () => {
    const parsed = JSON.parse(admin) as {
      paths: Record<string, { patch?: { requestBody?: unknown } }>
    }
    const update = parsed.paths["/v1/admin/products/product-types/{typeId}"]?.patch
    expect(JSON.stringify(update?.requestBody)).not.toContain('"code"')
  })

  it.each([
    ["admin", admin, "admin"],
    ["authoring", authoring, "admin"],
    ["storefront", storefront, "storefront"],
  ])("preserves composition metadata in the %s document", (_name, source, surface) => {
    const parsed = JSON.parse(source) as {
      paths: Record<
        string,
        Record<
          string,
          {
            operationId?: string
            summary?: string
            tags?: string[]
            "x-voyant-module"?: string
            "x-voyant-surface"?: string
          }
        >
      >
    }

    const operations = Object.values(parsed.paths).flatMap((path) => Object.values(path))
    expect(operations.length).toBeGreaterThan(0)
    for (const operation of operations) {
      expect(operation.operationId).toBeTruthy()
      expect(operation.summary).toBeTruthy()
      expect(operation.tags).toContain("products")
      expect(operation["x-voyant-module"]).toBe("products")
      expect(operation["x-voyant-surface"]).toBe(surface)
    }
  })
})
