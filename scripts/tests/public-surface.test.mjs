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

// Withdrawal — #4159. Marking a package private does not unpublish it, so a
// consumer outside this repository keeps resolving a frozen version forever.

const flights = { name: "@voyant-travel/flights", private: true }
const flightsContracts = { name: "@voyant-travel/flights-contracts" }
const hisky = { "voyant-travel/hisky-connector": { consumes: [flightsContracts.name] } }

test("withdrawing a package a recorded consumer depends on is a violation", () => {
  const report = checkPublicSurface([flights, flightsContracts], [], { consumers: hisky })
  assert.deepEqual(report.stranded, [
    { repository: "voyant-travel/hisky-connector", dependency: flightsContracts.name },
  ])
  assert.match(
    formatSurfaceViolations(report).find((v) => v.includes("hisky-connector")),
    /keeps resolving a frozen version/,
  )
})

test("a consumer whose dependencies are all allowlisted is fine", () => {
  const report = checkPublicSurface([flightsContracts], [flightsContracts.name], {
    consumers: hisky,
  })
  assert.deepEqual(report.stranded, [])
  assert.deepEqual(formatSurfaceViolations(report), [])
})

test("a consumer's dependency on a sibling repo's package is not ours to check", () => {
  // connect-provider-sdk lives in the connect repo; no manifest for it here.
  const report = checkPublicSurface([], [], {
    consumers: {
      "voyant-travel/hisky-connector": { consumes: ["@voyant-travel/connect-provider-sdk"] },
    },
  })
  assert.deepEqual(report.stranded, [])
})

test("recording the withdrawal is how a package a consumer names may leave", () => {
  const report = checkPublicSurface([flights, flightsContracts], [flightsContracts.name], {
    consumers: { "voyant-travel/hisky-connector": { consumes: [flights.name] } },
    withdrawn: { [flights.name]: { successor: flightsContracts.name } },
  })
  assert.deepEqual(report.stranded, [])
  assert.deepEqual(formatSurfaceViolations(report), [])
})

test("a withdrawal pointing at a successor that is not published is a violation", () => {
  const report = checkPublicSurface([flights, { ...flightsContracts, private: true }], [], {
    withdrawn: { [flights.name]: { successor: flightsContracts.name } },
  })
  assert.deepEqual(report.danglingSuccessors, [
    { package: flights.name, successor: flightsContracts.name },
  ])
  assert.match(formatSurfaceViolations(report).at(-1), /not on the public surface either/)
})

test("a withdrawal with no successor must say why", () => {
  const bare = checkPublicSurface([flights], [], {
    withdrawn: { [flights.name]: { successor: null } },
  })
  assert.deepEqual(bare.staleWithdrawals, [
    { package: flights.name, why: "no successor and no reason given" },
  ])

  const explained = checkPublicSurface([flights], [], {
    withdrawn: { [flights.name]: { successor: null, reason: "#4059 item 4" } },
  })
  assert.deepEqual(explained.staleWithdrawals, [])
})

test("a withdrawal record that stopped being true is a violation", () => {
  const republished = checkPublicSurface([{ name: flights.name }], [], {
    withdrawn: { [flights.name]: { successor: flightsContracts.name } },
  })
  assert.deepEqual(republished.staleWithdrawals, [
    { package: flights.name, why: "the package is publishable again" },
  ])

  const absent = checkPublicSurface([], [], {
    withdrawn: { "@voyant-travel/gone": { successor: null, reason: "x" } },
  })
  assert.deepEqual(absent.staleWithdrawals, [
    { package: "@voyant-travel/gone", why: "no such package in this repository" },
  ])
})

test("a package cannot be both withdrawn and on the allowlist", () => {
  const report = checkPublicSurface([flightsContracts], [flightsContracts.name], {
    withdrawn: { [flightsContracts.name]: { successor: null, reason: "x" } },
  })
  assert.ok(
    report.staleWithdrawals.some((entry) => entry.why === "it is also on the allowlist"),
    "expected the contradiction to be reported",
  )
})

test("no registry means no new violations — the check is additive", () => {
  const report = checkPublicSurface([flightsContracts], [flightsContracts.name])
  assert.deepEqual(report.stranded, [])
  assert.deepEqual(report.staleWithdrawals, [])
  assert.deepEqual(report.danglingSuccessors, [])
  assert.deepEqual(formatSurfaceViolations(report), [])
})
