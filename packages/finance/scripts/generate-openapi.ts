import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { createFinanceApiModule } from "../src/index.js"

const root = resolve(import.meta.dirname, "..")
const metadataKeys = [
  "operationId",
  "summary",
  "tags",
  "x-voyant-module",
  "x-voyant-surface",
] as const

const surfaces = [
  {
    artifact: "openapi/admin/finance.json",
    live: createFinanceApiModule().adminRoutes,
    prefix: "/v1/admin/finance",
    paths: ["/travel-credits", "/travel-credits/{id}", "/travel-credits/{id}/redeem"],
    legacyPaths: [
      "/v1/admin/finance/vouchers",
      "/v1/admin/finance/vouchers/{id}",
      "/v1/admin/finance/vouchers/{id}/redeem",
    ],
  },
  {
    artifact: "openapi/public-api/finance.json",
    live: createFinanceApiModule().publicRoutes,
    prefix: "/v1/public/finance",
    paths: ["/travel-credits/validate"],
    legacyPaths: ["/v1/public/finance/vouchers/validate"],
  },
] as const

/**
 * Paths this package documents somewhere else.
 *
 * One live surface can feed several artifacts: `tax-settings` and
 * `tax-preview` are their own documents, owned by their own graph API bundles,
 * and `payment-link` likewise. Claiming everything the surface produces put
 * `tax-settings` into two documents at once, which
 * `verify:deployment-graph-openapi-coverage` correctly rejected as a duplicate
 * authority.
 *
 * Read from the sibling artifacts rather than listed here, so a document that
 * takes over a path stops this one from claiming it without anybody editing a
 * list. Tracked files only — an untracked artifact from another checkout must
 * not silently narrow what this generator owns.
 */
function pathsOwnedElsewhere(mine: readonly string[]) {
  const tracked = execFileSync("git", ["ls-files", "openapi"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => file.endsWith(".json") && !mine.includes(file))
  const owned = new Set<string>()
  for (const file of tracked) {
    const document = JSON.parse(readFileSync(resolve(root, file), "utf8"))
    for (const path of Object.keys(document.paths ?? {})) owned.add(path)
  }
  return owned
}

const ownedElsewhere = pathsOwnedElsewhere(surfaces.map((surface) => surface.artifact))

for (const surface of surfaces) {
  const artifactPath = resolve(root, surface.artifact)
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))
  const live = surface.live.getOpenAPI31Document({
    info: { title: "Voyant Operator API", version: "0.0.0" },
  })

  // Rebuilt wholesale, not merged into what is already there. Merging only ever
  // adds, so a path the surface stopped serving — or one that moved to a sibling
  // document — survived forever, and nothing regenerated or compared it. That is
  // the defect this generator is being widened to close, so it must not leave a
  // residue of its own. `legacyPaths` needs no special case now: a path the live
  // surface no longer produces simply is not written.
  const nextPaths: Record<string, unknown> = {}
  for (const path of Object.keys(live.paths ?? {})) {
    const committedPath = `${surface.prefix}${path}`
    if (ownedElsewhere.has(committedPath)) continue
    nextPaths[committedPath] = withCompositionMetadata(
      live.paths?.[path],
      artifact.paths[committedPath],
    )
  }
  artifact.paths = nextPaths

  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)
}

function withCompositionMetadata(livePath: unknown, committedPath: unknown) {
  const live = structuredClone(livePath) as Record<string, Record<string, unknown>>
  const committed = committedPath as Record<string, Record<string, unknown>> | undefined
  for (const [method, operation] of Object.entries(live)) {
    const previous = committed?.[method]
    if (!previous) continue
    for (const key of metadataKeys) {
      if (previous[key] !== undefined) operation[key] = structuredClone(previous[key])
    }
  }
  return live
}
