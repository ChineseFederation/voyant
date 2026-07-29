import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

vi.mock("./project-resolver.js", () => {
  throw new Error("project resolver implementation loaded eagerly")
})

vi.mock("typescript", () => {
  throw new Error("TypeScript compiler loaded eagerly")
})

describe("framework project import boundary", () => {
  it("keeps authoring exports available without evaluating the resolver implementation", async () => {
    const authoring = await import("./project.js")

    expect(authoring.defineProject({ modules: [] })).toEqual({
      schemaVersion: "voyant.project.v1",
      modules: [],
      extensions: [],
      plugins: [],
      adapters: [],
      providers: [],
    })
    const config = authoring.defineConfig()
    expect(config.modules.map((unit) => unit.id)).toContain("@voyant-travel/bookings#extras")
    expect(config.extensions).toHaveLength(25)
    expect(config.plugins).toEqual([])
    expect(authoring.resolveProject).toBeTypeOf("function")
  })

  it("does not couple the public project boundary to a starter", () => {
    for (const file of ["project.ts", "project-resolver.ts", "deployment-artifacts.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8")
      expect(source).not.toContain("starters/")
      expect(source).not.toContain("starters\\")
    }
  })

  it("keeps TypeScript out of the production framework dependency graph", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

    expect(packageJson.dependencies?.typescript).toBeUndefined()
    expect(packageJson.devDependencies?.typescript).toBeDefined()
  })
})
