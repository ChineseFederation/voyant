#!/usr/bin/env node
/**
 * A generated client must cover the whole surface it claims to be a client for.
 *
 * `verify:openapi-drift` regenerates each client and diffs it, and
 * `verify:api-client-capability` proves the PK/SK line is a compile error. Both
 * are true of whatever the client is generated FROM — neither can see a path
 * the client was never pointed at.
 *
 * That is not hypothetical. `@voyant-travel/public-api-client` was typed from
 * one document of twenty-two: **13 of 138 public paths, 9% of the surface**,
 * with every check green and nothing to say otherwise. A caller reaching for
 * `/v1/public/bookings/{id}` found it absent and had no way to tell whether it
 * was unsupported or merely unmapped.
 *
 * So this asks the question the other two cannot: is anything on the surface
 * missing from the client? An exclusion must be recorded with a reason, and the
 * list may only shrink — the same shape as `not-generatable.json`, for the same
 * reason. A client is a promise about a surface; the gap between the two has to
 * be written down or it is not a promise.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { clientDocuments, surfaceDocuments, surfaceOf } from "./lib/api-client-documents.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { clients } = JSON.parse(readFileSync(path.join(root, "scripts/api-clients.json"), "utf8"))
const { limit, paths: excluded } = JSON.parse(
  readFileSync(path.join(root, "scripts/checks/openapi/client-coverage-exclusions.json"), "utf8"),
)

const violations = []
let covered = 0
let surfaceTotal = 0

for (const client of clients) {
  const { documents } = clientDocuments(client)

  // What the SURFACE serves — every tracked document on it, derived
  // INDEPENDENTLY of how this client selects its inputs.
  //
  // Taking it from the client's own selection instead is the trap this check
  // exists to catch, and the first version of it fell in: a client naming one
  // document would define the surface as that document and compare it to
  // itself. It reported 1016/1016 while the public client covered 9% — green,
  // and measuring nothing.
  const onSurface = new Set()
  for (const file of surfaceDocuments(surfaceOf(client))) {
    const parsed = JSON.parse(readFileSync(path.join(root, file), "utf8"))
    for (const route of Object.keys(parsed.paths ?? {})) onSurface.add(route)
  }

  // What the CLIENT is typed from — the composed document, or each part.
  const inClient = new Set()
  for (const document of documents) {
    const parsed =
      typeof document === "object"
        ? document
        : JSON.parse(readFileSync(path.join(root, document), "utf8"))
    for (const route of Object.keys(parsed.paths ?? {})) inClient.add(route)
  }

  surfaceTotal += onSurface.size
  for (const route of onSurface) if (inClient.has(route)) covered += 1

  const missing = [...onSurface].filter((route) => !inClient.has(route)).sort()
  for (const route of missing) {
    const entry = excluded[route]
    if (!entry) {
      violations.push(
        `${client.outDir} does not cover ${route}, which its surface serves. Point the client at ` +
          `it, or record it in client-coverage-exclusions.json with the reason it is out of scope.`,
      )
    } else if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      violations.push(`client-coverage-exclusions.json entry for ${route} has no \`reason\``)
    }
  }

  // An exclusion for a path the client DOES cover is a stale exemption, and a
  // stale exemption is how a ratchet stops ratcheting.
  for (const route of Object.keys(excluded)) {
    if (inClient.has(route)) {
      violations.push(
        `client-coverage-exclusions.json excludes ${route}, which ${client.outDir} covers. ` +
          `Delete the entry.`,
      )
    }
  }
}

// A checker that enumerated nothing would pass while proving nothing, and would
// read as coverage — the worst of the two ways to be wrong.
if (surfaceTotal === 0) {
  console.error("check-api-client-coverage: matched no surface paths, which cannot be right.")
  process.exit(1)
}

const count = Object.keys(excluded).length
if (count > limit) {
  violations.push(
    `client-coverage-exclusions.json holds ${count} entries, above its limit of ${limit}. ` +
      `The exclusion list may only shrink.`,
  )
} else if (count < limit) {
  violations.push(
    `client-coverage-exclusions.json holds ${count} entries, below its limit of ${limit}. ` +
      `Lower \`limit\` in the same commit that removes an entry.`,
  )
}

if (violations.length > 0) {
  console.error("API client coverage check failed.\n")
  for (const violation of violations.sort()) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(
  `check-api-client-coverage: ${covered}/${surfaceTotal} surface paths are in a generated client` +
    (count > 0 ? ` (${count} recorded as out of scope)` : ""),
)
