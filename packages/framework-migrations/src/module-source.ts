/**
 * Load a schema-owning module PACKAGE's pre-built `migrations/` folder as a
 * collector {@link MigrationSource}, resolved by package NAME (voyant#3069).
 *
 * A source-backed deployment discovers each package's migrations via its
 * generated schema-path list ({@link discoverMigrationSources}); a **source-free
 * managed image** has no such list — it only knows the module package NAMES its
 * profile snapshot declares. This resolves a declared module's package root and
 * loads its `migrations/` the same way {@link loadFrameworkBundleSource} loads
 * the framework bundle, so the managed migrate booter can apply
 * `[framework, ...customModules]` deps-first with no drizzle-kit generation.
 *
 * The convention (Option 1 of voyant#3069): a schema-owning module package ships
 * a committed drizzle `migrations/` folder (`meta/_journal.json` + `*.sql`).
 * Modules that own no schema (e.g. payment plugins) ship none, and resolve to
 * `null` here — they need no migrations and are simply skipped.
 *
 * A package that ABSORBED another's migration history declares the retired ledger
 * source names in its `package.json` as `voyant.legacyMigrationSources`, and they
 * are loaded here as {@link MigrationSource.legacyNames}. That declaration has to
 * live in `package.json`: this path never resolves the graph, so a graph-manifest
 * facet is invisible to it, and a managed deployment that already recorded the
 * retired identities would re-run the moved migrations (voyant#4330).
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { MigrationSource } from "./collector.js"
import { loadMigrationFolder } from "./load-folder.js"

export interface LoadModuleBundleSourceOptions {
  /**
   * Apply order across sources (lower first). MUST be greater than the framework
   * bundle's `0` — a module's tables FK into framework tables, so the framework
   * bundle applies first.
   */
  priority: number
  /**
   * Module specifier/file to resolve `packageName` from (a path or `file:` URL).
   * Defaults to this module's location; pass the deployment's own location so
   * the module resolves against the deployment's installed dependency tree.
   */
  resolveFrom?: string | URL
  /**
   * Ledger source name (recorded in `_voyant_migrations`). Defaults to the
   * package's unscoped name so the same module records under one stable name
   * across source and managed modes. Override only to match an existing ledger.
   */
  name?: string
  /** Resolved migrations folder, bypassing package resolution (mainly for tests). */
  migrationsDir?: string
  /**
   * Retired ledger source names this package absorbed, when the caller already
   * knows them. Defaults to the package's own `voyant.legacyMigrationSources`,
   * which is what a source-free managed image has to read.
   */
  legacyNames?: readonly string[]
}

/** The unscoped package name (`@acme/loyalty` → `loyalty`) used as the ledger source name. */
export function moduleSourceName(packageName: string): string {
  return packageName.replace(/^@[^/]+\//, "")
}

/**
 * Walk up from a resolved entry file to the package root — the nearest ancestor
 * whose `package.json` `name` matches `packageName`. Robust to `dist/` nesting
 * and any scope, unlike a node_modules path regex.
 */
function resolvePackageRoot(packageName: string, entryPath: string): string | null {
  let dir = dirname(entryPath)
  for (;;) {
    const packageJsonPath = join(dir, "package.json")
    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string }
        if (parsed.name === packageName) return dir
      } catch {
        // Unreadable/partial package.json — keep walking.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** The directory to start a `node_modules` walk from, given a file/dir path or `file:` URL. */
function toStartDir(resolveFrom: string | URL): string {
  const path =
    resolveFrom instanceof URL ||
    (typeof resolveFrom === "string" && resolveFrom.startsWith("file:"))
      ? fileURLToPath(resolveFrom)
      : resolveFrom
  try {
    return statSync(path).isDirectory() ? path : dirname(path)
  } catch {
    return dirname(path)
  }
}

/**
 * Locate an installed package's root by walking `node_modules` up from
 * `resolveFrom`, matching the `package.json` `name`. Ignores package `exports`
 * conditions, so it resolves ESM-only ("import"-only) packages that
 * `require.resolve` rejects with `ERR_PACKAGE_PATH_NOT_EXPORTED` — the publish
 * shape used across this repo. Only the package root is needed here (to read its
 * committed `migrations/`), so no entry-point resolution is required.
 */
function findInstalledPackageRoot(packageName: string, resolveFrom: string | URL): string | null {
  let dir = toStartDir(resolveFrom)
  for (;;) {
    const packageJsonPath = join(dir, "node_modules", packageName, "package.json")
    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string }
        if (parsed.name === packageName) return dirname(packageJsonPath)
      } catch {
        // Unreadable/partial package.json — keep walking.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function resolveModulePackageRoot(packageName: string, resolveFrom: string | URL): string | null {
  let entryPath: string | null = null
  try {
    entryPath = createRequire(resolveFrom).resolve(packageName)
  } catch {
    // ESM-only packages (import-only `exports`) reject the CommonJS `require`
    // condition — fall back to a package-root walk that ignores export conditions.
    entryPath = null
  }
  return entryPath
    ? resolvePackageRoot(packageName, entryPath)
    : findInstalledPackageRoot(packageName, resolveFrom)
}

/**
 * The retired ledger source names a package absorbed, from its own manifest.
 *
 * The ledger is keyed `(source, tag)` on the unscoped package name, so when a
 * module consolidation moves another package's tags into this one they would
 * otherwise not be found under the new name and would re-run against objects
 * that already exist (voyant#4330). This is read from `package.json` rather than
 * from the package's graph manifest because the managed image is SOURCE-FREE: it
 * resolves a module by package name and reads its committed `migrations/` folder,
 * and never resolves the graph. `package.json` is the one declaration both it and
 * the graph-driven plan can see — the same reason `voyant.requiresSchemas` lives
 * there.
 */
function declaredLegacySources(packageRoot: string): readonly string[] {
  try {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      voyant?: { legacyMigrationSources?: readonly string[] }
    }
    const declared = manifest.voyant?.legacyMigrationSources
    return Array.isArray(declared)
      ? declared.filter((name) => typeof name === "string" && name.length > 0)
      : []
  } catch {
    // Unreadable/partial package.json — the migrations folder is what matters.
    return []
  }
}

/**
 * Load a module package's pre-built migrations as a {@link MigrationSource}, or
 * `null` when the package ships no `migrations/` folder (it owns no schema).
 * Throws only if a present `migrations/` folder is malformed (missing SQL a
 * journal references) — a packaging error, surfaced rather than applied partially.
 */
export async function loadModuleBundleSource(
  packageName: string,
  options: LoadModuleBundleSourceOptions,
): Promise<MigrationSource | null> {
  const packageRoot = options.migrationsDir
    ? null
    : resolveModulePackageRoot(packageName, options.resolveFrom ?? import.meta.url)
  const migrationsDir =
    options.migrationsDir ?? (packageRoot ? join(packageRoot, "migrations") : null)
  if (!migrationsDir) return null
  if (!existsSync(join(migrationsDir, "meta", "_journal.json"))) return null

  const legacyNames = options.legacyNames ?? (packageRoot ? declaredLegacySources(packageRoot) : [])

  return {
    name: options.name ?? moduleSourceName(packageName),
    ...(legacyNames.length > 0 ? { legacyNames: [...legacyNames] } : {}),
    priority: options.priority,
    migrations: await loadMigrationFolder(migrationsDir),
  }
}

export interface CollectDeploymentMigrationSourcesOptions {
  /** Framework bundle folder override (defaults to the shipped bundle). */
  frameworkBundleDir?: string
  /**
   * Custom schema-owning module package names to load AFTER the framework
   * bundle, in deps-first order (framework metadata's `moduleSources`).
   */
  modulePackages?: readonly string[]
  /** Where to resolve module packages from (the deployment's location). */
  resolveFrom?: string | URL
}

/**
 * The ordered migration sources for a deployment: the framework bundle
 * (priority 0) followed by each declared custom schema-owning module's pre-built
 * migrations (priority 1..n, in declaration order). Pass the result straight to
 * `runDeploymentMigrations`. Modules that ship no migrations are skipped.
 */
export async function collectDeploymentMigrationSources(
  options: CollectDeploymentMigrationSourcesOptions = {},
): Promise<MigrationSource[]> {
  // Imported lazily to keep this module usable without eagerly resolving the
  // shipped framework bundle folder when only module sources are wanted.
  const { loadFrameworkBundleSource } = await import("./bundle.js")
  const sources: MigrationSource[] = [await loadFrameworkBundleSource(options.frameworkBundleDir)]

  let priority = 1
  for (const packageName of options.modulePackages ?? []) {
    const source = await loadModuleBundleSource(packageName, {
      priority,
      ...(options.resolveFrom ? { resolveFrom: options.resolveFrom } : {}),
    })
    if (source) {
      sources.push(source)
      priority += 1
    }
  }
  return sources
}
