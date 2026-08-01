import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"

import {
  OPERATOR_GENERATED_METADATA_FILES,
  writeOperatorStarterMetadata,
} from "../generate-operator-starter-metadata.mjs"

test("emits disposable operator config with rebased declaration paths", () => {
  const root = mkdtempSync(join(tmpdir(), "voyant-operator-metadata-"))
  try {
    write(
      root,
      "packages/typescript-config/dep-paths.json",
      JSON.stringify({
        compilerOptions: {
          paths: { "@voyant-travel/example": ["../example/dist/index.d.ts"] },
        },
      }),
    )

    assert.deepEqual(writeOperatorStarterMetadata(root), OPERATOR_GENERATED_METADATA_FILES)
    assert.deepEqual(writeOperatorStarterMetadata(root, { check: true }), [])

    const client = JSON.parse(
      readFileSync(join(root, "starters/operator/.voyant/tsconfig.client.json"), "utf8"),
    )
    assert.deepEqual(client.compilerOptions.paths["@/*"], ["../src/*"])
    assert.deepEqual(client.compilerOptions.paths["@voyant-travel/example"], [
      "../../../packages/example/dist/index.d.ts",
    ])
    assert.ok(!client.exclude.includes("../src/custom-fields/**"))
    assert.ok(client.exclude.includes("./app/project-runtime.d.ts"))
    const server = JSON.parse(
      readFileSync(join(root, "starters/operator/.voyant/tsconfig.server.json"), "utf8"),
    )
    assert.ok(server.include.includes("../src/server.ts"))
    assert.ok(!server.include.includes("../tests/**/*.ts"))
    assert.ok(server.include.includes("./vite.config.ts"))
    assert.ok(server.include.includes("./vitest.config.ts"))
    assert.ok(!server.include.includes("../src/custom-fields/**/*.ts"))
    assert.ok(!server.include.includes("./**/*.ts"))
    assert.ok(server.exclude.includes("./runtime/**"))
    const smokeTests = JSON.parse(
      readFileSync(join(root, "starters/operator/.voyant/tsconfig.tests-smoke.json"), "utf8"),
    )
    assert.ok(smokeTests.include.includes("../tests/api/operator-route-mounting.test.ts"))
    assert.ok(smokeTests.include.includes("../tests/voyant.config.test.ts"))
    assert.ok(smokeTests.exclude.includes("./runtime/**"))
    const vitest = readFileSync(join(root, "starters/operator/.voyant/vitest.config.ts"), "utf8")
    assert.match(vitest, /include: \["tests\/\*\*\/\*\.test\.ts", "tests\/\*\*\/\*\.test\.tsx"\]/)
    assert.match(
      readFileSync(join(root, "starters/operator/.voyant/env.d.ts"), "utf8"),
      /VoyantNodeRuntimeEnv/,
    )
    assert.match(
      readFileSync(join(root, "starters/operator/.voyant/app/project-runtime.d.ts"), "utf8"),
      /LoadVoyantProjectOptions\["generatedProjectRuntime"\]/,
    )
    assert.match(
      readFileSync(join(root, "starters/operator/.voyant/app/project-links.d.ts"), "utf8"),
      /LoadVoyantProjectOptions\["generatedProjectLinks"\]/,
    )
    const routeGenerator = readFileSync(
      join(root, "starters/operator/.voyant/generate-routes.mjs"),
      "utf8",
    )
    assert.match(routeGenerator, /createStandardOperatorRouteFiles/)
    assert.match(routeGenerator, /productBom\.graph\.presentations/)
    assert.match(routeGenerator, /await new Generator/)
    assert.match(routeGenerator, /VOYANT_ROUTE_FILE_IGNORE_PATTERN/)

    write(root, "starters/operator/.voyant/tsconfig.legacy.json", "{}\n")
    write(root, "starters/operator/.voyant/graph-runtime.generated.ts", "export {}\n")
    write(root, "starters/operator/.voyant/runtime/graph-runtime.generated.ts", "export {}\n")
    assert.deepEqual(writeOperatorStarterMetadata(root, { check: true }), [
      "unexpected:graph-runtime.generated.ts",
      "unexpected:runtime/graph-runtime.generated.ts",
      "unexpected:tsconfig.legacy.json",
    ])
    assert.deepEqual(writeOperatorStarterMetadata(root), [
      "unexpected:graph-runtime.generated.ts",
      "unexpected:runtime/graph-runtime.generated.ts",
      "unexpected:tsconfig.legacy.json",
    ])
    assert.deepEqual(writeOperatorStarterMetadata(root, { check: true }), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function write(root, path, contents) {
  const destination = join(root, path)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, contents)
}
