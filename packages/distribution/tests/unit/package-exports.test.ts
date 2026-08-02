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
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as PackageJson

describe("@voyant-travel/distribution package exports", () => {
  it("publishes the graph subscriber runtime subpath", () => {
    expect(packageJson.exports["./channel-push-subscribers"]).toBe(
      "./src/channel-push/subscriber-runtime.ts",
    )
    expect(packageJson.publishConfig.exports["./channel-push-subscribers"]).toEqual({
      types: "./dist/channel-push/subscriber-runtime.d.ts",
      import: "./dist/channel-push/subscriber-runtime.js",
      default: "./dist/channel-push/subscriber-runtime.js",
    })
  })

  it("publishes the publication intent worker subpaths", () => {
    expect(packageJson.exports["./publication-intent-worker"]).toBe(
      "./src/publication-intent-worker.ts",
    )
    expect(packageJson.exports["./publication-intent-subscribers"]).toBe(
      "./src/publication-intent-subscribers.ts",
    )
    expect(packageJson.publishConfig.exports["./publication-intent-worker"]).toEqual({
      types: "./dist/publication-intent-worker.d.ts",
      import: "./dist/publication-intent-worker.js",
      default: "./dist/publication-intent-worker.js",
    })
    expect(packageJson.publishConfig.exports["./publication-intent-subscribers"]).toEqual({
      types: "./dist/publication-intent-subscribers.d.ts",
      import: "./dist/publication-intent-subscribers.js",
      default: "./dist/publication-intent-subscribers.js",
    })
    expect(packageJson.exports["./publication-intent-runtime-port"]).toBe(
      "./src/publication-intent-runtime-port.ts",
    )
    expect(packageJson.publishConfig.exports["./publication-intent-runtime-port"]).toEqual({
      types: "./dist/publication-intent-runtime-port.d.ts",
      import: "./dist/publication-intent-runtime-port.js",
      default: "./dist/publication-intent-runtime-port.js",
    })
  })

  it("publishes the admitted Distribution setup migrations", () => {
    expect(packageJson.exports["./setup/publication-catalog-backfill"]).toBe(
      "./src/publication-catalog-backfill-setup.ts",
    )
    expect(packageJson.publishConfig.exports["./setup/publication-catalog-backfill"]).toEqual({
      types: "./dist/publication-catalog-backfill-setup.d.ts",
      import: "./dist/publication-catalog-backfill-setup.js",
      default: "./dist/publication-catalog-backfill-setup.js",
    })
    expect(packageJson.exports["./setup/storefront-channel-bindings"]).toBe(
      "./src/storefront-channel-binding-setup.ts",
    )
    expect(packageJson.publishConfig.exports["./setup/storefront-channel-bindings"]).toEqual({
      types: "./dist/storefront-channel-binding-setup.d.ts",
      import: "./dist/storefront-channel-binding-setup.js",
      default: "./dist/storefront-channel-binding-setup.js",
    })
  })
})
