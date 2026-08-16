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

describe("@voyant-travel/public-api package exports", () => {
  it("publishes the dependency-cheap shopping runtime port", () => {
    expect(packageJson.exports["./shopping/runtime-port"]).toBe("./src/shopping/runtime-port.ts")
    expect(packageJson.publishConfig.exports["./shopping/runtime-port"]).toEqual({
      types: "./dist/shopping/runtime-port.d.ts",
      import: "./dist/shopping/runtime-port.js",
      default: "./dist/shopping/runtime-port.js",
    })
  })
})
