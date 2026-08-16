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

for (const surface of surfaces) {
  const artifactPath = resolve(root, surface.artifact)
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))
  const live = surface.live.getOpenAPI31Document({
    info: { title: "Voyant Operator API", version: "0.0.0" },
  })

  for (const path of surface.paths) {
    const committedPath = `${surface.prefix}${path}`
    artifact.paths[committedPath] = withCompositionMetadata(
      live.paths?.[path],
      artifact.paths[committedPath],
    )
  }
  for (const legacyPath of surface.legacyPaths) delete artifact.paths[legacyPath]

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
