import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  collectDeploymentMigrationSources,
  loadModuleBundleSource,
  moduleSourceName,
} from "./module-source.js"

const frameworkBundleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations")

/** Write a resolvable fake package with (optionally) a migrations/ folder. */
function writeFakePackage(
  root: string,
  packageName: string,
  {
    withMigrations,
    esmOnly = false,
    legacyMigrationSources,
  }: {
    withMigrations: boolean
    esmOnly?: boolean
    legacyMigrationSources?: readonly string[]
  },
): void {
  const pkgDir = join(root, "node_modules", ...packageName.split("/"))
  mkdirSync(pkgDir, { recursive: true })
  // `esmOnly` writes an import-only `exports` map (no `require`/`default`
  // condition), so `require.resolve` throws ERR_PACKAGE_PATH_NOT_EXPORTED — the
  // publish shape that must still resolve via the package-root walk.
  const packageJson = esmOnly
    ? {
        name: packageName,
        version: "1.0.0",
        type: "module",
        exports: { ".": { import: "./index.js" } },
      }
    : { name: packageName, version: "1.0.0", main: "index.js" }
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify(
      legacyMigrationSources
        ? { ...packageJson, voyant: { schemaVersion: "voyant.package.v1", legacyMigrationSources } }
        : packageJson,
    ),
  )
  writeFileSync(join(pkgDir, "index.js"), "export {}\n")
  if (!withMigrations) return
  const migrationsDir = join(pkgDir, "migrations")
  mkdirSync(join(migrationsDir, "meta"), { recursive: true })
  writeFileSync(
    join(migrationsDir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [{ idx: 0, tag: "0001_init", when: 1 }],
    }),
  )
  writeFileSync(join(migrationsDir, "0001_init.sql"), 'CREATE TABLE "loyalty_points" ("id" text);')
}

let root: string
let resolveFrom: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "voyant-module-source-"))
  resolveFrom = pathToFileURL(join(root, "consumer.js")).href
  writeFakePackage(root, "@acme/loyalty", { withMigrations: true })
  writeFakePackage(root, "@acme/analytics", { withMigrations: false })
  writeFakePackage(root, "@acme/esm-only", { withMigrations: true, esmOnly: true })
  writeFakePackage(root, "@acme/consolidated", {
    withMigrations: true,
    legacyMigrationSources: ["retired-module"],
  })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("moduleSourceName", () => {
  it("uses the unscoped package name as the stable ledger source name", () => {
    expect(moduleSourceName("@acme/loyalty")).toBe("loyalty")
    expect(moduleSourceName("@voyant-travel/bookings")).toBe("bookings")
    expect(moduleSourceName("plain-module")).toBe("plain-module")
  })
})

describe("loadModuleBundleSource (voyant#3069)", () => {
  it("loads a module package's pre-built migrations by name", async () => {
    const source = await loadModuleBundleSource("@acme/loyalty", { priority: 1, resolveFrom })

    expect(source).toEqual({
      name: "loyalty",
      priority: 1,
      migrations: [{ tag: "0001_init", sql: 'CREATE TABLE "loyalty_points" ("id" text);' }],
    })
  })

  it("returns null for a module that ships no migrations (owns no schema)", async () => {
    expect(await loadModuleBundleSource("@acme/analytics", { priority: 1, resolveFrom })).toBeNull()
  })

  it("returns null for an unresolvable package", async () => {
    expect(await loadModuleBundleSource("@acme/missing", { priority: 1, resolveFrom })).toBeNull()
  })

  it("resolves ESM-only (import-only exports) packages require.resolve rejects", async () => {
    // The publish shape used across this repo: `require.resolve` throws
    // ERR_PACKAGE_PATH_NOT_EXPORTED, so the migrations must be found by root walk.
    const source = await loadModuleBundleSource("@acme/esm-only", { priority: 2, resolveFrom })
    expect(source).not.toBeNull()
    expect(source?.name).toBe("esm-only")
    expect(source?.migrations.length).toBeGreaterThan(0)
  })

  it("adopts the retired ledger sources the package's manifest declares", async () => {
    // voyant#4330: the managed image resolves a module by NAME and never resolves
    // the graph, so the absorbed identities have to come off package.json. Without
    // this the moved tags are invisible under the new source name and re-run.
    const source = await loadModuleBundleSource("@acme/consolidated", { priority: 1, resolveFrom })
    expect(source?.name).toBe("consolidated")
    expect(source?.legacyNames).toEqual(["retired-module"])
  })

  it("leaves legacyNames unset for a package that absorbed nothing", async () => {
    const source = await loadModuleBundleSource("@acme/loyalty", { priority: 1, resolveFrom })
    expect(source?.legacyNames).toBeUndefined()
  })

  it("carries the declared legacy sources through the managed collection path", async () => {
    const sources = await collectDeploymentMigrationSources({
      frameworkBundleDir,
      modulePackages: ["@acme/consolidated"],
      resolveFrom,
    })
    expect(sources.find((source) => source.name === "consolidated")?.legacyNames).toEqual([
      "retired-module",
    ])
  })

  it("honors an explicit migrationsDir, bypassing package resolution", async () => {
    const source = await loadModuleBundleSource("@acme/loyalty", {
      priority: 3,
      name: "custom-ledger-name",
      migrationsDir: join(root, "node_modules", "@acme", "loyalty", "migrations"),
    })
    expect(source?.name).toBe("custom-ledger-name")
    expect(source?.priority).toBe(3)
  })
})

describe("collectDeploymentMigrationSources (voyant#3069)", () => {
  it("orders the framework bundle first, then custom modules deps-first", async () => {
    const sources = await collectDeploymentMigrationSources({
      frameworkBundleDir,
      modulePackages: ["@acme/loyalty"],
      resolveFrom,
    })

    expect(sources[0]?.name).toBe("framework")
    expect(sources[0]?.priority).toBe(0)
    expect(sources.map((s) => s.name)).toContain("loyalty")
    expect(sources.find((s) => s.name === "loyalty")?.priority).toBe(1)
  })

  it("skips declared modules that ship no migrations", async () => {
    const sources = await collectDeploymentMigrationSources({
      frameworkBundleDir,
      modulePackages: ["@acme/analytics", "@acme/loyalty"],
      resolveFrom,
    })

    expect(sources.map((s) => s.name)).toEqual(["framework", "loyalty"])
    // Priority is assigned only to loaded modules — no gap from the skipped one.
    expect(sources.find((s) => s.name === "loyalty")?.priority).toBe(1)
  })
})
