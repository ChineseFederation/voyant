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
  it("states its framework compatibility once, where the graph reads it", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as McpPackageJson

    // The graph evaluates this when it composes the module into a build. It is
    // the only declaration of the supported line.
    expect(packageJson.voyant?.compatibleWith?.framework).toBe(">=0.65.0")

    // A semver peer range would be a second copy of that statement — and this
    // package is the one changesets rewrote to a version npm did not have yet,
    // which broke the release. `workspace:*` is always satisfied inside the
    // workspace, so there is nothing to rewrite. The package is never
    // published, so the range says nothing to a consumer either way.
    expect(packageJson.peerDependencies?.["@voyant-travel/framework"]).toBe("workspace:*")
    expect(packageJson.dependencies?.["@voyant-travel/framework"]).toBeUndefined()
    expect(packageJson.peerDependenciesMeta?.["@voyant-travel/framework"]).toBeUndefined()
  })
})
