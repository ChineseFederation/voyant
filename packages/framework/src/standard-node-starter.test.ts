import { describe, expect, expectTypeOf, it } from "vitest"
import {
  buildStandardNodeStarterSnapshot,
  STANDARD_NODE_STARTER,
  VOYANT_STANDARD_NODE_STARTER_SCHEMA_VERSION,
} from "./standard-node-starter.js"

describe("standard Node starter contract", () => {
  it("keeps the consumer-authored tree small and domain-conventional", () => {
    expect(JSON.parse(buildStandardNodeStarterSnapshot())).toEqual(STANDARD_NODE_STARTER)
    expect(STANDARD_NODE_STARTER).toMatchInlineSnapshot(`
      {
        "databaseProvider": "postgres",
        "defaultPlugins": [],
        "deploymentTarget": "node",
        "developmentDependencies": [
          "@voyant-travel/cli",
          "tsx",
          "typescript",
        ],
        "developmentDependencyCoordinates": {
          "@voyant-travel/cli": "0.40.5",
          "tsx": "4.22.4",
          "typescript": "6.0.3",
        },
        "gitignoreEntries": [
          ".voyant/",
          "dist/",
          "node_modules/",
          ".env",
          ".env.*",
          "!.env.example",
        ],
        "optionalDirectories": [
          "src/api/admin",
          "src/api/public",
          "src/admin",
          "src/modules",
          "src/extensions",
          "src/subscribers",
          "src/links",
          "src/scripts",
        ],
        "packageScripts": {
          "build": "voyant build",
          "db:migrate": "voyant migrate",
          "dev": "voyant develop",
          "seed": "voyant exec ./src/scripts/seed.ts",
          "start": "voyant start",
        },
        "rootFiles": [
          ".env.example",
          ".gitignore",
          "package.json",
          "voyant.config.ts",
        ],
        "runtimeDependencies": [
          "@voyant-travel/admin",
          "@voyant-travel/framework",
          "@voyant-travel/runtime",
          "@voyant-travel/operator-standard",
          "@tanstack/react-query",
          "@tanstack/react-router",
          "react",
          "react-dom",
          "pg",
        ],
        "runtimeDependencyCoordinates": {
          "@tanstack/react-query": "5.101.2",
          "@tanstack/react-router": "1.170.17",
          "@voyant-travel/admin": "0.135.1",
          "@voyant-travel/framework": "0.63.2",
          "@voyant-travel/operator-standard": "0.12.3",
          "@voyant-travel/runtime": "0.17.9",
          "pg": "8.22.0",
          "react": "19.2.7",
          "react-dom": "19.2.7",
        },
        "schemaVersion": "voyant.node-starter.v3",
        "seedEntry": "src/scripts/seed.ts",
      }
    `)
  })

  it("contains no Cloudflare deployment surface", () => {
    expect(buildStandardNodeStarterSnapshot()).not.toMatch(/cloudflare|worker|wrangler/i)
  })

  it("requires integrations to be selected explicitly", () => {
    expect(STANDARD_NODE_STARTER.defaultPlugins).toEqual([])
    expect(buildStandardNodeStarterSnapshot()).not.toMatch(/smartbill/i)
  })

  it("provides exact coordinates for every generated project dependency", () => {
    expect(Object.keys(STANDARD_NODE_STARTER.runtimeDependencyCoordinates).sort()).toEqual(
      [...STANDARD_NODE_STARTER.runtimeDependencies].sort(),
    )
    expect(Object.keys(STANDARD_NODE_STARTER.developmentDependencyCoordinates).sort()).toEqual(
      [...STANDARD_NODE_STARTER.developmentDependencies].sort(),
    )

    for (const coordinate of [
      ...Object.values(STANDARD_NODE_STARTER.runtimeDependencyCoordinates),
      ...Object.values(STANDARD_NODE_STARTER.developmentDependencyCoordinates),
    ]) {
      expect(coordinate).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
      expect(coordinate).not.toMatch(/^(?:latest|next)|^[~^*]|\s|\|/)
    }
  })

  it("preserves literal readonly types for consumers", () => {
    expectTypeOf(
      VOYANT_STANDARD_NODE_STARTER_SCHEMA_VERSION,
    ).toEqualTypeOf<"voyant.node-starter.v3">()
    expectTypeOf<(typeof STANDARD_NODE_STARTER.rootFiles)[number]>().toEqualTypeOf<
      ".env.example" | ".gitignore" | "package.json" | "voyant.config.ts"
    >()
    expectTypeOf(STANDARD_NODE_STARTER.rootFiles).toMatchTypeOf<readonly string[]>()
    expectTypeOf(STANDARD_NODE_STARTER.defaultPlugins).toEqualTypeOf<readonly []>()
  })
})
