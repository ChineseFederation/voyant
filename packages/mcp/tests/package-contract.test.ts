import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

interface McpPackageJson {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, unknown>
  voyant?: {
    compatibleWith?: {
      framework?: string
    }
  }
}

describe("@voyant-travel/mcp package contract", () => {
  it("requires the same framework line that its graph adapter imports", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as McpPackageJson
    const frameworkRange = packageJson.peerDependencies?.["@voyant-travel/framework"]

    expect(frameworkRange).toBe("^0.65.0 || ^1.0.0")
    expect(packageJson.voyant?.compatibleWith?.framework).toBe(frameworkRange)
    expect(packageJson.dependencies?.["@voyant-travel/framework"]).toBeUndefined()
    expect(packageJson.peerDependenciesMeta?.["@voyant-travel/framework"]).toBeUndefined()
  })
})
