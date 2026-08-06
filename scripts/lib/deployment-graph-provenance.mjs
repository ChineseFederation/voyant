import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { parse } from "yaml"

const dependencySections = ["dependencies", "optionalDependencies", "devDependencies"]
const ignoredWorkspaceDirs = new Set([".audit", ".git", ".turbo", "build", "dist", "node_modules"])
const voyantPackageMetadataSchemaVersion = "voyant.package.v1"
const voyantPackageKinds = new Set([
  "framework",
  "library",
  "module",
  "plugin",
  "adapter",
  "provider",
])
const voyantDeploymentModes = new Set(["managed-cloud", "self-hosted", "local"])

export function readPnpmLockfilePackageRecords(options) {
  const repoRoot = options.repoRoot ?? process.cwd()
  const projectRoot = options.projectRoot ?? repoRoot
  const lockfilePath = options.lockfilePath ?? path.join(repoRoot, "pnpm-lock.yaml")
  const workspacePackageInfo = readWorkspacePackageInfo(repoRoot)
  const installedPackageInfo = readInstalledPackageInfo(projectRoot, repoRoot, options.packageNames)
  return packageRecordsFromPnpmLockfile(readFileSync(lockfilePath, "utf8"), {
    packageNames: options.packageNames,
    importerPaths: options.importerPaths,
    workspacePackageVersions: options.workspacePackageVersions ?? workspacePackageInfo.versions,
    workspacePackageMetadata: options.workspacePackageMetadata ?? workspacePackageInfo.metadata,
    installedPackageMetadata: installedPackageInfo.metadata,
    installedPackageVersions: installedPackageInfo.versions,
    packageMetadata: options.packageMetadata,
  })
}

export function packageRecordsFromPnpmLockfile(lockfileText, options) {
  const lockfile = parse(lockfileText)
  const dependencies = indexImporterDependencies(lockfile?.importers ?? {}, options.importerPaths)
  const workspacePackageVersions = new Map(
    Object.entries(options.workspacePackageVersions ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  const packageMetadata = new Map(
    Object.entries({
      ...(options.workspacePackageMetadata ?? {}),
      ...(options.packageMetadata ?? {}),
    })
      .map(([packageName, metadata]) => [packageName, normalizeVoyantPackageMetadata(metadata)])
      .filter(([, metadata]) => metadata),
  )
  const installedPackageMetadata = new Map(
    Object.entries(options.installedPackageMetadata ?? {})
      .map(([packageName, metadata]) => [packageName, normalizeVoyantPackageMetadata(metadata)])
      .filter(([, metadata]) => metadata),
  )
  const installedPackageVersions = new Map(
    Object.entries(options.installedPackageVersions ?? {}).filter(
      ([, version]) => typeof version === "string" && version.length > 0,
    ),
  )

  return [...new Set(options.packageNames)]
    .sort((left, right) => left.localeCompare(right))
    .map((packageName) =>
      packageRecordForPackage(packageName, {
        lockfile,
        dependencies: dependencies.get(packageName) ?? [],
        workspacePackageVersions,
        packageMetadata,
        installedPackageMetadata,
        installedPackageVersions,
      }),
    )
}

export function readWorkspacePackageVersions(repoRoot) {
  return readWorkspacePackageInfo(repoRoot).versions
}

export function readWorkspacePackageMetadata(repoRoot) {
  return readWorkspacePackageInfo(repoRoot).metadata
}

function readInstalledPackageInfo(projectRoot, repoRoot, packageNames) {
  const metadata = {}
  const versions = {}
  for (const packageName of [...new Set(packageNames)].sort((left, right) =>
    left.localeCompare(right),
  )) {
    for (const root of [...new Set([projectRoot, repoRoot])]) {
      const packageJsonPath = path.join(root, "node_modules", packageName, "package.json")
      if (!existsSync(packageJsonPath)) continue
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
      if (typeof packageJson.version === "string") versions[packageName] = packageJson.version
      const normalized = normalizeVoyantPackageMetadata(packageJson.voyant)
      if (normalized) metadata[packageName] = normalized
      break
    }
  }
  return { metadata, versions }
}

function readWorkspacePackageInfo(repoRoot) {
  const versions = {}
  const metadata = {}
  for (const packageJsonPath of listPackageJsonFiles(repoRoot)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    if (typeof packageJson.name !== "string") continue
    if (typeof packageJson.version === "string") {
      versions[packageJson.name] = packageJson.version
    }
    const packageMetadata = normalizeVoyantPackageMetadata(packageJson.voyant)
    if (packageMetadata) {
      metadata[packageJson.name] = packageMetadata
    }
  }
  return { versions, metadata }
}

function packageRecordForPackage(packageName, context) {
  const dependency = chooseDependency(
    packageName,
    context.dependencies,
    context.workspacePackageVersions,
  )
  if (!dependency) {
    return withPackageMetadata(
      unknownPackageRecord(packageName, context.workspacePackageVersions.get(packageName)),
      packageName,
      context,
    )
  }

  if (isWorkspaceDependency(dependency)) {
    return withPackageMetadata(
      {
        packageName,
        ...versionField(context.workspacePackageVersions.get(packageName)),
        source: {
          kind: "workspace",
          reference: dependency.version,
        },
      },
      packageName,
      context,
    )
  }

  if (dependency.version.startsWith("file:")) {
    return withPackageMetadata(
      {
        packageName,
        source: { kind: "file", reference: dependency.version },
      },
      packageName,
      context,
    )
  }

  if (isGitReference(dependency.version)) {
    return withPackageMetadata(
      {
        packageName,
        source: { kind: "git", reference: dependency.version },
      },
      packageName,
      context,
    )
  }

  const version = basePnpmVersion(dependency.version)
  const integrity = context.lockfile?.packages?.[`${packageName}@${version}`]?.resolution?.integrity
  return withPackageMetadata(
    {
      packageName,
      ...versionField(version),
      source: {
        kind: "registry",
        reference: `pnpm-lock:${packageName}@${dependency.version}`,
        ...(typeof integrity === "string" ? { integrity } : {}),
      },
    },
    packageName,
    context,
  )
}

function withPackageMetadata(record, packageName, context) {
  const declaredMetadata = context.packageMetadata.get(packageName)
  const installedVersion = context.installedPackageVersions.get(packageName)
  const installedMetadata =
    record.source.kind !== "registry" || record.version === installedVersion
      ? context.installedPackageMetadata.get(packageName)
      : undefined
  const metadata = declaredMetadata ?? installedMetadata
  if (!metadata) return record
  return {
    ...record,
    metadata,
  }
}

function chooseDependency(packageName, dependencies, workspacePackageVersions) {
  if (workspacePackageVersions.has(packageName)) {
    return dependencies.find(isWorkspaceDependency)
  }
  return [...dependencies].sort(compareDependencies)[0]
}

function unknownPackageRecord(packageName, version) {
  return {
    packageName,
    ...versionField(version),
    source: { kind: "unknown" },
  }
}

function versionField(version) {
  return typeof version === "string" && version.length > 0 ? { version } : {}
}

function indexImporterDependencies(importers, importerPaths) {
  const selectedImporters = importerPaths ? new Set(importerPaths) : undefined
  const dependencies = new Map()

  for (const [importerPath, importer] of Object.entries(importers)) {
    if (selectedImporters && !selectedImporters.has(importerPath)) continue

    for (const section of dependencySections) {
      for (const [packageName, value] of Object.entries(importer?.[section] ?? {})) {
        if (!value || typeof value !== "object" || typeof value.version !== "string") continue
        const entries = dependencies.get(packageName) ?? []
        entries.push({
          importerPath,
          section,
          specifier: typeof value.specifier === "string" ? value.specifier : "",
          version: value.version,
        })
        dependencies.set(packageName, entries)
      }
    }
  }

  return dependencies
}

function compareDependencies(left, right) {
  return (
    dependencyRank(left) - dependencyRank(right) ||
    left.importerPath.localeCompare(right.importerPath) ||
    left.section.localeCompare(right.section) ||
    left.version.localeCompare(right.version)
  )
}

function dependencyRank(entry) {
  if (isWorkspaceDependency(entry)) return 0
  if (entry.version.startsWith("file:")) return 1
  if (isGitReference(entry.version)) return 2
  return 3
}

function isWorkspaceDependency(entry) {
  return entry.version.startsWith("link:") || entry.specifier.startsWith("workspace:")
}

function isGitReference(value) {
  return value.startsWith("git+") || value.startsWith("github:") || value.includes(".git#")
}

function basePnpmVersion(value) {
  return value.split("(")[0] ?? value
}

function normalizeVoyantPackageMetadata(value) {
  if (!isRecord(value)) return undefined
  if (value.schemaVersion !== voyantPackageMetadataSchemaVersion) return undefined
  if (!voyantPackageKinds.has(value.kind)) return undefined

  const compatibleWith = normalizeCompatibleWith(value.compatibleWith)
  const requires = normalizeCapabilityDeclaration(value.requires)
  const manifest = normalizeString(value.manifest)
  const runtime = normalizePackageRuntime(value.runtime)
  const schema = normalizeString(value.schema)
  const requiresSchemas = normalizeStringList(value.requiresSchemas)
  const legacyMigrationSources = normalizeStringList(value.legacyMigrationSources)
  return {
    schemaVersion: voyantPackageMetadataSchemaVersion,
    kind: value.kind,
    ...(manifest ? { manifest } : {}),
    ...(runtime ? { runtime } : {}),
    ...(compatibleWith ? { compatibleWith } : {}),
    ...(requires ? { requires } : {}),
    ...(schema ? { schema } : {}),
    ...(requiresSchemas ? { requiresSchemas } : {}),
    ...(legacyMigrationSources ? { legacyMigrationSources } : {}),
  }
}

function normalizePackageRuntime(value) {
  if (!isRecord(value)) return undefined
  const entry = normalizeString(value.entry)
  const exportName = normalizeString(value.export)
  return entry && exportName ? { entry, export: exportName } : undefined
}

function normalizeCompatibleWith(value) {
  if (!isRecord(value)) return undefined

  const framework = normalizeString(value.framework)
  const targets = normalizeStringList(value.targets)
  const modes = normalizeStringList(value.modes, { allowedValues: voyantDeploymentModes })
  const compatibleWith = {
    ...(framework ? { framework } : {}),
    ...(targets ? { targets } : {}),
    ...(modes ? { modes } : {}),
  }
  return Object.keys(compatibleWith).length > 0 ? compatibleWith : undefined
}

function normalizeCapabilityDeclaration(value) {
  if (!isRecord(value)) return undefined

  const capabilities = normalizeStringList(value.capabilities)
  const ports = normalizePorts(value.ports)
  const declaration = {
    ...(capabilities ? { capabilities } : {}),
    ...(ports ? { ports } : {}),
  }
  return Object.keys(declaration).length > 0 ? declaration : undefined
}

function normalizePorts(value) {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  const ports = []
  const seen = new Set()

  for (const entry of entries) {
    const port = normalizePort(entry)
    if (!port || seen.has(port.id)) continue
    seen.add(port.id)
    ports.push(port)
  }

  return ports.length > 0 ? ports : undefined
}

function normalizePort(value) {
  if (typeof value === "string") {
    const id = normalizeString(value)
    return id ? { id } : undefined
  }

  if (!isRecord(value)) return undefined
  const id = normalizeString(value.id)
  if (!id) return undefined
  return {
    id,
    ...(typeof value.optional === "boolean" ? { optional: value.optional } : {}),
  }
}

function normalizeStringList(value, options = {}) {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  const values = []
  const seen = new Set()

  for (const entry of entries) {
    const normalized = normalizeString(entry)
    if (!normalized || options.allowedValues?.has(normalized) === false || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    values.push(normalized)
  }

  return values.length > 0 ? values : undefined
}

function normalizeString(value) {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function listPackageJsonFiles(rootDir) {
  const files = []
  walk(rootDir)
  return files.sort((left, right) => left.localeCompare(right))

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/")

      if (entry.isDirectory()) {
        if (ignoredWorkspaceDirs.has(entry.name) || relativePath.startsWith(".claude/worktrees/")) {
          continue
        }
        walk(fullPath)
        continue
      }

      if (entry.isFile() && entry.name === "package.json" && existsSync(fullPath)) {
        files.push(fullPath)
      }
    }
  }
}
