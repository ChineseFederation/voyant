import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const { getReleaseMode } = require("../release-plan.cjs")
const { collectWorkspaceRangeProblems } = require("../verify-release-config.cjs")

test("release PR creation takes priority over pending publication", () => {
  assert.equal(getReleaseMode(true, true), "version")
})

test("pending packages publish after all changesets are applied", () => {
  assert.equal(getReleaseMode(false, true), "publish")
})

test("an up-to-date repository needs no release action", () => {
  assert.equal(getReleaseMode(false, false), "none")
})

test("accepts an exact future internal peer range covered by the release plan", () => {
  assert.deepEqual(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.0.0",
          peerDependencies: { "@fixture/provider": "^0.64.0" },
        },
        "@fixture/provider": { version: "0.63.4" },
      }),
      new Map([
        ["@fixture/consumer", "1.1.0"],
        ["@fixture/provider", "0.64.0"],
      ]),
    ),
    [],
  )
})

test("accepts a compatible published caret peer without creating a workspace edge", () => {
  assert.deepEqual(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.1.0",
          peerDependencies: { "@fixture/provider": "^0.64.0" },
        },
        "@fixture/provider": { version: "0.64.1" },
      }),
    ),
    [],
  )
})

test("accepts a compatible published union of caret peers", () => {
  assert.deepEqual(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.1.0",
          peerDependencies: { "@fixture/provider": "^0.64.24 || ^1.0.0" },
        },
        "@fixture/provider": { version: "0.64.24" },
      }),
    ),
    [],
  )
})

test("accepts a compatible published comparator span", () => {
  // A wide span is what keeps changesets from rewriting the peer range on every
  // provider bump when onlyUpdatePeerDependentsWhenOutOfRange is set.
  assert.deepEqual(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.1.0",
          peerDependencies: { "@fixture/provider": ">=0.64.0 <2.0.0" },
        },
        "@fixture/provider": { version: "0.65.0" },
      }),
    ),
    [],
  )
})

test("accepts a compatible workspace peer comparator span", () => {
  // Workspace protocol keeps local resolution, and pnpm publishes the bare
  // comparator range so the package keeps its public compatibility line.
  assert.deepEqual(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.1.0",
          peerDependencies: { "@fixture/provider": "workspace:>=0.64.0 <2.0.0" },
        },
        "@fixture/provider": { version: "0.65.0" },
      }),
    ),
    [],
  )
})

test("rejects a published peer range the current provider version falls outside", () => {
  assert.notDeepEqual(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.1.0",
          peerDependencies: { "@fixture/provider": ">=0.64.0 <0.65.0" },
        },
        "@fixture/provider": { version: "0.66.0" },
      }),
    ),
    [],
  )
})

test("rejects a peer range that is not valid semver", () => {
  assert.notDeepEqual(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.1.0",
          peerDependencies: { "@fixture/provider": "not-a-range" },
        },
        "@fixture/provider": { version: "0.66.0" },
      }),
    ),
    [],
  )
})

test("rejects a future internal peer range when either package is absent from the release plan", () => {
  const packages = createPackages({
    "@fixture/consumer": {
      version: "1.0.0",
      peerDependencies: { "@fixture/provider": "^0.64.0" },
    },
    "@fixture/provider": { version: "0.63.4" },
  })

  assert.equal(
    collectWorkspaceRangeProblems(packages, new Map([["@fixture/provider", "0.64.0"]])).length,
    1,
  )
  assert.equal(
    collectWorkspaceRangeProblems(packages, new Map([["@fixture/consumer", "1.1.0"]])).length,
    1,
  )
})

test("rejects non-exact staged ranges and staged runtime dependencies", () => {
  const projectedVersions = new Map([
    ["@fixture/consumer", "1.1.0"],
    ["@fixture/provider", "0.64.0"],
  ])

  assert.equal(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.0.0",
          peerDependencies: { "@fixture/provider": ">=0.64.0" },
        },
        "@fixture/provider": { version: "0.63.4" },
      }),
      projectedVersions,
    ).length,
    1,
  )
  assert.equal(
    collectWorkspaceRangeProblems(
      createPackages({
        "@fixture/consumer": {
          version: "1.0.0",
          dependencies: { "@fixture/provider": "^0.64.0" },
        },
        "@fixture/provider": { version: "0.63.4" },
      }),
      projectedVersions,
    ).length,
    1,
  )
})

function createPackages(manifests) {
  return {
    packages: Object.entries(manifests).map(([name, packageJson]) => ({
      dir: `/fixtures/${name}`,
      packageJson: { name, ...packageJson },
    })),
  }
}
