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

describe("@voyant-travel/catalog package exports", () => {
  it("publishes Node index reconciliation operations", () => {
    expect(packageJson.exports["./indexer/reconciliation-node"]).toBe(
      "./src/indexer/reconciliation-node.ts",
    )
    expect(packageJson.publishConfig.exports["./indexer/reconciliation-node"]).toEqual({
      types: "./dist/indexer/reconciliation-node.d.ts",
      import: "./dist/indexer/reconciliation-node.js",
      default: "./dist/indexer/reconciliation-node.js",
    })
  })

  it("publishes package-owned API graph runtimes", () => {
    expect(packageJson.exports["./graph-runtime"]).toBe("./src/graph-runtime.ts")
    expect(packageJson.publishConfig.exports["./graph-runtime"]).toEqual({
      types: "./dist/graph-runtime.d.ts",
      import: "./dist/graph-runtime.js",
      default: "./dist/graph-runtime.js",
    })
  })

  it("publishes the import-cheap content runtime port", () => {
    expect(packageJson.exports["./runtime-port"]).toBe("./src/content-runtime-port.ts")
    expect(packageJson.publishConfig.exports["./runtime-port"]).toEqual({
      types: "./dist/content-runtime-port.d.ts",
      import: "./dist/content-runtime-port.js",
      default: "./dist/content-runtime-port.js",
    })
  })

  it("publishes the projection subscriber runtime contract", () => {
    expect(packageJson.exports["./projection-runtime"]).toBe("./src/projection-runtime.ts")
    expect(packageJson.publishConfig.exports["./projection-runtime"]).toEqual({
      types: "./dist/projection-runtime.d.ts",
      import: "./dist/projection-runtime.js",
      default: "./dist/projection-runtime.js",
    })
    expect(packageJson.exports["./reindex-job"]).toBe("./src/reindex-job.ts")
    expect(packageJson.publishConfig.exports["./reindex-job"]).toEqual({
      types: "./dist/reindex-job.d.ts",
      import: "./dist/reindex-job.js",
      default: "./dist/reindex-job.js",
    })
  })

  it("publishes the index subscriber graph runtimes", () => {
    expect(packageJson.exports["./index-subscribers"]).toBe("./src/index-subscriber-runtime.ts")
    expect(packageJson.publishConfig.exports["./index-subscribers"]).toEqual({
      types: "./dist/index-subscriber-runtime.d.ts",
      import: "./dist/index-subscriber-runtime.js",
      default: "./dist/index-subscriber-runtime.js",
    })
  })

  it("publishes the booking snapshot subscriber graph runtime", () => {
    expect(packageJson.exports["./booking-snapshot-subscriber"]).toBe(
      "./src/booking-snapshot-subscriber-runtime.ts",
    )
    expect(packageJson.publishConfig.exports["./booking-snapshot-subscriber"]).toEqual({
      types: "./dist/booking-snapshot-subscriber-runtime.d.ts",
      import: "./dist/booking-snapshot-subscriber-runtime.js",
      default: "./dist/booking-snapshot-subscriber-runtime.js",
    })
    expect(packageJson.exports["./booking-session-created-analytics-subscriber"]).toBe(
      "./src/booking-session-created-analytics-subscriber.ts",
    )
    expect(
      packageJson.publishConfig.exports["./booking-session-created-analytics-subscriber"],
    ).toEqual({
      types: "./dist/booking-session-created-analytics-subscriber.d.ts",
      import: "./dist/booking-session-created-analytics-subscriber.js",
      default: "./dist/booking-session-created-analytics-subscriber.js",
    })
  })
})
