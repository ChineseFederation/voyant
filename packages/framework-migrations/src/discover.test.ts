import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DEPLOYMENT_SOURCE,
  discoverMigrationSources,
  type Fs,
  packageRootOfSchemaPath,
} from "./discover.js"

// A deep baseDir so the generated `../../…` relative paths resolve to clean,
// predictable absolute roots (matching the runtime's join(baseDir, rootRel)).
const BASE = "/work/app/admin"
const DEPLOY_MIGRATIONS = "/work/app/admin/migrations"
const absRoot = (rel: string) => join(BASE, rel)

/** In-memory fs: package.json by absolute root, + roots whose journal exists. */
function fakeFs(opts: {
  // keyed by ABSOLUTE root
  pkgs: Record<string, { name: string; requires?: string[]; absorbed?: string[] }>
  withJournal: string[] // absolute roots (or DEPLOY_MIGRATIONS) whose migrations/meta exists
}): Fs {
  const files = new Map<string, string>()
  for (const [root, pj] of Object.entries(opts.pkgs)) {
    files.set(
      join(root, "package.json"),
      JSON.stringify({
        name: pj.name,
        voyant: {
          requiresSchemas: pj.requires ?? [],
          ...(pj.absorbed ? { legacyMigrationSources: pj.absorbed } : {}),
        },
      }),
    )
  }
  const journals = new Set(
    opts.withJournal.map((r) =>
      r === DEPLOY_MIGRATIONS
        ? join(DEPLOY_MIGRATIONS, "meta", "_journal.json")
        : join(r, "migrations", "meta", "_journal.json"),
    ),
  )
  return {
    existsSync: (p) => journals.has(p) || files.has(p),
    readFileSync: (p) => {
      const v = files.get(p)
      if (v === undefined) throw new Error(`unexpected read: ${p}`)
      return v
    },
  }
}

describe("packageRootOfSchemaPath", () => {
  it("maps a monorepo schema path to its package dir + root", () => {
    expect(packageRootOfSchemaPath("../../packages/db/src/schema/index.ts")).toEqual({
      rootRel: "../../packages/db",
      name: "db",
    })
  })

  it("maps an npm (pnpm) schema path to the unscoped name + the LAST package root", () => {
    const p =
      "../../node_modules/.pnpm/@voyant-travel+db@0.108.4_hash/node_modules/@voyant-travel/db/dist/schema/index.js"
    expect(packageRootOfSchemaPath(p)).toEqual({
      rootRel:
        "../../node_modules/.pnpm/@voyant-travel+db@0.108.4_hash/node_modules/@voyant-travel/db",
      name: "db",
    })
  })

  it("maps an npm file URL to a filesystem package root", () => {
    const p =
      "file:///work/app/node_modules/.pnpm/@voyant-travel+db@0.109.4_hash/node_modules/@voyant-travel/db/dist/schema/index.js"
    expect(packageRootOfSchemaPath(p)).toEqual({
      rootRel:
        "/work/app/node_modules/.pnpm/@voyant-travel+db@0.109.4_hash/node_modules/@voyant-travel/db",
      name: "db",
    })
  })

  it("maps a plain node_modules path (hoisted, no .pnpm) too", () => {
    expect(
      packageRootOfSchemaPath(
        "./node_modules/@voyant-travel/flights/dist/reference/local-postgres.js",
      ),
    ).toEqual({ rootRel: "./node_modules/@voyant-travel/flights", name: "flights" })
  })

  it("returns null for a deployment-local schema", () => {
    expect(packageRootOfSchemaPath("./drizzle.links.generated.ts")).toBeNull()
    expect(packageRootOfSchemaPath("./src/db/schema/auth-extras.ts")).toBeNull()
  })
})

describe("discoverMigrationSources", () => {
  it("orders deps-first and appends the deployment source last (monorepo layout)", () => {
    const dbR = absRoot("../../packages/db")
    const idR = absRoot("../../packages/identity")
    const bkR = absRoot("../../packages/bookings")
    const fs = fakeFs({
      pkgs: {
        [dbR]: { name: "@voyant-travel/db" },
        [idR]: { name: "@voyant-travel/identity", requires: ["@voyant-travel/db"] },
        [bkR]: {
          name: "@voyant-travel/bookings",
          requires: ["@voyant-travel/db", "@voyant-travel/identity"],
        },
      },
      withJournal: [dbR, idR, bkR, DEPLOY_MIGRATIONS],
    })
    // Config lists bookings BEFORE its deps on purpose — discovery must still
    // topologically place db + identity ahead of bookings.
    const schema = [
      "../../packages/bookings/src/schema.ts",
      "../../packages/identity/src/schema.ts",
      "../../packages/db/src/schema/index.ts",
      "./drizzle.links.generated.ts",
    ]
    const got = discoverMigrationSources(schema, {
      baseDir: BASE,
      deploymentMigrationsDir: DEPLOY_MIGRATIONS,
      fs,
    })
    expect(got.map((s) => s.name)).toEqual(["db", "identity", "bookings", DEPLOYMENT_SOURCE])
    expect(got.at(-1)?.migrationsDir).toBe(DEPLOY_MIGRATIONS)
    expect(got.every((s) => s.hasMigrations)).toBe(true)
    expect(got.every((s) => s.legacyNames === undefined)).toBe(true)
  })

  it("carries the retired ledger sources a package absorbed (voyant#4330)", () => {
    // A source deployment reads the same declaration the managed image does, so
    // a database holding the retired source's tags does not replay them.
    const dbR = absRoot("../../packages/db")
    const opsR = absRoot("../../packages/operations")
    const fs = fakeFs({
      pkgs: {
        [dbR]: { name: "@voyant-travel/db" },
        [opsR]: {
          name: "@voyant-travel/operations",
          requires: ["@voyant-travel/db"],
          absorbed: ["availability"],
        },
      },
      withJournal: [dbR, opsR],
    })
    const got = discoverMigrationSources(
      ["../../packages/operations/src/schema.ts", "../../packages/db/src/schema/index.ts"],
      { baseDir: BASE, deploymentMigrationsDir: DEPLOY_MIGRATIONS, fs },
    )
    expect(got.find((s) => s.name === "operations")?.legacyNames).toEqual(["availability"])
    expect(got.find((s) => s.name === "db")?.legacyNames).toBeUndefined()
  })

  it("resolves the SAME package set from npm (pnpm) layout paths", () => {
    const dbRel =
      "../../node_modules/.pnpm/@voyant-travel+db@0.108.4_h/node_modules/@voyant-travel/db"
    const idRel =
      "../../node_modules/.pnpm/@voyant-travel+identity@0.127.0_h/node_modules/@voyant-travel/identity"
    const dbR = absRoot(dbRel)
    const idR = absRoot(idRel)
    const fs = fakeFs({
      pkgs: {
        [dbR]: { name: "@voyant-travel/db" },
        [idR]: { name: "@voyant-travel/identity", requires: ["@voyant-travel/db"] },
      },
      withJournal: [dbR, idR],
    })
    const schema = [`${idRel}/dist/schema.js`, `${dbRel}/dist/schema/index.js`]
    const got = discoverMigrationSources(schema, {
      baseDir: BASE,
      deploymentMigrationsDir: DEPLOY_MIGRATIONS,
      fs,
    })
    expect(got.map((s) => s.name)).toEqual(["db", "identity"])
    expect(got.find((s) => s.name === "identity")?.migrationsDir).toBe(join(idR, "migrations"))
    expect(got.every((s) => s.hasMigrations)).toBe(true)
  })

  it("resolves migrations from npm file URL schema paths", () => {
    const dbR =
      "/work/app/node_modules/.pnpm/@voyant-travel+db@0.109.4_h/node_modules/@voyant-travel/db"
    const idR =
      "/work/app/node_modules/.pnpm/@voyant-travel+identity@0.127.0_h/node_modules/@voyant-travel/identity"
    const fs = fakeFs({
      pkgs: {
        [dbR]: { name: "@voyant-travel/db" },
        [idR]: { name: "@voyant-travel/identity", requires: ["@voyant-travel/db"] },
      },
      withJournal: [dbR, idR],
    })
    const schema = [`file://${idR}/dist/schema.js`, `file://${dbR}/dist/schema/index.js`]
    const got = discoverMigrationSources(schema, {
      baseDir: BASE,
      deploymentMigrationsDir: DEPLOY_MIGRATIONS,
      fs,
    })
    expect(got.map((s) => s.name)).toEqual(["db", "identity"])
    expect(got.find((s) => s.name === "db")?.migrationsDir).toBe(join(dbR, "migrations"))
    expect(got.every((s) => s.hasMigrations)).toBe(true)
  })

  it("flags a source whose migrations folder is missing (hasMigrations=false)", () => {
    const dbR = absRoot("../../packages/db")
    const wR = absRoot("../../packages/widgets")
    const fs = fakeFs({
      pkgs: {
        [dbR]: { name: "@voyant-travel/db" },
        [wR]: { name: "@voyant-travel/widgets", requires: ["@voyant-travel/db"] },
      },
      withJournal: [dbR], // widgets ships NO journal
    })
    const got = discoverMigrationSources(
      ["../../packages/db/src/schema/index.ts", "../../packages/widgets/src/schema.ts"],
      { baseDir: BASE, deploymentMigrationsDir: DEPLOY_MIGRATIONS, fs },
    )
    expect(got.find((s) => s.name === "widgets")?.hasMigrations).toBe(false)
    expect(got.find((s) => s.name === "db")?.hasMigrations).toBe(true)
  })

  it("de-duplicates a package referenced by multiple schema paths", () => {
    const dbR = absRoot("../../packages/db")
    const fs = fakeFs({ pkgs: { [dbR]: { name: "@voyant-travel/db" } }, withJournal: [dbR] })
    const got = discoverMigrationSources(
      ["../../packages/db/src/schema/index.ts", "../../packages/db/src/schema/other.ts"],
      { baseDir: BASE, deploymentMigrationsDir: DEPLOY_MIGRATIONS, fs },
    )
    expect(got.map((s) => s.name)).toEqual(["db"])
  })

  it("omits the deployment source when no template-local schema is listed", () => {
    const dbR = absRoot("../../packages/db")
    const fs = fakeFs({ pkgs: { [dbR]: { name: "@voyant-travel/db" } }, withJournal: [dbR] })
    const got = discoverMigrationSources(["../../packages/db/src/schema/index.ts"], {
      baseDir: BASE,
      deploymentMigrationsDir: DEPLOY_MIGRATIONS,
      fs,
    })
    expect(got.map((s) => s.name)).toEqual(["db"])
  })

  it("tolerates a requiresSchemas dep that isn't a present source (external/type-only)", () => {
    const dbR = absRoot("../../packages/db")
    const cR = absRoot("../../packages/catalog")
    const fs = fakeFs({
      pkgs: {
        [dbR]: { name: "@voyant-travel/db" },
        [cR]: {
          name: "@voyant-travel/catalog",
          requires: ["@voyant-travel/db", "@voyant-travel/types"], // types not present
        },
      },
      withJournal: [dbR, cR],
    })
    const got = discoverMigrationSources(
      ["../../packages/catalog/src/schema.ts", "../../packages/db/src/schema/index.ts"],
      { baseDir: BASE, deploymentMigrationsDir: DEPLOY_MIGRATIONS, fs },
    )
    expect(got.map((s) => s.name)).toEqual(["db", "catalog"])
  })
})
