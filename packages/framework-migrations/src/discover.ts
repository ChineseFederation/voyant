/**
 * Portable migration-source discovery for deployment runners.
 *
 * A deployment migrates the schema owned by a set of packages (its mounted
 * modules + extensions + additionalSchemas, plus the base `db` package) and its
 * own template-local migrations. Each schema-owning package SHIPS its
 * own drizzle `migrations/` folder; this resolves them — in topological order so
 * a package's dependencies apply first — from the SAME generated schema list the
 * deployment's `drizzle.config` consumes (`drizzle.schemas.generated.ts`).
 *
 * Layout-agnostic: each generated schema path is mapped back to the owning
 * package by matching either
 *   • a monorepo path `…/packages/<dir>/…`                       (apps/operator), or
 *   • an installed path `…/node_modules/@voyant-travel/<name>/…` (npm deployments,
 *     including pnpm's `…/.pnpm/…/node_modules/@voyant-travel/<name>/…`).
 * The package's own folder (its root) is the substring up to that boundary, so
 * `<root>/migrations` + `<root>/package.json` resolve without Node module
 * resolution (which many packages don't expose via `./package.json`). The source
 * NAME is the package directory / unscoped name — matching the cutline manifest.
 *
 * Dependency-free + filesystem-injectable so it can be unit-tested without a real
 * workspace. See `docs/architecture/migration-collector-d2.md`.
 */
import { existsSync as fsExists, readFileSync as fsRead } from "node:fs"
import { isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"

/** The collector source name for the deployment's own migrations folder. */
export const DEPLOYMENT_SOURCE = "deployment"

/** A discovered, ordered migration source: a package folder or the deployment. */
export interface DiscoveredSource {
  /** Collector source name — a package dir / unscoped name, or `"deployment"`. */
  name: string
  /** Absolute path to the drizzle migrations folder for this source. */
  migrationsDir: string
  /** Whether that folder actually ships migrations (`meta/_journal.json`). */
  hasMigrations: boolean
  /**
   * Retired ledger source names this package absorbed
   * (`voyant.legacyMigrationSources`), for `MigrationSource.legacyNames`. Absent
   * when it absorbed none. A deployment that already applied the retired
   * source's tags finds them under that name, and would otherwise re-run them
   * against objects that exist (voyant#4330).
   */
  legacyNames?: readonly string[]
}

/** Injectable filesystem surface (defaults to `node:fs`) for testability. */
export interface Fs {
  existsSync(path: string): boolean
  readFileSync(path: string, enc: "utf8"): string
}

const defaultFs: Fs = {
  existsSync: fsExists,
  readFileSync: (p, enc) => fsRead(p, enc),
}

export interface DiscoverOptions {
  /** Absolute dir the (relative) schema paths resolve against — the deployment
   *  root where `drizzle.config` lives. */
  baseDir: string
  /** Absolute path to the deployment's own migrations folder (its link tables +
   *  custom modules). Discovered as the `"deployment"` source, applied LAST. */
  deploymentMigrationsDir: string
  fs?: Fs
}

/** The owning package's relative root + source name for a generated schema path,
 *  or null for a deployment-local schema (`./…`, no package boundary). */
export function packageRootOfSchemaPath(
  schemaPath: string,
): { rootRel: string; name: string } | null {
  const fsPath = schemaPath.startsWith("file:") ? fileURLToPath(schemaPath) : schemaPath
  // npm / pnpm: the LAST `node_modules/@voyant-travel/<name>` wins (pnpm nests a
  // second node_modules under `.pnpm/<pkg>@<ver>_<hash>/`).
  const npm = fsPath.match(/^(.*\/node_modules\/@voyant-travel\/([^/]+))\//)
  if (npm) return { rootRel: npm[1] as string, name: npm[2] as string }
  // monorepo: `…/packages/<dir>/…`.
  const mono = fsPath.match(/^(.*packages\/([^/]+))\//)
  if (mono) return { rootRel: mono[1] as string, name: mono[2] as string }
  return null // ./drizzle.links.generated.ts, ./src/… → deployment-local
}

interface PkgMeta {
  name: string
  /** `@voyant-travel/…` package name (for resolving requiresSchemas edges). */
  pkgName: string
  requires: string[]
  legacyNames: string[]
  migrationsDir: string
  hasMigrations: boolean
}

function readPkgMeta(name: string, packageRoot: string, fs: Fs): PkgMeta {
  let pkgName = `@voyant-travel/${name}`
  let requires: string[] = []
  let legacyNames: string[] = []
  const pjPath = join(packageRoot, "package.json")
  if (fs.existsSync(pjPath)) {
    const pj = JSON.parse(fs.readFileSync(pjPath, "utf8")) as {
      name?: string
      voyant?: { requiresSchemas?: string[]; legacyMigrationSources?: string[] }
    }
    pkgName = pj.name ?? pkgName
    requires = pj.voyant?.requiresSchemas ?? []
    legacyNames = pj.voyant?.legacyMigrationSources ?? []
  }
  const migrationsDir = join(packageRoot, "migrations")
  return {
    name,
    pkgName,
    requires,
    legacyNames,
    migrationsDir,
    hasMigrations: fs.existsSync(join(migrationsDir, "meta", "_journal.json")),
  }
}

/**
 * Discover the ordered migration sources for a deployment.
 *
 * Returns package sources in deps-first topological order, followed by the
 * deployment source (`opts.deploymentMigrationsDir`) last — its link tables FK
 * into package tables, so it must apply after every package.
 */
export function discoverMigrationSources(
  schemaPaths: readonly string[],
  opts: DiscoverOptions,
): DiscoveredSource[] {
  const fs = opts.fs ?? defaultFs
  const abs = (rel: string) => (isAbsolute(rel) ? rel : join(opts.baseDir, rel))

  // De-duplicated owning packages, preserving first-seen order.
  const order: string[] = []
  const roots = new Map<string, string>() // name -> absolute package root
  let hasDeploymentSchema = false
  for (const p of schemaPaths) {
    const info = packageRootOfSchemaPath(p)
    if (info === null) {
      hasDeploymentSchema = true
    } else if (!roots.has(info.name)) {
      order.push(info.name)
      roots.set(info.name, abs(info.rootRel))
    }
  }

  const metas = new Map<string, PkgMeta>()
  for (const name of order) metas.set(name, readPkgMeta(name, roots.get(name) as string, fs))
  // pkgName -> name, to resolve requiresSchemas edges to present sources only.
  const nameByPkg = new Map<string, string>()
  for (const m of metas.values()) nameByPkg.set(m.pkgName, m.name)

  // Deps-first topological order over the present packages (edges = requiresSchemas
  // that resolve to another present package). Stable: visits in first-seen order.
  const sorted: string[] = []
  const seen = new Set<string>()
  const visit = (name: string, stack: Set<string>) => {
    if (seen.has(name) || stack.has(name)) return // cycle guard: break, don't recurse
    stack.add(name)
    const meta = metas.get(name)
    if (meta) {
      for (const dep of meta.requires) {
        const depName = nameByPkg.get(dep)
        if (depName) visit(depName, stack)
      }
    }
    stack.delete(name)
    if (!seen.has(name)) {
      seen.add(name)
      sorted.push(name)
    }
  }
  for (const name of order) visit(name, new Set())

  const sources: DiscoveredSource[] = sorted.map((name) => {
    const m = metas.get(name) as PkgMeta
    return {
      name,
      migrationsDir: m.migrationsDir,
      hasMigrations: m.hasMigrations,
      ...(m.legacyNames.length > 0 ? { legacyNames: m.legacyNames } : {}),
    }
  })

  if (hasDeploymentSchema) {
    sources.push({
      name: DEPLOYMENT_SOURCE,
      migrationsDir: opts.deploymentMigrationsDir,
      hasMigrations: fs.existsSync(join(opts.deploymentMigrationsDir, "meta", "_journal.json")),
    })
  }
  return sources
}
