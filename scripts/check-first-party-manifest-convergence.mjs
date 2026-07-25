import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  inspectFirstPartyManifestConvergence,
  standardSelectionsFromPolicy,
} from "./lib/first-party-manifest-convergence.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const graphPath = path.join(root, "starters/operator/.voyant/deployment-graph.generated.json")
if (!existsSync(graphPath)) {
  throw new Error(
    "generated Operator graph is missing; run `pnpm --filter operator prepare:verify`",
  )
}

const policySource = read("packages/operator-standard/src/index.ts")
const graph = JSON.parse(readFileSync(graphPath, "utf8"))
const workspacePackages = new Map()
const sources = new Map()

for (const directory of workspaceDirectories(path.join(root, "packages"))) {
  const packageJsonPath = path.join(directory, "package.json")
  if (!existsSync(packageJsonPath)) continue
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  if (!manifest.name) continue
  const relative = relativePath(directory)
  workspacePackages.set(manifest.name, { directory: relative, manifest })
  collectSources(directory, sources)
}

const toolRuntimeDefinitions = await loadToolRuntimeDefinitions(graph, workspacePackages)
const failures = inspectFirstPartyManifestConvergence({
  graph,
  selections: standardSelectionsFromPolicy(policySource),
  workspacePackages,
  sources,
  toolRuntimeDefinitions,
})

if (failures.length > 0) {
  console.error("First-party manifest convergence failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `First-party manifest convergence: OK (${graph.modules.length} modules, ${graph.extensions.length} extensions)`,
)

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8")
}

function relativePath(absolute) {
  return path.relative(root, absolute).split(path.sep).join("/")
}

function workspaceDirectories(directory) {
  const result = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ["dist", "node_modules"].includes(entry.name)) continue
    const child = path.join(directory, entry.name)
    if (existsSync(path.join(child, "package.json"))) result.push(child)
    result.push(...workspaceDirectories(child))
  }
  return result
}

function collectSources(directory, result) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["dist", "node_modules", "coverage"].includes(entry.name)) continue
    const child = path.join(directory, entry.name)
    if (entry.isDirectory()) collectSources(child, result)
    else if (/\.(?:ts|tsx|json)$/.test(entry.name))
      result.set(relativePath(child), readFileSync(child, "utf8"))
  }
}

async function loadToolRuntimeDefinitions(deploymentGraph, packages) {
  const result = new Map()
  const units = [
    ...(deploymentGraph.modules ?? []),
    ...(deploymentGraph.extensions ?? []),
    ...(deploymentGraph.plugins ?? []),
    ...(deploymentGraph.adapters ?? []),
    ...(deploymentGraph.providers ?? []),
  ]
  for (const tool of units.flatMap((unit) => unit.tools ?? [])) {
    const exportName = tool.runtime.export ?? "default"
    const key = `${tool.runtime.entry}#${exportName}`
    if (result.has(key)) continue
    try {
      const owner = packageName(tool.runtime.entry)
      const pkg = packages.get(owner)
      const exportKey =
        tool.runtime.entry === owner ? "." : `.${tool.runtime.entry.slice(owner.length)}`
      const target = exportTarget(pkg?.manifest.exports?.[exportKey])
      if (!pkg || !target) {
        result.set(key, { error: `package export "${tool.runtime.entry}" is missing` })
        continue
      }
      const namespace = await import(pathToFileURL(path.join(root, pkg.directory, target)).href)
      const definition = namespace[exportName]
      result.set(
        key,
        definition
          ? {
              definition,
              contextContribution: namespace.voyantToolContextContribution,
            }
          : { error: `export "${exportName}" is missing` },
      )
    } catch (error) {
      result.set(key, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}

function packageName(specifier) {
  return specifier.split("/").slice(0, 2).join("/")
}

function exportTarget(value) {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return undefined
  for (const condition of ["development", "import", "default", "types", "require"]) {
    const target = exportTarget(value[condition])
    if (target) return target
  }
  return Object.values(value).map(exportTarget).find(Boolean)
}
