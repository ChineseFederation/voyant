import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const ROOT = join(import.meta.dirname, "..", "..")
const CHECKER = join(ROOT, "scripts/check-admin-composition-drift.mjs")

test("derives expected admin entries from the resolved graph, not voyant.config", () => {
  const dir = mkdtempSync(join(tmpdir(), "voyant-admin-composition-"))
  const graph = join(dir, "deployment-graph.generated.json")
  const extensions = join(dir, "admin.extensions.generated.ts")
  const bundle = join(dir, "selected-graph-admin.generated.ts")
  const presentation = join(dir, "admin-presentation.tsx")
  const compatibility = join(dir, "admin-extensions.tsx")

  try {
    writeFileSync(graph, JSON.stringify({ modules: [], plugins: [] }))
    writeFileSync(bundle, "export const selectedGraphAdminExtensionFactories = {}\n")
    writePresentation(presentation)

    assert.doesNotThrow(() =>
      runChecker({ graph, extensions, bundle, presentation, compatibility }),
    )

    writeFileSync(
      graph,
      JSON.stringify({
        modules: [
          {
            api: [{ surface: "admin" }],
            packageName: "@voyant-travel/action-ledger",
          },
        ],
        plugins: [],
      }),
    )

    assert.throws(
      () => runChecker({ graph, extensions, bundle, presentation, compatibility }),
      /selected by the deployment graph.*does not declare admin\.runtime/s,
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test("requires migrated UI-only admin factories only in the selected-graph bundle", () => {
  const dir = mkdtempSync(join(tmpdir(), "voyant-admin-bundle-"))
  const graph = join(dir, "deployment-graph.generated.json")
  const extensions = join(dir, "admin.extensions.generated.ts")
  const bundle = join(dir, "selected-graph-admin.generated.ts")
  const presentation = join(dir, "admin-presentation.tsx")
  const compatibility = join(dir, "admin-extensions.tsx")

  try {
    writeFileSync(
      graph,
      JSON.stringify({
        modules: [
          {
            admin: { runtime: { entry: "@voyant-travel/action-ledger-react/admin" } },
            packageName: "@voyant-travel/action-ledger",
          },
        ],
        plugins: [],
      }),
    )
    writeFileSync(
      bundle,
      'import { createActionLedgerAdminExtension } from "@voyant-travel/action-ledger-react/admin"\n',
    )
    writePresentation(presentation)

    assert.doesNotThrow(() =>
      runChecker({ graph, extensions, bundle, presentation, compatibility }),
    )

    writeFileSync(
      bundle,
      'import { createActionLedgerAdminExtension } from "@voyant-travel/action-ledger-react/wrong-entry"\n',
    )
    assert.throws(
      () => runChecker({ graph, extensions, bundle, presentation, compatibility }),
      /missing from selected-graph-admin\.generated\.js/,
    )
    writeFileSync(
      bundle,
      'import { createActionLedgerAdminExtension } from "@voyant-travel/action-ledger-react/admin"\n',
    )

    writeFileSync(compatibility, "export const adminExtensions = []\n")
    assert.throws(
      () => runChecker({ graph, extensions, bundle, presentation, compatibility }),
      /admin-extensions\.tsx must not exist/,
    )
    rmSync(compatibility, { force: true })

    writeFileSync(extensions, "export const generatedAdminExtensionFactories = {}\n")
    assert.throws(
      () => runChecker({ graph, extensions, bundle, presentation, compatibility }),
      /admin\.extensions\.generated\.ts must not exist/,
    )

    rmSync(extensions, { force: true })
    writeFileSync(
      presentation,
      'selectedGraphAdminExtensionFactories["@voyant-travel/action-ledger"]({})\n',
    )
    assert.throws(
      () => runChecker({ graph, extensions, bundle, presentation, compatibility }),
      /remains package-keyed in the Operator presentation input/,
    )

    writeFileSync(
      presentation,
      'import "@voyant-travel/operator-settings-react/settings"\nexport const extensions = []\n',
    )
    assert.throws(
      () => runChecker({ graph, extensions, bundle, presentation, compatibility }),
      /package admin authority must arrive through the selected graph/,
    )

    writeFileSync(presentation, 'const path = "custom-fields"\nexport const extensions = []\n')
    assert.throws(
      () => runChecker({ graph, extensions, bundle, presentation, compatibility }),
      /retains package-owned token custom-fields/,
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test("accepts Realtime only when its selected graph admin factory is bundled", () => {
  const dir = mkdtempSync(join(tmpdir(), "voyant-realtime-admin-"))
  const graph = join(dir, "deployment-graph.generated.json")
  const extensions = join(dir, "admin.extensions.generated.ts")
  const bundle = join(dir, "selected-graph-admin.generated.ts")
  const presentation = join(dir, "admin-presentation.tsx")
  const compatibility = join(dir, "admin-extensions.tsx")

  try {
    writeFileSync(
      graph,
      JSON.stringify({
        modules: [
          {
            admin: { runtime: { entry: "@voyant-travel/realtime-react/admin" } },
            api: [{ surface: "admin" }],
            packageName: "@voyant-travel/realtime",
          },
        ],
        plugins: [],
      }),
    )
    writeFileSync(
      bundle,
      'import { createSelectedRealtimeAdminExtension } from "@voyant-travel/realtime-react/admin"\n',
    )
    writePresentation(presentation)

    assert.doesNotThrow(() =>
      runChecker({ graph, extensions, bundle, presentation, compatibility }),
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test("rejects legacy committed admin generation artifacts and commands", () => {
  const dir = mkdtempSync(join(tmpdir(), "voyant-admin-legacy-generation-"))
  const graph = join(dir, "deployment-graph.generated.json")
  const extensions = join(dir, "admin.extensions.generated.ts")
  const bundle = join(dir, "selected-graph-admin.generated.ts")
  const presentation = join(dir, "admin-presentation.tsx")
  const compatibility = join(dir, "admin-extensions.tsx")
  const router = join(dir, "router.tsx")
  const workspace = join(dir, "workspace.tsx")
  const operatorPackage = join(dir, "package.json")
  const adminHostDestinations = join(dir, "admin-host-destinations.ts")
  const legacyRoutes = join(dir, "admin.routes.generated.tsx")
  const legacyDestinations = join(dir, "admin.destinations.generated.ts")
  const legacyGenerator = join(dir, "run-admin-generator.ts")

  try {
    writeFileSync(graph, JSON.stringify({ modules: [], plugins: [] }))
    writeFileSync(bundle, "export const selectedGraphAdminExtensionFactories = {}\n")
    writePresentation(presentation)
    writeFileSync(router, "buildAdminExtensionRoutes(operatorAdminPresentation.extensions)\n")
    writeFileSync(workspace, "createAdminHostDestinations(presentation.extensions)\n")
    writeFileSync(operatorPackage, JSON.stringify({ scripts: {} }))
    writeFileSync(adminHostDestinations, "buildAdminExtensionDestinations(extensions)\n")

    const options = {
      graph,
      extensions,
      bundle,
      presentation,
      compatibility,
      router,
      workspace,
      operatorPackage,
      adminHostDestinations,
      legacyRoutes,
      legacyDestinations,
      legacyGenerator,
    }
    assert.doesNotThrow(() => runChecker(options))

    writeFileSync(legacyRoutes, "// generated\n")
    assert.throws(() => runChecker(options), /admin\.routes\.generated\.tsx must not exist/)
    rmSync(legacyRoutes, { force: true })

    writeFileSync(
      operatorPackage,
      JSON.stringify({ scripts: { "admin:check": "voyant admin generate --routes" } }),
    )
    assert.throws(() => runChecker(options), /legacy admin generation token/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

function runChecker({
  graph,
  extensions,
  bundle,
  presentation,
  compatibility,
  router = join(ROOT, "apps/operator/src/router.tsx"),
  workspace = join(ROOT, "packages/admin-host/src/workspace.tsx"),
  operatorPackage = join(ROOT, "apps/operator/package.json"),
  adminHostDestinations = join(ROOT, "packages/admin-host/src/admin-destinations.ts"),
  legacyRoutes = join(ROOT, "apps/operator/src/admin.routes.generated.tsx"),
  legacyDestinations = join(ROOT, "apps/operator/src/admin.destinations.generated.ts"),
  legacyGenerator = join(ROOT, "apps/operator/scripts/run-admin-generator.ts"),
}) {
  return execFileSync(
    process.execPath,
    [
      CHECKER,
      "--graph",
      graph,
      "--extensions",
      extensions,
      "--bundle",
      bundle,
      "--presentation",
      presentation,
      "--compatibility",
      compatibility,
      "--router",
      router,
      "--workspace-source",
      workspace,
      "--operator-package",
      operatorPackage,
      "--admin-host-destinations",
      adminHostDestinations,
      "--legacy-routes",
      legacyRoutes,
      "--legacy-destinations",
      legacyDestinations,
      "--legacy-generator",
      legacyGenerator,
    ],
    { encoding: "utf8" },
  )
}

function writePresentation(path) {
  writeFileSync(
    path,
    'createAdminHostPresentation({ selected: "../../.voyant/admin/selected-graph-admin.generated", project: import.meta.glob("../admin/*/index.tsx", { eager: true }) })\n',
  )
}
