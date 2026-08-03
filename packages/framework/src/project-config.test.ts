import { describe, expect, it } from "vitest"
import { defineConfig, STANDARD_OPERATOR_DISTRIBUTION } from "./index.js"

describe("framework project config", () => {
  it("expands an empty authored config to the standard distribution", () => {
    const project = defineConfig()

    expect(project.modules).toHaveLength(STANDARD_OPERATOR_DISTRIBUTION.modules.length)
    expect(project.modules.map((unit) => unit.id)).toContain("@voyant-travel/bookings#extras")
    expect(project.extensions).toHaveLength(STANDARD_OPERATOR_DISTRIBUTION.extensions.length)
    expect(project.plugins).toEqual([])
    expect(project.productBom).toEqual({
      schemaVersion: "voyant.product-bom-reference.v1",
      id: "@voyant-travel/operator-standard",
      version: "1",
    })
    expect(project.modules.map((unit) => unit.id).slice(0, 5)).toEqual([
      "@voyant-travel/action-ledger",
      "@voyant-travel/event-catalog",
      "@voyant-travel/webhook-delivery",
      "@voyant-travel/mcp",
      "@voyant-travel/relationships",
    ])
    expect(project.extensions.map((unit) => unit.schemaVersion)).toEqual(
      Array.from(
        { length: STANDARD_OPERATOR_DISTRIBUTION.extensions.length },
        () => "voyant.extension.v1",
      ),
    )
  })

  it("appends authored differences in their independent unit lanes", () => {
    const project = defineConfig({
      modules: [{ resolve: "./src/modules/team" }],
      extensions: [{ resolve: "@acme/reporting/extension" }],
      plugins: [{ resolve: "@voyant-travel/plugin-netopia" }],
      deployment: {
        target: "node",
        mode: "self-hosted",
        providers: { database: "postgres" },
      },
    })

    expect(project.modules).toHaveLength(STANDARD_OPERATOR_DISTRIBUTION.modules.length + 1)
    expect(project.extensions).toHaveLength(STANDARD_OPERATOR_DISTRIBUTION.extensions.length + 1)
    expect(project.plugins).toHaveLength(1)
    expect(project.modules.at(-1)).toMatchObject({
      id: "local/src.modules.team",
      schemaVersion: "voyant.module.v1",
    })
    expect(project.extensions.at(-1)).toMatchObject({
      id: "@acme/reporting#extension",
      schemaVersion: "voyant.extension.v1",
    })
    expect(project.plugins[0]).toMatchObject({
      id: "@voyant-travel/plugin-netopia",
      schemaVersion: "voyant.plugin.v1",
    })
    expect(project.selections?.modules.at(-1)?.resolve).toBe("./src/modules/team")
    expect(project.selections?.extensions.at(-1)?.resolve).toBe("@acme/reporting#extension")
    expect(project.selections?.plugins.map((selection) => selection.resolve)).toEqual([
      "@voyant-travel/plugin-netopia",
    ])
    expect(project.deployment).toMatchObject({
      target: "node",
      mode: "self-hosted",
      providers: { database: "postgres", cache: "postgres", storage: "memory" },
    })
  })

  it("declares the standard response-cache posture and lets an author override it", () => {
    expect(defineConfig().deployment?.responseCache).toEqual({ edge: "none" })

    expect(
      defineConfig({
        deployment: { responseCache: { edge: "declared" } },
      }).deployment?.responseCache,
    ).toEqual({ edge: "declared" })
  })
})
