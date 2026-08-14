#!/usr/bin/env node
/**
 * Every public API bundle states which storefront key kind may call it
 * (voyant#4625 §1).
 *
 * A bundle that declares neither `publishable` nor `guardedIntake` is
 * secret-key-only — the right fail-closed default, and indistinguishable from
 * nobody having looked at it. So a secret-only public bundle must be named in
 * `scripts/checks/openapi/secret-only-public-bundles.json` with a reason. That
 * turns "unclassified" into a reviewable decision instead of silence, which is
 * the whole point: `/v1/public/*` names the audience, not the trust level, and
 * a route nobody classified must not become browser-reachable by default.
 *
 * ## Why this checks declarations and not the committed specs
 *
 * The key kind is a property of the DEPLOYMENT: it falls out of which bundles
 * a deployment selected and where they mounted. A per-package `openapi/*.json`
 * is a package artifact, so writing a deployment fact into it is a layering
 * error — and a costly one. Seven packages own `generate:openapi` scripts;
 * stamping their output made every one of them depend on a resolved deployment
 * graph, which broke `verify:openapi-drift` and the `operations --check`
 * generator on a clean checkout.
 *
 * The stamp still exists where it is meaningful and where the graph is known:
 * `buildSelectedGraphOpenApiDocuments` stamps `x-voyant-key-kind` on every
 * operation of the documents a deployment actually serves, from the same
 * declaration the capability middleware enforces. That path is covered by
 * `packages/framework/src/selected-graph-openapi.test.ts`.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { readApiBundles } from "./lib/openapi-key-kind.mjs"
import { requireDeploymentGraph } from "./lib/openapi-key-kind-tree.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const bundles = readApiBundles(requireDeploymentGraph(root))
const allowlist = JSON.parse(
  readFileSync(path.join(root, "scripts/checks/openapi/secret-only-public-bundles.json"), "utf8"),
)
const secretOnly = new Map(Object.entries(allowlist.bundles ?? {}))

const failures = []
const publicBundles = bundles.filter((bundle) => bundle.surface === "public")

for (const bundle of publicBundles) {
  const declared = bundle.publishable !== undefined || bundle.guardedIntake !== undefined
  const listed = secretOnly.has(bundle.apiId)
  if (declared && listed) {
    failures.push(
      `${bundle.apiId} declares a publishable posture AND is listed as secret-only; remove the allowlist entry.`,
    )
  } else if (!declared && !listed) {
    failures.push(
      `${bundle.apiId} (${bundle.mount}) declares no key-kind posture. Add \`publishable\`/\`guardedIntake\` to its manifest, or record it in scripts/checks/openapi/secret-only-public-bundles.json with a reason.`,
    )
  }
}

// An exemption that outlives its reason quietly re-opens the gap.
for (const apiId of secretOnly.keys()) {
  const bundle = publicBundles.find((candidate) => candidate.apiId === apiId)
  if (!bundle) {
    failures.push(`secret-only-public-bundles.json names "${apiId}", which is not a public bundle.`)
    continue
  }
  if (!secretOnly.get(apiId)?.trim()) {
    failures.push(`secret-only-public-bundles.json entry "${apiId}" has no reason.`)
  }
}

// A checker that finds nothing passes for free.
if (publicBundles.length === 0) failures.push("the graph selected no public API bundles.")

if (failures.length > 0) {
  console.error("OpenAPI key-kind authority failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

const publishable = publicBundles.filter((bundle) => bundle.publishable !== undefined).length
const guarded = publicBundles.filter((bundle) => bundle.guardedIntake !== undefined).length
console.log(
  `OpenAPI key-kind authority: OK (${publicBundles.length} public bundles state a posture; ${publishable} declare publishable paths, ${guarded} declare guarded intake, ${secretOnly.size} recorded secret-only)`,
)
