import assert from "node:assert/strict"
import { test } from "node:test"

import { checkPublicSurface, formatSurfaceViolations } from "../checks/manifests/public-surface.ts"

const contracts = { name: "@voyant-travel/catalog-contracts" }
const sdk = { name: "@voyant-travel/admin-extension-sdk" }

test("a closed allowlist passes", () => {
  const report = checkPublicSurface([sdk, contracts], [sdk.name, contracts.name])
  assert.deepEqual(report.escapes, [])
  assert.equal(report.closureSize, 2)
  assert.deepEqual(formatSurfaceViolations(report), [])
})

test("a dependency outside the allowlist is an escape", () => {
  const apps = {
    name: "@voyant-travel/apps",
    dependencies: { "@voyant-travel/db": "workspace:^", zod: "catalog:" },
  }
  const report = checkPublicSurface(
    [apps, { name: "@voyant-travel/db", private: true }],
    [apps.name],
  )
  assert.deepEqual(report.escapes, [
    { package: apps.name, via: apps.name, dependency: "@voyant-travel/db" },
  ])
  assert.equal(report.unlisted.length, 0)
  assert.match(formatSurfaceViolations(report)[0], /would drag @voyant-travel\/db/)
})

test("peer dependencies count — they are installed by the consumer too", () => {
  const ui = {
    name: "@voyant-travel/ui",
    peerDependencies: { "@voyant-travel/i18n": "workspace:^" },
  }
  const report = checkPublicSurface([ui, { name: "@voyant-travel/i18n", private: true }], [ui.name])
  assert.equal(report.escapes.length, 1)
  assert.equal(report.escapes[0].dependency, "@voyant-travel/i18n")
})

test("non-workspace dependencies are ignored", () => {
  const pkg = {
    name: "@voyant-travel/schema-kit",
    dependencies: { zod: "catalog:", "typeid-js": "^1" },
  }
  assert.deepEqual(checkPublicSurface([pkg], [pkg.name]).escapes, [])
})

test("an escape is reported transitively, naming the package that introduces it", () => {
  const manifest = {
    name: "@voyant-travel/app-manifest",
    dependencies: { "@voyant-travel/custom-fields-contracts": "workspace:^" },
  }
  const cfc = {
    name: "@voyant-travel/custom-fields-contracts",
    dependencies: { "@voyant-travel/db": "workspace:^" },
  }
  const report = checkPublicSurface(
    [manifest, cfc, { name: "@voyant-travel/db", private: true }],
    [manifest.name, cfc.name],
  )
  assert.deepEqual(report.escapes, [
    { package: cfc.name, via: cfc.name, dependency: "@voyant-travel/db" },
  ])
})

test("an allowlisted package that does not exist is a violation", () => {
  const report = checkPublicSurface([], ["@voyant-travel/trips-contracts"])
  assert.deepEqual(report.missing, ["@voyant-travel/trips-contracts"])
  assert.match(formatSurfaceViolations(report)[0], /no such package exists/)
})

test("an allowlisted package marked private is a violation", () => {
  const pkg = { name: "@voyant-travel/apps", private: true }
  const report = checkPublicSurface([pkg], [pkg.name])
  assert.deepEqual(report.unpublishable, [pkg.name])
  assert.match(formatSurfaceViolations(report)[0], /marked private/)
})

test("a publishable package that is not allowlisted is a violation", () => {
  const stray = { name: "@voyant-travel/admin" }
  const report = checkPublicSurface([stray], [])
  assert.deepEqual(report.unlisted, ["@voyant-travel/admin"])
  assert.match(formatSurfaceViolations(report)[0], /publishable but not on the public surface/)
})

test("a private package is not required to be allowlisted", () => {
  const report = checkPublicSurface([{ name: "@voyant-travel/admin", private: true }], [])
  assert.deepEqual(report.unlisted, [])
  assert.deepEqual(formatSurfaceViolations(report), [])
})

test("a dependency cycle inside the allowlist terminates", () => {
  const a = { name: "@voyant-travel/a", dependencies: { "@voyant-travel/b": "workspace:^" } }
  const b = { name: "@voyant-travel/b", dependencies: { "@voyant-travel/a": "workspace:^" } }
  const report = checkPublicSurface([a, b], [a.name, b.name])
  assert.deepEqual(report.escapes, [])
  assert.equal(report.closureSize, 2)
})
