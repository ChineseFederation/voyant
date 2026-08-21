#!/usr/bin/env node
/**
 * Enforces the deployment-graph cold-start invariant from
 * docs/architecture/unified-deployment-graph.md.
 *
 * Graph declaration and generated metadata entrypoints must be cheap to import:
 * static imports may reach manifest math helpers, but must not pull route,
 * schema, UI, workflow, runtime, or provider graphs into discovery.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const repoRoot = process.cwd()
const DEFAULT_ENTRY_SURFACES = [
  {
    id: "framework-deployment-graph",
    file: "packages/framework/src/deployment-graph.ts",
  },
  {
    id: "framework-deployment-artifacts",
    file: "packages/framework/src/deployment-artifacts.ts",
  },
  {
    id: "operator-project",
    file: "apps/operator/voyant.config.ts",
  },
  ...discoverPackageManifestEntries(repoRoot),
]

const ALLOWED_EXTERNAL_IMPORTS = new Set(["@voyant-travel/hono/composition"])
const ALLOWED_PACKAGE_MANIFEST_IMPORTS = new Set([
  "@voyant-travel/core/project",
  // The authoring helpers moved here; core/project re-exports them.
  "@voyant-travel/graph-contracts",
  "@voyant-travel/framework/project",
])

const ALLOWED_EXTERNAL_IMPORT_PATTERNS = [
  /\/workflow-[^/]+-manifest$/,
  /\/[^/]+-workflow-manifest$/,
]
const ALLOWED_PACKAGE_MANIFEST_IMPORT_PATTERNS = [
  /\/ports$/,
  // A package with more than one seam names them, so the contract subpath is
  // `<seam>-runtime-port` rather than the bare `runtime-port` a single-seam
  // package can use. Both are the same kind of thing — a `definePort` contract
  // and its types — and a manifest has to name the port it provides or requires.
  /\/[^/]*runtime-port$/,
  /\/[^/]+-manifest$/,
]

const FORBIDDEN_EXTERNAL_IMPORTS = new Map([
  [
    "@voyant-travel/framework/managed-runtime",
    "managed runtime route/provider graph must stay behind a dynamic import",
  ],
])

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"]
const TEST_PATH_SEGMENTS = new Set(["__tests__", "tests"])

const entrySurfaces = parseArgs(process.argv.slice(2))
const failures = []
const checkedFiles = new Set()

for (const entry of entrySurfaces) {
  const entryPath = path.resolve(repoRoot, entry.file)
  if (!existsSync(entryPath)) {
    failures.push({
      code: "missing-entry",
      entry,
      importer: entryPath,
      message: `entry surface ${entry.file} does not exist`,
    })
    continue
  }
  walkEntry(entry, entryPath, new Set())
}

if (failures.length > 0) {
  console.error("Deployment graph import-cheap check failed.")
  for (const failure of failures) {
    console.error(formatFailure(failure))
  }
  process.exit(1)
}

console.log(
  `check-deployment-graph-import-cheap: OK (${entrySurfaces.length} entry surfaces, ${checkedFiles.size} files)`,
)

function walkEntry(entry, filePath, activeStack) {
  const resolved = path.resolve(filePath)
  if (activeStack.has(resolved)) return
  checkedFiles.add(resolved)

  const source = readFileSync(resolved, "utf8")
  for (const edge of staticRuntimeImports(source)) {
    const violation = forbiddenImport(edge.specifier, resolved, entry)
    if (violation) {
      failures.push({
        code: violation.code,
        entry,
        importer: resolved,
        specifier: edge.specifier,
        message: violation.reason,
      })
      continue
    }

    if (!isRelativeSpecifier(edge.specifier)) continue
    const target = resolveSourceImport(path.dirname(resolved), edge.specifier)
    if (!target) {
      failures.push({
        code: "unresolved-import",
        entry,
        importer: resolved,
        specifier: edge.specifier,
        message: "static relative import could not be resolved",
      })
      continue
    }

    activeStack.add(resolved)
    walkEntry(entry, target, activeStack)
    activeStack.delete(resolved)
  }
}

function staticRuntimeImports(source) {
  const imports = []
  const declarations = /(^|[;\n])\s*(import|export)\s+([^'"();]*?)\s+from\s*["']([^"']+)["']/gs
  let match = declarations.exec(source)
  while (match) {
    const kind = match[2]
    const clause = match[3].trim()
    if (!isTypeOnlyImport(kind, clause)) {
      imports.push({ specifier: match[4] })
    }
    match = declarations.exec(source)
  }

  const sideEffects = /(^|[;\n])\s*import\s*["']([^"']+)["']/gs
  match = sideEffects.exec(source)
  while (match) {
    imports.push({ specifier: match[2] })
    match = sideEffects.exec(source)
  }

  return imports
}

function isTypeOnlyImport(kind, clause) {
  if (clause.startsWith("type ")) return true
  if (kind !== "export") return false
  const named = clause.match(/^\{([^}]*)\}$/s)
  if (!named) return false
  const entries = named[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.length > 0 && entries.every((entry) => entry.startsWith("type "))
}

function forbiddenImport(specifier, importer, entry) {
  if (specifier.startsWith("node:")) return undefined
  if (!isRelativeSpecifier(specifier) && isPackageManifestEntry(entry)) {
    const allowed =
      ALLOWED_PACKAGE_MANIFEST_IMPORTS.has(specifier) ||
      ALLOWED_PACKAGE_MANIFEST_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier))
    if (!allowed) {
      return {
        code: "runtime-heavy-import",
        reason:
          "package manifests may import only project authoring helpers, port contracts, or dedicated manifest subpaths",
      }
    }
    return undefined
  }
  if (ALLOWED_EXTERNAL_IMPORTS.has(specifier)) return undefined
  if (ALLOWED_EXTERNAL_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier))) {
    return undefined
  }

  const exactExternalReason = FORBIDDEN_EXTERNAL_IMPORTS.get(specifier)
  if (exactExternalReason) {
    return { code: "runtime-heavy-import", reason: exactExternalReason }
  }

  const labels = [specifier]
  if (isRelativeSpecifier(specifier)) {
    const target = resolveSourceImport(path.dirname(importer), specifier)
    if (target) labels.push(relativeToRepo(target))
  }

  for (const label of labels) {
    const normalized = label.replaceAll("\\", "/")
    const reason = forbiddenPathReason(normalized)
    if (reason) return { code: "runtime-heavy-import", reason }
  }

  return undefined
}

function isPackageManifestEntry(entry) {
  return entry.packageManifest === true || entry.id === "package"
}

function forbiddenPathReason(value) {
  const segments = value.split("/").filter(Boolean)
  if (segments.some((segment) => TEST_PATH_SEGMENTS.has(segment))) return undefined

  const basename = segments.at(-1) ?? value
  const basenameWithoutExt = basename.replace(/\.[^.]+$/, "")

  if (value.endsWith(".tsx") || segments.some((segment) => segment.endsWith("-react"))) {
    return "UI/React graph must not be statically imported by deployment graph discovery"
  }
  if (matchesSegment(segments, /^(routes?|api-routes|routes-.+)$/)) {
    return "route graph must stay behind a lazy runtime import"
  }
  if (matchesSegment(segments, /^(schema|schemas|drizzle|migrations)$/)) {
    return "schema and migration graphs must not be statically imported by manifest discovery"
  }
  if (/^(schema|schemas|drizzle|migrations)(\.|$|-)/.test(basenameWithoutExt)) {
    return "schema and migration graphs must not be statically imported by manifest discovery"
  }
  if (matchesSegment(segments, /^(workflows?|workflow-.+)$/)) {
    return "workflow graph must stay behind a lazy runtime import"
  }
  if (matchesSegment(segments, /^(providers?|runtime)$/)) {
    return "provider/runtime graph must stay behind a lazy runtime import"
  }
  if (/^(managed-runtime|runtime|server|service-.+|.*-service)$/.test(basenameWithoutExt)) {
    return "provider/runtime graph must stay behind a lazy runtime import"
  }

  return undefined
}

function matchesSegment(segments, pattern) {
  return segments.some((segment) => pattern.test(segment))
}

function resolveSourceImport(fromDir, specifier) {
  const candidate = path.resolve(fromDir, specifier)
  const candidates = [candidate]
  const extension = path.extname(candidate)
  if ([".js", ".mjs", ".cjs"].includes(extension)) {
    const withoutExtension = candidate.slice(0, -extension.length)
    candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`)
  }
  if (!extension) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${candidate}${extension}`)
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.push(path.join(candidate, `index${extension}`))
    }
  }

  for (const filePath of candidates) {
    if (existsSync(filePath) && statSync(filePath).isFile()) return filePath
  }
  return undefined
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/")
}

function discoverPackageManifestEntries(root) {
  const packageRoot = path.join(root, "packages")
  if (!existsSync(packageRoot)) return []

  return findPackageJsonFiles(packageRoot).flatMap((packageJsonPath) => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    const manifest = packageJson.voyant?.manifest
    if (typeof manifest !== "string" || manifest.length === 0) return []

    const exportTarget = packageExportTarget(
      packageJson.exports?.[manifest],
      path.dirname(packageJsonPath),
    )
    if (!exportTarget) {
      return [
        {
          id: packageJson.name ?? relativeToRepo(packageJsonPath),
          file: path.join(path.dirname(relativeToRepo(packageJsonPath)), manifest),
          packageManifest: true,
        },
      ]
    }

    return [
      {
        id: packageJson.name ?? relativeToRepo(packageJsonPath),
        file: relativeToRepo(path.resolve(path.dirname(packageJsonPath), exportTarget)),
        packageManifest: true,
      },
    ]
  })
}

function findPackageJsonFiles(directory) {
  const packageJsonPath = path.join(directory, "package.json")
  if (existsSync(packageJsonPath)) return [packageJsonPath]

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === "dist") return []
    return findPackageJsonFiles(path.join(directory, entry.name))
  })
}

function packageExportTarget(value, packageDirectory) {
  for (const target of packageExportTargets(value) ?? []) {
    if (validPackageExportTarget(packageDirectory, target)) return target
  }
  return undefined
}

function packageExportTargets(value) {
  if (typeof value === "string") return [value]
  if (Array.isArray(value))
    return value.flatMap((candidate) => packageExportTargets(candidate) ?? [])
  if (value === null) return []
  if (typeof value !== "object") return undefined
  for (const [condition, candidate] of Object.entries(value)) {
    if (condition !== "node" && condition !== "import" && condition !== "default") continue
    const targets = packageExportTargets(candidate)
    if (targets !== undefined) return targets
  }
  return undefined
}

function validPackageExportTarget(packageDirectory, target) {
  if (!target.startsWith("./")) return false
  const packageRoot = path.resolve(packageDirectory)
  const relative = path.relative(packageRoot, path.resolve(packageRoot, target))
  return !relative.startsWith("..") && !path.isAbsolute(relative)
}

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: node scripts/check-deployment-graph-import-cheap.mjs [--entry id:path]

Checks deployment graph declaration/generated metadata entry surfaces for
runtime-heavy static imports. Repeat --entry to test custom fixture entries.`)
    process.exit(0)
  }

  const entries = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg !== "--entry") throw new Error(`Unknown argument: ${arg}`)
    const value = args[index + 1]
    if (!value) throw new Error("--entry requires a value")
    index += 1
    const separatorIndex = value.indexOf(":")
    if (separatorIndex === -1) {
      entries.push({ id: value, file: value })
      continue
    }
    entries.push({
      id: value.slice(0, separatorIndex),
      file: value.slice(separatorIndex + 1),
    })
  }

  return entries.length > 0 ? entries : DEFAULT_ENTRY_SURFACES
}

function formatFailure(failure) {
  const location = failure.specifier
    ? `${relativeToRepo(failure.importer)} imports ${failure.specifier}`
    : relativeToRepo(failure.importer)
  return `  - [deployment-graph-import-cheap:${failure.code}] ${failure.entry.id}: ${location}. ${failure.message}.`
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/")
}
