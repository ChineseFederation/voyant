#!/usr/bin/env node
/** Runner: absorbed migration identity must reach both consumers. See voyant#4330. */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  checkNoGraphFacetIdentity,
  checkPlanCarriesIdentity,
  checkSourceFreeVisibility,
  declaredInManifests,
} from "./dual-path-parity.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../..")

// Every workspace manifest, keyed by package name.
const manifests = new Map()
for (const directory of ["packages", "apps"]) {
  const absolute = path.join(repoRoot, directory)
  if (!existsSync(absolute)) continue
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(absolute, entry.name, "package.json")
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    if (manifest.name) manifests.set(manifest.name, manifest)
  }
}

const declared = declaredInManifests(manifests)

// Source-free visibility: exactly the load the managed image performs. Imported
// from SOURCE, so the check asserts what will be published rather than whatever
// happens to be built.
const { loadModuleBundleSource } = await import(
  path.join(repoRoot, "packages/framework-migrations/src/module-source.ts")
)
const observable = new Map()
for (const packageName of declared.keys()) {
  const source = await loadModuleBundleSource(packageName, {
    priority: 0,
    resolveFrom: path.join(repoRoot, "apps/operator/package.json"),
  })
  observable.set(packageName, source?.legacyNames ?? [])
}

const violations = [...checkSourceFreeVisibility(declared, observable)]

// The graph half needs the resolved graph. Gated on the artifact rather than
// passing silently without it — the posture access-catalog uses.
const graphPath = path.join(repoRoot, "apps/operator/.voyant/deployment-graph.generated.json")
let graphChecked = false
if (existsSync(graphPath)) {
  const graph = JSON.parse(readFileSync(graphPath, "utf8"))
  const units = [
    ...(graph.modules ?? []),
    ...(graph.extensions ?? []),
    ...(graph.adapters ?? []),
    ...(graph.providers ?? []),
    ...(graph.plugins ?? []),
  ]
  violations.push(...checkNoGraphFacetIdentity(units))

  // buildMigrationPlan is this repo's own resolver, distinct from the external
  // CLI that emits the artifact on disk.
  const { buildMigrationPlan } = await import(
    path.join(repoRoot, "packages/framework/src/project-resolver.ts")
  )
  try {
    const plan = buildMigrationPlan(graph)
    const inPlan = new Map()
    for (const migration of plan.migrations ?? []) {
      const packageName = migration.source?.packageName
      if (!packageName || !migration.legacySources?.length) continue
      inPlan.set(packageName, [...(inPlan.get(packageName) ?? []), ...migration.legacySources])
    }
    violations.push(...checkPlanCarriesIdentity(declared, inPlan))
    graphChecked = true
  } catch (error) {
    violations.push(`buildMigrationPlan could not run over the resolved graph: ${error.message}`)
  }
}

if (violations.length > 0) {
  console.error("Migration identity check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  console.error("\nSee voyant#4330.")
  process.exit(1)
}

const total = [...declared.values()].reduce((sum, names) => sum + names.length, 0)
console.log(
  `verify:migration-identity: ${total} absorbed ledger source(s) across ${declared.size} package(s) ` +
    `reach the source-free consumer` +
    (graphChecked ? " and this repo's plan build." : " (.voyant absent — graph half skipped)."),
)
