import path from "node:path"

import { STANDARD_OPERATOR_DISTRIBUTION } from "@voyant-travel/framework"
import { resolveProject } from "@voyant-travel/framework/project"
import { describe, expect, it } from "vitest"
import config from "../voyant.config.js"

const operatorRoot = process.cwd()

describe("Operator project config", () => {
  it("authors only deployment differences", () => {
    expect(config.modules).toHaveLength(STANDARD_OPERATOR_DISTRIBUTION.modules.length)
    expect(config.extensions).toHaveLength(STANDARD_OPERATOR_DISTRIBUTION.extensions.length)
    expect(config.plugins).toHaveLength(0)
    expect(config.productBom).toEqual({
      schemaVersion: "voyant.product-bom-reference.v1",
      id: "@voyant-travel/operator-standard",
      version: "1",
    })
    expect(config).not.toHaveProperty("presetLineage")
    expect(config.deployment?.migrations).toBeUndefined()
    expect(config.access?.presets?.map((preset) => preset.id)).toEqual([
      "agent-customer",
      "agent-staff",
      "automation",
      "catalog-read",
      "commerce-read",
      "editor",
      "full-access",
      "public-catalog-reader",
      "read-only",
    ])

    expect(config.selections?.modules).toHaveLength(STANDARD_OPERATOR_DISTRIBUTION.modules.length)
    expect(
      config.selections?.modules.every(({ provenance }) => provenance.kind === "package"),
    ).toBe(true)
    expect(config.selections?.extensions).toHaveLength(
      STANDARD_OPERATOR_DISTRIBUTION.extensions.length,
    )
    expect(config.selections?.plugins).toEqual([])
    expect(config.extensions.every((unit) => unit.schemaVersion === "voyant.extension.v1")).toBe(
      true,
    )
  })

  it("expands the standard distribution without project plugins", async () => {
    const { graph, artifacts } = await resolveProject({
      project: config,
      projectRoot: operatorRoot,
      configPath: path.join(operatorRoot, "voyant.config.ts"),
    })
    expect(graph.plugins).toEqual([])
    expect(graph.diagnostics).toEqual([])
    expect(graph.deployment.migrations).toBeUndefined()
    expect(
      artifacts.migrationPlan.migrations
        .filter((migration) => migration.migrationKind === "schema")
        .every((migration) => migration.source.kind === "package"),
    ).toBe(true)
    const productBom = artifacts.files.find((file) => file.path === "product-bom.generated.json")
    expect(JSON.parse(productBom?.contents ?? "null")).toMatchObject({
      schemaVersion: "voyant.product-bom-expansion.v1",
      productBom: config.productBom,
      graph: {
        contentHash: graph.contentHash,
        deploymentTarget: "node",
        modules: expect.arrayContaining(["@voyant-travel/identity"]),
        plugins: [],
      },
    })
  })
})
