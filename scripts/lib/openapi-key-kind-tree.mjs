/** Graph access for the key-kind checker. */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const GRAPH_PATH = "apps/operator/.voyant/deployment-graph.generated.json"

/**
 * The resolved deployment graph. Generated rather than committed, so a clean
 * checkout has to build it first — failing loudly here beats deriving the
 * capability line from a graph that is not this tree's.
 */
export function requireDeploymentGraph(root) {
  const absolute = path.join(root, GRAPH_PATH)
  if (!existsSync(absolute)) {
    throw new Error(
      `openapi key kind: ${GRAPH_PATH} is missing; run \`pnpm --filter operator prepare:verify\` first.`,
    )
  }
  return JSON.parse(readFileSync(absolute, "utf8"))
}
