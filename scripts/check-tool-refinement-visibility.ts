/**
 * Fail the build when a Tool input schema carries a refinement nobody has
 * classified. See `scripts/lib/tool-refinement-inventory.mjs` for why.
 *
 * Runs under `tsx`: package `exports` point at `src/*.ts`, and those sources
 * import sibling `.js` specifiers that only exist as `.ts`, so bare Node cannot
 * load them. `publishConfig.exports` swaps to `dist` at publish time, which is
 * why the first attempt appeared to work — it was run against the published
 * packages installed under `apps/voyant-operator-runtime`, not repo sources.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { z } from "zod"
import { inspectToolProtocolFieldInventory } from "./lib/tool-protocol-field-inventory.mjs"
import {
  entryId,
  findRefinementPaths,
  inspectRefinementInventory,
} from "./lib/tool-refinement-inventory.mjs"

const INVENTORY_PATH = "scripts/tool-refinement-inventory.json"
const PROTOCOL_INVENTORY_PATH = "scripts/tool-protocol-field-inventory.json"

void main()

async function main() {
  const rootArg = process.argv.indexOf("--root")
  const repoRoot =
    rootArg >= 0
      ? path.resolve(process.argv[rootArg + 1] ?? "")
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const write = process.argv.includes("--write")

  const { found, protocolFields, unknownTypes } = await collectRefinements(repoRoot)

  if (process.argv.includes("--report")) {
    for (const item of found) {
      console.log(`\n${item.id}`)
      console.log(`  tool: ${collapse(item.toolDescription)}`)
      console.log(`  path: ${collapse(item.pathDescription)}`)
    }
    for (const item of protocolFields) {
      console.log(`\n${item.id} (${item.serverResolved ? "server-owned" : "caller-owned"})`)
    }
    return
  }

  if (unknownTypes.length > 0) {
    console.error("Tool refinement visibility failed — unrecognised schema nodes:\n")
    for (const entry of unknownTypes) console.error(`- ${entry}`)
    console.error(
      "\nTeach the walker this node type in scripts/lib/tool-refinement-inventory.mjs. " +
        "Skipping it would let refinements underneath it go unseen.",
    )
    process.exitCode = 1
    return
  }

  const inventoryFile = path.join(repoRoot, INVENTORY_PATH)

  if (write) {
    const existing = existsSync(inventoryFile)
      ? (JSON.parse(readFileSync(inventoryFile, "utf8")) as Inventory)
      : { entries: [], maxUndocumented: 0 }
    const byId = new Map((existing.entries ?? []).map((entry) => [entry.id, entry]))
    const entries = found.map(
      (item) =>
        byId.get(item.id) ?? {
          id: item.id,
          documented: false,
          note: "UNCLASSIFIED — state where the rule is written, or mark it undocumented.",
        },
    )
    const undocumented = entries.filter((entry) => entry.documented === false).length
    writeFileSync(
      inventoryFile,
      `${JSON.stringify({ ...existing, maxUndocumented: undocumented, entries }, null, 2)}\n`,
    )
    console.log(
      `Wrote ${INVENTORY_PATH}: ${entries.length} refinements, ${undocumented} undocumented.`,
    )
    return
  }

  if (!existsSync(inventoryFile)) {
    console.error(`Tool refinement visibility failed — ${INVENTORY_PATH} is missing.`)
    process.exitCode = 1
    return
  }

  const inventory = JSON.parse(readFileSync(inventoryFile, "utf8")) as Inventory
  const result = inspectRefinementInventory(found, inventory)
  const protocolInventoryFile = path.join(repoRoot, PROTOCOL_INVENTORY_PATH)
  if (!existsSync(protocolInventoryFile)) {
    console.error(`Tool refinement visibility failed — ${PROTOCOL_INVENTORY_PATH} is missing.`)
    process.exitCode = 1
    return
  }
  const protocolResult = inspectToolProtocolFieldInventory(
    protocolFields,
    JSON.parse(readFileSync(protocolInventoryFile, "utf8")),
  )

  if (result.diagnostics.length > 0 || protocolResult.diagnostics.length > 0) {
    console.error("Tool refinement visibility failed:\n")
    for (const diagnostic of result.diagnostics) console.error(`- ${diagnostic}`)
    for (const diagnostic of protocolResult.diagnostics) console.error(`- ${diagnostic}`)
    process.exitCode = 1
    return
  }

  console.log(
    `Tool refinement visibility: OK (${result.total} refinements, ` +
      `${result.documented} documented, ${result.undocumented} undocumented)`,
  )
  console.log(`Tool protocol field inventory: OK (${protocolResult.total} classified fields)`)
}

function collapse(text: string) {
  const value = (text ?? "").replace(/\s+/g, " ").trim()
  return value.length === 0 ? "(none)" : value
}

/** The `.describe()` text a model would see at one refinement path. */
function describeAt(schema: unknown, refinementPath: string): string {
  if (refinementPath === "<root>") return descriptionOf(schema)
  let node: unknown = schema
  for (const segment of refinementPath.split(".")) {
    const field = segment.replace(/\[\]$|\{key\}$|\[\d+\]$/, "")
    node = unwrap(node)
    const shape = (node as { _zod?: { def?: { shape?: unknown } } })?._zod?.def?.shape
    const resolved = typeof shape === "function" ? shape() : shape
    node = (resolved as Record<string, unknown> | undefined)?.[field]
    if (!node) return ""
  }
  return descriptionOf(node)
}

function unwrap(node: unknown): unknown {
  let current = node
  for (let depth = 0; depth < 10; depth += 1) {
    const def = (current as { _zod?: { def?: Record<string, unknown> } })?._zod?.def
    if (!def) return current
    if (def.type === "object") return current
    const inner = def.innerType ?? def.element ?? def.in
    if (!inner) return current
    current = inner
  }
  return current
}

function descriptionOf(node: unknown): string {
  const meta = node as { _zod?: { def?: { description?: string } }; description?: string }
  return meta?._zod?.def?.description ?? meta?.description ?? ""
}

type Inventory = {
  entries?: { id: string; documented?: boolean; note?: string }[]
  maxUndocumented?: number
}

type PackageJson = {
  name?: string
  exports?: Record<string, unknown>
  voyant?: { kind?: string; manifest?: string }
}

async function collectRefinements(root: string) {
  const found: {
    id: string
    toolDescription: string
    pathDescription: string
  }[] = []
  const unknownTypes: string[] = []
  const protocolFields: { id: string; serverResolved: boolean }[] = []
  const packagesRoot = path.join(root, "packages")

  for (const packageDirectory of findPackageDirectories(packagesRoot)) {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
    ) as PackageJson
    if (!packageJson.name?.startsWith("@voyant-travel/")) continue
    if (!packageJson.voyant?.manifest) continue

    const manifestTarget = exportTarget(packageJson.exports?.[packageJson.voyant.manifest])
    if (!manifestTarget) {
      // Fail closed. An unread package would otherwise pass by finding nothing.
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
        const definition = toolModule[tool.export] as
          | { inputSchema?: z.ZodType; resolvesIdempotencyKeyServerSide?: boolean }
          | undefined
        if (!definition?.inputSchema) {
          throw new Error(
            `${packageJson.name}: "${tool.export}" is not an exported Tool with an inputSchema`,
          )
        }
        if (hasTopLevelField(definition.inputSchema, "idempotencyKey")) {
          protocolFields.push({
            id: `${packageJson.name}:${tool.name}:input.idempotencyKey`,
            serverResolved: definition.resolvesIdempotencyKeyServerSide === true,
          })
        }
        const walked = findRefinementPaths(definition.inputSchema)
        for (const entry of walked.unknownTypes) {
          unknownTypes.push(`${packageJson.name}:${tool.name}:${entry}`)
        }
        for (const refinementPath of walked.paths) {
          found.push({
            id: entryId(packageJson.name, tool.name, refinementPath),
            // Evidence for a human classifying the entry, never a verdict. The
            // first attempt keyword-matched text like this and got it wrong.
            toolDescription: (definition as { description?: string }).description ?? "",
            pathDescription: describeAt(definition.inputSchema, refinementPath),
          })
        }
      }
    }
  }

  // A package can list the same Tool from more than one exported manifest (a
  // module plus an extension that contributes it). One refinement is one rule a
  // human classifies once, so collapse them.
  const byId = new Map(found.map((item) => [item.id, item]))
  const unique = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
  const uniqueProtocolFields = [
    ...new Map(protocolFields.map((item) => [item.id, item])).values(),
  ].sort((left, right) => left.id.localeCompare(right.id))
  return { found: unique, protocolFields: uniqueProtocolFields, unknownTypes }
}

function hasTopLevelField(schema: unknown, field: string, depth = 0): boolean {
  if (depth > 12 || !schema || typeof schema !== "object") return false
  const def = (schema as { _zod?: { def?: Record<string, unknown> } })._zod?.def
  if (!def) return false
  const shape = typeof def.shape === "function" ? def.shape() : def.shape
  if (shape && typeof shape === "object" && field in shape) return true
  for (const key of ["left", "right", "innerType", "in", "out"]) {
    if (hasTopLevelField(def[key], field, depth + 1)) return true
  }
  if (Array.isArray(def.options)) {
    return def.options.some((option) => hasTopLevelField(option, field, depth + 1))
  }
  return false
}

function manifestTools(value: unknown) {
  if (!value || typeof value !== "object") return []
  const tools = (value as { tools?: unknown }).tools
  if (!Array.isArray(tools)) return []
  const rows: { name: string; entry: string; export: string }[] = []
  for (const tool of tools) {
    const runtime = (tool as { runtime?: { entry?: string; export?: string } }).runtime
    const name = (tool as { name?: string }).name
    if (!runtime?.entry || !runtime.export || !name) continue
    rows.push({ name, entry: runtime.entry, export: runtime.export })
  }
  return rows
}

/** `@voyant-travel/trips/tools` -> `./tools` within its own package. */
function relativeEntry(entry: string, packageJson: PackageJson) {
  if (!packageJson.name) return entry
  if (entry === packageJson.name) return "."
  return entry.startsWith(`${packageJson.name}/`)
    ? `./${entry.slice(packageJson.name.length + 1)}`
    : entry
}

async function importFile(packageDirectory: string, target: string, packageName: string) {
  const absolute = path.resolve(packageDirectory, target)
  if (!existsSync(absolute)) {
    throw new Error(`${packageName}: export target ${target} does not exist`)
  }
  return (await import(pathToFileURL(absolute).href)) as Record<string, unknown>
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  for (const key of ["development", "import", "default", "node"]) {
    const resolved = exportTarget(record[key])
    if (resolved) return resolved
  }
  return undefined
}

function findPackageDirectories(packagesRoot: string) {
  const directories: string[] = []
  if (!existsSync(packagesRoot)) return directories
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = path.join(packagesRoot, entry.name)
    if (existsSync(path.join(directory, "package.json"))) directories.push(directory)
  }
  return directories.sort()
}
