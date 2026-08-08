import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

interface PublishedExport {
  types: string
  import: string
  default: string
}

interface PackageJson {
  exports: Record<string, string>
  publishConfig: {
    exports: Record<string, PublishedExport>
  }
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson

describe("@voyant-travel/trips package exports", () => {
  it("publishes the Storefront Trip selections provider subpath", () => {
    expect(packageJson.exports["./storefront-trip-offer-resolver-port"]).toBe(
      "./src/storefront-trip-offer-resolver-port.ts",
    )
    expect(packageJson.publishConfig.exports["./storefront-trip-offer-resolver-port"]).toEqual({
      types: "./dist/storefront-trip-offer-resolver-port.d.ts",
      import: "./dist/storefront-trip-offer-resolver-port.js",
      default: "./dist/storefront-trip-offer-resolver-port.js",
    })
    expect(packageJson.exports["./storefront-trip-selections-runtime"]).toBe(
      "./src/storefront-trip-selections-runtime.ts",
    )
    expect(packageJson.publishConfig.exports["./storefront-trip-selections-runtime"]).toEqual({
      types: "./dist/storefront-trip-selections-runtime.d.ts",
      import: "./dist/storefront-trip-selections-runtime.js",
      default: "./dist/storefront-trip-selections-runtime.js",
    })
  })

  it("publishes the payment subscriber runtime subpath", () => {
    expect(packageJson.exports["./payment-subscribers"]).toBe("./src/payment-subscriber-runtime.ts")
    expect(packageJson.publishConfig.exports["./payment-subscribers"]).toEqual({
      types: "./dist/payment-subscriber-runtime.d.ts",
      import: "./dist/payment-subscriber-runtime.js",
      default: "./dist/payment-subscriber-runtime.js",
    })
  })

  it("publishes the fixed durable sourcing job subpath", () => {
    expect(packageJson.exports["./sourcing-job"]).toBe("./src/sourcing-job.ts")
    expect(packageJson.publishConfig.exports["./sourcing-job"]).toEqual({
      types: "./dist/sourcing-job.d.ts",
      import: "./dist/sourcing-job.js",
      default: "./dist/sourcing-job.js",
    })
  })

  it("publishes the durable Trip action conformance and worker subpaths", () => {
    expect(packageJson.exports["./durable-action-runtime-port"]).toBe(
      "./src/durable-action-runtime-port.ts",
    )
    expect(packageJson.publishConfig.exports["./durable-action-runtime-port"]).toEqual({
      types: "./dist/durable-action-runtime-port.d.ts",
      import: "./dist/durable-action-runtime-port.js",
      default: "./dist/durable-action-runtime-port.js",
    })
    expect(packageJson.exports["./action-job"]).toBe("./src/action-job.ts")
    expect(packageJson.publishConfig.exports["./action-job"]).toEqual({
      types: "./dist/action-job.d.ts",
      import: "./dist/action-job.js",
      default: "./dist/action-job.js",
    })
  })
})
