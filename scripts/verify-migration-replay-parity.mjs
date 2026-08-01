/**
 * Replay-parity oracle for retiring the Operator deployment migration source.
 * Proves that the legacy upgrade path reconstitutes exactly the same schema as
 * a fresh replay of the selected packages:
 *
 *   frozen framework bundle + retired deployment migrations
 *   + package post-cutline increments
 *   === all current package-owned migrations
 *
 * The D.2 cutline and framework bundle remain frozen transition fixtures. The
 * retired deployment history is retained only under scripts/fixtures so this
 * check can prove upgrades without keeping database authority in the application.
 *
 * Run: TEST_DATABASE_URL=<postgres url, user with CREATEDB> node scripts/verify-migration-replay-parity.mjs
 *   (skips cleanly when no DB is configured).
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(new URL("../apps/operator/package.json", import.meta.url))
const { Client } = require("pg")

const ROOT = new URL("..", import.meta.url).pathname
const DB_URL = process.env.TEST_DATABASE_URL
if (!DB_URL) {
  console.log(
    "verify-migration-replay-parity: SKIP (set TEST_DATABASE_URL to a CREATEDB-capable Postgres)",
  )
  process.exit(0)
}

const FRAMEWORK_BUNDLE = join(ROOT, "packages/framework-migrations/migrations")
const LEGACY_DEPLOYMENT_MIGRATIONS = join(
  ROOT,
  "scripts/fixtures/legacy-operator-deployment-migrations",
)
const OPERATOR_DIR = join(ROOT, "apps/operator")
const OPERATOR_ARTIFACTS = join(OPERATOR_DIR, ".voyant")

execFileSync("pnpm", ["exec", "voyant", "build", "--json"], {
  cwd: OPERATOR_DIR,
  stdio: "pipe",
  encoding: "utf8",
})

// Extensions required by package-owned indexes on a fresh package replay.
const SEED_EXTENSIONS = [
  'CREATE EXTENSION IF NOT EXISTS "pg_trgm"',
  'CREATE EXTENSION IF NOT EXISTS "unaccent"',
]

const splitStatements = (sql) =>
  sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

/** Load a drizzle folder's SQL statements in journal order. */
function loadFolder(folder) {
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"))
  return [...journal.entries]
    .sort((a, b) => a.when - b.when)
    .flatMap((e) => splitStatements(readFileSync(join(folder, `${e.tag}.sql`), "utf8")))
}

function loadCutline() {
  const p = join(ROOT, "packages/framework-migrations/cutline.generated.json")
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")).cutline ?? {}) : {}
}

function loadFolderAfterCutline(folder, sourceName, cutline) {
  const covered = new Set(cutline[sourceName] ?? [])
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"))
  return [...journal.entries]
    .sort((a, b) => a.when - b.when)
    .filter((e) => !covered.has(e.tag))
    .flatMap((e) => splitStatements(readFileSync(join(folder, `${e.tag}.sql`), "utf8")))
}

function discoverPackageSources() {
  const plan = JSON.parse(
    readFileSync(join(OPERATOR_ARTIFACTS, "migration-plan.generated.json"), "utf8"),
  )
  const sources = []
  const seen = new Set()
  for (const migration of plan.migrations) {
    if (migration.migrationKind !== "schema" || migration.source.kind !== "package") continue
    const name = migration.source.packageName.replace(/^@[^/]+\//, "")
    if (seen.has(name)) continue
    seen.add(name)
    const migrationsDir = join(ROOT, "packages", name, "migrations")
    sources.push({
      name,
      migrationsDir,
      hasMigrations: existsSync(join(migrationsDir, "meta", "_journal.json")),
    })
  }
  return sources
}

async function applyFolders(client, folders) {
  for (const folder of folders) {
    for (const stmt of loadFolder(folder)) {
      await client.query(stmt)
    }
  }
}

/** Canonical, order-independent fingerprint of the public schema. */
async function fingerprint(client) {
  const q = async (sql) => (await client.query(sql)).rows
  const columns = await q(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public'
    ORDER BY table_name, column_name`)
  const enums = await q(`
    SELECT t.typname, e.enumlabel, e.enumsortorder
    FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
    ORDER BY t.typname, e.enumsortorder`)
  const indexes = await q(`
    SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public'
    ORDER BY tablename, indexname`)
  const constraints = await q(`
    SELECT tc.table_name, tc.constraint_type, cc.column_name
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage cc
      ON cc.constraint_name=tc.constraint_name AND cc.table_schema=tc.table_schema
    WHERE tc.table_schema='public'
    ORDER BY tc.table_name, tc.constraint_type, cc.column_name`)
  return { columns, enums, indexes, constraints }
}

const hashOf = (obj) => createHash("sha256").update(JSON.stringify(obj)).digest("hex")

function urlFor(name) {
  const url = new URL(DB_URL)
  url.pathname = `/${name}`
  return url.toString()
}

async function withFreshDb(admin, name, fn) {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${name}"`)
  try {
    return await fn()
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  }
}

async function onDb(name, fn) {
  const client = new Client({ connectionString: urlFor(name) })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function main() {
  const admin = new Client({ connectionString: urlFor("postgres") })
  await admin.connect()
  try {
    const packageSources = discoverPackageSources()

    // Canonical current schema: every selected package migration from an empty DB.
    const packageFp = await withFreshDb(admin, "voyant_replay_packages", async () =>
      onDb("voyant_replay_packages", async (c) => {
        for (const ext of SEED_EXTENSIONS) await c.query(ext)
        for (const source of packageSources) {
          if (!source.hasMigrations) {
            throw new Error(`schema source ${source.name} has no migrations folder`)
          }
          await applyFolders(c, [source.migrationsDir])
        }
        return fingerprint(c)
      }),
    )

    // Upgrade path: frozen cutline + retired deployment history + package increments.
    const newFp = await withFreshDb(admin, "voyant_replay_new", async () => {
      const cutline = loadCutline()
      const sourceNames = packageSources.map((s) => s.name).join(", ")
      console.log(`  sources: framework, legacy-deployment, ${sourceNames}`)
      return onDb("voyant_replay_new", async (c) => {
        await applyFolders(c, [FRAMEWORK_BUNDLE])
        await applyFolders(c, [LEGACY_DEPLOYMENT_MIGRATIONS])
        for (const source of packageSources) {
          if (!source.hasMigrations) {
            throw new Error(`schema source ${source.name} has no migrations folder`)
          }
          for (const stmt of loadFolderAfterCutline(source.migrationsDir, source.name, cutline)) {
            await c.query(stmt)
          }
        }
        return fingerprint(c)
      })
    })

    const sections = ["columns", "enums", "indexes", "constraints"]
    let ok = true
    for (const s of sections) {
      const a = hashOf(newFp[s])
      const b = hashOf(packageFp[s])
      if (a !== b) {
        ok = false
        console.error(`  MISMATCH  ${s}: upgrade=${a.slice(0, 12)} packages=${b.slice(0, 12)}`)
        const aSet = new Set(newFp[s].map((r) => JSON.stringify(r)))
        const bSet = new Set(packageFp[s].map((r) => JSON.stringify(r)))
        const onlyNew = [...aSet].filter((r) => !bSet.has(r)).slice(0, 5)
        const onlyPush = [...bSet].filter((r) => !aSet.has(r)).slice(0, 5)
        for (const r of onlyNew) console.error(`    only in upgrade path: ${r}`)
        for (const r of onlyPush) console.error(`    only in package replay: ${r}`)
      } else {
        console.log(`  OK  ${s} (${newFp[s].length} rows)`)
      }
    }

    if (!ok) {
      console.error(
        "\nreplay-parity FAIL — the legacy upgrade path and package-owned replay differ.",
      )
      process.exit(1)
    }
    console.log("\nverify-migration-replay-parity: OK — legacy upgrade == package-owned replay")
  } finally {
    await admin.end()
  }
}

main().catch((err) => {
  console.error("verify-migration-replay-parity ERROR:", err)
  process.exit(2)
})
