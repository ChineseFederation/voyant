/**
 * Cached accessor and query surface for the resolved Operator deployment graph.
 *
 * Background: 339 `.includes()` substring assertions are spread across the
 * `*authority*` scripts, and none of them loads the graph they are asserting
 * about — they pin how source text is *written* rather than what the graph *is*,
 * so unrelated refactors break them. See #3898 and ADR-0016 decision 3.
 *
 * Resolving the graph costs ~6s of CPU, which is fine once and far too much 47
 * times. The result is memoised in-process and cached on disk under
 * node_modules/.cache so separate checker processes share one resolution.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import getReleasePlan from "@changesets/get-release-plan"

import operatorProject from "../../../starters/operator/voyant.config.ts"
import {
  type OperatorAuthoredProject,
  resolveOperatorDeploymentGraph,
} from "../../lib/operator-deployment-graph-package-records.ts"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const cachePath = join(repoRoot, "node_modules", ".cache", "voyant-resolved-graph.json")

/**
 * The cache is keyed on the mtimes of every input that can change the graph:
 * the authored project and each package's `voyant` manifest surface. A stale
 * cache would be worse than no cache — it would report on a graph that no longer
 * exists — so the key is conservative and a miss just costs the resolve.
 */
function cacheKey(): string {
  const inputs = [
    join(repoRoot, "starters", "operator", "voyant.config.ts"),
    join(repoRoot, "pnpm-lock.yaml"),
  ]
  return inputs
    .map((file) => {
      try {
        return `${file}:${statSync(file).mtimeMs}`
      } catch {
        return `${file}:missing`
      }
    })
    .join("|")
}

let memo: ResolvedGraph | undefined

export type ResolvedGraph = Awaited<ReturnType<typeof resolveOperatorDeploymentGraph>>["graph"]

export async function loadResolvedGraph(): Promise<ResolvedGraph> {
  if (memo) return memo

  const key = cacheKey()
  try {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"))
    if (cached.key === key) {
      memo = cached.graph as ResolvedGraph
      return memo
    }
  } catch {
    // no usable cache; resolve below
  }

  const frameworkPackage = JSON.parse(
    readFileSync(join(repoRoot, "packages", "framework", "package.json"), "utf8"),
  ) as { version: string }
  const releasePlan = await getReleasePlan(repoRoot)
  const frameworkVersion =
    releasePlan.releases.find(({ name }) => name === "@voyant-travel/framework")?.newVersion ??
    frameworkPackage.version

  const { graph } = await resolveOperatorDeploymentGraph({
    project: operatorProject as OperatorAuthoredProject,
    projectRoot: join(repoRoot, "starters", "operator"),
    repoRoot,
    frameworkVersion,
  })

  memo = graph
  try {
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ key, graph }))
  } catch {
    // caching is an optimisation; a failure to write must not fail a check
  }
  return graph
}
