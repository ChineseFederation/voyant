#!/usr/bin/env node
/**
 * Runner for the declarative route-set conformance rules. See assertions.ts.
 *
 * Rules live in route-sets.json: each names a mounted route array and the doc
 * that claims to describe it.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  diffRouteSets,
  documentedRoutes,
  formatRouteSetDiff,
  mountedRoutes,
  type RouteSet,
} from "./assertions.ts"

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const { routeSets } = JSON.parse(readFileSync(join(here, "route-sets.json"), "utf8")) as {
    routeSets: RouteSet[]
  }

  const failures = routeSets.flatMap((set) => {
    const mounted = mountedRoutes(readFileSync(set.source, "utf8"), set.export)
    const documented = documentedRoutes(readFileSync(set.doc, "utf8"), set.marker)
    return formatRouteSetDiff(set, diffRouteSets(mounted, documented))
  })

  if (failures.length > 0) {
    console.error("Route-set conformance check failed.\n")
    for (const failure of failures) console.error(`  ${failure}`)
    console.error("\nUpdate the doc, or the mounted set, so the two agree.")
    process.exit(1)
  }

  console.log(
    `verify:route-conformance: ${routeSets.length} mounted route set(s) match their documentation.`,
  )
}

main()
