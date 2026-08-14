/**
 * Load every Tool definition a selected deployment graph can serve, straight
 * from repo sources.
 *
 * A package declares its manifest export in `package.json#voyant.manifest`; the
 * manifest lists each Tool's `runtime.entry` + `runtime.export`. Walking that
 * pair is the only way to reach the *real* `inputSchema` object — a Tool's
 * schema is frequently composed from a sibling `*-contracts` package, so
 * grepping the `tools.ts` source sees a fraction of what a client receives.
 *
 * Fails closed everywhere: a package whose manifest export cannot be resolved,
 * or a manifest entry whose runtime export is not a Tool, throws rather than
 * contributing nothing. A checker that silently skipped an unreadable package
 * would report a confident zero.
 *
 * Callers run under `tsx`: package `exports` point at `src/*.ts`, and those
 * sources import sibling `.js` specifiers that only exist as `.ts`, so bare
 * Node cannot load them.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/**
 * @param {string} root - repository toplevel.
 * @returns {Promise<{ packageName: string, packageDirectory: string, toolName: string, definition: Record<string, unknown> }[]>}
 *   one row per (package, Tool), deduplicated when a package lists the same
 *   Tool from more than one exported manifest.
 */
export async function collectGraphToolDefinitions(root) {
  const rows = []
  const packagesRoot = path.join(root, "packages")

  for (const packageDirectory of findPackageDirectories(packagesRoot)) {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
    )
    if (!packageJson.name?.startsWith("@voyant-travel/")) continue
    if (!packageJson.voyant?.manifest) continue

    const manifestTarget = exportTarget(packageJson.exports?.[packageJson.voyant.manifest])
    if (!manifestTarget) {
      throw new Error(
        `${packageJson.name}: manifest export "${packageJson.voyant.manifest}" has no importable target`,
      )
    }

    const manifestModule = await importFile(packageDirectory, manifestTarget, packageJson.name)
    for (const value of Object.values(manifestModule)) {
      for (const tool of manifestTools(value)) {
        const target = exportTarget(packageJson.exports?.[relativeEntry(tool.entry, packageJson)])
        if (!target) {
          throw new Error(
            `${packageJson.name}: tool "${tool.name}" runtime entry "${tool.entry}" has no importable target`,
          )
        }
        const toolModule = await importFile(packageDirectory, target, packageJson.name)
        const definition = toolModule[tool.export]
        if (!definition?.inputSchema) {
          throw new Error(
            `${packageJson.name}: "${tool.export}" is not an exported Tool with an inputSchema`,
          )
        }
        rows.push({
          packageName: packageJson.name,
          packageDirectory,
          toolName: tool.name,
          definition,
        })
      }
    }
  }

  const byKey = new Map(rows.map((row) => [`${row.packageName}:${row.toolName}`, row]))
  return [...byKey.values()].sort((left, right) =>
    `${left.packageName}:${left.toolName}`.localeCompare(`${right.packageName}:${right.toolName}`),
  )
}

function manifestTools(value) {
  if (!value || typeof value !== "object") return []
  const tools = value.tools
  if (!Array.isArray(tools)) return []
  const rows = []
  for (const tool of tools) {
    const runtime = tool?.runtime
    if (!runtime?.entry || !runtime.export || !tool.name) continue
    rows.push({ name: tool.name, entry: runtime.entry, export: runtime.export })
  }
  return rows
}

/** `@voyant-travel/trips/tools` -> `./tools` within its own package. */
function relativeEntry(entry, packageJson) {
  if (!packageJson.name) return entry
  if (entry === packageJson.name) return "."
  return entry.startsWith(`${packageJson.name}/`)
    ? `./${entry.slice(packageJson.name.length + 1)}`
    : entry
}

async function importFile(packageDirectory, target, packageName) {
  const absolute = path.resolve(packageDirectory, target)
  if (!existsSync(absolute)) {
    throw new Error(`${packageName}: export target ${target} does not exist`)
  }
  return await import(pathToFileURL(absolute).href)
}

export function exportTarget(value) {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return undefined
  for (const key of ["development", "import", "default", "node"]) {
    const resolved = exportTarget(value[key])
    if (resolved) return resolved
  }
  return undefined
}

function findPackageDirectories(packagesRoot) {
  const directories = []
  if (!existsSync(packagesRoot)) return directories
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = path.join(packagesRoot, entry.name)
    if (existsSync(path.join(directory, "package.json"))) directories.push(directory)
  }
  return directories.sort()
}
