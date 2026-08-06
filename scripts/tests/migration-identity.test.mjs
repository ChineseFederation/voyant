import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"

import {
  checkNoGraphFacetIdentity,
  checkPlanCarriesIdentity,
  checkSourceFreeVisibility,
  declaredInManifests,
} from "../checks/migrations/dual-path-parity.mjs"

/**
 * voyant#4330 in miniature.
 *
 * The absorption itself was fine and was verified against a real Postgres. What
 * was never verified is that the declaration REACHED the consumer that applies
 * migrations in production — the check hand-constructed the migration source with
 * `legacyNames` already set, which proves the collector honours the field and
 * proves nothing about how it gets there.
 *
 * So each assertion below is paired with the failure it is supposed to catch. A
 * green from an assertion that cannot fail is what caused the incident.
 */

const repoRoot = process.cwd()

test("identity on a graph migration facet is rejected — the #4330 trap", () => {
  const violations = checkNoGraphFacetIdentity([
    {
      packageName: "@voyant-travel/operations",
      migrations: [{ id: "@voyant-travel/operations#migrations", legacySources: ["availability"] }],
    },
  ])
  assert.equal(violations.length, 1)
  assert.match(violations[0], /invisible to it/)
  assert.match(violations[0], /package\.json#voyant\.legacyMigrationSources/)
})

test("a graph facet with no identity is fine", () => {
  const violations = checkNoGraphFacetIdentity([
    {
      packageName: "@voyant-travel/operations",
      migrations: [{ id: "@voyant-travel/operations#migrations", source: "./migrations" }],
    },
  ])
  assert.deepEqual(violations, [])
})

test("a declaration a source-free load cannot return is rejected", () => {
  const declared = new Map([["@voyant-travel/operations", ["availability"]]])
  const violations = checkSourceFreeVisibility(
    declared,
    new Map([["@voyant-travel/operations", []]]),
  )
  assert.equal(violations.length, 1)
  assert.match(violations[0], /source-free load does not return them/)
})

test("a declaration the source-free load returns passes", () => {
  const declared = new Map([["@voyant-travel/operations", ["availability"]]])
  const observable = new Map([["@voyant-travel/operations", ["availability"]]])
  assert.deepEqual(checkSourceFreeVisibility(declared, observable), [])
})

test("a declaration the plan drops is rejected", () => {
  // The inverse failure: production sees it, path A does not, so a developer or
  // self-hoster migrating an existing database re-runs the moved migrations.
  const declared = new Map([["@voyant-travel/operations", ["availability"]]])
  const violations = checkPlanCarriesIdentity(declared, new Map())
  assert.equal(violations.length, 1)
  assert.match(violations[0], /does not carry them into the plan/)
})

test("declaredInManifests reads only voyant.legacyMigrationSources", () => {
  const declared = declaredInManifests(
    new Map([
      ["@voyant-travel/operations", { voyant: { legacyMigrationSources: ["availability"] } }],
      ["@voyant-travel/other", { voyant: { requiresSchemas: ["@voyant-travel/db"] } }],
      ["@voyant-travel/none", {}],
    ]),
  )
  assert.deepEqual([...declared.keys()], ["@voyant-travel/operations"])
})

test("the repository passes end to end", () => {
  // Drives the real checker over the real tree: real manifests, a real
  // source-free load, and this repo's own plan build. Not a fixture.
  const output = execFileSync(
    "npx",
    ["tsx", path.join(repoRoot, "scripts/checks/migrations/index.mjs")],
    { cwd: repoRoot, encoding: "utf8" },
  )
  assert.match(output, /reach the source-free consumer/)
})
