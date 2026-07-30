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

    // Spans the published 0.65 line, the 0.66 a release publishes, and the
    // projected 1.x. The span matters at release time: changesets rewrites this
    // peer range when the bumped framework version falls outside it, and a bare
    // caret on an as-yet-unpublished version makes `pnpm install
    // --frozen-lockfile` unresolvable before the publish step runs. Keeping the
    // bumped version inside the range is what lets
    // `onlyUpdatePeerDependentsWhenOutOfRange` leave it alone.
    expect(frameworkRange).toBe(">=0.65.0 <2.0.0")
    expect(packageJson.voyant?.compatibleWith?.framework).toBe(frameworkRange)
    expect(packageJson.dependencies?.["@voyant-travel/framework"]).toBeUndefined()
    expect(packageJson.peerDependenciesMeta?.["@voyant-travel/framework"]).toBeUndefined()
  })
})
