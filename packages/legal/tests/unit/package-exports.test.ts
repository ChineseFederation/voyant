import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

interface PackageJson {
  exports: Record<string, string>
  publishConfig: {
    exports: Record<string, { types: string; import: string; default: string }>
  }
}

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as PackageJson

describe("@voyant-travel/legal package exports", () => {
  it("publishes the package-owned Tool runtime", () => {
    expect(packageJson.exports["./tools"]).toBe("./src/mcp-runtime.ts")
    expect(packageJson.publishConfig.exports["./tools"]).toEqual({
      types: "./dist/mcp-runtime.d.ts",
      import: "./dist/mcp-runtime.js",
      default: "./dist/mcp-runtime.js",
    })
  })

  it("publishes the booking-confirmed durable subscriber", () => {
    expect(packageJson.exports["./booking-contract-confirmed-subscriber"]).toBe(
      "./src/booking-contract-confirmed-subscriber.ts",
    )
    expect(packageJson.publishConfig.exports["./booking-contract-confirmed-subscriber"]).toEqual({
      types: "./dist/booking-contract-confirmed-subscriber.d.ts",
      import: "./dist/booking-contract-confirmed-subscriber.js",
      default: "./dist/booking-contract-confirmed-subscriber.js",
    })
  })

  it("does not publish retired document-generation runtime subpaths", () => {
    for (const subpath of [
      "./booking-contract-subscriber",
      "./contract-document",
      "./contract-variables",
      "./runtime",
    ]) {
      expect(packageJson.exports).not.toHaveProperty(subpath)
      expect(packageJson.publishConfig.exports).not.toHaveProperty(subpath)
    }
  })
})
