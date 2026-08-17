import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_ATTEMPTS,
  DEFAULT_TREE,
  expandExportPattern,
  importProbeSpecifiers,
  isRegistryPropagationFailure,
  parseAttempts,
  parseTree,
  registryHasVersion,
  selectPublishedPackages,
  unappliedPublishConfigViolations,
  unresolvedProtocolViolations,
  workspaceManifestPaths,
} from "../lib/published-surface.mjs"

const WORKSPACE_PATTERNS = ["packages/*", "apps/*", "examples/*"]

function registryResponse({ status = 200, statusText = "OK", body = {} }) {
  return async () => ({
    status,
    statusText,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })
}

test("defaults the attempt count when no flag is passed", () => {
  // The case CI takes and no local run ever did. `argv.indexOf` returns -1 with
  // the flag absent, so the old `argv[index + 1]` read `argv[0]` — the node
  // binary's path — and `Number(...)` of it was NaN. `attempt <= NaN` is false,
  // so the retry loop ran zero times and every package was reported missing
  // without one request being made.
  assert.equal(parseAttempts(["/usr/bin/node", "/repo/scripts/verify.mjs"]), DEFAULT_ATTEMPTS)
  assert.ok(DEFAULT_ATTEMPTS >= 1)
})

test("reads an explicit attempt count", () => {
  assert.equal(parseAttempts(["/usr/bin/node", "/repo/scripts/verify.mjs", "--attempts", "2"]), 2)
})

test("refuses an attempt count that would skip the work", () => {
  for (const value of ["0", "-1", "banana", "1.5"]) {
    assert.throws(
      () => parseAttempts(["/usr/bin/node", "/repo/scripts/verify.mjs", "--attempts", value]),
      /--attempts must be a positive integer/,
    )
  }

  assert.throws(
    () => parseAttempts(["/usr/bin/node", "/repo/scripts/verify.mjs", "--attempts"]),
    /--attempts must be a positive integer/,
  )
})

test("reads a published version out of the packument", async () => {
  const published = await registryHasVersion("@voyant-travel/payments", "0.9.2", {
    fetch: registryResponse({ body: { versions: { "0.9.1": {}, "0.9.2": {} } } }),
  })

  assert.equal(published, true)
})

test("reports a version the packument does not carry", async () => {
  const published = await registryHasVersion("@voyant-travel/graph-contracts", "0.2.0", {
    fetch: registryResponse({ body: { versions: { "0.1.0": {} } } }),
  })

  assert.equal(published, false)
})

test("reports a package name that has never been published", async () => {
  const published = await registryHasVersion("@voyant-travel/nothing", "1.0.0", {
    fetch: registryResponse({ status: 404, statusText: "Not Found" }),
  })

  assert.equal(published, false)
})

test("refuses to call a registry failure an unpublished version", async () => {
  // The whole gate reported all fourteen packages missing because `npm view`
  // failed on a placeholder auth token and the failure was read as a verdict.
  // An unauthorised or unavailable registry has told us nothing, and saying
  // otherwise is worse than saying nothing.
  await assert.rejects(
    registryHasVersion("@voyant-travel/payments", "0.9.2", {
      fetch: registryResponse({ status: 401, statusText: "Unauthorized" }),
    }),
    /registry returned 401 Unauthorized/,
  )

  await assert.rejects(
    registryHasVersion("@voyant-travel/payments", "0.9.2", {
      fetch: async () => {
        throw new Error("ECONNRESET")
      },
    }),
    /ECONNRESET/,
  )
})

test("defaults to the checked-out commit when no tree is named", () => {
  assert.equal(parseTree(["/usr/bin/node", "/repo/scripts/verify.mjs"]), DEFAULT_TREE)
})

test("reads an explicit tree", () => {
  assert.equal(
    parseTree(["/usr/bin/node", "/repo/scripts/verify.mjs", "--tree", "origin/main"]),
    "origin/main",
  )
})

test("refuses a tree flag carrying no commit-ish", () => {
  for (const argv of [["--tree"], ["--tree", "--keep"]]) {
    assert.throws(
      () => parseTree(["/usr/bin/node", "/repo/scripts/verify.mjs", ...argv]),
      /--tree requires a commit-ish/,
    )
  }
})

test("takes manifests from the commit, not from the working directory", () => {
  // The defect this replaced: `pnpm version-packages` runs before this gate in
  // the release job and rewrites every releasable package.json on disk, so a
  // disk read asked the registry for versions that only publish once the
  // pending release PR merges.
  assert.deepEqual(
    workspaceManifestPaths(WORKSPACE_PATTERNS, [
      "packages/catalog-contracts/package.json",
      "apps/operator/package.json",
      "examples/storefront/package.json",
    ]),
    [
      "apps/operator/package.json",
      "examples/storefront/package.json",
      "packages/catalog-contracts/package.json",
    ],
  )
})

test("covers only the one level the workspace globs reach", () => {
  assert.deepEqual(
    workspaceManifestPaths(WORKSPACE_PATTERNS, [
      "package.json",
      "packages/package.json",
      "packages/ui/package.json",
      "packages/plugins/legacy/package.json",
      "packages/ui/src/fixtures/package.json",
      "docs/package.json",
    ]),
    ["packages/ui/package.json"],
  )
})

test("ignores everything in the tree that is not a manifest", () => {
  assert.deepEqual(
    workspaceManifestPaths(WORKSPACE_PATTERNS, [
      "packages/ui/package.json",
      "packages/ui/tsconfig.json",
      "packages/ui/src/index.ts",
      "packages/ui/my-package.json",
    ]),
    ["packages/ui/package.json"],
  )
})

test("selects the publishable packages in a stable order", () => {
  const selected = selectPublishedPackages([
    { name: "@voyant-travel/zeta", version: "1.0.0" },
    { name: "operator", version: "1.0.0", private: true },
    { name: "@voyant-travel/alpha", version: "1.0.0" },
  ])

  assert.deepEqual(
    selected.map((manifest) => manifest.name),
    ["@voyant-travel/alpha", "@voyant-travel/zeta"],
  )
})

test("treats the package root as the entry point when no exports map is declared", () => {
  assert.deepEqual(importProbeSpecifiers({ name: "@voyant-travel/legacy" }).specifiers, [
    "@voyant-travel/legacy",
  ])
})

test("derives one specifier per declared subpath", () => {
  const { specifiers, unsupported } = importProbeSpecifiers({
    name: "@voyant-travel/app-manifest",
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./compiler": "./dist/compiler.js",
      "./package.json": "./package.json",
    },
  })

  assert.deepEqual(specifiers, [
    "@voyant-travel/app-manifest",
    "@voyant-travel/app-manifest/compiler",
  ])
  assert.deepEqual(unsupported, [])
})

test("skips assets Node could never import however correctly they were published", () => {
  const { specifiers, unsupported } = importProbeSpecifiers({
    name: "@voyant-travel/ui",
    exports: {
      "./globals.css": "./dist/globals.css",
      "./components": "./dist/components/index.js",
      "./blocked": null,
    },
  })

  assert.deepEqual(specifiers, ["@voyant-travel/ui/components"])
  assert.deepEqual(unsupported, [])
})

test("rejects an export that points at a source path the tarball never shipped", () => {
  // `@voyant-travel/webhook-delivery-contracts@0.1.0`. Probing the other
  // subpaths would have reported nothing: this one had no others.
  const { specifiers, unsupported } = importProbeSpecifiers({
    name: "@voyant-travel/webhook-delivery-contracts",
    version: "0.1.0",
    exports: { ".": "./src/index.ts" },
  })

  assert.deepEqual(specifiers, [])
  assert.equal(unsupported.length, 1)
  assert.match(unsupported[0], /exports "\." as "\.\/src\/index\.ts", which Node cannot import/)
})

test("expands a wildcard export against the files the package shipped", () => {
  const expanded = expandExportPattern("./lib/*", "./dist/lib/*.js", [
    "./dist/lib/utils.js",
    "./dist/lib/format.js",
    "./dist/lib/utils.d.ts",
    "./dist/components/index.js",
  ])

  assert.deepEqual(expanded, ["./lib/format", "./lib/utils"])
})

test("exercises the subpaths behind a wildcard rather than the pattern", () => {
  const { specifiers } = importProbeSpecifiers(
    {
      name: "@voyant-travel/ui",
      exports: { "./lib/*": { import: "./dist/lib/*.js" } },
    },
    ["./dist/lib/utils.js"],
  )

  assert.deepEqual(specifiers, ["@voyant-travel/ui/lib/utils"])
})

test("rejects a published manifest carrying pnpm-only protocols", () => {
  // The shape `@voyant-travel/app-manifest@0.1.0` actually went out with (#4086).
  const violations = unresolvedProtocolViolations({
    name: "@voyant-travel/app-manifest",
    version: "0.1.0",
    dependencies: { zod: "catalog:", "@voyant-travel/graph-contracts": "workspace:^" },
    peerDependencies: { react: "^19.0.0" },
  })

  assert.equal(violations.length, 2)
  assert.match(violations[0], /published dependencies\.zod as "catalog:"/)
  assert.match(
    violations[1],
    /published dependencies\.@voyant-travel\/graph-contracts as "workspace:\^"/,
  )
  assert.ok(
    violations.every((violation) => violation.includes("@voyant-travel/app-manifest@0.1.0")),
  )
})

test("accepts a published manifest whose ranges are concrete", () => {
  assert.deepEqual(
    unresolvedProtocolViolations({
      name: "@voyant-travel/graph-contracts",
      version: "0.1.0",
      dependencies: { zod: "^4.4.3" },
    }),
    [],
  )
})

test("rejects a published manifest whose publishConfig was never applied", () => {
  // `@voyant-travel/webhook-delivery-contracts@0.1.0`: `exports` stayed at the
  // source path while `files` shipped only `dist`, so every consumer resolved
  // a missing module (#4086, fixed by #4109).
  const violations = unappliedPublishConfigViolations({
    name: "@voyant-travel/webhook-delivery-contracts",
    version: "0.1.0",
    exports: { ".": "./src/index.ts" },
    publishConfig: { access: "public", exports: { ".": "./dist/index.js" } },
  })

  assert.equal(violations.length, 1)
  assert.match(violations[0], /publishConfig\.exports/)
})

test("accepts the inert publishConfig every published package keeps", () => {
  assert.deepEqual(
    unappliedPublishConfigViolations({
      name: "@voyant-travel/graph-contracts",
      version: "0.2.0",
      publishConfig: { access: "public" },
    }),
    [],
  )
})

/**
 * Which install failures are worth retrying. Release 32005575707 published
 * every package and then failed its own gate with `ETARGET` on a version that
 * npm served moments later, so the retry has to cover propagation — and must
 * not cover anything else, or a genuine finding turns into a slow timeout with
 * the same message.
 */
test("ETARGET and E404 are propagation, and retry", () => {
  assert.equal(
    isRegistryPropagationFailure(
      "npm error code ETARGET\nnpm error notarget No matching version found for " +
        "@voyant-travel/public-api-contracts@0.2.0.",
    ),
    true,
  )
  assert.equal(isRegistryPropagationFailure("npm error code E404"), true)
})

test("a restricted package or an unresolved protocol fails on the first attempt", () => {
  // E403 is the shape a package published `restricted` by accident takes, and
  // it is exactly what this gate exists to catch. Retrying it would bury the
  // finding under five attempts and report a timeout instead.
  assert.equal(isRegistryPropagationFailure("npm error code E403 Forbidden"), false)
  assert.equal(
    isRegistryPropagationFailure('npm error Unsupported URL Type "workspace:": workspace:^'),
    false,
  )
  assert.equal(isRegistryPropagationFailure("npm error code ERESOLVE unable to resolve"), false)
})

test("an absent detail is not treated as propagation", () => {
  assert.equal(isRegistryPropagationFailure(undefined), false)
  assert.equal(isRegistryPropagationFailure(""), false)
})
