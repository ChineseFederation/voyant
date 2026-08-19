#!/usr/bin/env node
/**
 * Cross-checks the resolved deployment graph's API bundles against the
 * committed package-owned OpenAPI documents.
 *
 * The graph is now the deploy-time source of API bundle declarations, while the
 * OpenAPI artifacts are the browsable/public contract. This checker keeps those
 * two views from drifting by requiring every graph API bundle to have at least
 * one documented path for its surface/module, unless the bundle is in the
 * temporary allowlist below.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"

import {
  buildDeploymentGraphOpenApiCoverageReport,
  formatDeploymentGraphOpenApiCoverageFailure,
  formatDeploymentGraphOpenApiCoverageGap,
} from "./lib/deployment-graph-openapi-coverage-report.mjs"

const DEFAULT_GRAPH = "apps/operator/.voyant/deployment-graph.generated.json"
const DEFAULT_OPENAPI_DIR = "packages"
const CHECKED_SURFACES = new Set(["admin", "public-api"])
// Ratchet only. The document names and owners remain authoritative in package
// manifests; this prevents migrated bundles from silently falling back to the
// Operator compatibility partition. The value is data so that a second checker
// can hold it without matching this file's source text — see the rule file.
const RATCHET_FILE = "scripts/checks/openapi/graph-coverage-ratchet.json"
const HTTP_METHODS = new Set([
  "connect",
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
])

const DEFAULT_ALLOWLIST = new Map()

const repoRoot = process.cwd()
const options = parseArgs(process.argv.slice(2))
const allowlist = new Map(options.useDefaultAllowlist ? DEFAULT_ALLOWLIST : [])
for (const [id, reason] of readAllowlistFiles(options.allowlistFiles)) {
  allowlist.set(id, reason)
}

const graphPath = path.resolve(repoRoot, options.graph)
const openapiDir = path.resolve(repoRoot, options.openapiDir)

/** A stale resolved graph, reported as an instruction rather than a stack trace. */
class StaleGraphError extends Error {}

const graph = readJson(graphPath)
let openapiRoots
try {
  openapiRoots = [
    ...discoverOpenApiRoots(openapiDir),
    ...discoverInstalledPackageOpenApiRoots(graph, graphPath),
  ]
} catch (error) {
  if (!(error instanceof StaleGraphError)) throw error
  console.error(
    `check-deployment-graph-openapi-coverage: stale deployment graph.\n\n${error.message}`,
  )
  process.exit(1)
}
const docs = readOpenApiCoverage(uniqueDirectories(openapiRoots))
const bundles = readApiBundles(graph)
const bundlesById = new Map(bundles.map((bundle) => [bundle.apiId, bundle]))
const documentClaims = new Set(
  bundles
    .filter((bundle) => bundle.openapiDocument)
    .map((bundle) => coverageKey(bundle.surface, bundle.openapiDocument)),
)
const failures = []
const coveredBundles = []
const allowlistedGaps = []

if (options.useDefaultAllowlist) {
  const minimum = readJson(path.resolve(repoRoot, RATCHET_FILE)).minimum
  const packageOwnedBundles = bundles.filter((bundle) => bundle.openapiDocument).length
  if (packageOwnedBundles < minimum) {
    failures.push({ kind: "authority-regression", actual: packageOwnedBundles, minimum })
  }
}

for (const bundle of bundles) {
  if (!CHECKED_SURFACES.has(bundle.surface)) continue

  if (bundle.openapiDocument && allowlist.has(bundle.apiId)) {
    failures.push({ kind: "stale-allowlist", bundle })
    continue
  }

  const matched = docs.documents.has(coverageKey(bundle.surface, bundle.openapiDocument))
  if (matched) {
    coveredBundles.push(bundle)
    if (allowlist.has(bundle.apiId)) {
      failures.push({ kind: "stale-allowlist", bundle })
    }
    continue
  }

  const reason = allowlist.get(bundle.apiId)
  if (reason) {
    allowlistedGaps.push({ bundle, reason })
  } else {
    failures.push({ kind: "missing-docs", bundle, nearby: nearbyDocuments(bundle, docs) })
  }
}

for (const [apiId, claims] of docs.apiIds) {
  const bundle = bundlesById.get(apiId)
  if (!bundle) {
    failures.push({ kind: "unknown-docs", apiId, files: claims.map((claim) => claim.file) })
  } else if (
    claims.some(
      (claim) =>
        claim.document !== bundle.openapiDocument ||
        claim.surface !== normalizeSurface(bundle.surface),
    )
  ) {
    failures.push({
      kind: "mismatched-docs",
      apiId,
      expected: coverageKey(bundle.surface, bundle.openapiDocument),
      files: claims.map((claim) => claim.file),
    })
  }
  const files = new Set(claims.map((claim) => claim.file))
  if (files.size > 1) {
    failures.push({ kind: "duplicate-docs", apiId, files: [...files].sort() })
  }
}

for (const [document, artifact] of docs.documents) {
  if (!documentClaims.has(document)) {
    failures.push({ kind: "unknown-document", document, files: artifact.files })
  }
}

for (const [document, owners] of docs.documentOwners) {
  if (owners.size > 1) {
    failures.push({ kind: "duplicate-document-owner", document, owners: [...owners].sort() })
  }
}

for (const id of allowlist.keys()) {
  if (!bundles.some((bundle) => bundle.apiId === id)) {
    failures.push({ kind: "stale-allowlist", apiId: id })
  }
}

const report = buildDeploymentGraphOpenApiCoverageReport(
  { graph, graphPath, openapiDir, docs, coveredBundles, allowlistedGaps, failures },
  relativeToRepo,
)

if (options.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.ok) process.exit(1)
  process.exit(0)
}

if (allowlistedGaps.length > 0) {
  console.warn("Deployment graph OpenAPI coverage warnings.")
  for (const gap of allowlistedGaps) {
    console.warn(
      formatDeploymentGraphOpenApiCoverageGap(gap.bundle, {
        reason: gap.reason,
        nearby: nearbyDocuments(gap.bundle, docs),
      }),
    )
  }
}

if (failures.length > 0) {
  console.error("Deployment graph OpenAPI coverage failed.")
  console.error(
    `Checked graph ${relativeToRepo(graphPath)} against OpenAPI docs in ${relativeToRepo(openapiDir)}.\n`,
  )
  for (const failure of failures)
    console.error(formatDeploymentGraphOpenApiCoverageFailure(failure))
  process.exit(1)
}

console.log(
  `check-deployment-graph-openapi-coverage: OK (${coveredBundles.length} covered graph API bundles, ${allowlistedGaps.length} allowlisted gaps, ${docs.keys.size} documented surface/module pairs)`,
)

function readApiBundles(resolvedGraph) {
  const units = [
    ...arrayOf(resolvedGraph.modules),
    ...arrayOf(resolvedGraph.extensions),
    ...arrayOf(resolvedGraph.plugins),
    ...arrayOf(resolvedGraph.adapters),
    ...arrayOf(resolvedGraph.providers),
  ]
  const bundles = []

  for (const unit of units) {
    for (const api of arrayOf(unit.api)) {
      if (!api || typeof api !== "object" || typeof api.id !== "string") continue
      const surface = normalizeSurface(api.surface)
      bundles.push({
        apiId: api.id,
        surface,
        graphSurface: api.surface,
        moduleId: stringOrEmpty(unit.id),
        localId: stringOrEmpty(unit.localId),
        packageName: stringOrEmpty(unit.packageName),
        mount: stringOrEmpty(api.mount),
        openapiDocument:
          api.openapi && typeof api.openapi === "object" ? stringOrEmpty(api.openapi.document) : "",
      })
    }
  }

  return bundles
}

function readOpenApiCoverage(openapiDirPaths) {
  const keys = new Set()
  const apiIds = new Map()
  const documentOwners = new Map()
  const documents = new Map()
  const files = []
  for (const openapiDirPath of openapiDirPaths) {
    if (!existsSync(openapiDirPath) || !statSync(openapiDirPath).isDirectory()) {
      throw new Error(`${relativeToRepo(openapiDirPath)} is missing or is not a directory`)
    }

    for (const surfaceEntry of readdirSync(openapiDirPath, { withFileTypes: true })) {
      if (!surfaceEntry.isDirectory()) continue
      const fileSurface = normalizeSurface(surfaceEntry.name)
      if (!CHECKED_SURFACES.has(fileSurface)) continue
      const surfaceDir = path.join(openapiDirPath, surfaceEntry.name)
      for (const fileEntry of readdirSync(surfaceDir, { withFileTypes: true })) {
        if (!fileEntry.isFile() || !fileEntry.name.endsWith(".json")) continue
        const filePath = path.join(surfaceDir, fileEntry.name)
        const fileModule = fileEntry.name.replace(/\.json$/, "")
        const documentKey = coverageKey(fileSurface, fileModule)
        const document = documents.get(documentKey) ?? { files: [] }
        document.files.push(relativeToRepo(filePath))
        documents.set(documentKey, document)
        const packageRoot = path.dirname(openapiDirPath)
        const documentOwnerKey = fileModule
        const owners = documentOwners.get(documentOwnerKey) ?? new Set()
        owners.add(relativeToRepo(packageRoot))
        documentOwners.set(documentOwnerKey, owners)
        const doc = readJson(filePath)
        const operations = documentedOperations(doc)
        if (operations.length === 0) continue

        let operationKeys = 0
        for (const operation of operations) {
          if (typeof operation["x-voyant-api-id"] === "string") {
            const apiId = operation["x-voyant-api-id"]
            const claims = apiIds.get(apiId) ?? []
            claims.push({
              document: fileModule,
              file: relativeToRepo(filePath),
              surface: fileSurface,
            })
            apiIds.set(apiId, claims)
          }
          const operationSurface = normalizeSurface(operation["x-voyant-surface"] ?? fileSurface)
          const operationModule = operation["x-voyant-module"] ?? fileModule
          if (typeof operationModule !== "string" || operationModule.length === 0) continue
          keys.add(coverageKey(operationSurface, operationModule))
          operationKeys += 1
        }

        if (operationKeys === 0) keys.add(coverageKey(fileSurface, fileModule))
        files.push(relativeToRepo(filePath))
      }
    }
  }

  return { files, keys, apiIds, documentOwners, documents }
}

function discoverOpenApiRoots(root) {
  const hasSurfaceDirectories = ["admin", "public-api"].some((surface) =>
    containsOpenApiDocument(path.join(root, surface)),
  )
  if (hasSurfaceDirectories) return [root]

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, "openapi"))
    .filter((directory) => existsSync(directory) && statSync(directory).isDirectory())
    .sort()
}

function discoverInstalledPackageOpenApiRoots(resolvedGraph, resolvedGraphPath) {
  const selectedPackageNames = new Set(
    [
      ...arrayOf(resolvedGraph.modules),
      ...arrayOf(resolvedGraph.extensions),
      ...arrayOf(resolvedGraph.plugins),
      ...arrayOf(resolvedGraph.adapters),
      ...arrayOf(resolvedGraph.providers),
    ]
      .filter((unit) => arrayOf(unit?.api).some((api) => stringOrEmpty(api?.openapi?.document)))
      .map((unit) => stringOrEmpty(unit?.packageName))
      .filter(Boolean),
  )
  const installRoots = [...new Set([graphProjectRoot(resolvedGraphPath), repoRoot])]
  const openapiRoots = []

  for (const record of arrayOf(resolvedGraph.packageRecords)) {
    const packageName = stringOrEmpty(record?.packageName)
    if (
      !packageName ||
      record?.source?.kind === "workspace" ||
      !selectedPackageNames.has(packageName)
    ) {
      continue
    }

    const packageRoot = installRoots
      .map((root) => path.join(root, "node_modules", packageName))
      .find((root) => existsSync(path.join(root, "package.json")))
    if (!packageRoot) continue

    const packageJson = readJson(path.join(packageRoot, "package.json"))
    if (packageJson.name !== packageName) {
      throw new Error(
        `${relativeToRepo(packageRoot)} contains ${stringOrEmpty(packageJson.name) || "an unnamed package"}, expected ${packageName}`,
      )
    }
    if (record.version && packageJson.version !== record.version) {
      // The graph is untracked build output, so it goes stale on any version
      // bump — a release, a rebase, a branch switch. That is the common cause
      // by a wide margin and the mismatch alone does not say so, which left the
      // reader debugging an install that was fine.
      throw new StaleGraphError(
        `${packageName} package record selects ${record.version}, but ` +
          `${relativeToRepo(packageRoot)} contains ${stringOrEmpty(packageJson.version) || "an unknown version"}.\n\n` +
          `${relativeToRepo(resolvedGraphPath)} is generated, untracked, and older than the ` +
          `installed packages. Regenerate it:\n\n` +
          "  pnpm --filter operator prepare:verify\n\n" +
          "If it persists after regenerating, the install is genuinely out of step: " +
          "pnpm install --frozen-lockfile",
      )
    }

    const openapiRoot = path.join(packageRoot, "openapi")
    if (existsSync(openapiRoot) && statSync(openapiRoot).isDirectory()) {
      openapiRoots.push(openapiRoot)
    }
  }

  return openapiRoots.sort()
}

function graphProjectRoot(resolvedGraphPath) {
  const graphDirectory = path.dirname(resolvedGraphPath)
  return path.basename(graphDirectory) === ".voyant" ? path.dirname(graphDirectory) : graphDirectory
}

function uniqueDirectories(directories) {
  const seen = new Set()
  return directories.filter((directory) => {
    const identity = realpathSync(directory)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function containsOpenApiDocument(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return false
  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    if (!entry.isFile() || !entry.name.endsWith(".json")) return false
    try {
      return typeof readJson(path.join(directory, entry.name)).openapi === "string"
    } catch {
      return false
    }
  })
}

function documentedOperations(doc) {
  const operations = []
  if (!doc || typeof doc !== "object" || !doc.paths || typeof doc.paths !== "object") {
    return operations
  }

  for (const pathItem of Object.values(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue
      if (operation && typeof operation === "object") operations.push(operation)
    }
  }
  return operations
}

/**
 * What to suggest when a bundle's document is missing.
 *
 * A bundle names exactly one document and the lookup is an exact key, so the
 * only useful thing to say is which key was wanted and what is nearby. This
 * replaces ~80 lines that derived a dozen candidate slugs from the package
 * name, mount, local id and graph fragment; every use of that list was a string
 * in an error message, and it made a failed exact-key lookup read as a naming
 * search — sending the reader after a document that was never being looked for.
 *
 * The two mistakes that actually happen are a document filed under the wrong
 * surface, and a document that does not exist yet.
 */
function nearbyDocuments(bundle, docs) {
  const wanted = stringOrEmpty(bundle.openapiDocument)
  if (!wanted) return []
  return [...docs.documents.keys()]
    .filter((key) => key.slice(key.indexOf(":") + 1) === wanted)
    .sort()
}

function normalizeSurface(surface) {
  // The public surface's documents live in `openapi/public-api/` since the
  // storefront entity was retired (voyant#4624).
  if (surface === "public") return "public-api"
  return String(surface ?? "").trim()
}

function coverageKey(surface, module) {
  return `${surface}:${module}`
}

function readAllowlistFiles(files) {
  const entries = []
  for (const file of files) {
    const allowlist = readJson(path.resolve(repoRoot, file))
    if (Array.isArray(allowlist)) {
      for (const item of allowlist) {
        if (typeof item === "string") entries.push([item, "external allowlist"])
        else if (item && typeof item.id === "string") {
          entries.push([item.id, stringOrEmpty(item.reason) || "external allowlist"])
        }
      }
      continue
    }
    if (allowlist && typeof allowlist === "object") {
      for (const [id, reason] of Object.entries(allowlist)) {
        entries.push([id, typeof reason === "string" ? reason : "external allowlist"])
      }
    }
  }
  return entries
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch (error) {
    throw new Error(`${relativeToRepo(filePath)} could not be read as JSON: ${error.message}`)
  }
}

function arrayOf(value) {
  return Array.isArray(value) ? value : []
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : ""
}

function parseArgs(args) {
  const options = {
    graph: DEFAULT_GRAPH,
    openapiDir: DEFAULT_OPENAPI_DIR,
    allowlistFiles: [],
    useDefaultAllowlist: true,
    json: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/check-deployment-graph-openapi-coverage.mjs [options]

Options:
  --graph <path>            Resolved graph JSON path. Default: ${DEFAULT_GRAPH}
  --openapi-dir <path>      Directory containing openapi/<surface>/*.json. Default: ${DEFAULT_OPENAPI_DIR}
  --allowlist <path>        JSON object or array of { "id", "reason" } entries to merge.
  --json                    Emit the stable OpenAPI coverage report as JSON.
  --no-default-allowlist    Disable the repository's temporary allowlist, useful for fixture tests.`)
      process.exit(0)
    }
    if (arg === "--graph") {
      index += 1
      options.graph = requireValue(args, index, arg)
    } else if (arg === "--openapi-dir") {
      index += 1
      options.openapiDir = requireValue(args, index, arg)
    } else if (arg === "--allowlist") {
      index += 1
      options.allowlistFiles.push(requireValue(args, index, arg))
    } else if (arg === "--no-default-allowlist") {
      options.useDefaultAllowlist = false
    } else if (arg === "--json") {
      options.json = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function requireValue(args, index, flag) {
  const value = args[index]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/")
}
