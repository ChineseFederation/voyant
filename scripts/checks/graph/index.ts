#!/usr/bin/env node
/**
 * Runner for the declarative graph conformance spec. See conformance.ts.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { checkGraphConformance, type GraphConformanceSpec } from "./conformance.ts"
import { loadResolvedGraph } from "./load.ts"

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url))
  const { packages } = JSON.parse(readFileSync(join(here, "graph-conformance.json"), "utf8")) as {
    packages: GraphConformanceSpec
  }

  const graph = await loadResolvedGraph()
  const violations = checkGraphConformance(graph, packages)

  if (violations.length > 0) {
    console.error("Graph conformance check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }

  console.log(
    `verify:graph-conformance: ${Object.keys(packages).length} package(s) conform to the resolved graph.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
